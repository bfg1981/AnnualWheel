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
const nthFullWeekday = (first, weekday, occurrence) => {
  const firstMonday = nextWeekday(first, 1, true);
  return offset(firstMonday, (occurrence - 1) * 7 + (weekday - 1 + 7) % 7);
};
const monthEnd = (year, month) => new Date(year, month, 0);
export function calendarBoundary(rule, year) {
  if (rule.kind === 'nth_weekday' || rule.kind === 'nth_full_weekday') {
    return { kind: 'month_start', date: new Date(year, rule.month - 1, 1) };
  }
  if (rule.kind === 'last_weekday' || rule.kind === 'month_end') {
    return { kind: 'month_end', date: monthEnd(year, rule.month) };
  }
}
const offset = (value, days) => {
  const date = copy(value);
  date.setDate(date.getDate() + days);
  return date;
};
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
    start_of_year: { title: 'Start of year', defaultDate: { month: 1, day: 1 }, status: 'set' },
    ...config.anchors,
  };
}

export function resolveAnchorDate(anchor, year, override) {
  if (override) {
    const date = parseCalendarDate(override);
    return new Date(year, date.getMonth(), date.getDate());
  }
  const { kind, month, day } = anchor.defaultDate;
  return kind === 'month_end' ? monthEnd(year, month) : new Date(year, month - 1, day);
}

export function configuredWeekday(config, rule) {
  if (rule.weekday != null) return rule.weekday;
  const constraints = (rule.constraints || []).map(id => {
    const constraint = config.constraints?.[id];
    if (!constraint) throw new Error(`Unknown constraint: ${id}`);
    return constraint;
  });
  return constraints.find(constraint => Number.isInteger(constraint.weekday))?.weekday;
}

export function isRelativeRule(rule) {
  return rule.kind !== 'fixed' && rule.kind !== 'month_end';
}

export function excludedSchedules(config, rule) {
  const schedules = new Set();
  for (const id of rule.constraints ?? []) {
    const constraint = config.constraints?.[id];
    if (!constraint) throw new Error(`Unknown constraint: ${id}`);
    if (!('schedule' in constraint)) continue;
    if (typeof constraint.no !== 'boolean') throw new Error(`Expected boolean no in constraint: ${id}`);
    if (!Object.hasOwn(config.schedules ?? {}, constraint.schedule)) throw new Error(`Unknown schedule: ${constraint.schedule}`);
    if (constraint.no) schedules.add(constraint.schedule);
  }
  return [...schedules];
}

export function calendarOccurrences(schedule, year) {
  const dates = new Map();
  function add(date, title) {
    const key = +date;
    if (!dates.has(key)) dates.set(key, { date, titles: [] });
    const { titles } = dates.get(key);
    if (title && !titles.includes(title)) titles.push(title);
  }
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
  return [...dates.values()].sort((a, b) => a.date - b.date);
}

export function scheduledDays(schedule, year) {
  return calendarOccurrences(schedule, year).map(occurrence => occurrence.date);
}

export function weekdayDependencies(rule) {
  const after = rule.kind === 'next_weekday';
  if (!after && rule.kind !== 'previous_weekday') return [];
  const references = after ? rule.after ?? [rule] : [rule.before ?? rule];
  return references.map(reference => {
    if (typeof reference === 'string') reference = { anchor: reference };
    if (reference.offsetMonths && reference.offsetDays) throw new Error('Use either offsetMonths or offsetDays per dependency.');
    return {
      anchor: reference.anchor,
      after,
      inclusive: reference.inclusive ?? rule.inclusive ?? false,
      amount: reference.offsetMonths ?? reference.offsetDays ?? 0,
      unit: reference.offsetMonths != null ? 'month' : 'day',
    };
  });
}

function dependencyBoundary(date, dependency) {
  const { unit, amount, inclusive, after } = dependency;
  let boundary;
  if (unit === 'month') {
    const month = date.getMonth() + amount;
    const lastDay = new Date(date.getFullYear(), month + 1, 0).getDate();
    boundary = new Date(date.getFullYear(), month, Math.min(date.getDate(), lastDay));
  } else {
    boundary = offset(date, amount);
  }
  return inclusive ? boundary : offset(boundary, after ? 1 : -1);
}

export function resolveSchedule(config, year, runtimeAnchors = {}, runtimeOverrides = {}) {
  const anchors = Object.fromEntries(Object.entries(scheduleAnchors(config)).map(([id, anchor]) =>
    [id, resolveAnchorDate(anchor, year, runtimeAnchors[id])]));
  const resolved = {};
  const calendars = new Map();
  const occurrenceWithConstraints = (rule, occurrence) => {
    const conflicts = [];
    for (const id of excludedSchedules(config, rule)) {
      const calendar = config.schedules[id];
      if (!calendars.has(id)) calendars.set(id, new Map());
      const years = calendars.get(id);
      for (const date of occurrence.sessions ?? [occurrence.date]) {
        const y = date.getFullYear();
        if (!years.has(y)) years.set(y, new Set(scheduledDays(calendar, y).map(Number)));
        if (years.get(y).has(+new Date(y, date.getMonth(), date.getDate()))) {
          conflicts.push(id);
          break;
        }
      }
    }
    if (conflicts.length) occurrence.conflicts = conflicts;
    return occurrence;
  };
  const reference = id => {
    if (id.includes('.')) { const [item, edge] = id.split('.'); const sessions = resolved[item].sessions; return new Date(+sessions[edge === 'start' ? 0 : sessions.length - 1] + (edge === 'start' ? -86400000 : 86400000)); }
    return resolved[id]?.date || anchors[id];
  };
  const constrainedWeekday = rule => {
    const weekday = configuredWeekday(config, rule);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error(`Invalid weekday for ${rule.kind}`);
    return weekday;
  };
  for (const item of config.items) {
    const rule=item.schedule; let date, sessions;
    if (runtimeOverrides[item.id]) {
      const override = parseCalendarDate(runtimeOverrides[item.id]);
      resolved[item.id] = occurrenceWithConstraints(rule, { date: new Date(year, override.getMonth(), override.getDate()) });
      continue;
    }
    if(rule.kind==='anchor') date=reference(rule.anchor);
    if(rule.kind==='fixed') date=new Date(year,rule.month-1,rule.day);
    const boundary = calendarBoundary(rule, year);
    if(rule.kind==='nth_weekday') date=nthWeekday(boundary.date,constrainedWeekday(rule),rule.occurrence);
    if(rule.kind==='nth_full_weekday') date=nthFullWeekday(boundary.date,constrainedWeekday(rule),rule.occurrence);
    if(rule.kind==='last_weekday') date=previousWeekday(boundary.date,constrainedWeekday(rule),true);
    if(rule.kind==='month_end') date=boundary.date;
    if (rule.kind === 'next_weekday' || rule.kind === 'previous_weekday') {
      const boundaries = weekdayDependencies(rule).map(dep => dependencyBoundary(reference(dep.anchor), dep));
      const weekday = constrainedWeekday(rule);
      date = rule.kind === 'next_weekday'
        ? nextWeekday(new Date(Math.max(...boundaries)), weekday, true)
        : previousWeekday(boundaries[0], weekday, true);
    }
    if(rule.kind==='offset') date=offset(reference(rule.anchor),rule.days);
    if(rule.kind==='course') { sessions=course(rule.anchor?reference(rule.anchor):new Date(year,rule.month-1,rule.day),rule.direction,rule.weekday,rule.count,rule.skip); date=sessions[0]; }
    resolved[item.id] = occurrenceWithConstraints(rule, { date, sessions });
  }
  return resolved;
}

export function resolveItemStatuses(config, anchorStatuses = {}) {
  const items = Object.fromEntries(config.items.map(item => [item.id, item]));
  const state = id => {
    if (config.anchors[id]) return anchorStatuses[id] || 'tentative';
    if (id === 'start_of_year' && !items[id]) return 'set';
    const item = items[id];
    if (!item) return 'tentative';
    const source = item.schedule.anchor?.split('.')[0];
    if (source) return state(source);
    return 'set';
  };
  return Object.fromEntries(config.items.map(item => [item.id, state(item.id)]));
}
