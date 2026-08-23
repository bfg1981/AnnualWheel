import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { resolveItemStatuses, resolveSchedule } from '../lib/schedule.mjs';

const config = YAML.parse(await readFile(new URL('./fixtures/schedule-template.yaml', import.meta.url), 'utf8'));
const iso = value => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

test('removes tentative dependency state when every anchor is set', () => {
  const statuses = resolveItemStatuses(config, Object.fromEntries(Object.keys(config.anchors).map(id => [id, 'set'])));
  assert.deepEqual(Object.values(statuses).filter(status => status !== 'set'), []);
});

test('resolves recurring and relative dates', () => {
  const schedule = resolveSchedule(config, 2026);
  assert.equal(iso(schedule['annual-event'].date), '2026-08-08');
  assert.equal(iso(schedule['follow-up'].date), '2026-08-10');
  assert.equal(iso(schedule['week-before-planning'].date), '2026-03-24');
  assert.equal(iso(schedule['february-end'].date), '2026-02-28');
});

test('moves dependent dates when an anchor changes', () => {
  const schedule = resolveSchedule(config, 2026, { summer_break: '2026-07-01' });
  assert.equal(iso(schedule['before-break'].date), '2026-06-29');
});

test('generates the following year from the same template', () => {
  const schedule = resolveSchedule(config, 2027);
  assert.equal(iso(schedule['annual-event'].date), '2027-08-14');
  assert.equal(iso(schedule['follow-up'].date), '2027-08-16');
  assert.equal(iso(schedule['february-end'].date), '2027-02-28');
});

test('uses the actual final day of February in leap years', () => {
  const schedule = resolveSchedule(config, 2028);
  assert.equal(iso(schedule['february-end'].date), '2028-02-29');
});
