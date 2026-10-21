// New tab widgets: calendar, pomodoro, weather forecast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAL_APPS, eventIcs, feedUrl, monthGrid, occurrences, parseIcs, sameDay, weekStartFor } from '../src/shared/ntcal.ts';
import { POMO_DEFAULT, clockText, freshPomo, msLeft, next, pause, settle, start } from '../src/shared/ntpomo.ts';
import { parseWeather, shortCredit, weatherUrl } from '../src/shared/ntdata.ts';

test('month grid: six weeks, starts on the right weekday, includes the month', () => {
  const g = monthGrid(2026, 9, 1); // October 2026, Monday first
  assert.equal(g.length, 42);
  assert.equal(g[0].getDay(), 1);
  assert.ok(g.some((d) => d.getMonth() === 9 && d.getDate() === 1));
  assert.ok(g.some((d) => d.getMonth() === 9 && d.getDate() === 31));
  assert.equal(monthGrid(2026, 9, 0)[0].getDay(), 0);
  assert.equal(weekStartFor('en-US'), 0);
  assert.equal(weekStartFor('en-GB'), 1);
  assert.equal(weekStartFor('te-IN'), 1);
});

const ICS = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'UID:one',
  'SUMMARY:Standup\\, team',
  'DTSTART:20261013T140000Z',
  'DTEND:20261013T141500Z',
  'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;COUNT=8',
  'EXDATE:20261015T140000Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:two',
  'SUMMARY:Ferrari track day',
  'DTSTART;VALUE=DATE:20261024',
  'DTEND;VALUE=DATE:20261025',
  'LOCATION:Monticello Motor Club',
  'URL:https://example.com/e/2',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:three',
  'SUMMARY:A very long title that wraps onto',
  '  the next line',
  'DTSTART:20261101T090000',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

test('iCal: events, all-day, folded lines, escapes', () => {
  const evs = parseIcs(ICS, 2);
  assert.equal(evs.length, 3);
  assert.equal(evs[0].title, 'Standup, team');
  assert.equal(evs[0].rrule?.freq, 'WEEKLY');
  assert.deepEqual(evs[0].rrule?.byday, [1, 2, 3, 4, 5]);
  assert.equal(evs[1].allDay, true);
  assert.equal(evs[1].location, 'Monticello Motor Club');
  assert.equal(evs[1].url, 'https://example.com/e/2');
  assert.equal(evs[2].title, 'A very long title that wraps onto the next line');
  assert.equal(evs[2].end - evs[2].start, 3_600_000, 'no end = one hour');
  assert.equal(evs[0].feed, 2);
});

test('iCal: recurring events expand within the month, honouring COUNT and EXDATE', () => {
  const evs = parseIcs(ICS);
  const oct = occurrences(evs, new Date(2026, 9, 1).getTime(), new Date(2026, 10, 1).getTime());
  const standups = oct.filter((e) => e.title.startsWith('Standup'));
  assert.equal(standups.length, 7, 'COUNT=8 minus one EXDATE');
  assert.ok(!standups.some((e) => sameDay(e.start, Date.UTC(2026, 9, 15, 14))));
  assert.ok(standups.every((e) => e.end - e.start === 15 * 60_000));
  assert.ok(oct.some((e) => e.title === 'Ferrari track day'));
  assert.ok(!oct.some((e) => e.title.startsWith('A very long')), 'November event stays out');
  for (let i = 1; i < oct.length; i++) assert.ok(oct[i].start >= oct[i - 1].start, 'sorted');
});

test('calendar apps: day links and new-event links', () => {
  const d = new Date(2026, 9, 13, 9, 0);
  assert.equal(CAL_APPS.google.day(d), 'https://calendar.google.com/calendar/r/day/2026/10/13');
  assert.match(CAL_APPS.google.create!(d, 'Gym'), /eventedit\?text=Gym&dates=20261013T090000\/20261013T100000$/);
  assert.match(CAL_APPS.outlook.create!(d, 'Gym'), /startdt=2026-10-13T09:00:00/);
  assert.equal(CAL_APPS.notion.create, null);
  assert.match(eventIcs('Gym; legs', d), /SUMMARY:Gym\\; legs/);
  assert.equal(feedUrl(' webcal://p01-calendars.icloud.com/x.ics '), 'https://p01-calendars.icloud.com/x.ics');
});

test('pomodoro: start, pause, finish into breaks, long break every fourth', () => {
  const c = POMO_DEFAULT;
  let s = freshPomo(c);
  assert.equal(clockText(msLeft(s, 0)), '25:00');
  s = start(s, 1000);
  assert.equal(msLeft(s, 1000 + 60_000), 24 * 60_000);
  s = pause(s, 1000 + 60_000);
  assert.equal(s.running, false);
  assert.equal(msLeft(s, 9e9), 24 * 60_000, 'paused time stands still');
  s = start(s, 100_000);
  const done = settle(s, c, 100_000 + 24 * 60_000);
  assert.equal(done.finished, 'focus');
  assert.equal(done.state.phase, 'short');
  assert.equal(done.state.rounds, 1);
  let x = done.state;
  for (let i = 0; i < 3; i++) x = next(next(x, c), c);
  assert.equal(x.phase, 'long', 'fourth focus ends in a long break');
  assert.equal(clockText(59_001), '01:00');
});

test('weather: next four days come with the forecast', () => {
  assert.match(weatherUrl(40.7, -74, 'f'), /forecast_days=5/);
  const raw = { current: { temperature_2m: 68.4, apparent_temperature: 70, relative_humidity_2m: 81, weather_code: 2, is_day: 1 }, daily: { time: ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'], weather_code: [2, 61, 3, 0, 45], temperature_2m_max: [70, 64.6, 60, 66, 63], temperature_2m_min: [56, 50, 48, 51, 49] } };
  const w = parseWeather(raw, 'f', 'Jersey City')!;
  assert.equal(w.days?.length, 4);
  assert.deepEqual(w.days?.[0], { date: '2026-10-14', code: 61, hi: 65, lo: 50 });
});

test('wallpaper credit: short and meaningful', () => {
  assert.equal(shortCredit('Photo: Austin Neill on Unsplash'), 'AN');
  assert.equal(shortCredit('Portrait Head of Hadrian · Art Institute of Chicago · public domain'), 'AIC');
  assert.equal(shortCredit('cars · Wallhaven'), 'Wallhaven');
  assert.equal(shortCredit('NASA'), 'NASA');
  assert.equal(shortCredit('Your picture'), '');
  assert.equal(shortCredit('NS · your pictures'), '');
});

test('focus history: one entry per finished session, totals by day, a 12-week grid', async () => {
  const { logFocus, focusGrid } = await import('../src/shared/ntpomo.ts');
  const end = new Date(2026, 9, 21, 15, 0).getTime();
  let log = logFocus([], end, 25);
  log = logFocus(log, end, 25); // a second open tab finishing the same session
  log = logFocus(log, end + 3600_000, 25);
  log = logFocus(log, new Date(2026, 9, 20, 9, 0).getTime(), 50);
  assert.equal(log.length, 3, 'the same session is logged once');
  const g = focusGrid(log, new Date(2026, 9, 21, 18, 0), 12);
  assert.equal(g.days.length, 12 * 7);
  const today = g.days.find((d) => d.today)!;
  assert.equal(today.min, 50);
  assert.equal(g.days[g.days.indexOf(today) - 1].min, 50);
  assert.equal(g.thisWeek, 100);
  assert.ok(g.days.every((d) => d.level >= 0 && d.level <= 4));
  assert.equal(today.level, 4, 'the busiest day is the darkest');
  assert.equal(g.days[g.days.length - 1].future, true, 'days after today in this week are blank');
  assert.ok(logFocus(Array.from({ length: 600 }, (_, i) => ({ end: i, min: 1 })), end, 25).length <= 500, 'the log stays bounded');
});

test('a second time zone names the city and says when it is another day', async () => {
  const { zoneText } = await import('../src/shared/ntdata.ts');
  const lateUtc = new Date(Date.UTC(2026, 9, 21, 22, 30));
  const z = zoneText('Asia/Kolkata', lateUtc, 'en-US', 'UTC');
  assert.deepEqual(z, { city: 'Kolkata', time: '4:00 am, tomorrow' });
  assert.deepEqual(zoneText('America/Los_Angeles', new Date(Date.UTC(2026, 9, 21, 3, 0)), 'en-US', 'UTC'), { city: 'Los Angeles', time: '8:00 pm, yesterday' });
  assert.deepEqual(zoneText('Europe/London', lateUtc, 'en-US', 'UTC'), { city: 'London', time: '11:30 pm' });
  assert.equal(zoneText('Not/AZone', lateUtc), null);
});
