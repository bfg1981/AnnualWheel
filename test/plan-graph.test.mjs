import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import YAML from 'yaml';
import { readPlan, toPlanDocument } from '../lib/plan-graph.js';
import { normalizeAnchorDependencies, resolveItemStatuses, resolveSchedule } from '../lib/schedule.mjs';

test('legacy recurrences keep their dates and statuses after a JSON graph round trip', async () => {
  const fixture = new URL('./fixtures/schedule-template.yaml', import.meta.url);
  const plan = normalizeAnchorDependencies(YAML.parse(await readFile(fixture, 'utf8')));
  const graph = toPlanDocument(plan);
  assert.deepEqual(Object.keys(graph.graph), ['layers', 'nodes', 'edges']);
  const restored = readPlan(JSON.parse(JSON.stringify(graph)));
  assert.deepEqual(toPlanDocument(restored), graph);
  assert.deepEqual(resolveItemStatuses(restored), resolveItemStatuses(plan));
  for (const year of [2026, 2027, 2028]) {
    assert.deepEqual(resolveSchedule(restored, year), resolveSchedule(plan, year));
  }
});

test('group defaults, calendar composition, week offsets and course endpoints are linked by ID', () => {
  const plan = {
    initialYear: 'current', display: { locale: 'en-GB' },
    layers: { events: { label: 'Events' } }, autoLayers: { course: 'events' },
    groups: { series: { title: 'Series', collapsed: false, date: { month: 1, day: 5 },
      defaults: { layer: 'events', status: 'set' } } },
    schedules: { closed: { includes: ['breaks'] }, breaks: { weekdays: [0] } },
    constraints: { open: { schedule: 'closed', membership: 'outside' } },
    anchors: { opening: { defaultDate: { kind: 'relative' },
      dependency: { type: 'offset', source: { kind: 'month_start', month: 2 }, weeks: 0, whole: true } } },
    items: [
      { id: 'notice', group: 'series', title: 'Notice' },
      { id: 'sessions', kind: 'course', layer: 'auto', schedule: { kind: 'course', direction: 'forward',
        weekday: 1, count: 3, anchor: 'opening', constraints: ['open'] } },
      { id: 'wrap', schedule: { kind: 'offset', anchor: 'sessions.end', days: 1, rule: 'Review',
        after: [{ anchor: { group: 'series' }, offsetMonths: 1, inclusive: true }] } },
    ],
  };
  const { settings, graph } = toPlanDocument(plan);
  assert.ok(graph.edges.some(edge => edge.endpoint === 'end' && edge.from === 'item:sessions'));
  assert.ok(graph.edges.some(edge => edge.type === 'greater_or_equal' && edge.from === 'group:series'));
  const restored = readPlan({ settings, graph: { ...graph, edges: [...graph.edges].reverse() } });
  assert.deepEqual(restored.items[0], plan.items[0]);
  assert.deepEqual(restored.groups, plan.groups);
  assert.deepEqual(restored.schedules, plan.schedules);
  assert.deepEqual(restored.anchors, plan.anchors);
  assert.deepEqual(restored.items[2].schedule.rule, 'Review');
  assert.deepEqual(resolveSchedule(restored, 2028), resolveSchedule(plan, 2028));
});

test('a virtual date keeps its authored ID when edited, including with forward references', () => {
  const graph = {
    nodes: [{ id: 'item:review' }, { id: 'initial' },
      { id: 'date:cutoff', date: { kind: 'month_end', month: 2 } }],
    edges: [{ from: 'date:cutoff', to: 'item:review', type: 'same_day' }],
  };
  const plan = readPlan(graph);
  plan.items[0].schedule.month = 3;
  const edited = toPlanDocument(plan, graph);
  assert.deepEqual(edited.graph.edges, graph.edges);
  assert.deepEqual(edited.graph.nodes.find(node => node.id === 'date:cutoff').date, { kind: 'month_end', month: 3 });
  assert.equal(resolveSchedule(readPlan(edited), 2028).review.date.getDate(), 31);
});

test('malformed graphs report duplicate IDs, missing endpoints and incompatible relations', () => {
  const nodes = [{ id: 'initial' }, { id: 'item:event' }, { id: 'layer:events' }];
  assert.throws(() => readPlan({ nodes: [...nodes, nodes[0]], edges: [] }), /Duplicate node/);
  assert.throws(() => readPlan({ nodes, edges: [{ from: 'item:missing', to: 'item:event', type: 'offset' }] }), /Unknown graph endpoint/);
  assert.throws(() => readPlan({ nodes, edges: [{ from: 'layer:events', to: 'item:event', type: 'same_day' }] }), /Invalid date source/);
});

test('older graphs move layers and their defaults into the ordered layers collection', () => {
  const settings = { organisation: { name: 'Observatory' }, display: { title: 'Observations' },
    translations: { overrides: {} } };
  const initial = { id: 'initial', initialYear: 2028, initialRule: 'Start of year' };
  const layer = { id: 'layer:events', label: 'Events' };
  const deadline = { id: 'item:review', layer: 'auto', kind: 'event' };
  const due = { from: 'initial', to: deadline.id, type: 'offset', days: 3 };
  const old = { nodes: [{ ...initial, ...settings }, layer, deadline],
    edges: [{ from: layer.id, to: 'initial', type: 'default_layer', kind: 'event' }, due] };
  const migrated = toPlanDocument(readPlan(old), old);
  assert.deepEqual(migrated, {
    settings,
    graph: { layers: [{ ...layer, defaultFor: ['event'] }], nodes: [initial, deadline], edges: [due] },
  });
  const previous = { settings: { ...settings, autoLayers: { event: 'events' } },
    graph: { nodes: [initial, layer, deadline], edges: [due] } };
  assert.deepEqual(toPlanDocument(readPlan(previous), previous), migrated);
  const edited = readPlan(migrated);
  edited.display.title = 'Observing year';
  const saved = toPlanDocument(edited, migrated);
  assert.deepEqual(saved.graph, migrated.graph);
  assert.equal(saved.settings.display.title, 'Observing year');
  assert.equal(migrated.settings.display.title, 'Observations');
});
