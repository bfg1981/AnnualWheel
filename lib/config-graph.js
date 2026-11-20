export { addDependencyHandles, dragDependency } from './dependency-drag.js';

const currentConfigurationVersion = 1;

// Keep array indices numeric and mapping keys literal, including keys containing dots.
export function* configurationFields(value, path = []) {
  if (value !== null && typeof value === 'object' && Object.keys(value).length) {
    for (const [key, child] of Object.entries(value)) {
      yield* configurationFields(child, [...path, Array.isArray(value) ? Number(key) : key]);
    }
  } else {
    yield { path, value };
  }
}

function textKey(plan, path) {
  return JSON.stringify(path[0] === 'items' && typeof path[1] === 'number'
    ? ['items', plan.items[path[1]].id, ...path.slice(2)] : path);
}

export function sourceTextChanges(original, translated) {
  const changes = [];
  for (const { path, value } of configurationFields(translated)) {
    if (typeof value !== 'string') continue;
    const source = path.reduce((parent, key) => parent[key], original);
    if (source !== value) changes.push([textKey(original, path), [value, source]]);
  }
  return changes;
}

function sourceValue(value, translation) {
  return translation && translation[0] === value ? translation[1] : value;
}

export function sourceConfiguration(plan, sourceTexts) {
  const fields = Array.from(configurationFields(plan), ({ path, value }) => {
    const translation = sourceTexts.get(textKey(plan, path));
    return { path, value: sourceValue(value, translation) };
  });
  return { ...configurationFromFields(fields), version: currentConfigurationVersion };
}

export function configurationFromFields(fields) {
  const plan = {};
  for (const { path, value } of fields) {
    let parent = plan;
    for (const [index, key] of path.entries()) {
      if (!Object.hasOwn(parent, key)) {
        const child = index === path.length - 1 ? value : typeof path[index + 1] === 'number' ? [] : {};
        Object.defineProperty(parent, key, { value: child, enumerable: true, writable: true, configurable: true });
      }
      parent = parent[key];
    }
  }
  return plan;
}

export function applyRemovedNodes(plan, removedNodes, effectiveItem) {
  const deletedConstraints = new Set();
  for (const node of removedNodes.values()) {
    if (node.itemGroup !== undefined) {
      const group = plan.groups[node.itemGroup];
      // Dissolve the group while keeping each member's inherited settings.
      plan.items = plan.items.map(item => {
        if (item.group !== node.itemGroup) return item;
        const member = effectiveItem(plan, item);
        if (member.schedule?.kind === 'group') member.schedule = { ...member.schedule, kind: 'fixed', ...group.date };
        delete member.group;
        return member;
      });
      delete plan.groups[node.itemGroup];
    }
    if (node.constraintId !== undefined) deletedConstraints.add(node.constraintId);
    if (node.scheduleKey !== undefined) {
      delete plan.schedules[node.scheduleKey];
      for (const calendar of Object.values(plan.schedules)) {
        if (calendar.includes?.includes(node.scheduleKey)) calendar.includes = calendar.includes.filter(key => key !== node.scheduleKey);
      }
      for (const [key, constraint] of Object.entries(plan.constraints ?? {})) {
        if (constraint.schedule !== node.scheduleKey) continue;
        if (Number.isInteger(constraint.weekday)) {
          delete constraint.schedule;
          delete constraint.no;
          delete constraint.membership;
        } else deletedConstraints.add(key);
      }
    }
  }
  plan.items = plan.items.filter(item => !removedNodes.has('item:' + item.id));
  for (const node of removedNodes.values()) {
    if (!node.anchorKey) continue;
    const stillUsed = plan.items.some(item => {
      const rule = effectiveItem(plan, item).schedule;
      return rule?.kind === 'anchor' && rule.anchor === node.anchorKey;
    });
    if (!stillUsed) delete plan.anchors[node.anchorKey];
  }
  for (const key of deletedConstraints) delete plan.constraints[key];
  for (const owner of [...plan.items, ...Object.values(plan.groups ?? {}).map(group => group.defaults)]) {
    const rule = owner?.schedule;
    if (rule?.constraints?.some(key => deletedConstraints.has(key))) rule.constraints = rule.constraints.filter(key => !deletedConstraints.has(key));
  }
}

function pathLabel(path) {
  return path.map((part, index) => typeof part === 'number' ? `[${part}]`
    : /^[\w-]+$/u.test(part) ? (index ? '.' : '') + part : '[' + JSON.stringify(part) + ']').join('');
}

const nodeCollections = new Set(['items', 'anchors', 'constraints', 'schedules', 'groups', 'layers']);

const graphReaders = new WeakMap();

export function renderConfigurationNodes(root, plan, sourceTexts, owner, expanded, recover) {
  const projected = recover(plan);
  const bindings = [];
  const advanced = [];
  graphReaders.set(root, extraFields => {
    const current = recover(configurationFromFields([...advanced, ...extraFields]));
    const graphFields = bindings.map(({ path, key, translation }) => {
      const value = current.get(key);
      return { path, value: sourceValue(value, translation) };
    });
    return [...graphFields, ...advanced];
  });
  const nodes = new Map();
  for (const { path, value } of configurationFields(plan)) {
    if (path[0] === 'version') continue;
    const fieldKey = JSON.stringify(path);
    const translation = sourceTexts.get(textKey(plan, path));
    if (projected.has(fieldKey) && Object.is(projected.get(fieldKey), value)) {
      bindings.push({ path, key: fieldKey, translation });
      continue;
    }
    const prefix = path.slice(0, nodeCollections.has(path[0]) ? 2 : 1);
    const host = owner(prefix);
    const originalValue = sourceValue(value, translation);
    if (!host) {
      advanced.push({ path, value: originalValue });
      continue;
    }
    const key = JSON.stringify(prefix);
    if (!nodes.has(key)) {
      const details = document.createElement('details');
      details.className = 'graph-config-node';
      details.dataset.nodePath = key;
      details.open = expanded.has(key);
      const summary = document.createElement('summary');
      summary.textContent = pathLabel(prefix);
      const list = document.createElement('dl');
      details.append(summary, list);
      host.append(details);
      nodes.set(key, list);
    }
    const list = nodes.get(key);
    const term = document.createElement('dt');
    term.textContent = pathLabel(path.slice(prefix.length)) || pathLabel(prefix);
    const definition = document.createElement('dd');
    definition.dataset.graphPath = JSON.stringify(path);
    definition.textContent = JSON.stringify(originalValue);
    list.append(term, definition);
  }
  return advanced;
}

export function readDisplayedConfiguration(root) {
  const fields = Array.from(root.querySelectorAll('[data-graph-path]'), definition => ({
    path: JSON.parse(definition.dataset.graphPath),
    value: JSON.parse(definition.textContent),
  }));
  return { version: currentConfigurationVersion, ...configurationFromFields([...graphReaders.get(root)(fields), ...fields]) };
}

// Reconstruct candidates from the actual timeline. Only exact matches with an
// authored field are bound, so omitted defaults and alternate rule forms survive.
export function recoverGraphFields(panel, edges, metadata) {
  const fields = new Map();
  function put(path, value) {
    if (value !== undefined) fields.set(JSON.stringify(path), value);
  }
  function putReference(path, source, reference) {
    if (source.dataset.itemGroup !== undefined) put([...path, 'group'], source.dataset.itemGroup);
    else put(path, reference);
  }
  const page = panel.ownerDocument;
  put(['display', 'title'], page.querySelector('.intro h1')?.textContent);
  put(['display', 'description'], page.querySelector('.lede')?.textContent);
  put(['organisation', 'type'], page.querySelector('.organisation-type')?.dataset.type);
  put(['organisation', 'name'], page.querySelector('.brand')?.lastChild.textContent.trim());
  const initialYear = panel.querySelector('.initial-year').dataset.initialYear;
  put(['initialYear'], initialYear === 'current' ? initialYear : Number(initialYear));
  const mappings = Object.assign(Object.create(null), metadata.autoLayers);
  for (const button of page.querySelectorAll('.legend [data-layer]')) {
    for (const kind of JSON.parse(button.dataset.autoKinds)) {
      mappings[kind] = button.dataset.layer;
      put(['autoLayers', kind], button.dataset.layer);
    }
    const path = ['layers', button.dataset.layer];
    put([...path, 'label'], button.textContent);
    put([...path, 'color'], button.querySelector('.dot')?.getAttribute('style')?.replace(/^background:/, ''));
  }
  for (const row of panel.querySelectorAll('.timeline-calendar')) {
    const key = row.dataset.scheduleKey;
    put(['schedules', key, 'calendar'], row.dataset.calendarRef);
    put(['schedules', key, 'title'], row.getAttribute('aria-label'));
    const visibility = row.querySelector('.calendar-visibility input').value;
    if (visibility !== 'default') put(['schedules', key, 'hidden'], visibility === 'true');
    row.querySelectorAll('[data-source-key]').forEach((source, index) => {
      put(['schedules', key, 'includes', index], source.dataset.sourceKey);
      put(['schedules', source.dataset.sourceKey, 'title'], source.textContent);
    });
  }
  for (const node of panel.querySelectorAll('.timeline-weekday')) {
    put(['constraints', node.dataset.constraintId, 'weekday'], Number(node.querySelector('select').value));
  }
  for (const node of panel.querySelectorAll('.timeline-dated-group')) {
    const path = ['groups', node.dataset.itemGroup];
    const content = node.querySelector(':scope > .card-content');
    put([...path, 'title'], content.querySelector('h2').textContent);
    dateParts([...path, 'date'], node.querySelector(':scope > time').dateTime);
    put([...path, 'collapsed'], node.querySelector(':scope > [data-group-toggle]').dataset.configuredCollapsed === 'true');
    put([...path, 'defaults', 'rule'], content.querySelector('.rule-line').textContent);
    const label = content.querySelector('.card-kind').textContent;
    const matches = [...page.querySelectorAll('.legend [data-layer]')].filter(button => button.textContent === label);
    if (matches.length === 1) put([...path, 'defaults', 'layer'], matches[0].dataset.layer);
    for (const status of ['set', 'derived', 'anchor']) {
      if (node.classList.contains('is-' + status)) put([...path, 'defaults', 'status'], status);
    }
    put([...path, 'defaults', 'kind'], 'deadline');
  }

  function dateParts(path, iso) {
    if (!iso) return;
    put([...path, 'month'], Number(iso.slice(5, 7)));
    put([...path, 'day'], Number(iso.slice(8, 10)));
  }
  function boundaryType(source) {
    if (source.classList.contains('timeline-start')) return 'month_start';
    return source.dataset.boundaryKind;
  }
  function recoverVirtualDate(path, edge) {
    if (!edge.nestedDate) return;
    const definition = JSON.parse(edge.source.dataset.virtualDefinition);
    for (const [key, value] of Object.entries(definition)) put([...path, 'baseDate', key], value);
  }

  function recoverAnchor(key, node, edge) {
    const anchor = ['anchors', key];
    put([...anchor, 'title'], node.querySelector('h2')?.textContent);
    const control = node.querySelector('[data-anchor-id]');
    put([...anchor, 'configurable'], Boolean(control));
    if (control) {
      const pinned = node.querySelector('[data-anchor-status]').getAttribute('aria-pressed') === 'true';
      put([...anchor, 'status'], pinned ? 'set' : 'tentative');
      put([...anchor, 'date'], control.value);
    }
    const path = [...anchor, 'defaultDate'];
    if (edge?.edit?.kind === 'relative') {
      const dep = [...anchor, 'dependency'];
      put([...path, 'kind'], 'relative');
      put([...dep, 'type'], 'offset');
      for (const [key, value] of Object.entries(JSON.parse(edge.source.dataset.virtualDefinition))) put([...dep, 'source', key], value);
      const { relation } = edge;
      put([...dep, 'days'], relation.weeks === undefined ? relation.days : undefined);
      put([...dep, 'weeks'], relation.weeks);
      put([...dep, 'whole'], relation.whole);
      return;
    }
    if (!edge) {
      dateParts(path, node.dataset.virtualDate);
      return;
    }
    const { source, relation } = edge;
    const date = source.dataset.virtualDate ?? source.dataset.virtualDateValue;
    put([...anchor, 'defaultDateRelation'], relation.type);
    recoverVirtualDate(path, edge);
    const boundary = boundaryType(source);
    if (boundary) {
      const days = relation.days ?? relation.amount;
      const offset = relation.type === 'offset' || Boolean(days);
      const kind = edge.nestedDate ? (offset ? 'offset' : 'same_day') : offset ? 'offset_from_' + (boundary === 'fixed' ? 'date' : boundary) : boundary;
      put([...path, 'kind'], kind);
      if (boundary === 'fixed') dateParts(path, date);
      put([...path, 'days'], days);
      put([...path, 'weeks'], relation.weeks);
      put([...path, 'whole'], relation.whole);
      put([...path, 'month'], Number(date.slice(5, 7)));
    } else {
      dateParts(path, date);
    }
  }
  for (const node of panel.querySelectorAll('[data-anchor-key]')) {
    recoverAnchor(node.dataset.anchorKey, node, edges.find(edge => edge.target === node && edge.relation.type !== 'satisfies'));
  }
  for (const card of panel.querySelectorAll('[data-item-index]')) {
    const path = ['items', Number(card.dataset.itemIndex)];
    const rule = [...path, 'schedule'];
    const incoming = edges.filter(edge => edge.target === card);
    const dependencies = incoming.filter(edge => edge.relation.type !== 'satisfies');
    const weekday = incoming.find(edge => edge.relation.type === 'satisfies');
    const calendarRules = [...card.querySelectorAll('[data-calendar-constraint-id]')];
    const ids = [...(weekday ? [weekday.relation.source] : []), ...calendarRules.map(line => line.dataset.calendarConstraintId)];
    ids.forEach((id, index) => put([...rule, 'constraints', index], id));
    for (const line of calendarRules) {
      put(['constraints', line.dataset.calendarConstraintId, 'schedule'], line.dataset.scheduleKey);
      put(['constraints', line.dataset.calendarConstraintId, 'membership'], line.dataset.membership);
      if (line.dataset.membership === 'outside') put(['constraints', line.dataset.calendarConstraintId, 'no'], true);
    }
    put([...path, 'title'], card.querySelector('h2').textContent);
    put([...path, 'id'], card.dataset.deadlineId);
    const groupNode = card.closest('.timeline-item-group');
    if (groupNode) {
      const group = groupNode.dataset.itemGroup;
      put([...path, 'group'], group);
      if (!groupNode.classList.contains('timeline-dated-group')) {
        put(['groups', group, 'title'], groupNode.getAttribute('aria-label'));
      } else if (card.hasAttribute('data-inherits-date')) {
        put([...rule, 'kind'], 'group');
      }
    }
    // The editor creates deadlines by default. A named anchor, course or a
    // unique automatic layer mapping supplies a more specific default kind.
    const anchorKey = card.dataset.anchorKey;
    const course = dependencies.some(edge => edge.relation.type === 'course');
    const kinds = Object.keys(mappings).filter(kind => mappings[kind] === card.dataset.layer && kind !== 'anchor' && kind !== 'course');
    const inferredKind = anchorKey ? 'anchor' : course ? 'course' : kinds.length === 1 ? kinds[0] : 'deadline';
    put([...path, 'kind'], inferredKind);
    const kind = metadata.items?.[path[1]]?.kind ?? inferredKind;
    put([...path, 'layer'], mappings[kind] === card.dataset.layer ? 'auto' : card.dataset.layer);
    put([...path, 'rule'], dependencies.find(edge => edge.ruleText)?.ruleText ?? card.querySelector('.rule-line').textContent);
    const field = card.querySelector('[data-item-override]');
    put([...path, 'configurable'], Boolean(field));
    if (field && card.querySelector('[data-item-status]').getAttribute('aria-pressed') === 'true') {
      put([...path, 'date'], field.value);
    }
    put([...path, 'status'], anchorKey ? 'anchor' : !field && card.classList.contains('is-set') ? 'set' : 'derived');
    for (const field of card.querySelectorAll('.timeline-member-overrides [data-group-field]')) {
      put([...path, field.dataset.groupField], field.dataset.value);
    }
    const explicitWeekday = card.querySelector('.card-weekday');
    if (explicitWeekday) put([...rule, 'weekday'], Number(explicitWeekday.dataset.weekday));
    if (anchorKey) {
      put([...rule, 'kind'], 'anchor');
      put([...rule, 'anchor'], anchorKey);
      continue;
    }
    if (!dependencies.length && card.dataset.dateType === 'fixed') {
      put([...rule, 'kind'], 'fixed');
      dateParts(rule, card.dataset.timelineDate);
    }
    dependencies.forEach((edge, index) => {
      const { source, relation } = edge;
      if (!relation.baseDate) recoverVirtualDate(rule, edge);
      const type = relation.type;
      const boundary = edge.boundaryKind;
      const date = source.dataset.virtualDate ?? source.dataset.virtualDateValue;
      if (relation.after !== undefined) {
        put([...rule, 'kind'], relation.after ? 'next_weekday' : 'previous_weekday');
        const ref = relation.after ? [...rule, 'after', index] : [...rule, 'before'];
        if (relation.baseDate) {
          for (const [key, value] of Object.entries(relation.baseDate)) put([...ref, 'baseDate', key], value);
        }
        if (typeof relation.anchor === 'string') put(ref, relation.anchor);
        // A single bound can use the shorthand fields on the rule itself.
        for (const part of dependencies.length === 1 ? [ref, rule] : [ref]) {
          putReference([...part, 'anchor'], source, relation.anchor);
          put([...part, relation.unit === 'month' ? 'offsetMonths' : 'offsetDays'], relation.amount);
          put([...part, 'inclusive'], relation.inclusive);
        }
        if (dependencies.every(other => other.relation.inclusive === relation.inclusive)) {
          put([...rule, 'inclusive'], relation.inclusive);
        }
      } else if (type === 'course') {
        put([...rule, 'kind'], 'course');
        for (const key of ['direction', 'weekday', 'count']) put([...rule, key], relation[key]);
        relation.skip?.forEach((entry, i) => put([...rule, 'skip', i], entry));
        if (date) dateParts(rule, date);
        putReference([...rule, 'anchor'], source, edge.reference);
      } else if (boundary) {
        if (boundary === 'fixed') dateParts(rule, date);
        put([...rule, 'month'], Number(date.slice(5, 7)));
        put([...rule, 'kind'], edge.nestedDate ? type : type === 'same_day' ? boundary : type === 'offset' ? 'offset_from_' + (boundary === 'fixed' ? 'date' : boundary) : type);
        put([...rule, 'occurrence'], relation.occurrence);
        put([...rule, 'days'], relation.days);
        put([...rule, 'weeks'], relation.weeks);
        put([...rule, 'whole'], relation.whole);
      } else {
        put([...rule, 'kind'], type === 'same_day' ? 'anchor' : type);
        putReference([...rule, 'anchor'], source, edge.reference);
        put([...rule, 'occurrence'], relation.occurrence);
        put([...rule, 'days'], relation.days);
        put([...rule, 'weeks'], relation.weeks);
        put([...rule, 'whole'], relation.whole);
      }
    });
  }
  return fields;
}
