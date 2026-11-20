import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { calendarOccurrences, excludedSchedules, scheduledDays, resolveItemStatuses, resolveSchedule } from '../lib/schedule.mjs';

const config = YAML.parse(await readFile(new URL('./fixtures/schedule-template.yaml', import.meta.url), 'utf8'));
const iso = value => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

test('only cards explicitly referencing a calendar exclusion report a conflict', () => {
  const plan = {
    constraints: { exclude: { no: true, schedule: 'daysOff' } },
    schedules: { daysOff: { title: 'Days off', weekdays: [0] } },
    items: [
      { id: 'monthEnd', schedule: { kind: 'month_end', month: 2 } },
      { id: 'sameDay', schedule: { kind: 'offset', anchor: 'monthEnd', days: 0, constraints: ['exclude'] } },
      { id: 'fixed', schedule: { kind: 'fixed', month: 2, day: 28 } },
      { id: 'anotherRelative', schedule: { kind: 'offset', anchor: 'monthEnd', days: 0 } },
    ],
  };
  const resolved = resolveSchedule(plan, 2027);
  for (const item of plan.items) assert.equal(iso(resolved[item.id].date), '2027-02-28');
  assert.deepEqual(excludedSchedules(plan, plan.items[0].schedule), []);
  assert.deepEqual(excludedSchedules(plan, plan.items[2].schedule), []);
  assert.equal(resolved.monthEnd.conflicts, undefined);
  assert.equal(resolved.anotherRelative.conflicts, undefined);
  assert.deepEqual(resolved.sameDay.conflicts, ['daysOff']);
  assert.equal(resolveSchedule(plan, 2027, {}, { sameDay: '2027-03-01' }).sameDay.conflicts, undefined);
  plan.constraints.exclude.no = false;
  assert.equal(resolveSchedule(plan, 2027).sameDay.conflicts, undefined);
});

test('calendar tracks merge coincident weekdays and annual dates and follow Easter and leap years', () => {
  const schedule = { weekdays: [0], fixed: [{ month: 2, day: 29 }], easterOffsets: [0, 1] };
  const dates = scheduledDays(schedule, 2024).map(iso);
  assert.ok(dates.includes('2024-02-29'));
  assert.equal(dates.filter(d => d === '2024-03-31').length, 1);
  assert.ok(dates.includes('2024-04-01'));
  const following = scheduledDays(schedule, 2025).map(iso);
  assert.ok(following.includes('2025-04-21'));
  assert.ok(!following.includes('2025-03-01'));
});

test('one calendar marker retains every distinct holiday name on a shared date', () => {
  const schedule = {
    fixed: [{ month: 5, day: 17, title: 'Constitution Day' }],
    weekdays: [{ weekday: 0, title: 'Sunday' }],
    easterOffsets: [{ days: -2, title: 'Good Friday' }, { days: 50, title: 'Whit Monday' }],
  };
  const occurrences = calendarOccurrences(schedule, 2027);
  const namesOn = day => occurrences.filter(entry => iso(entry.date) === day).map(entry => entry.titles);
  assert.deepEqual(namesOn('2027-05-17'), [['Constitution Day', 'Whit Monday']]);
  assert.deepEqual(namesOn('2027-03-26'), [['Good Friday']]);
  assert.deepEqual(namesOn('2027-01-03'), [['Sunday']]);
});

test('combines a strict prerequisite with an inclusive calendar-month minimum', () => {
  const plan = { anchors: {}, items: [
    { id: 'first', schedule: { kind: 'fixed', month: 1, day: 31 } },
    { id: 'review', schedule: { kind: 'fixed', month: 2, day: 28 } },
    { id: 'follow-up', schedule: { kind: 'next_weekday', weekday: 4, after: [
      'review', { anchor: 'first', offsetMonths: 1, inclusive: true },
    ] } },
  ] };
  assert.equal(iso(resolveSchedule(plan, 2024)['follow-up'].date), '2024-02-29');
  const delayed = resolveSchedule(plan, 2024, {}, { review: '2024-02-29' });
  assert.equal(iso(delayed['follow-up'].date), '2024-03-07');
});

test('a month-end anchor follows the calendar until its date is overridden', () => {
  const plan = {
    anchors: { review: { defaultDate: { kind: 'month_end', month: 2 } } },
    items: [
      { id: 'meeting', schedule: { kind: 'anchor', anchor: 'review' } },
      { id: 'reminder', schedule: { kind: 'offset', anchor: 'review', days: -1 } },
    ],
  };
  assert.equal(iso(resolveSchedule(plan, 2027).meeting.date), '2027-02-28');
  assert.equal(iso(resolveSchedule(plan, 2028).meeting.date), '2028-02-29');
  const moved = resolveSchedule(plan, 2028, { review: '2028-02-15' });
  assert.equal(iso(moved.meeting.date), '2028-02-15');
  assert.equal(iso(moved.reminder.date), '2028-02-14');
});

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

test('start_of_year is a recurring dependency without a configured year', () => {
  const plan = { anchors: {}, items: [
    { id: 'opening', schedule: { kind: 'offset', anchor: 'start_of_year', days: 1 } },
  ] };
  for (const year of [2027, 2028]) {
    assert.equal(iso(resolveSchedule(plan, year).opening.date), `${year}-01-02`);
  }
  assert.equal(resolveItemStatuses(plan).opening, 'set');
  plan.anchors.start_of_year = { defaultDate: { month: 4, day: 1 } };
  assert.equal(iso(resolveSchedule(plan, 2028).opening.date), '2028-04-02');
});
