// Format-independent calendar events use ISO calendar dates, never UTC timestamps.
export function createCalendarEvents(items) {
  return items.map(({ id, date, title, description = '', tentative = false }) => {
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !title) throw new Error('Invalid calendar event');
    return { id, date, title, description, tentative: Boolean(tentative) };
  });
}

export function calendarExportFilename(title, displayDate, events, extension = 'ics') {
  const name = String(title).trim().replace(/\s+/gu, '-').replace(/[\\/\x00-\x1f<>:"|?*]/g, '-').replace(/^-+|-+$/g, '') || 'annual-wheel';
  const dates = events.map(event => event.date).sort();
  const range = displayDate.endsWith('-01-01') ? displayDate.slice(0, 4) : `${(dates[0] || displayDate).replace(/-/g, '')}-${(dates.at(-1) || displayDate).replace(/-/g, '')}`;
  return `${name}-${range}.${extension}`;
}

const escapeText = value => String(value).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const foldLine = line => {
  const encoder = new TextEncoder();
  const lines = [];
  let part = '', bytes = 0, limit = 75;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > limit) { lines.push(part); part = ' '; bytes = 1; limit = 75; }
    part += char;
    bytes += size;
  }
  lines.push(part);
  return lines.join('\r\n');
};
const nextDate = value => {
  const [year, month, day] = value.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10).replace(/-/g, '');
};

export function toICalendar(events, { name = 'Annual Wheel', timestamp = new Date() } = {}) {
  const stamp = timestamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AnnualWheel//Calendar Export//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escapeText(name)}`];
  for (const event of events) {
    const day = event.date.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${encodeURIComponent(event.id)}-${day}@annualwheel`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${nextDate(event.date)}`, `SUMMARY:${escapeText(event.title)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    lines.push(`STATUS:${event.tentative ? 'TENTATIVE' : 'CONFIRMED'}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
