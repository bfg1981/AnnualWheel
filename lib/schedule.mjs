const copy = value => new Date(value);
export function yearBandSegments(rotation, year) {
  const normalize = angle => ((angle % 360) + 360) % 360;
  const splitAngle = normalize(rotation - 90);
  const firstPortion = normalize(splitAngle - 90) / 360;
  const firstYear = year + (firstPortion > 0.5 ? 0 : -1);
  return [
    { start: 90, portion: firstPortion, year: firstYear },
    { start: splitAngle, portion: 1 - firstPortion, year: firstYear + 1 },
  ];
}
const nthWeekday = (first, weekday, occurrence) => {
  return offset(first, (weekday - first.getDay() + 7) % 7 + (occurrence - 1) * 7);
};
function firstDayOfWeek(locale = 'en-GB') {
  const regionLocale = new Intl.Locale(locale);
  const info = regionLocale.getWeekInfo?.() ?? regionLocale.weekInfo;
  if (info) return info.firstDay % 7;
  // ICU region defaults for browsers without Intl.Locale week information.
  const region = regionLocale.maximize().region;
  if (region === 'MV') return 5;
  if ('AF BH DJ DZ EG IQ IR JO KW LY OM QA SD SY'.split(' ').includes(region)) return 6;
  if ('AG AS BD BR BS BT BW BZ CA CO DM DO ET GT GU HK HN ID IL IN IS JM JP KE KH KR LA MH MM MO MT MX MZ NI NP PA PE PH PK PR PT PY SA SG SV TH TT TW UM US VE VI WS YE ZA ZW'.split(' ').includes(region)) return 0;
  return 1;
}
const nthFullWeekday = (first, weekday, occurrence, locale) => {
  const start = firstDayOfWeek(locale);
  return offset(nextWeekday(first, start, true), (occurrence - 1) * 7 + (weekday - start + 7) % 7);
};
const monthEnd = (year, month) => new Date(year, month, 0);
export function calendarBoundary(rule, year, locale) {
  if (rule.baseDate) return { kind: rule.baseDate.kind ?? 'fixed', date: resolveVirtualDate(rule.baseDate, year, locale), definition: rule.baseDate };
  if (rule.anchor && ['nth_weekday', 'nth_full_weekday', 'last_weekday'].includes(rule.kind)) return;
  let kind;
  switch (rule.kind) {
    case 'offset_from_date': {
      const definition = { kind: 'fixed', month: rule.month, day: rule.day };
      return { kind: 'fixed', date: resolveVirtualDate(definition, year), definition };
    }
    case 'month_start':
    case 'offset_from_month_start': kind = 'month_start'; break;
    case 'month_end':
    case 'offset_from_month_end': kind = 'month_end'; break;
    case 'nth_weekday':
    case 'nth_full_weekday':
    case 'last_weekday': kind = rule.kind === 'last_weekday' ? 'month_end' : 'month_start'; break;
    default: return;
  }
  if (kind === 'month_start') return { kind, date: new Date(year, rule.month - 1, 1) };
  if (kind === 'month_end') return { kind, date: monthEnd(year, rule.month) };
  throw new Error('Unknown month boundary: ' + kind);
}
const offset = (value, days) => {
  const date = copy(value);
  date.setDate(date.getDate() + days);
  return date;
};
function offsetDays(rule) {
  if (rule.weeks !== undefined) {
    if (rule.days !== undefined || !Number.isSafeInteger(rule.weeks * 7) || !Number.isInteger(rule.weeks)) throw new Error('Specify the offset in whole days or whole weeks');
    return rule.weeks * 7;
  }
  if (rule.whole) throw new Error('Whole weeks require a week offset');
  if (!Number.isSafeInteger(rule.days)) throw new Error('A date offset requires a whole number of days');
  return rule.days;
}
function applyDateOffset(base, rule, locale) {
  const days = offsetDays(rule);
  if (!rule.whole) return offset(base, days);
  const firstWholeWeek = nextWeekday(base, firstDayOfWeek(locale), true);
  return offset(firstWholeWeek, days);
}
const nextWeekday = (value, weekday, inclusive = false) => {
  const date = copy(value);
  const days = (weekday - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + (inclusive ? days : days || 7));
  return date;
};
const previousWeekday = (value, weekday, inclusive = false) => {
  const date = copy(value);
  const days = (date.getDay() - weekday + 7) % 7;
  date.setDate(date.getDate() - (inclusive ? days : days || 7));
  return date;
};
const easter = year => {
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  return new Date(year, Math.floor((h+l-7*m+114)/31)-1, (h+l-7*m+114)%31+1);
};
const holiday = (date, skip) => {
  const year=date.getFullYear(), time=+date;
  if (skip?.includes('easter')) { const day=easter(year), start=copy(day), end=copy(day); start.setDate(day.getDate()-6); end.setDate(day.getDate()+1); if(time>=start&&time<=end)return true; }
  if (skip?.includes('autumn_holiday')) { const jan4=new Date(year,0,4), start=new Date(year,0,4-((jan4.getDay()||7)-1)+39*7), end=copy(start); end.setDate(start.getDate()+6); if(time>=start&&time<=end)return true; }
  return false;
};
const course = (start, direction, weekday, count, skip) => {
  let date=copy(start), sessions=[];
  if(direction==='backward') while(date.getDay()!==weekday) date.setDate(date.getDate()-1);
  else date=nextWeekday(new Date(+date-86400000),weekday);
  while(sessions.length<count) { if(!holiday(date,skip)) direction==='backward'?sessions.unshift(copy(date)):sessions.push(copy(date)); date.setDate(date.getDate()+(direction==='backward'?-7:7)); }
  return sessions;
};

// HTML date controls supply civil dates without a time zone.
function parseCalendarDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

export function scheduleAnchors(config) {
  return {
    start_of_year: { title: 'Initial object', defaultDate: { month: 1, day: 1 }, status: 'set' },
    ...config.anchors,
  };
}

// Legacy anchors stored their incoming offset on the virtual date itself.
export function normalizeAnchorDependencies(plan) {
  const anchors = { ...plan.anchors };
  for (const [id, anchor] of Object.entries(anchors)) {
    const date = anchor.defaultDate;
    if (!date || anchor.dependency || anchor.defaultDateRelation) continue;
    const { kind, month, day, baseDate, days, weeks, whole, rule, ...metadata } = date;
    let source = baseDate;
    if (kind === 'offset_from_date') source = { kind: 'fixed', month, day };
    else if (kind === 'offset_from_month_start') source = { kind: 'month_start', month };
    else if (kind === 'offset_from_month_end') source = { kind: 'month_end', month };
    else if (!source || !['offset', 'same_day'].includes(kind)) continue;
    const amount = weeks !== undefined ? { weeks } : { days: kind === 'same_day' ? 0 : days };
    anchors[id] = { ...anchor, defaultDate: { ...metadata, kind: 'relative' },
      dependency: { type: 'offset', source: rule === undefined ? source : { ...source, rule }, ...amount, ...(whole !== undefined && { whole }) } };
  }
  return { ...plan, anchors };
}

export function resolveAnchorDate(anchor, year, override, locale) {
  if (override) {
    const date = parseCalendarDate(override);
    return new Date(year, date.getMonth(), date.getDate());
  }
  const rule = anchor.defaultDate;
  if (rule.kind === 'relative') {
    const dep = anchor.dependency;
    if (dep?.type !== 'offset' || !dep.source) throw new Error('A relative date requires an offset dependency and a source');
    return applyDateOffset(resolveVirtualDate(dep.source, year, locale), dep, locale);
  }
  if (rule.baseDate) {
    const base = resolveVirtualDate(rule.baseDate, year, locale);
    return rule.kind === 'offset' ? applyDateOffset(base, rule, locale) : base;
  }
  return resolveVirtualDate(rule, year, locale);
}

export function resolveVirtualDate(rule, year, locale) {
  const { kind = 'fixed', month, day } = rule;
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Invalid virtual date month');
  if (kind === 'fixed') {
    if (!Number.isInteger(day) || day < 1 || day > monthEnd(2000, month).getDate()) throw new Error('Invalid virtual date day');
    return new Date(year, month - 1, day);
  }
  const boundary = calendarBoundary(rule, year, locale);
  if (kind === 'offset_from_date' || kind === 'offset_from_month_start' || kind === 'offset_from_month_end') return applyDateOffset(boundary.date, rule, locale);
  if (kind === 'month_start' || kind === 'month_end') return boundary.date;
  throw new Error('Unknown virtual date kind: ' + kind);
}

export function weekdayDependency(config, rule) {
  if (rule.weekday != null) return;
  for (const id of rule.constraints ?? []) {
    const constraint = config.constraints?.[id];
    if (!constraint) throw new Error(`Unknown constraint: ${id}`);
    if (constraint.weekday == null) continue;
    if (!Number.isInteger(constraint.weekday) || constraint.weekday < 0 || constraint.weekday > 6) {
      throw new Error(`Invalid weekday in constraint: ${id}`);
    }
    return { type: 'satisfies', source: id, weekday: constraint.weekday };
  }
}

export function configuredWeekday(config, rule) {
  return rule.weekday ?? weekdayDependency(config, rule)?.weekday;
}

export function isRelativeRule(rule) {
  return !['fixed', 'same_day', 'month_start', 'month_end'].includes(rule.kind);
}

export function calendarConstraints(config, rule) {
  const rules = [];
  for (const id of rule.constraints ?? []) {
    const constraint = config.constraints?.[id];
    if (!constraint) throw new Error(`Unknown constraint: ${id}`);
    if (!('schedule' in constraint)) continue;
    // Older plans use no: true for exclusion and no: false to disable the constraint.
    let membership = constraint.membership;
    if (membership === undefined && typeof constraint.no === 'boolean') {
      membership = constraint.no ? 'outside' : null;
    } else if (!['inside', 'outside'].includes(membership) || constraint.no !== undefined) {
      throw new Error(`Invalid calendar membership in constraint: ${id}`);
    }
    if (!Object.hasOwn(config.schedules ?? {}, constraint.schedule)) throw new Error(`Unknown schedule: ${constraint.schedule}`);
    if (membership) rules.push({ id, schedule: constraint.schedule, membership });
  }
  return rules;
}

export function excludedSchedules(config, rule) {
  return [...new Set(calendarConstraints(config, rule).filter(entry => entry.membership === 'outside').map(entry => entry.schedule))];
}

function rangeDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Expected a YYYY-MM-DD calendar date');
  const date = parseCalendarDate(value);
  const [, month, day] = value.split('-').map(Number);
  if (date.getMonth() + 1 !== month || date.getDate() !== day) throw new Error(`Invalid calendar date: ${value}`);
  return date;
}

function calendarRange(range) {
  const start = rangeDate(range.start), end = rangeDate(range.end);
  if (start > end) throw new Error('Calendar range ends before it starts');
  return { start, end };
}

const civilDayNumber = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;

function projectDate(date, years, basis) {
  const y = date.getFullYear();
  if (basis === 'monthDay') return new Date(y + years, date.getMonth(), date.getDate());
  const origin = year => {
    if (basis === 'easter') return easter(year);
    if (basis === 'isoWeek') return previousWeekday(new Date(year, 0, 4), 1, true);
    throw new Error(`Unknown calendar estimate basis: ${basis}`);
  };
  return offset(origin(y + years), civilDayNumber(date) - civilDayNumber(origin(y)));
}

export function calendarYear(schedule, year, schedules = {}, sources = {}) {
  const dates = new Map();
  const yearStart = new Date(year, 0, 1), yearEnd = new Date(year, 11, 31);
  const unknownDates = new Set();
  function add(date, title, estimated = false) {
    const key = +date;
    if (!dates.has(key)) dates.set(key, { date, titles: [], estimatedTitles: [] });
    const entry = dates.get(key);
    const titles = estimated ? entry.estimatedTitles : entry.titles;
    if (title && !titles.includes(title)) titles.push(title);
  }
  function addRange(start, end, title, record, coverage) {
    const first = new Date(Math.max(+start, +yearStart));
    const last = new Date(Math.min(+end, +yearEnd));
    for (let date = first; date <= last; date = offset(date, 1)) {
      if (!coverage?.some(period => date >= period.start && date <= period.end)) record(date, title, !!coverage);
    }
  }
  // A shared source can appear through several branches of a calendar union.
  const visited = new Set();
  const visiting = new Set();
  function collect(source) {
    if (visited.has(source)) return;
    if (visiting.has(source)) throw new Error('Circular calendar dependency');
    visiting.add(source);
    const reference = source.calendar ?? source.source;
    if (reference) {
      if (!Object.hasOwn(sources, reference)) throw new Error(`Missing calendar source: ${reference}`);
      collect(sources[reference]);
    }
    for (const id of source.includes ?? []) {
      if (!Object.hasOwn(schedules, id)) throw new Error(`Unknown source calendar: ${id}`);
      collect(schedules[id]);
    }
    const coverage = source.coverage?.map(calendarRange).sort((a, b) => a.start - b.start);
    // Coverage records both school days and breaks. An isolated historical
    // break also establishes that source's status for those particular dates.
    const missing = new Set();
    if (coverage) {
      let cursor = yearStart;
      for (const period of coverage) {
        if (period.end < cursor || period.start > yearEnd) continue;
        for (; cursor < period.start; cursor = offset(cursor, 1)) missing.add(+cursor);
        cursor = offset(period.end, 1);
      }
      for (; cursor <= yearEnd; cursor = offset(cursor, 1)) missing.add(+cursor);
    }
    function record(date, title, estimated = false) {
      if (!estimated) missing.delete(+date);
      add(date, title, estimated);
    }
    for (const range of source.ranges ?? []) {
      const { start, end } = calendarRange(range);
      addRange(start, end, range.title, record);
      if (!range.estimateBy) continue;
      if (!coverage?.length) throw new Error('Calendar estimates require a period with recorded dates');
      if (coverage.some(period => period.start <= yearStart && period.end >= yearEnd)) continue;
      // Include projections crossing New Year, including an ISO week spilling into an adjacent year.
      for (let shift = year - end.getFullYear() - 1; shift <= year - start.getFullYear() + 1; shift++) {
        const projectedStart = projectDate(start, shift, range.estimateBy);
        const projectedEnd = range.estimateBy === 'monthDay' ? projectDate(end, shift, range.estimateBy)
          : offset(projectedStart, civilDayNumber(end) - civilDayNumber(start));
        addRange(projectedStart, projectedEnd, range.title, record, coverage);
      }
    }
    addRecurringCalendarDays(source, year, record);
    for (const date of missing) unknownDates.add(date);
    visiting.delete(source);
    visited.add(source);
  }
  collect(schedule);
  const occurrences = [...dates.values()].sort((a, b) => a.date - b.date);
  for (const entry of occurrences) {
    entry.estimatedTitles = entry.estimatedTitles.filter(title => !entry.titles.includes(title));
    entry.estimated = unknownDates.has(+entry.date);
  }
  const estimatedPeriods = [];
  for (const timestamp of [...unknownDates].sort((a, b) => a - b)) {
    const date = new Date(timestamp);
    const previous = estimatedPeriods.at(-1);
    if (previous && +offset(previous.end, 1) === timestamp) previous.end = date;
    else estimatedPeriods.push({ start: date, end: date });
  }
  return { occurrences, estimatedPeriods };
}

export function calendarOccurrences(schedule, year, schedules = {}, sources = {}) {
  return calendarYear(schedule, year, schedules, sources).occurrences;
}

function addRecurringCalendarDays(schedule, year, add) {
  for (const { month, day, title } of schedule.fixed ?? []) {
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) ||
        day < 1 || day > monthEnd(2000, month).getDate()) throw new Error('Invalid fixed calendar date');
    const date = new Date(year, month - 1, day);
    if (date.getMonth() === month - 1) add(date, title);
  }
  for (const entry of schedule.weekdays ?? []) {
    const weekday = entry?.weekday ?? entry;
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error('Invalid calendar weekday');
    const first = nextWeekday(new Date(year, 0, 1), weekday, true);
    for (let date = first; date.getFullYear() === year; date = offset(date, 7)) add(date, entry.title);
  }
  for (const entry of schedule.easterOffsets ?? []) {
    const days = entry?.days ?? entry;
    if (!Number.isInteger(days)) throw new Error('Invalid Easter offset');
    add(offset(easter(year), days), entry.title);
  }
}

export function scheduledDays(schedule, year, schedules, sources) {
  return calendarOccurrences(schedule, year, schedules, sources).map(occurrence => occurrence.date);
}

// A date edge compares its dependent to its prerequisite plus any offset.
// "after" and "inclusive" describe the resulting bound on the dependent.
const dateComparisons = {
  greater_or_equal: { after: true, inclusive: true },
  greater_than: { after: true, inclusive: false },
  less_or_equal: { after: false, inclusive: true },
  less_than: { after: false, inclusive: false },
};

export function comparisonBound(type) {
  return Object.hasOwn(dateComparisons, type) ? dateComparisons[type] : undefined;
}

export function offsetRelation(rule) {
  return { type: 'offset', days: offsetDays(rule), ...(rule.weeks !== undefined && { weeks: rule.weeks }), ...(rule.whole && { whole: true }) };
}

export function anchorDateRelation(anchor) {
  if (anchor.defaultDate.kind === 'relative') return offsetRelation(anchor.dependency);
  const type = anchor.defaultDateRelation === 'on_or_before' ? 'less_or_equal' : anchor.defaultDateRelation;
  if (type && !comparisonBound(type)) throw new Error(`Unknown anchor date comparison: ${type}`);
  const rule = anchor.defaultDate;
  if (type) return { type, amount: rule.weeks !== undefined ? offsetDays(rule) : rule.days ?? 0, unit: 'day' };
  if (['offset', 'offset_from_date', 'offset_from_month_start', 'offset_from_month_end'].includes(rule.kind)) {
    return offsetRelation(rule);
  }
  if (rule.kind === 'same_day' && rule.baseDate) return { type: 'same_day' };
  return { type: 'default_date' };
}

export function weekdayDependencies(rule) {
  const after = rule.kind === 'next_weekday';
  if (!after && rule.kind !== 'previous_weekday') return [];
  const references = after ? rule.after ?? [rule] : [rule.before ?? rule];
  return references.map(reference => {
    if (typeof reference === 'string') reference = { anchor: reference };
    if (reference.offsetMonths && reference.offsetDays) throw new Error('Use either offsetMonths or offsetDays per dependency.');
    const inclusive = reference.inclusive ?? rule.inclusive ?? false;
    const type = after ? (inclusive ? 'greater_or_equal' : 'greater_than')
      : (inclusive ? 'less_or_equal' : 'less_than');
    return {
      anchor: reference.anchor,
      ...(reference.baseDate && { baseDate: reference.baseDate }),
      type,
      ...comparisonBound(type),
      amount: reference.offsetMonths ?? reference.offsetDays ?? 0,
      unit: reference.offsetMonths != null ? 'month' : 'day',
    };
  });
}

// Rules that already determine a date can also require it to meet lower bounds.
export function additionalDateBounds(rule) {
  if (rule.kind === 'next_weekday' || !rule.after?.length) return [];
  return weekdayDependencies({ kind: 'next_weekday', after: rule.after });
}

function dependencyOffsetDate(date, { unit, amount }) {
  if (unit !== 'month') return offset(date, amount);
  const month = date.getMonth() + amount;
  const lastDay = new Date(date.getFullYear(), month + 1, 0).getDate();
  return new Date(date.getFullYear(), month, Math.min(date.getDate(), lastDay));
}

// A member supplies its own fields over the group defaults. A dated group
// supplies a same-day schedule unless the member has its own scheduling rule.
export function effectiveItem(config, item) {
  const group = config.groups?.[item.group];
  if (!group) return item;
  return { ...(group.date && { schedule: { kind: 'group' } }), ...group.defaults, ...item };
}

export function groupDate(config, id, year) {
  const { month, day } = config.groups?.[id]?.date ?? {};
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) ||
      day < 1 || day > new Date(2000, month, 0).getDate()) {
    throw new Error(`Group ${id} needs a valid annual date`);
  }
  return new Date(year, month - 1, day);
}

export function resolveSchedule(config, year, runtimeAnchors = {}, runtimeOverrides = {}, sources = {}) {
  const resolved = {};
  const locale = config.display?.locale;
  const members = config.items.map(item => effectiveItem(config, item));
  const items = new Map(members.map(item => [item.id, item]));
  const visiting = new Set();
  const calendars = new Map();
  const inCalendar = (id, date) => {
    if (!calendars.has(id)) calendars.set(id, new Map());
    const years = calendars.get(id);
    const y = date.getFullYear();
    if (!years.has(y)) years.set(y, new Set(scheduledDays(config.schedules[id], y, config.schedules, sources).map(Number)));
    return years.get(y).has(+new Date(y, date.getMonth(), date.getDate()));
  };
  const satisfiesCalendar = (rule, date) => inCalendar(rule.schedule, date) === (rule.membership === 'inside');
  const occurrenceWithConstraints = (itemId, constraints, occurrence) => {
    if (!Number.isFinite(occurrence.date?.getTime())) throw new Error(`Cannot calculate date for ${itemId}`);
    const dates = occurrence.sessions ?? [occurrence.date];
    const conflicts = constraints.filter(rule => dates.some(date => !satisfiesCalendar(rule, date)));
    if (conflicts.length) {
      occurrence.conflicts = [...new Set(conflicts.map(rule => rule.schedule))];
      occurrence.conflictingConstraints = conflicts.map(rule => rule.id);
    }
    return occurrence;
  };
  const closestMatchingDate = (bound, step, constraints, end) => {
    if (!constraints.length) return bound;
    const limit = end ?? copy(bound);
    if (!end) limit.setFullYear(limit.getFullYear() + Math.sign(step));
    for (let candidate = bound; step > 0 ? candidate < limit : candidate > limit; candidate = offset(candidate, step)) {
      if (constraints.every(rule => satisfiesCalendar(rule, candidate))) return candidate;
    }
    return bound; // Keep the conflict visible when every candidate is blocked.
  };
  const anchors = new Map();
  for (const [id, anchor] of Object.entries(scheduleAnchors(config))) {
    const override = runtimeAnchors[id] || anchor.date;
    let date = resolveAnchorDate(anchor, year, override, locale);
    const relation = anchorDateRelation(anchor);
    const bound = comparisonBound(relation.type);
    if (bound && !override && anchor.status !== 'set') {
      const calendarRules = members
        .filter(item => item.schedule.kind === 'anchor' && item.schedule.anchor === id && !(runtimeOverrides[item.id] || item.date))
        .flatMap(item => calendarConstraints(config, item.schedule));
      // resolveAnchorDate already applied the default date's calendar offset.
      const step = bound.after ? 1 : -1;
      date = closestMatchingDate(bound.inclusive ? date : offset(date, step), step, calendarRules);
    }
    anchors.set(id, date);
  }
  const reference = id => {
    if (typeof id?.group === 'string') return groupDate(config, id.group, year);
    const [itemId, edge] = id.split('.');
    if (items.has(itemId)) {
      const occurrence = resolveItem(items.get(itemId));
      if (!edge) return occurrence.date;
      if (!occurrence.sessions?.length) throw new Error(`No course sessions for ${id}`);
      const start = edge === 'start';
      return offset(start ? occurrence.sessions[0] : occurrence.sessions.at(-1), start ? -1 : 1);
    }
    if (anchors.has(id)) return anchors.get(id);
    throw new Error(`Unknown schedule dependency: ${id}`);
  };
  const constrainedWeekday = rule => {
    const weekday = configuredWeekday(config, rule);
    if (weekday != null && (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)) throw new Error(`Invalid weekday for ${rule.kind}`);
    return weekday;
  };
  function resolveItem(item) {
    if (Object.hasOwn(resolved, item.id)) return resolved[item.id];
    if (visiting.has(item.id)) throw new Error(`Circular schedule dependency: ${item.id}`);
    visiting.add(item.id);
    const monthAdjustments = [];
    function resolveBound(dep, index) {
      const source = dep.baseDate ? resolveVirtualDate(dep.baseDate, year, locale) : reference(dep.anchor);
      const boundary = dependencyOffsetDate(source, dep);
      if (dep.unit === 'month' && boundary.getDate() < source.getDate()) {
        monthAdjustments.push({ after: dep.after, index, source, boundary });
      }
      return dep.inclusive ? boundary : offset(boundary, dep.after ? 1 : -1);
    }
    const occurrence = calculate(item, resolveBound);
    additionalDateBounds(item.schedule).forEach((dep, index) => {
      if (occurrence.date < resolveBound(dep, index)) (occurrence.conflictingDateBounds ??= []).push(index);
    });
    if (monthAdjustments.length) occurrence.monthAdjustments = monthAdjustments;
    resolved[item.id] = occurrence;
    visiting.delete(item.id);
    return occurrence;
  }
  function calculate(item, resolveBound) {
    const rule=item.schedule; let date, sessions;
    const calendarRules = calendarConstraints(config, rule);
    if (rule.kind === 'group') date = groupDate(config, item.group, year);
    if (runtimeOverrides[item.id] || item.date) {
      const override = parseCalendarDate(runtimeOverrides[item.id] || item.date);
      return occurrenceWithConstraints(item.id, calendarRules, { date: new Date(year, override.getMonth(), override.getDate()) });
    }
    if(rule.kind==='anchor') date=anchors.get(rule.anchor) ?? reference(rule.anchor);
    if(rule.kind==='fixed') date=new Date(year,rule.month-1,rule.day);
    const boundary = calendarBoundary(rule, year, locale);
    if(rule.kind==='offset_from_date'||rule.kind==='offset_from_month_start'||rule.kind==='offset_from_month_end') date=applyDateOffset(boundary.date,rule,locale);
    if (['nth_weekday', 'nth_full_weekday', 'last_weekday'].includes(rule.kind)) {
      const origin = boundary?.date ?? reference(rule.anchor);
      const weekday = constrainedWeekday(rule);
      const backward = rule.kind === 'last_weekday';
      if (backward) date = weekday == null ? origin : previousWeekday(origin, weekday, true);
      else if (rule.kind === 'nth_full_weekday') date = nthFullWeekday(origin, weekday ?? firstDayOfWeek(locale), rule.occurrence, locale);
      else date = nthWeekday(origin, weekday ?? origin.getDay(), rule.occurrence);
      // Removing the weekday opens all seven positions in the same recurrence window.
      if (weekday == null) {
        const step = backward ? -1 : 1;
        date = closestMatchingDate(date, step, calendarRules, offset(date, 7 * step));
      }
    }
    if(rule.kind==='same_day'||rule.kind==='month_start'||rule.kind==='month_end') date=boundary.date;
    if (rule.kind === 'next_weekday' || rule.kind === 'previous_weekday') {
      const boundaries = weekdayDependencies(rule).map(resolveBound);
      const weekday = constrainedWeekday(rule);
      const forward = rule.kind === 'next_weekday';
      const bound = forward ? new Date(Math.max(...boundaries)) : boundaries[0];
      date = bound;
      if (weekday != null) date = forward ? nextWeekday(bound, weekday, true) : previousWeekday(bound, weekday, true);
      date = closestMatchingDate(date, (forward ? 1 : -1) * (weekday == null ? 1 : 7), calendarRules);
    }
    if(rule.kind==='offset') date=applyDateOffset(boundary?.date ?? reference(rule.anchor),rule,locale);
    if(rule.kind==='course') { sessions=course(rule.anchor?reference(rule.anchor):boundary?.date ?? new Date(year,rule.month-1,rule.day),rule.direction,rule.weekday,rule.count,rule.skip); date=sessions[0]; }
    return occurrenceWithConstraints(item.id, calendarRules, { date, sessions });
  }
  for (const item of members) resolveItem(item);
  return resolved;
}

export function resolveItemStatuses(config, anchorStatuses = {}) {
  const items = Object.fromEntries(config.items.map(item => [item.id, effectiveItem(config, item)]));
  const state = id => {
    if (config.anchors[id]) return anchorStatuses[id] || 'tentative';
    if (id === 'start_of_year' && !items[id]) return 'set';
    const item = items[id];
    if (!item) return 'tentative';
    const reference = item.schedule.anchor;
    if (typeof reference?.group === 'string') return 'set';
    const source = reference?.split('.')[0];
    if (source) return state(source);
    return 'set';
  };
  return Object.fromEntries(config.items.map(item => [item.id, state(item.id)]));
}
