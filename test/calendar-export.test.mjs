import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarExportFilename, createCalendarEvents, toICalendar } from '../lib/calendar-export.js';

test('exports concrete all-day dates and tentative state across year boundaries', () => {
  const events = createCalendarEvents([
    { id: 'survey', date: '2026-12-31', title: 'Sky, survey; 1', description: 'Line 1\nLine 2', tentative: true },
    { id: 'survey', date: '2027-01-19', title: 'Sky survey', tentative: false },
  ]);
  const output = toICalendar(events, { timestamp: new Date('2026-01-01T00:00:00Z') });
  assert.match(output, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/);
  assert.match(output, /SUMMARY:Sky\\, survey\\; 1/);
  assert.match(output, /DESCRIPTION:Line 1\\nLine 2/);
  assert.match(output, /STATUS:TENTATIVE/);
  assert.match(output, /UID:survey-20270119@annualwheel/);
  assert.match(output, /STATUS:CONFIRMED/);
});

test('folds long UTF-8 lines without splitting characters', () => {
  const output = toICalendar(createCalendarEvents([{ id: 'a', date: '2028-02-29', title: 'Å'.repeat(100) }]));
  for (const line of output.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.ok(output.replace(/\r\n /g, '').includes(`SUMMARY:${'Å'.repeat(100)}`));
  assert.match(output, /DTEND;VALUE=DATE:20280301/);
});

test('names full-year and partial exports using the configured title and actual dates', () => {
  const events = [{ date: '2027-01-19' }, { date: '2026-11-30' }];
  assert.equal(calendarExportFilename('Årlig plan', '2026-01-01', events), 'Årlig-plan-2026.ics');
  assert.equal(calendarExportFilename('Årlig plan', '2026-11-20', events), 'Årlig-plan-20261130-20270119.ics');
  assert.equal(calendarExportFilename('Årlig plan', '2026-11-20', []), 'Årlig-plan-20261120-20261120.ics');
});
