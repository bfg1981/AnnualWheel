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

test('applies one shared weekday constraint to every board meeting', () => {
  const schedule = resolveSchedule(config, 2026);
  assert.equal(iso(schedule['board-meeting-january'].date), '2026-01-14');
  assert.equal(iso(schedule['board-meeting-before-planning'].date), '2026-03-18');
  assert.equal(iso(schedule['board-meeting-after-planning'].date), '2026-04-22');
  assert.equal(iso(schedule['board-meeting-autumn'].date), '2026-08-12');
  assert.equal(iso(schedule['board-meeting-november'].date), '2026-11-25');

  const thursdayConfig = structuredClone(config);
  thursdayConfig.constraints.board_meeting.weekday = 4;
  const thursdaySchedule = resolveSchedule(thursdayConfig, 2026);
  for (const id of ['board-meeting-january', 'board-meeting-before-planning', 'board-meeting-after-planning', 'board-meeting-autumn', 'board-meeting-november']) {
    assert.equal(thursdaySchedule[id].date.getDay(), 4);
  }
});

test('uses a confirmed item override instead of its suggestion', () => {
  const schedule = resolveSchedule(config, 2026, {}, { 'board-meeting-before-planning': '2026-03-11' });
  assert.equal(iso(schedule['board-meeting-before-planning'].date), '2026-03-11');
  assert.equal(iso(schedule['board-meeting-after-planning'].date), '2026-04-15');
});
