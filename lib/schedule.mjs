const copy = value => new Date(value);
const nthWeekday = (year, month, weekday, occurrence) => {
  const first = new Date(year, month - 1, 1);
  return new Date(year, month - 1, 1 + (weekday - first.getDay() + 7) % 7 + (occurrence - 1) * 7);
};
const nthFullWeekday = (year, month, weekday, occurrence) => {
  const first = new Date(year, month - 1, 1);
  const firstMonday = new Date(year, month - 1, 1 + (1 - first.getDay() + 7) % 7);
  return new Date(year, month - 1, firstMonday.getDate() + (occurrence - 1) * 7 + (weekday - 1 + 7) % 7);
};
const lastWeekday = (year, month, weekday) => {
  const date = new Date(year, month, 0);
  date.setDate(date.getDate() - (date.getDay() - weekday + 7) % 7);
  return date;
};
const monthEnd = (year, month) => new Date(year, month, 0);
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

export function resolveSchedule(config, year, runtimeAnchors = {}, runtimeOverrides = {}) {
  const anchors = Object.fromEntries(Object.entries(config.anchors).map(([id, anchor]) => {
    const value = runtimeAnchors[id];
    const date = value ? new Date(value) : new Date(year, anchor.defaultDate.month - 1, anchor.defaultDate.day);
    return [id, new Date(year, date.getMonth(), date.getDate())];
  }));
  const resolved = {};
  const reference = id => {
    if (id.includes('.')) { const [item, edge] = id.split('.'); const sessions = resolved[item].sessions; return new Date(+sessions[edge === 'start' ? 0 : sessions.length - 1] + (edge === 'start' ? -86400000 : 86400000)); }
    return resolved[id]?.date || anchors[id];
  };
  const dateReference = value => {
    if (typeof value === 'string') return reference(value);
    return offset(reference(value.anchor), value.offsetDays || 0);
  };
  const constraints = rule => (rule.constraints || []).map(id => {
    const constraint = config.constraints?.[id];
    if (!constraint) throw new Error(`Unknown constraint: ${id}`);
    return constraint;
  });
  const constrainedWeekday = rule => {
    const weekday = rule.weekday ?? constraints(rule).find(constraint => Number.isInteger(constraint.weekday))?.weekday;
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error(`Invalid weekday for ${rule.kind}`);
    return weekday;
  };
  const latest = values => new Date(Math.max(...values.map(value => +dateReference(value))));
  for (const item of config.items) {
    const rule=item.schedule; let date, sessions;
    if (runtimeOverrides[item.id]) {
      const override = new Date(runtimeOverrides[item.id]);
      resolved[item.id] = { date: new Date(year, override.getMonth(), override.getDate()) };
      continue;
    }
    if(rule.kind==='anchor') date=reference(rule.anchor);
    if(rule.kind==='fixed') date=new Date(year,rule.month-1,rule.day);
    if(rule.kind==='nth_weekday') date=nthWeekday(year,rule.month,constrainedWeekday(rule),rule.occurrence);
    if(rule.kind==='nth_full_weekday') date=nthFullWeekday(year,rule.month,constrainedWeekday(rule),rule.occurrence);
    if(rule.kind==='last_weekday') date=lastWeekday(year,rule.month,constrainedWeekday(rule));
    if(rule.kind==='month_end') date=monthEnd(year,rule.month);
    if(rule.kind==='next_weekday') date=nextWeekday(rule.after ? latest(rule.after) : dateReference({ anchor: rule.anchor, offsetDays: rule.offsetDays }),constrainedWeekday(rule),rule.inclusive);
    if(rule.kind==='previous_weekday') date=previousWeekday(rule.before ? dateReference(rule.before) : dateReference({ anchor: rule.anchor, offsetDays: rule.offsetDays }),constrainedWeekday(rule),rule.inclusive);
    if(rule.kind==='offset') date=offset(reference(rule.anchor),rule.days);
    if(rule.kind==='course') { sessions=course(rule.anchor?reference(rule.anchor):new Date(year,rule.month-1,rule.day),rule.direction,rule.weekday,rule.count,rule.skip); date=sessions[0]; }
    resolved[item.id] = { date, sessions };
  }
  return resolved;
}

export function resolveItemStatuses(config, anchorStatuses = {}) {
  const items = Object.fromEntries(config.items.map(item => [item.id, item]));
  const state = id => {
    if (config.anchors[id]) return anchorStatuses[id] || 'tentative';
    const item = items[id];
    if (!item) return 'tentative';
    const source = item.schedule.anchor?.split('.')[0];
    if (source) return state(source);
    return 'set';
  };
  return Object.fromEntries(config.items.map(item => [item.id, state(item.id)]));
}
