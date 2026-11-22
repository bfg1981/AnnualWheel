// The plan document contains application settings and a scheduling graph. The scheduler and editor use an indexed projection.
const collections = {
  layer: 'layers', calendar: 'schedules', constraint: 'constraints', group: 'groups', anchor: 'anchors',
};
const comparisons = new Map([
  ['less_than', false], ['less_or_equal', true], ['greater_than', false], ['greater_or_equal', true],
]);
const weekRules = ['nth_weekday', 'nth_full_weekday', 'last_weekday'];
const dateKey = date => JSON.stringify(Object.entries(date).sort(([a], [b]) => a.localeCompare(b)));
const nodeId = (type, key) => type + ':' + key;

function splitId(id) {
  if (id === 'initial') return ['initial', 'start_of_year'];
  const separator = typeof id === 'string' ? id.indexOf(':') : -1;
  if (separator < 1 || separator === id.length - 1) throw new Error('Invalid node ID: ' + id);
  return [id.slice(0, separator), id.slice(separator + 1)];
}

function checkDefaultLayers(autoLayers, layers) {
  for (const layer of Object.values(autoLayers ?? {})) {
    if (!Object.hasOwn(layers ?? {}, layer)) throw new Error('Unknown default layer: ' + layer);
  }
}

export function planSettings(plan) {
  const { version, items, layers, schedules, constraints, groups, anchors, autoLayers, initialYear, initialRule, ...settings } = plan;
  return settings;
}

export function toPlanDocument(plan, template) {
  const { items, layers, anchors, autoLayers, initialYear, initialRule } = plan;
  const settings = planSettings(plan);
  const initial = { id: 'initial' };
  if (initialYear !== undefined) initial.initialYear = initialYear;
  if (initialRule !== undefined) initial.initialRule = initialRule;
  const nodes = [initial];
  checkDefaultLayers(autoLayers, layers);
  const graphLayers = Object.entries(layers ?? {}).map(([key, fields]) => {
    const defaultFor = Object.keys(autoLayers ?? {}).filter(kind => autoLayers[kind] === key);
    return { id: nodeId('layer', key), ...structuredClone(fields), ...(defaultFor.length && { defaultFor }) };
  });
  const templateGraph = template?.graph ?? template;
  const edges = [];
  const ids = new Set(['initial', ...graphLayers.map(layer => layer.id)]);
  const dates = new Map();
  const assignedDates = new Map();
  // Retain authored date IDs when a translated label or an edited date changes.
  const templateDates = new Map((templateGraph?.nodes ?? []).filter(node => node.id.startsWith('date:'))
    .map(node => [node.id, node]));
  const originalDates = new Map([...templateDates.values()].map(node => [dateKey(node.date), node.id]));
  const dateSources = new Map();
  const consumers = new Map();
  for (const edge of templateGraph?.edges ?? []) {
    if (!templateDates.has(edge.from)) continue;
    const slot = JSON.stringify([edge.to, edge.type]);
    if (!dateSources.has(slot)) dateSources.set(slot, []);
    dateSources.get(slot).push(edge.from);
    consumers.set(edge.from, (consumers.get(edge.from) ?? 0) + 1);
  }
  const itemIds = new Set(items.map(item => item.id));

  function add(id, properties) {
    if (ids.has(id)) throw new Error('Duplicate node: ' + id);
    ids.add(id);
    nodes.push({ id, ...properties });
  }
  function link(from, to, type, fields = {}) {
    edges.push({ from, to, type, ...fields });
  }
  function virtualDate(definition, to, relation) {
    const date = { kind: 'fixed', ...definition };
    const key = dateKey(date);
    const previous = dateSources.get(JSON.stringify([to, relation]))?.shift();
    let id;
    if (previous && (dateKey(templateDates.get(previous).date) === key || consumers.get(previous) === 1)) id = previous;
    else id = dates.get(key) ?? originalDates.get(key);
    if (assignedDates.get(id) === key) return id;
    if (assignedDates.has(id)) id = undefined;
    if (!id) {
      const base = 'date:' + [date.kind, date.month, date.day].filter(x => x !== undefined).join('-');
      id = base;
      for (let n = 2; ids.has(id) || templateDates.has(id); n++) id = base + '-' + n;
    }
    add(id, { date });
    dates.set(key, id);
    assignedDates.set(id, key);
    return id;
  }
  function source(ref, to, relation) {
    if (ref.baseDate) return { from: virtualDate(ref.baseDate, to, relation) };
    const value = ref.anchor;
    if (value?.group) return { from: nodeId('group', value.group) };
    if (typeof value !== 'string') throw new Error('Missing date dependency');
    const [id, endpoint] = value.split('.');
    if (itemIds.has(id)) return { from: nodeId('item', id), ...(endpoint && { endpoint }) };
    if (value === 'start_of_year' && !Object.hasOwn(anchors ?? {}, value)) return { from: 'initial' };
    return { from: nodeId('anchor', value) };
  }
  function bound(to, ref, forward, inclusive, inheritStatus = false) {
    if (typeof ref === 'string') ref = { anchor: ref };
    const closed = ref.inclusive ?? inclusive ?? false;
    const type = forward ? (closed ? 'greater_or_equal' : 'greater_than') : (closed ? 'less_or_equal' : 'less_than');
    const { from, ...port } = source(ref, to, type);
    link(from, to, type, { ...port, ...(inheritStatus && { inheritStatus: true }), ...(ref.offsetDays !== undefined && { offsetDays: ref.offsetDays }),
      ...(ref.offsetMonths !== undefined && { offsetMonths: ref.offsetMonths }) });
  }
  function writeSchedule(to, owner) {
    const rule = owner.schedule;
    if (!rule) return;
    const { kind, constraints: shared, before, after, rule: text, ...params } = rule;
    const description = text === undefined ? {} : { rule: text };
    for (const id of shared ?? []) link(nodeId('constraint', id), to, 'satisfies');
    for (const ref of after ?? []) bound(to, ref, true, kind === 'next_weekday' && rule.inclusive);
    if (kind === 'next_weekday' || kind === 'previous_weekday') {
      if (kind === 'previous_weekday' || !after) bound(to, before ?? rule, kind === 'next_weekday', rule.inclusive, Boolean(!before && rule.anchor));
      const local = { ...description, ...(rule.weekday !== undefined && { weekday: rule.weekday }) };
      if (Object.keys(local).length) owner.schedule = local;
      else delete owner.schedule;
      return;
    }
    if (kind === 'fixed' || kind === 'group') {
      owner.schedule = { kind, ...description, ...params };
      return;
    }
    const { anchor, baseDate, month, day, ...operation } = params;
    let type = kind;
    if (['anchor', 'month_start', 'month_end'].includes(kind)) type = 'same_day';
    if (kind.startsWith('offset_from_')) type = 'offset';
    let origin;
    if (anchor || baseDate) origin = source({ anchor, baseDate }, to, type);
    else {
      const end = ['last_weekday', 'month_end', 'offset_from_month_end'].includes(kind);
      const boundary = day !== undefined ? 'fixed' : end ? 'month_end' : 'month_start';
      origin = { from: virtualDate({ kind: boundary, month, ...(day !== undefined && { day }) }, to, type) };
    }
    const { from, ...port } = origin;
    link(from, to, type, { ...port, ...operation });
    if (text === undefined) delete owner.schedule;
    else owner.schedule = description;
  }
  function ownerEdges(id, owner) {
    if (owner.layer && owner.layer !== 'auto') {
      link(nodeId('layer', owner.layer), id, 'layer');
      delete owner.layer;
    }
    writeSchedule(id, owner);
  }

  for (const [type, section] of Object.entries(collections)) {
    if (type === 'layer') continue;
    for (const [key, fields] of Object.entries(plan[section] ?? {})) {
      const id = nodeId(type, key);
      const node = structuredClone(fields);
      if (type === 'calendar' && node.includes) {
        for (const part of node.includes) link(nodeId('calendar', part), id, 'includes');
        delete node.includes;
      }
      if (type === 'constraint' && node.schedule) {
        link(nodeId('calendar', node.schedule), id, 'calendar');
        delete node.schedule;
      }
      if (type === 'group' && node.defaults) ownerEdges(id, node.defaults);
      if (type === 'anchor') {
        if (node.dependency) {
          const { type: relation, source, ...offset } = node.dependency;
          link(virtualDate(source, id, relation), id, relation, offset);
          delete node.dependency;
          if (node.defaultDate?.kind === 'relative' && Object.keys(node.defaultDate).length === 1) delete node.defaultDate;
        } else if (node.defaultDate) {
          const relation = node.defaultDateRelation ?? 'default_date';
          link(virtualDate(node.defaultDate, id, relation), id, relation);
          delete node.defaultDate;
          delete node.defaultDateRelation;
        }
      }
      add(id, node);
    }
  }
  for (const item of items) {
    const { id: key, group, ...node } = structuredClone(item);
    const id = nodeId('item', key);
    if (group) link(nodeId('group', group), id, 'member');
    ownerEdges(id, node);
    add(id, node);
  }
  for (const [id, node] of templateDates) {
    if (!consumers.has(id) && !ids.has(id)) add(id, { date: structuredClone(node.date) });
  }
  for (const { from, to } of edges) {
    if (!ids.has(from) || !ids.has(to)) throw new Error('Unknown graph endpoint: ' + from + ' → ' + to);
  }
  return { settings, graph: { layers: graphLayers, nodes, edges } };
}

// Read all vertices before applying any edges, including forward references.
export function readPlan(document) {
  if (!document) return document;
  const separateSettings = Object.hasOwn(document, 'graph');
  if (!separateSettings && !Object.hasOwn(document, 'nodes') && !Object.hasOwn(document, 'edges')) return document;
  const graph = separateSettings ? document.graph : document;
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error('Expected nodes and edges arrays');
  const hasLayers = Object.hasOwn(graph, 'layers');
  if (hasLayers && !Array.isArray(graph.layers)) throw new Error('Expected a layers array');
  const records = new Map();
  const plan = { version: 1, layers: {}, autoLayers: {}, anchors: {}, items: [] };
  function assign(object, key, value) {
    if (Object.hasOwn(object, key)) throw new Error('Conflicting graph definition: ' + key);
    Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true });
  }
  if (separateSettings) {
    const settings = document.settings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Expected a settings object');
    for (const [key, value] of Object.entries(structuredClone(settings))) {
      if (key === 'autoLayers') {
        if (hasLayers) throw new Error('Declare default layer assignments in graph.layers');
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an autoLayers mapping');
        plan.autoLayers = value;
      } else {
        if (['initialYear', 'initialRule', ...Object.values(collections)].includes(key)) throw new Error('Graph field in settings: ' + key);
        assign(plan, key, value);
      }
    }
  }
  for (const { id, defaultFor = [], ...properties } of structuredClone(graph.layers ?? [])) {
    const [type, key] = splitId(id);
    if (type !== 'layer') throw new Error('Invalid layer ID: ' + id);
    if (!Array.isArray(defaultFor) || defaultFor.some(kind => typeof kind !== 'string' || !kind)) {
      throw new Error('Expected item kinds in defaultFor on ' + id);
    }
    assign(plan.layers, key, properties);
    records.set(id, { type, key, properties });
    for (const kind of defaultFor) assign(plan.autoLayers, kind, key);
  }
  for (const { id, ...properties } of structuredClone(graph.nodes)) {
    const [type, key] = splitId(id);
    if (type === 'layer' && hasLayers) throw new Error('Declare layers in graph.layers');
    if (records.has(id)) throw new Error('Duplicate node: ' + id);
    records.set(id, { type, key, properties });
    if (type === 'initial') {
      for (const [field, value] of Object.entries(properties)) {
        if (separateSettings && field !== 'initialYear' && field !== 'initialRule') throw new Error('Unexpected initial node field: ' + field);
        assign(plan, field, value);
      }
    } else if (type === 'item') {
      plan.items.push(properties);
      properties.id = key;
    } else if (Object.hasOwn(collections, type)) {
      assign(plan[collections[type]] ??= {}, key, properties);
    } else if (type !== 'date' || !properties.date) throw new Error('Invalid graph node: ' + id);
  }
  if (!records.has('initial')) throw new Error('The graph needs an initial node');

  // Bounds and constraints can precede the edge that supplies the primary rule.
  const scheduleEdges = new Map();
  for (const { from, to, type, ...options } of graph.edges) {
    const origin = records.get(from), target = records.get(to);
    if (!origin || !target) throw new Error('Unknown graph endpoint: ' + from + ' → ' + to);
    const node = target.properties;
    if (!separateSettings && type === 'default_layer' && origin.type === 'layer' && target.type === 'initial' && typeof options.kind === 'string') assign(plan.autoLayers, options.kind, origin.key);
    else if (type === 'includes' && origin.type === 'calendar' && target.type === 'calendar') (node.includes ??= []).push(origin.key);
    else if (type === 'calendar' && origin.type === 'calendar' && target.type === 'constraint') assign(node, 'schedule', origin.key);
    else if (type === 'member' && origin.type === 'group' && target.type === 'item') assign(node, 'group', origin.key);
    else if (target.type === 'anchor' && origin.type === 'date') {
      const date = structuredClone(origin.properties.date);
      if (type === 'offset') {
        assign(node, 'dependency', { type, source: date, ...options });
        node.defaultDate ??= { kind: 'relative' };
      } else {
        if (type !== 'default_date' && type !== 'on_or_before' && !comparisons.has(type)) throw new Error('Unknown anchor relation: ' + type);
        assign(node, 'defaultDate', date);
        if (type !== 'default_date') assign(node, 'defaultDateRelation', type);
      }
    } else if (target.type === 'item' || target.type === 'group') {
      const owner = target.type === 'group' ? node.defaults ??= {} : node;
      if (type === 'layer' && origin.type === 'layer') assign(owner, 'layer', origin.key);
      else {
        if (!scheduleEdges.has(owner)) scheduleEdges.set(owner, []);
        scheduleEdges.get(owner).push({ origin, type, ...options });
      }
    } else throw new Error('Invalid ' + type + ' edge: ' + from + ' → ' + to);
  }
  for (const [owner, edges] of scheduleEdges) {
    let primary = owner.schedule?.kind ? owner.schedule : undefined;
    const after = [], shared = [];
    let before, inherited;
    for (const { origin, type, endpoint, ...params } of edges) {
      if (type === 'satisfies' && origin.type === 'constraint') {
        shared.push(origin.key);
        continue;
      }
      if (endpoint !== undefined && (origin.type !== 'item' || !['start', 'end'].includes(endpoint))) {
        throw new Error('Invalid course endpoint: ' + endpoint);
      }
      let ref;
      if (origin.type === 'date') ref = { baseDate: structuredClone(origin.properties.date) };
      else if (origin.type === 'group') ref = { anchor: { group: origin.key } };
      else if (['item', 'anchor', 'initial'].includes(origin.type)) ref = { anchor: origin.key + (endpoint ? '.' + endpoint : '') };
      else throw new Error('Invalid date source: ' + origin.type);
      if (comparisons.has(type)) {
        const { inheritStatus, ...offset } = params;
        const bound = { ...ref, ...offset, inclusive: comparisons.get(type) };
        if (inheritStatus) inherited = bound;
        if (type.startsWith('greater')) after.push(bound);
        else if (!before) before = bound;
        else throw new Error('Only one upper date bound is supported');
        continue;
      }
      if (primary) throw new Error('Multiple primary date rules');
      const date = ref.baseDate;
      const plainMonth = date && Object.keys(date).length === 2 && ['month_start', 'month_end'].includes(date.kind);
      if (type === 'same_day' && plainMonth) primary = { kind: date.kind, month: date.month };
      else if (type === 'same_day') primary = { kind: ref.anchor ? 'anchor' : 'same_day', ...ref };
      else if (weekRules.includes(type) && plainMonth && date.kind === (type === 'last_weekday' ? 'month_end' : 'month_start')) {
        primary = { kind: type, month: date.month, ...params };
      } else if (['offset', 'course', ...weekRules].includes(type)) primary = { kind: type, ...ref, ...params };
      else throw new Error('Unknown schedule relation: ' + type);
    }
    if (!primary && !before && !after.length) throw new Error('A constraint needs a date rule');
    primary ??= { kind: before ? 'previous_weekday' : 'next_weekday' };
    if (before && primary.kind !== 'previous_weekday') throw new Error('Upper bound requires previous_weekday');
    if (before && before !== inherited) primary.before = before;
    if (after.length && after[0] !== inherited) primary.after = after;
    if (inherited) {
      if (after.includes(inherited) && after.length !== 1) throw new Error('A status-inheriting lower bound must be the sole lower bound');
      Object.assign(primary, inherited);
    }
    if (shared.length) primary.constraints = shared;
    owner.schedule = { ...owner.schedule, ...primary };
  }
  checkDefaultLayers(plan.autoLayers, plan.layers);
  return plan;
}
