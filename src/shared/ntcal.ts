// Calendar for the new tab: a month grid, events from calendars you subscribe
// to (the private iCal address Google, Outlook, iCloud and Proton give you),
// and links into the calendar app you use, so a click opens that day there or
// starts a new event in it.

export type CalApp = 'google' | 'outlook' | 'office' | 'notion' | 'apple' | 'proton';

export interface CalEvent {
  id: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  location?: string;
  url?: string;
  rrule?: Rrule;
  exdates?: number[];
  /** Which feed it came from (for colour). */
  feed: number;
}

export interface Rrule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  count?: number;
  until?: number;
  byday?: number[];
}

const p2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
const ymdDash = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const localStamp = (d: Date) => `${ymd(d)}T${p2(d.getHours())}${p2(d.getMinutes())}00`;

export const CAL_APPS: Record<CalApp, { name: string; day: (d: Date) => string; create: ((start: Date, title?: string) => string) | null }> = {
  google: {
    name: 'Google Calendar',
    day: (d) => `https://calendar.google.com/calendar/r/day/${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`,
    create: (s, t = '') => {
      const e = new Date(s.getTime() + 3_600_000);
      return `https://calendar.google.com/calendar/r/eventedit?text=${encodeURIComponent(t)}&dates=${localStamp(s)}/${localStamp(e)}`;
    },
  },
  outlook: {
    name: 'Outlook',
    day: (d) => `https://outlook.live.com/calendar/0/view/day/${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`,
    create: (s, t = '') =>
      `https://outlook.live.com/calendar/0/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent&subject=${encodeURIComponent(t)}&startdt=${ymdDash(s)}T${p2(s.getHours())}:00:00&enddt=${ymdDash(s)}T${p2(s.getHours() + 1)}:00:00`,
  },
  office: {
    name: 'Outlook (work)',
    day: (d) => `https://outlook.office.com/calendar/view/day/${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`,
    create: (s, t = '') =>
      `https://outlook.office.com/calendar/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent&subject=${encodeURIComponent(t)}&startdt=${ymdDash(s)}T${p2(s.getHours())}:00:00&enddt=${ymdDash(s)}T${p2(s.getHours() + 1)}:00:00`,
  },
  notion: { name: 'Notion Calendar', day: () => 'https://calendar.notion.so/', create: null },
  apple: { name: 'Apple Calendar', day: () => 'https://www.icloud.com/calendar/', create: null },
  proton: { name: 'Proton Calendar', day: () => 'https://calendar.proton.me/', create: null },
};

/** Monday-first for most of the world, Sunday-first where that's the custom. */
export function weekStartFor(locale: string): 0 | 1 {
  return /^(en-(US|CA|PH)|ja|ko|zh-(TW|HK)|he|pt-BR|es-MX|ar-SA|hi)/i.test(locale) ? 0 : 1;
}

/** Six rows of seven days covering the month (with the edges of the next and previous). */
export function monthGrid(year: number, month: number, weekStart: 0 | 1): Date[] {
  const first = new Date(year, month, 1);
  const shift = (first.getDay() - weekStart + 7) % 7;
  const start = new Date(year, month, 1 - shift);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export const sameDay = (a: Date | number, b: Date | number) => {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
};

// ------------------------------------------------------------ iCal

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function parseDate(value: string, params: string): { t: number; allDay: boolean } | null {
  const v = value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, Y, M, D, h, mi, s, z] = m;
  if (!h || /VALUE=DATE(?!-)/i.test(params)) return { t: new Date(+Y, +M - 1, +D).getTime(), allDay: true };
  // UTC when it says so; otherwise the floating or zoned time is read as local (close enough for a glance).
  const t = z ? Date.UTC(+Y, +M - 1, +D, +h, +mi, +(s ?? 0)) : new Date(+Y, +M - 1, +D, +h, +mi, +(s ?? 0)).getTime();
  return { t, allDay: false };
}

const unescapeText = (s: string) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

function parseRrule(v: string): Rrule | undefined {
  const kv = Object.fromEntries(v.split(';').map((p) => p.split('=') as [string, string]));
  const freq = kv.FREQ as Rrule['freq'];
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return undefined;
  const until = kv.UNTIL ? parseDate(kv.UNTIL, '')?.t : undefined;
  const byday = kv.BYDAY ? kv.BYDAY.split(',').map((d) => DAYS.indexOf(d.slice(-2))).filter((n) => n >= 0) : undefined;
  return { freq, interval: Math.max(1, Number(kv.INTERVAL) || 1), count: kv.COUNT ? Number(kv.COUNT) : undefined, until, byday: byday?.length ? byday : undefined };
}

/** Read events out of an iCalendar (.ics) file. */
export function parseIcs(text: string, feed = 0): CalEvent[] {
  // Unfold continuation lines first.
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const out: CalEvent[] = [];
  let cur: Partial<CalEvent> & { allDayEnd?: boolean } = {};
  let inEvent = false;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      cur = { feed, exdates: [] };
      continue;
    }
    if (line === 'END:VEVENT') {
      inEvent = false;
      if (cur.start !== undefined && cur.title !== undefined) {
        const end = cur.end ?? (cur.allDay ? cur.start + 86_400_000 : cur.start + 3_600_000);
        out.push({ id: cur.id ?? `${feed}:${cur.start}:${cur.title}`, title: cur.title || 'Busy', start: cur.start, end, allDay: !!cur.allDay, location: cur.location, url: cur.url, rrule: cur.rrule, exdates: cur.exdates, feed });
      }
      continue;
    }
    if (!inEvent) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const [name, ...rest] = head.split(';');
    const params = rest.join(';');
    switch (name.toUpperCase()) {
      case 'UID':
        cur.id = value.trim();
        break;
      case 'SUMMARY':
        cur.title = unescapeText(value);
        break;
      case 'LOCATION':
        cur.location = unescapeText(value) || undefined;
        break;
      case 'URL':
        cur.url = value.trim();
        break;
      case 'DTSTART': {
        const d = parseDate(value, params);
        if (d) {
          cur.start = d.t;
          cur.allDay = d.allDay;
        }
        break;
      }
      case 'DTEND': {
        const d = parseDate(value, params);
        if (d) cur.end = d.t;
        break;
      }
      case 'RRULE':
        cur.rrule = parseRrule(value.trim());
        break;
      case 'EXDATE':
        for (const v of value.split(',')) {
          const d = parseDate(v, params);
          if (d) cur.exdates!.push(d.t);
        }
        break;
    }
  }
  return out;
}

/** Every occurrence that touches [from, to), recurring events included. */
export function occurrences(events: CalEvent[], from: number, to: number, limit = 500): CalEvent[] {
  const out: CalEvent[] = [];
  for (const ev of events) {
    const len = ev.end - ev.start;
    if (!ev.rrule) {
      if (ev.start < to && ev.end > from) out.push(ev);
      continue;
    }
    const r = ev.rrule;
    const base = new Date(ev.start);
    let n = 0;
    for (let step = 0; step < 2000 && out.length < limit; step++) {
      const cands: Date[] = [];
      if (r.freq === 'DAILY') cands.push(new Date(base.getFullYear(), base.getMonth(), base.getDate() + step * r.interval, base.getHours(), base.getMinutes()));
      else if (r.freq === 'WEEKLY') {
        const weekStart = new Date(base.getFullYear(), base.getMonth(), base.getDate() - base.getDay() + step * 7 * r.interval, base.getHours(), base.getMinutes());
        for (const d of r.byday ?? [base.getDay()]) cands.push(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + d, base.getHours(), base.getMinutes()));
      } else if (r.freq === 'MONTHLY') cands.push(new Date(base.getFullYear(), base.getMonth() + step * r.interval, base.getDate(), base.getHours(), base.getMinutes()));
      else cands.push(new Date(base.getFullYear() + step * r.interval, base.getMonth(), base.getDate(), base.getHours(), base.getMinutes()));
      let past = false;
      for (const c of cands.sort((a, b) => +a - +b)) {
        const t = c.getTime();
        if (t < ev.start) continue;
        if ((r.until !== undefined && t > r.until) || (r.count !== undefined && n >= r.count)) {
          past = true;
          break;
        }
        n++;
        if (t >= to) {
          past = true;
          break;
        }
        if (t + len > from && !ev.exdates?.some((x) => sameDay(x, t) && (ev.allDay || Math.abs(x - t) < 60_000))) out.push({ ...ev, id: `${ev.id}@${t}`, start: t, end: t + len });
      }
      if (past) break;
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** A calendar file for one event (Apple Calendar and others open it). */
export function eventIcs(title: string, start: Date, minutes = 60): string {
  const end = new Date(start.getTime() + minutes * 60_000);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//sidegig//EN', 'BEGIN:VEVENT', `UID:${start.getTime()}@sidegig`, `DTSTAMP:${localStamp(new Date())}`, `DTSTART:${localStamp(start)}`, `DTEND:${localStamp(end)}`, `SUMMARY:${title.replace(/([,;\\])/g, '\\$1')}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

/** webcal:// links are https underneath. */
export const feedUrl = (u: string) => u.trim().replace(/^webcals?:\/\//i, 'https://');
