import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { applyRemovedNodes, configurationFields, configurationFromFields, readDisplayedConfiguration, renderConfigurationNodes, sourceTextChanges } from '../lib/config-graph.js';
import { loadPlanCalendars } from '../lib/calendar-sources.mjs';
import { calendarYear, effectiveItem, resolveSchedule } from '../lib/schedule.mjs';

test('removing a group keeps member dates and overrides, omitting individually removed cards', () => {
  const plan = {
    groups: { close: { date: { month: 2, day: 28 }, defaults: { layer: 'finance' } } },
    items: [
      { id: 'report', group: 'close' },
      { id: 'review', group: 'close', schedule: { kind: 'fixed', month: 3, day: 1 } },
      { id: 'obsolete', group: 'close' },
    ],
  };
  applyRemovedNodes(plan, new Map([
    ['group:close', { itemGroup: 'close' }], ['item:obsolete', { deadlineId: 'obsolete' }],
  ]), effectiveItem);
  assert.deepEqual(plan.groups, {});
  assert.deepEqual(plan.items, [
    { id: 'report', layer: 'finance', schedule: { kind: 'fixed', month: 2, day: 28 } },
    { id: 'review', layer: 'finance', schedule: { kind: 'fixed', month: 3, day: 1 } },
  ]);
});

test('removing a calendar cleans up references and preserves independent weekday constraints', () => {
  const plan = {
    schedules: { bookings: {}, closures: {}, combined: { includes: ['bookings', 'closures'] } },
    constraints: { avoid: { schedule: 'bookings', no: true }, shared: { weekday: 3, schedule: 'bookings', membership: 'inside' } },
    items: [{ id: 'review', schedule: { kind: 'next_weekday', anchor: 'start_of_year', constraints: ['avoid', 'shared'] } }],
  };
  applyRemovedNodes(plan, new Map([['calendar:bookings', { scheduleKey: 'bookings' }]]), effectiveItem);
  assert.deepEqual(plan.schedules, { closures: {}, combined: { includes: ['closures'] } });
  assert.deepEqual(plan.constraints, { shared: { weekday: 3 } });
  assert.deepEqual(plan.items[0].schedule.constraints, ['shared']);
});

test('graph fields preserve types, empty collections, item order and literal mapping keys', () => {
  const plan = JSON.parse('{"items":[{"id":"later"},{"id":"earlier","extra":null}],"anchors":{},"flags":[false,2,"2"],"overrides":{"a.b":[],"__proto__":{"value":0}}}');
  assert.deepEqual(configurationFromFields([...configurationFields(plan)].reverse()), plan);
  const translated = structuredClone(plan);
  plan.items[1].title = 'Meeting';
  translated.items[1].title = 'Møte';
  assert.deepEqual(sourceTextChanges(plan, translated), [
    [JSON.stringify(['items', 'earlier', 'title']), ['Møte', 'Meeting']],
  ]);
});

test('the editor omits the plan version and exports the current format for unversioned and older inputs', () => {
  const root = { querySelectorAll: () => [] };
  const nestedVersion = { source: { version: 7 } };
  const graph = new Map([[JSON.stringify(['source', 'version']), 7]]);
  for (const plan of [nestedVersion, { version: 0, ...nestedVersion }, { version: 1, ...nestedVersion }]) {
    renderConfigurationNodes(root, plan, new Map(), () => assert.fail('Unexpected details'), new Set(), () => graph);
    assert.deepEqual(readDisplayedConfiguration(root), { version: 1, ...nestedVersion });
  }
});

test('recoverable fields need no expansion and are read from the current graph on export', () => {
  const root = { querySelectorAll: () => [] };
  const plan = { items: [{ id: 'review', title: 'Sitzung' }] };
  const graph = new Map([
    [JSON.stringify(['items', 0, 'id']), 'review'],
    [JSON.stringify(['items', 0, 'title']), 'Sitzung'],
  ]);
  const translations = new Map([[JSON.stringify(['items', 'review', 'title']), ['Sitzung', 'Meeting']]]);
  renderConfigurationNodes(root, plan, translations, () => assert.fail('Unexpected details'), new Set(), () => graph);
  assert.equal(readDisplayedConfiguration(root).items[0].title, 'Meeting');
  graph.set(JSON.stringify(['items', 0, 'title']), 'Rescheduled');
  assert.equal(readDisplayedConfiguration(root).items[0].title, 'Rescheduled');
});

test('advanced options include only residual plan fields and export alongside graph fields', () => {
  const root = { querySelectorAll: () => [] };
  const plan = { display: { title: 'My wheel', locale: 'nb-NO' } };
  const graph = new Map([[JSON.stringify(['display', 'title']), plan.display.title]]);
  const advanced = renderConfigurationNodes(root, plan, new Map(), () => null, new Set(), () => graph);
  assert.deepEqual(advanced, [{ path: ['display', 'locale'], value: 'nb-NO' }]);
  assert.deepEqual(readDisplayedConfiguration(root), { version: 1, ...plan });
});

test('a reconstructed plan resolves with separate calendar sources and retains confirmed dates', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'wheel-calendar-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'breaks.yaml'), 'fixed: [{ month: 3, day: 31 }]\n');
  const plan = {
    schedules: { breaks: { source: 'breaks.yaml' }, combined: { includes: ['breaks'] } },
    constraints: { avoid: { no: true, schedule: 'combined' } },
    anchors: { limit: { defaultDate: { kind: 'month_end', month: 3 }, defaultDateRelation: 'less_or_equal' } },
    items: [
      { id: 'meeting', schedule: { kind: 'anchor', anchor: 'limit', constraints: ['avoid'] } },
      { id: 'pinned', date: '2026-03-20', schedule: { kind: 'offset', anchor: 'meeting', days: 1 } },
    ],
  };
  const restored = configurationFromFields(configurationFields(plan));
  await writeFile(join(dir, 'calendars.yaml'), 'school.breaks: {title: School breaks, source: breaks.yaml}\n');
  const { plan: imported, sources } = await loadPlanCalendars(restored, join(dir, 'plan.yaml'));
  assert.deepEqual(imported.schedules.breaks, { calendar: 'school.breaks' });
  assert.equal(sources['school.breaks'].title, 'School breaks');
  assert.equal(sources['school.breaks'].source, undefined);
  const downloaded = configurationFromFields(configurationFields(imported));
  const rebuilt = await loadPlanCalendars(downloaded, join(dir, 'other-plan.yaml'));
  assert.deepEqual(rebuilt.sources, sources);
  const result = resolveSchedule(rebuilt.plan, 2026, {}, {}, rebuilt.sources);
  assert.equal(result.meeting.date.getDate(), 30);
  assert.equal(result.pinned.date.getDate(), 20);
  assert.throws(() => calendarYear(plan.schedules.combined, 2026, plan.schedules), /Missing calendar source/);
  assert.deepEqual(restored, plan);
  downloaded.schedules.breaks.calendar = 'missing';
  await assert.rejects(loadPlanCalendars(downloaded, join(dir, 'plan.yaml')), /Unknown calendar reference: missing/);
});
