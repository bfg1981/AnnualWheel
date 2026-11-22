import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { normalizeAnchorDependencies, anchorDateRelation, effectiveItem, weekdayDependencies, calendarOccurrences, calendarYear, excludedSchedules, scheduledDays, resolveItemStatuses, resolveSchedule, weekdayDependency } from '../lib/schedule.mjs';

const config = YAML.parse(await readFile(new URL('./fixtures/schedule-template.yaml', import.meta.url), 'utf8'));
const iso = value => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

test('a deadline needs a calculable date, including when its only rule is a dependency', () => {
  const item = { id: 'review', schedule: {} };
  const plan = { items: [item] };
  assert.throws(() => resolveSchedule(plan, 2026), /Cannot calculate date for review/);
  item.schedule = { kind: 'offset', anchor: 'start_of_year', days: 3 };
  assert.equal(iso(resolveSchedule(plan, 2026).review.date), '2026-01-04');
});

test('reattached weekday rules follow a named prerequisite or a virtual calendar boundary', () => {
  const plan = { items: [
    { id: 'source', schedule: { kind: 'fixed', month: 4, day: 10 } },
    { id: 'secondMonday', schedule: { kind: 'nth_weekday', anchor: 'source', weekday: 1, occurrence: 2 } },
    { id: 'lastFriday', schedule: { kind: 'last_weekday', anchor: 'source', weekday: 5 } },
    { id: 'beforeEnd', schedule: { kind: 'previous_weekday', weekday: 2,
      before: { baseDate: { kind: 'month_end', month: 9 }, offsetDays: -4, inclusive: true } } },
  ] };
  const dates = resolveSchedule(plan, 2026);
  assert.equal(iso(dates.secondMonday.date), '2026-04-20');
  assert.equal(iso(dates.lastFriday.date), '2026-04-10');
  assert.equal(iso(dates.beforeEnd.date), '2026-09-22');
});

test('a group supplies omitted fields and preserves individual overrides and sparse input', () => {
  const plan = {
    groups: { review: { date: { month: 9, day: 30 }, defaults: { layer: 'samples', rule: 'Label samples', configurable: true } } },
    items: [
      { id: 'first', group: 'review' },
      { id: 'second', group: 'review', configurable: false, rule: '', schedule: { kind: 'fixed', month: 2, day: 3 } },
    ],
  };
  const original = structuredClone(plan);
  assert.equal(effectiveItem(plan, plan.items[0]).rule, 'Label samples');
  assert.equal(effectiveItem(plan, plan.items[1]).rule, '');
  assert.equal(effectiveItem(plan, plan.items[1]).configurable, false);
  assert.equal(effectiveItem(plan, plan.items[1]).layer, 'samples');
  const dates = resolveSchedule(plan, 2026);
  assert.equal(iso(dates.first.date), '2026-09-30');
  assert.equal(iso(dates.second.date), '2026-02-03');
  assert.deepEqual(plan, original);
});

test('a dependency on a dated group follows its date independently of its members', () => {
  const group = { group: 'review' };
  const plan = {
    anchors: {},
    groups: { review: { date: { month: 9, day: 30 }, collapsed: true } },
    items: [
      { id: 'review', group: 'review', schedule: { kind: 'fixed', month: 5, day: 1 } },
      { id: 'report', schedule: { kind: 'offset', anchor: group, days: 0 } },
      { id: 'meeting', schedule: { kind: 'previous_weekday', before: { anchor: group }, weekday: 3 } },
    ],
  };
  assert.equal(iso(resolveSchedule(plan, 2026).report.date), '2026-09-30');
  plan.groups.review.date = { month: 6, day: 30 };
  plan.groups.review.collapsed = false;
  const dates = resolveSchedule(plan, 2026);
  assert.equal(iso(dates.report.date), '2026-06-30');
  assert.equal(iso(dates.meeting.date), '2026-06-24');
  assert.equal(iso(dates.review.date), '2026-05-01');
  assert.equal(resolveItemStatuses(plan).report, 'set');
});

test('group members and their dependants follow the shared annual date', () => {
  const plan = {
    groups: { review: { date: { month: 9, day: 30 } } },
    items: [
      { id: 'followup', schedule: { kind: 'offset', anchor: 'draft', days: 1 } },
      { id: 'draft', group: 'review', schedule: { kind: 'group' } },
      { id: 'summary', group: 'review', schedule: { kind: 'group' } },
      { id: 'other', schedule: { kind: 'fixed', month: 2, day: 7 } },
    ],
  };
  const dates = year => Object.fromEntries(Object.entries(resolveSchedule(plan, year))
    .map(([id, occurrence]) => [id, iso(occurrence.date)]));
  assert.deepEqual(dates(2026), { draft: '2026-09-30', summary: '2026-09-30', followup: '2026-10-01', other: '2026-02-07' });
  plan.groups.review.date = { month: 2, day: 28 };
  assert.deepEqual(dates(2028), { draft: '2028-02-28', summary: '2028-02-28', followup: '2028-02-29', other: '2028-02-07' });
  delete plan.groups.review.date;
  assert.throws(() => dates(2026), /Group review needs a valid annual date/);
});

test('virtual date kinds retain the dependent relation and follow the calendar in each year', () => {
  for (const [baseDate, ordinary, leap] of [
    [{ kind: 'fixed', month: 2, day: 12 }, '02-12', '02-12'],
    [{ kind: 'offset_from_date', month: 3, day: 1, days: -1 }, '02-28', '02-29'],
    [{ kind: 'offset_from_date', month: 2, day: 28, days: 1 }, '03-01', '02-29'],
    [{ kind: 'month_start', month: 2 }, '02-01', '02-01'],
    [{ kind: 'month_end', month: 2 }, '02-28', '02-29'],
    [{ kind: 'offset_from_month_start', month: 2, days: -2 }, '01-30', '01-30'],
    [{ kind: 'offset_from_month_end', month: 2, days: -2 }, '02-26', '02-27'],
  ]) {
    const plan = {
      anchors: { limit: { defaultDate: { kind: 'same_day', baseDate }, defaultDateRelation: 'less_or_equal' } },
      items: [
        { id: 'direct', schedule: { kind: 'same_day', baseDate } },
        { id: 'after', schedule: { kind: 'offset', baseDate, days: 5 } },
        { id: 'bounded', schedule: { kind: 'anchor', anchor: 'limit' } },
      ],
    };
    for (const [year, expected] of [[2027, ordinary], [2028, leap]]) {
      const dates = resolveSchedule(plan, year);
      assert.equal(iso(dates.direct.date), year + '-' + expected);
      assert.equal(iso(dates.bounded.date), iso(dates.direct.date));
      const after = new Date(dates.direct.date);
      after.setDate(after.getDate() + 5);
      assert.equal(iso(dates.after.date), iso(after));
    }
  }
});

test('relative virtual dates keep their source and distinguish plain weeks from whole weeks in the plan locale', () => {
  const baseDate = { kind: 'month_start', month: 8 };
  function date(locale, offset) {
    const plan = {
      display: { locale },
      anchors: { opening: { defaultDate: { kind: 'offset', baseDate, ...offset } } },
      items: [{ id: 'start', schedule: { kind: 'anchor', anchor: 'opening' } }],
    };
    return iso(resolveSchedule(plan, 2027).start.date);
  }
  assert.equal(date('nb-NO', { days: 7 }), '2027-08-08');
  assert.equal(date('nb-NO', { weeks: 1 }), '2027-08-08');
  assert.equal(date('nb-NO', { weeks: 1, whole: true }), '2027-08-09');
  assert.equal(date('en-US', { weeks: 1, whole: true }), '2027-08-08');
  assert.equal(date('nb-NO', { weeks: -1, whole: true }), '2027-07-26');
  assert.equal(date('nb-NO', { weeks: 0, whole: true }), '2027-08-02');
  assert.equal(date('en-US', { weeks: 0, whole: true }), '2027-08-01');
  assert.equal(date('nb-NO', { weeks: 0 }), '2027-08-01');
  assert.throws(() => date('nb-NO', { days: 1, whole: true }), /week offset/);
  assert.throws(() => date('nb-NO', { days: 7, weeks: 1 }), /days or whole weeks/);
});

test('a relative virtual date takes its calculation from its incoming dependency', () => {
  const original = {
    display: { locale: 'nb-NO' },
    anchors: { marker: { title: 'Marker', defaultDate: { kind: 'offset_from_month_start', month: 8, days: 7 } } },
    items: [{ id: 'deadline', schedule: { kind: 'anchor', anchor: 'marker' } }],
  };
  const plan = normalizeAnchorDependencies(original);
  const marker = plan.anchors.marker;
  assert.deepEqual(marker.defaultDate, { kind: 'relative' });
  assert.deepEqual(marker.dependency, { type: 'offset', source: { kind: 'month_start', month: 8 }, days: 7 });
  assert.deepEqual(normalizeAnchorDependencies(plan), plan);
  assert.equal(iso(resolveSchedule(plan, 2027).deadline.date), iso(resolveSchedule(original, 2027).deadline.date));
  delete marker.dependency.days;
  Object.assign(marker.dependency, { weeks: 0, whole: true });
  assert.equal(iso(resolveSchedule(plan, 2027).deadline.date), '2027-08-02');
  marker.dependency.source.month = 9;
  assert.equal(iso(resolveSchedule(plan, 2027).deadline.date), '2027-09-06');
  assert.deepEqual(marker.defaultDate, { kind: 'relative' });
  delete marker.dependency;
  assert.throws(() => resolveSchedule(plan, 2027), /requires an offset dependency/);
});

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

test('choose the closest date inside every required calendar and outside excluded calendars', () => {
  const plan = {
    anchors: { start: { defaultDate: { month: 1, day: 1 }, defaultDateRelation: 'greater_or_equal' } },
    schedules: {
      window: { ranges: [{ start: '2027-01-05', end: '2027-01-20' }] },
      closed: { fixed: [{ month: 1, day: 6 }] },
    },
    constraints: {
      during: { membership: 'inside', schedule: 'window' },
      avoid: { membership: 'outside', schedule: 'closed' },
    },
    items: [
      { id: 'opening', schedule: { kind: 'anchor', anchor: 'start', constraints: ['during'] } },
      { id: 'meeting', schedule: { kind: 'next_weekday', weekday: 3, after: ['opening'], constraints: ['during', 'avoid'] } },
    ],
  };
  const dates = resolveSchedule(plan, 2027);
  assert.equal(iso(dates.opening.date), '2027-01-05');
  assert.equal(iso(dates.meeting.date), '2027-01-13');
  assert.equal(dates.meeting.conflicts, undefined);
  const pinned = resolveSchedule(plan, 2027, {}, { meeting: '2027-01-27' });
  assert.deepEqual(pinned.meeting.conflicts, ['window']);
  plan.schedules.window.ranges = [];
  assert.deepEqual(resolveSchedule(plan, 2027).opening.conflicts, ['window']);
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

test('a combined calendar follows both sources for markers and conflicts across years', () => {
  const calendars = {
    regionA: { ranges: [{ start: '2026-12-31', end: '2027-01-02', title: 'Break A' }] },
    regionB: { fixed: [{ month: 1, day: 2, title: 'Break B' }, { month: 1, day: 4, title: 'Break B' }] },
    combined: { includes: ['regionA', 'regionB'] },
  };
  const occurrences = year => calendarOccurrences(calendars.combined, year, calendars);
  assert.deepEqual(occurrences(2026).map(entry => iso(entry.date)), ['2026-01-02', '2026-01-04', '2026-12-31']);
  assert.deepEqual(occurrences(2027).map(({ date, titles }) => [iso(date), titles]), [
    ['2027-01-01', ['Break A']], ['2027-01-02', ['Break A', 'Break B']], ['2027-01-04', ['Break B']],
  ]);
  const plan = {
    schedules: calendars, constraints: { exclude: { no: true, schedule: 'combined' } },
    items: [{ id: 'item', schedule: { kind: 'offset', anchor: 'start_of_year', days: 0, constraints: ['exclude'] } }],
  };
  assert.deepEqual(resolveSchedule(plan, 2027).item.conflicts, ['combined']);
  calendars.regionA.ranges[0].end = '2026-12-31';
  assert.equal(resolveSchedule(plan, 2027).item.conflicts, undefined);
  calendars.regionB.includes = ['combined'];
  assert.throws(() => occurrences(2027), /Circular calendar dependency/);
  calendars.regionB.includes = ['missing'];
  assert.throws(() => occurrences(2027), /Unknown source calendar/);
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

test('estimates respect coverage, move with Easter and ISO weeks, and preserve source certainty', () => {
  const external = {
    coverage: [{ start: '2026-08-01', end: '2027-07-31' }, { start: '2028-04-11', end: '2028-04-13' }],
    ranges: [
      { start: '2027-03-22', end: '2027-03-30', title: 'Spring break', estimateBy: 'easter' },
      { start: '2026-12-21', end: '2027-01-01', title: 'New year', estimateBy: 'monthDay' },
      { start: '2027-02-22', end: '2027-02-26', title: 'Winter', estimateBy: 'isoWeek' },
    ],
  };
  const schedules = { external, recurring: { fixed: [{ month: 4, day: 10, title: 'Holiday' }] } };
  const annual = year => calendarYear({ includes: ['external', 'recurring'] }, year, schedules);
  const lookup = result => new Map(result.occurrences.map(o => [iso(o.date), o]));
  const known = lookup(annual(2027));
  assert.equal(known.get('2027-03-22').estimated, false);
  assert.deepEqual(known.get('2027-03-22').estimatedTitles, []);
  const model = annual(2028), next = lookup(model);
  assert.deepEqual(model.estimatedPeriods.map(p => [iso(p.start), iso(p.end)]),
    [['2028-01-01','2028-04-10'], ['2028-04-14','2028-12-31']]);
  assert.equal(next.get('2028-01-01').estimated, true);
  assert.equal(next.get('2028-02-21').estimated, true);
  assert.deepEqual(next.get('2028-04-10').estimatedTitles, ['Spring break']);
  assert.equal(next.get('2028-04-10').estimated, true);
  assert.ok(!next.has('2028-04-11')); // Published coverage can establish that a day is clear.
  assert.equal(next.get('2028-04-14').estimated, true);
  const plan = { schedules, constraints: { avoid: { no: true, schedule: 'external' } },
    items: [{ id: 'item', schedule: { kind: 'fixed', month: 2, day: 21, constraints: ['avoid'] } }] };
  assert.deepEqual(resolveSchedule(plan, 2028).item.conflicts, ['external']);
});

test('a combined date needs a known status in every source, including sources with no marker', () => {
  const schedules = {
    first: { ranges: [{ start: '2026-04-01', end: '2026-04-03', title: 'Break A' }] },
    second: {
      coverage: [{ start: '2026-04-01', end: '2026-04-01' }],
      ranges: [{ start: '2026-04-03', end: '2026-04-03', title: 'Break B' }],
    },
    branch: { includes: ['second'] },
  };
  const { occurrences, estimatedPeriods } = calendarYear({ includes: ['first', 'branch', 'second'] }, 2026, schedules);
  assert.deepEqual(estimatedPeriods.map(({ start, end }) => [iso(start), iso(end)]), [
    ['2026-01-01', '2026-03-31'], ['2026-04-02', '2026-04-02'], ['2026-04-04', '2026-12-31'],
  ]);
  assert.deepEqual(occurrences.map(({ date, estimated, titles }) => [iso(date), estimated, titles]), [
    ['2026-04-01', false, ['Break A']], // Second calendar records a clear day.
    ['2026-04-02', true, ['Break A']],  // Second calendar has no data.
    ['2026-04-03', false, ['Break A', 'Break B']], // Isolated historical record.
  ]);
});

test('month adjustment details identify only the bound whose original day is missing', () => {
  const plan = { groups: { cutoff: { date: { month: 1, day: 31 } } }, items: [
    { id: 'ordinary', schedule: { kind: 'fixed', month: 1, day: 28 } },
    { id: 'review', schedule: { kind: 'previous_weekday',
      before: { baseDate: { kind: 'fixed', month: 3, day: 31 }, offsetMonths: -1 },
      after: [
        { anchor: 'ordinary', offsetMonths: 1, inclusive: true },
        { anchor: { group: 'cutoff' }, offsetMonths: 1, inclusive: true },
      ],
    } },
  ] };
  for (const [year, end] of [[2026, '02-28'], [2028, '02-29']]) {
    const result = resolveSchedule(plan, year).review;
    assert.deepEqual(result.monthAdjustments.map(({ after, index, source, boundary }) =>
      [after, index, iso(source), iso(boundary)]), [
      [false, 0, year + '-03-31', year + '-' + end],
      [true, 1, year + '-01-31', year + '-' + end],
    ]);
    assert.ok(result.date < result.monthAdjustments[0].boundary);
  }
  const rule = plan.items[1].schedule;
  rule.before.baseDate.day = 28;
  plan.groups.cutoff.date.day = 28;
  assert.equal(resolveSchedule(plan, 2026).review.monthAdjustments, undefined);
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

test('directional weekday rules use the first clear weekday while respecting offsets and overrides', () => {
  const plan = {
    anchors: { opening: { defaultDate: { kind: 'offset_from_month_start', month: 11, days: 7 } } },
    schedules: { closure: { ranges: [{ start: '2026-11-09', end: '2026-11-22' }] } },
    constraints: { workday: { weekday: 3 }, avoidClosure: { no: true, schedule: 'closure' } },
    items: [
      { id: 'forward', schedule: { kind: 'next_weekday', after: ['opening'], inclusive: true, constraints: ['workday', 'avoidClosure'] } },
      { id: 'back', schedule: { kind: 'previous_weekday', before: { anchor: 'forward', offsetDays: -7 }, inclusive: true, constraints: ['workday', 'avoidClosure'] } },
    ],
  };
  assert.equal(iso(resolveSchedule(plan, 2028).forward.date), '2028-11-08');
  const shifted = resolveSchedule(plan, 2026);
  assert.equal(iso(shifted.forward.date), '2026-11-25');
  assert.equal(iso(shifted.back.date), '2026-11-04');
  assert.equal(shifted.forward.conflicts, undefined);
  const manual = resolveSchedule(plan, 2026, {}, { forward: '2026-11-11' });
  assert.equal(iso(manual.forward.date), '2026-11-11');
  assert.deepEqual(manual.forward.conflicts, ['closure']);
  plan.constraints.workday.weekday = 2;
  assert.equal(iso(resolveSchedule(plan, 2026).forward.date), '2026-11-24');
  plan.schedules.closure.weekdays = [2];
  const impossible = resolveSchedule(plan, 2026).forward;
  assert.equal(iso(impossible.date), '2026-11-10');
  assert.deepEqual(impossible.conflicts, ['closure']);
});

test('date comparisons use the dependent as the left operand in both anchor and weekday rules', () => {
  const anchor = { defaultDate: { kind: 'month_end', month: 10 }, defaultDateRelation: 'less_or_equal' };
  const relation = anchorDateRelation(anchor);
  assert.deepEqual(relation, { type: 'less_or_equal', amount: 0, unit: 'day' });
  assert.deepEqual(anchorDateRelation({ ...anchor, defaultDateRelation: 'on_or_before' }), relation);
  for (const [kind, inclusive, type] of [
    ['previous_weekday', true, 'less_or_equal'], ['previous_weekday', false, 'less_than'],
    ['next_weekday', true, 'greater_or_equal'], ['next_weekday', false, 'greater_than'],
  ]) {
    const [edge] = weekdayDependencies({ kind, inclusive, anchor: 'limit', offsetDays: -4 });
    assert.equal(edge.type, type);
    assert.equal(edge.amount, -4);
    assert.equal(edge.anchor, 'limit');
  }
});

test('resolve a bounded anchor before its dependents regardless of declaration order', () => {
  const plan = {
    anchors: { cutoff: { defaultDate: { kind: 'month_end', month: 6 }, defaultDateRelation: 'less_or_equal' } },
    schedules: { closed: { ranges: [{ start: '2026-06-24', end: '2026-07-02' }] } },
    constraints: { avoid: { no: true, schedule: 'closed' } },
    items: [
      { id: 'follow-up', schedule: { kind: 'next_weekday', weekday: 3, after: ['meeting', 'preparation'] } },
      { id: 'preparation', schedule: { kind: 'previous_weekday', weekday: 3, before: { anchor: 'cutoff', offsetDays: -4 }, inclusive: true } },
      { id: 'meeting', schedule: { kind: 'anchor', anchor: 'cutoff', constraints: ['avoid'] } },
    ],
  };
  const dates = resolveSchedule(plan, 2026);
  assert.equal(iso(dates.meeting.date), '2026-06-23');
  assert.equal(dates.meeting.conflicts, undefined);
  assert.equal(iso(dates.preparation.date), '2026-06-17');
  assert.equal(iso(dates['follow-up'].date), '2026-06-24');
  assert.deepEqual(resolveSchedule({ ...plan, items: [...plan.items].reverse() }, 2026), dates);
  assert.equal(iso(resolveSchedule(plan, 2027).meeting.date), '2027-06-30');
  const pinned = resolveSchedule(plan, 2026, { cutoff: '2026-06-30' });
  assert.equal(iso(pinned.meeting.date), '2026-06-30');
  assert.deepEqual(pinned.meeting.conflicts, ['closed']);
  assert.equal(iso(pinned.preparation.date), '2026-06-24');
  delete plan.anchors.cutoff.defaultDateRelation;
  assert.deepEqual(resolveSchedule(plan, 2026).meeting, pinned.meeting);
});

test('cyclic item dependencies are reported when traversing prerequisites', () => {
  const items = ['a', 'b'].map((id, index) => ({
    id, schedule: { kind: 'offset', anchor: index ? 'a' : 'b', days: 1 },
  }));
  assert.throws(() => resolveSchedule({ items }, 2026), /Circular schedule dependency/);
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
  assert.equal(iso(schedule['sky-survey'].date), '2026-05-19');
  assert.equal(iso(schedule['process-images'].date), '2026-05-22');
  assert.equal(iso(schedule['print-charts'].date), '2026-10-12');
  assert.equal(iso(schedule['february-end'].date), '2026-02-28');
});

test('moves dependent dates when an anchor changes', () => {
  const schedule = resolveSchedule(config, 2026, { dome_service: '2026-07-01' });
  assert.equal(iso(schedule['inspect-dome'].date), '2026-06-29');
});

test('generates the following year from the same template', () => {
  const schedule = resolveSchedule(config, 2027);
  assert.equal(iso(schedule['sky-survey'].date), '2027-05-18');
  assert.equal(iso(schedule['process-images'].date), '2027-05-21');
  assert.equal(iso(schedule['february-end'].date), '2027-02-28');
});

test('uses the actual final day of February in leap years', () => {
  const schedule = resolveSchedule(config, 2028);
  assert.equal(iso(schedule['february-end'].date), '2028-02-29');
});

test('applies one shared weekday constraint across different recurrence rules', () => {
  const schedule = resolveSchedule(config, 2026);
  assert.equal(iso(schedule['align-mirrors'].date), '2026-06-16');
  assert.equal(iso(schedule['prepare-lenses'].date), '2026-10-13');
  assert.equal(iso(schedule['store-lenses'].date), '2026-10-27');
  assert.equal(iso(schedule['sky-survey'].date), '2026-05-19');
  assert.equal(iso(schedule['clean-filters'].date), '2026-07-28');

  const thursdayConfig = structuredClone(config);
  thursdayConfig.constraints.lab_day.weekday = 4;
  const thursdaySchedule = resolveSchedule(thursdayConfig, 2026);
  for (const id of ['align-mirrors', 'prepare-lenses', 'store-lenses', 'sky-survey', 'clean-filters']) {
    assert.equal(thursdaySchedule[id].date.getDay(), 4);
  }
});

test('satisfies dependencies identify the referenced weekday rule, even for equal weekdays', () => {
  const plan = { constraints: { first: { weekday: 3 }, other: { weekday: 3 } } };
  for (const id of Object.keys(plan.constraints)) {
    assert.deepEqual(weekdayDependency(plan, { constraints: [id] }), { type: 'satisfies', source: id, weekday: 3 });
  }
  assert.equal(weekdayDependency(plan, { weekday: 3, constraints: ['first'] }), undefined);
});

test('uses a confirmed item override instead of its suggestion', () => {
  const schedule = resolveSchedule(config, 2026, {}, { 'prepare-lenses': '2026-10-06' });
  assert.equal(iso(schedule['prepare-lenses'].date), '2026-10-06');
  assert.equal(iso(schedule['store-lenses'].date), '2026-10-20');
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
