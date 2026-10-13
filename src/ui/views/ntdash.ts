// The new tab's widgets: time, weather, a month calendar that opens your
// calendar app, a Pomodoro timer, sticky notes, and bookmarks. Each sits on its
// own card (frosted, clear or solid) and each can be turned off in Customize.
import { ext } from '../../shared/api.ts';
import { getLocal, setLocal, onLocalChanged, updateSettings } from '../../shared/storage.ts';
import { CAL_APPS, eventIcs, feedUrl, monthGrid, occurrences, parseIcs, sameDay, weekStartFor, type CalEvent } from '../../shared/ntcal.ts';
import { clockText, freshPomo, msLeft, next, pause, phaseMs, settle, start, type PomoConfig, type PomoState } from '../../shared/ntpomo.ts';
import { greetingFor, parseWeather, weatherLabel, weatherUrl, type WeatherNow } from '../../shared/ntdata.ts';
import { h, ico, favicon, faviconOnly, toast } from '../dom.ts';
import { type Ctx, openUrl } from '../ctx.ts';
import { spacesFor } from './home.ts';
import { analogClockEl, findPlace } from './ntwidgets.ts';
import { play } from '../sound.ts';
import { TIMER } from '../figures/timer.ts';
import { WATCH } from '../figures/watch.ts';
import { STATION } from '../figures/station.ts';
import { CUBES } from '../figures/cubes.ts';
import { faceText, figureSvg, hand, line, poly, ring as ringPath } from '../figures/iso.ts';
import { PAD } from '../figures/pad.ts';

const stillMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Run `frame` about `fps` times a second while the element is on the page and the tab is visible. */
function animate(el: Element, fps: number, frame: (now: number) => void) {
  let last = 0;
  let seen = false;
  let waited = 0;
  const step = (now: number) => {
    // Cards are built before they're put on the page: wait for that, stop once it's removed.
    if (!el.isConnected) {
      if (seen || ++waited > 600) return;
      requestAnimationFrame(step);
      return;
    }
    seen = true;
    if (document.visibilityState === 'visible' && now - last >= 1000 / fps) {
      last = now;
      frame(Date.now());
    }
    requestAnimationFrame(step);
  };
  frame(Date.now());
  requestAnimationFrame(step);
}

const locale = navigator.language || 'en-US';

/** A card: title, a few small actions, then the body. */
export function card(cls: string, title: string | null, actions: (Node | null)[], ...body: (Node | null)[]): HTMLElement {
  return h(
    'section',
    { class: `nt-card ${cls}`, 'aria-label': title ?? undefined },
    title ? h('header', { class: 'nt-card-h' }, h('h2', {}, title), h('div', { class: 'nt-card-a' }, ...actions.filter(Boolean))) : null,
    ...body.filter(Boolean),
  );
}
const iconBtn = (name: string, label: string, onClick: (e: MouseEvent) => void, size = 18) => h('button', { type: 'button', class: 'nt-ib', title: label, 'aria-label': label, onclick: onClick }, ico(name, size));

/** Characters that change roll in (from above, through a blur); the rest stay still. */
export function rollText(el: HTMLElement, text: string) {
  const prev = el.dataset.text;
  if (prev === text) return;
  el.dataset.text = text;
  const chars = [...text];
  const was = prev ? [...prev] : [];
  // Same length: swap only the characters that changed, leaving the rest in place
  // (re-inserting a node would replay its animation).
  if (prev && was.length === chars.length && el.children.length === chars.length) {
    chars.forEach((ch, i) => {
      if (was[i] !== ch) el.children[i].replaceWith(h('span', { class: 'roll in' }, ch));
    });
    return;
  }
  el.replaceChildren(...chars.map((ch, i) => h('span', { class: prev && was[i] !== ch ? 'roll in' : 'roll' }, ch)));
}

/** Swap a placeholder for content with a soft fade up through a blur. */
export function reveal(host: HTMLElement, ...kids: (Node | string)[]) {
  host.replaceChildren(...kids);
  host.classList.remove('nt-reveal');
  void host.offsetWidth;
  host.classList.add('nt-reveal');
}
const skel = (...widths: string[]) => h('div', { class: 'skel-stack', 'aria-hidden': 'true' }, widths.map((w) => h('i', { class: 'skel', style: { width: w } })));

// ---------------------------------------------------------------- time

/** The line over the search: your own message, or a greeting with your name. */
export function greetingLine(ctx: Ctx): HTMLElement | null {
  const n = ctx.settings.newtab;
  if (!n.widgets.greeting) return null;
  const name = n.name.trim();
  return h('h1', { class: 'nt-greet' }, n.message.trim() || `${greetingFor(new Date().getHours())}${name ? `, ${name}` : ''}`);
}

export function timeBlock(ctx: Ctx, brief: HTMLElement | null = null): HTMLElement {
  const n = ctx.settings.newtab;
  const date = h('div', { class: 'nt-date' });
  const paintDate = () => (date.textContent = new Date().toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' }));
  paintDate();
  if (!n.clock) return h('section', { class: 'nt-timeblock nt-card' }, date);
  if (n.clockStyle === 'analog') return h('section', { class: 'nt-timeblock nt-card analog' }, analogClockEl(), date);
  const digits = h('span', { class: 'nt-hm' });
  const ampmEl = h('span', { class: 'nt-ampm' });
  const time = h('div', { class: 'nt-time' }, digits, ampmEl);
  // A pocket watch on a stand keeps the same time, with a small seconds hand that sweeps.
  const watch = h('div', {
    class: 'fig fig-watch iso',
    html: figureSvg(WATCH.width, WATCH.height, `${WATCH.below}<path class="iso-line" data-tone="hi" data-hand="h" style="stroke-width:2.4px" d=""/><path class="iso-line" data-tone="hi" data-hand="m" style="stroke-width:1.5px" d=""/><path class="iso-line" data-tone="lit" data-hand="s" style="stroke-width:1px" d=""/>${WATCH.above}`),
  });
  const [hh, mm, ss] = (['h', 'm', 's'] as const).map((k) => watch.querySelector<SVGPathElement>(`[data-hand="${k}"]`)!);
  animate(watch, stillMotion() ? 1 : 8, (now) => {
    const d = new Date(now);
    const sec = d.getSeconds() + (stillMotion() ? 0 : d.getMilliseconds() / 1000);
    const min = d.getMinutes() + sec / 60;
    hh.setAttribute('d', hand(WATCH.projection, 0, 0, WATCH.face, ((d.getHours() % 12) + min / 60) / 12, WATCH.hour));
    mm.setAttribute('d', hand(WATCH.projection, 0, 0, WATCH.face, min / 60, WATCH.minute));
    ss.setAttribute('d', hand(WATCH.projection, WATCH.sub[0], WATCH.sub[1], WATCH.face, sec / 60, WATCH.second));
  });
  const paint = () => {
    const parts = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).formatToParts(new Date());
    const hm = parts.filter((p) => p.type === 'hour' || p.type === 'minute' || p.type === 'literal').map((p) => p.value).join('').trim();
    rollText(digits, hm);
    ampmEl.textContent = parts.find((p) => p.type === 'dayPeriod')?.value.toLowerCase() ?? '';
    paintDate();
  };
  paint();
  const tick = () => setTimeout(() => (time.isConnected ? (paint(), tick()) : undefined), 60_000 - (Date.now() % 60_000) + 50);
  tick();
  return h('section', { class: 'nt-timeblock nt-card has-fig', 'aria-label': 'Clock' }, watch, h('div', { class: 'nt-timetext' }, time, date, brief));
}

// ---------------------------------------------------------------- weather

async function loadWeather(ctx: Ctx): Promise<WeatherNow | null> {
  const w = ctx.settings.newtab.weather;
  const cached = await getLocal<WeatherNow | null>('ntWeather', null);
  if (cached && cached.place === w.place && cached.units === w.units && cached.days && cached.wind && Date.now() - cached.at < 30 * 60_000) return cached;
  try {
    const r = await fetch(weatherUrl(w.lat, w.lon, w.units), { credentials: 'omit' });
    const now = parseWeather(await r.json(), w.units, w.place);
    if (now) await setLocal('ntWeather', now);
    return now ?? cached;
  } catch {
    return cached;
  }
}

export function weatherCard(ctx: Ctx): HTMLElement {
  const w = ctx.settings.newtab.weather;
  if (!w.place) {
    // Set it up right here: type a city, pick it.
    const input = h('input', { class: 'text-input', type: 'text', placeholder: 'Your city', 'aria-label': 'Your city' });
    const list = h('div', { class: 'wx-pick' });
    const find = async () => {
      const q = input.value.trim();
      if (!q) return;
      const places = await findPlace(q).catch(() => []);
      list.replaceChildren(
        ...(places.length
          ? places.slice(0, 4).map((p) =>
              h(
                'button',
                { type: 'button', class: 'nt-chip', onclick: () => void updateSettings((s) => void (s.newtab.weather = { ...s.newtab.weather, enabled: true, place: p.name, lat: p.lat, lon: p.lon })) },
                p.name,
              ),
            )
          : [h('span', { class: 'muted' }, 'No place by that name')]),
      );
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && void find());
    return card('nt-wx', 'Weather', [], h('form', { class: 'wx-setup', onsubmit: (e: Event) => (e.preventDefault(), void find()) }, input, h('button', { class: 'btn', type: 'submit' }, 'Find')), list);
  }
  const body = h('div', { class: 'wx-body', 'aria-live': 'polite' }, skel('60%', '90%', '75%'));
  // A small weather station: the cups spin with the wind, the vane points into it,
  // the thermometer reads the temperature.
  const live = { temp: 60, units: w.units as 'f' | 'c', wind: 4, dir: 225 };
  const S = STATION;
  const station = h('div', {
    class: 'fig fig-station iso',
    html: figureSvg(
      S.width,
      S.height,
      `${S.back}<path class="iso-line" data-tone="hi" data-part="vane" style="stroke-width:1.5px" d=""/><path class="iso-fill" data-part="fin" d=""/><path class="iso-line" data-tone="mid" data-part="fin-edge" d=""/>${S.mastUpper}<path class="iso-line" data-tone="mid" data-part="arms" d=""/><path class="iso-fill" data-part="cups" d=""/><path class="iso-line" data-tone="lo" data-part="cups-edge" d=""/>${S.gauge}${S.thermoSvg}<path class="iso-line" data-tone="red" data-part="mercury" style="stroke-width:1.6px" d=""/>`,
    ),
  });
  const part = (n: string) => station.querySelector<SVGPathElement>(`[data-part="${n}"]`)!;
  let spin = 0;
  let lastFrame = Date.now();
  animate(station, stillMotion() ? 1 : 30, (now) => {
    const P = S.projection;
    const [mx, my] = S.mast;
    // Cups: about one turn a second at 10 mph; never quite still.
    spin += (stillMotion() ? 0 : (now - lastFrame) / 1000) * (0.6 + live.wind * 0.55);
    lastFrame = now;
    const arms: string[] = [];
    const cups: string[] = [];
    for (let i = 0; i < 3; i++) {
      const t = spin + (i * Math.PI * 2) / 3;
      const ex = mx + Math.cos(t) * 13;
      const ey = my + Math.sin(t) * 13;
      arms.push(line(P, [mx, my, S.cupZ], [ex, ey, S.cupZ]));
      cups.push(ringPath(P, ex, ey, 3, S.cupZ, 14));
    }
    part('arms').setAttribute('d', arms.join(''));
    part('cups').setAttribute('d', cups.join(''));
    part('cups-edge').setAttribute('d', cups.join(''));
    // Vane: the arrow points where the wind comes from (north is -y here).
    const a = ((live.dir - 90) * Math.PI) / 180;
    const head: [number, number, number] = [mx + Math.cos(a) * 15, my + Math.sin(a) * 15, S.vaneZ];
    const tail: [number, number, number] = [mx - Math.cos(a) * 12, my - Math.sin(a) * 12, S.vaneZ];
    part('vane').setAttribute('d', line(P, tail, head));
    const n = [-Math.sin(a) * 4, Math.cos(a) * 4];
    const back: [number, number, number] = [mx - Math.cos(a) * 7, my - Math.sin(a) * 7, S.vaneZ];
    const fin = poly(P, [tail, [back[0] + n[0], back[1] + n[1], S.vaneZ], [back[0] - n[0], back[1] - n[1], S.vaneZ]]);
    part('fin').setAttribute('d', fin);
    part('fin-edge').setAttribute('d', fin);
    // Mercury: -20..120 °F (or -30..50 °C) along the tube.
    const [lo, hi] = live.units === 'c' ? [-30, 50] : [-20, 120];
    const f = Math.max(0, Math.min(1, (live.temp - lo) / (hi - lo)));
    part('mercury').setAttribute('d', line(P, [S.thermo.x, S.thermo.y, S.thermo.bulb], [S.thermo.x, S.thermo.y, S.thermo.low + (S.thermo.high - S.thermo.low) * f]));
  });
  void loadWeather(ctx).then((now) => {
    if (!now) return void reveal(body, h('span', { class: 'muted' }, 'Weather is unavailable right now'));
    const { label, icon } = weatherLabel(now.code, now.isDay);
    station.dataset.ready = '';
    live.temp = now.temp;
    live.units = now.units;
    live.wind = now.wind?.speed ?? 4;
    live.dir = now.wind?.dir ?? 225;
    reveal(
      body,
      h(
        'div',
        { class: 'wx-now' },
        h('span', { class: 'wx-icon' }, ico(icon, 34)),
        h('span', { class: 'wx-temp', 'aria-label': `${now.temp} degrees` }, String(now.temp), h('span', { class: 'wx-deg', 'aria-hidden': 'true' }, '°')),
        h('span', { class: 'wx-desc' }, h('b', {}, label), h('span', {}, `H ${now.hi}°  L ${now.lo}°`)),
      ),
      now.days?.length
        ? h(
            'div',
            { class: 'wx-days' },
            now.days.map((d) =>
              h(
                'div',
                { class: 'wx-day', title: `${weatherLabel(d.code).label}, ${d.hi}° / ${d.lo}°` },
                h('span', { class: 'wx-dn' }, new Date(`${d.date}T12:00:00`).toLocaleDateString(locale, { weekday: 'short' })),
                ico(weatherLabel(d.code).icon, 20),
                h('span', { class: 'wx-dt' }, `${d.hi}°`, h('i', {}, `${d.lo}°`)),
              ),
            ),
          )
        : '',
    );
  });
  return card('nt-wx has-fig', w.place.split(',')[0], [], h('div', { class: 'wx-scene' }, station, body));
}

// ---------------------------------------------------------------- calendar

let view: { y: number; m: number } | null = null;
let picked: number | null = null;

async function loadEvents(feeds: string[]): Promise<CalEvent[]> {
  const urls = feeds.map(feedUrl).filter((u) => /^https:\/\//.test(u));
  if (!urls.length) return [];
  const key = urls.join('|');
  const cached = await getLocal<{ key: string; at: number; events: CalEvent[] } | null>('ntCalCache', null);
  if (cached?.key === key && Date.now() - cached.at < 30 * 60_000) return cached.events;
  const lists = await Promise.allSettled(urls.map(async (u, i) => parseIcs(await (await fetch(u, { credentials: 'omit' })).text(), i)));
  const events = lists.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  if (events.length || !cached) await setLocal('ntCalCache', { key, at: Date.now(), events });
  return events.length ? events : cached?.events ?? [];
}

export function calendarCard(ctx: Ctx): HTMLElement {
  const cal = ctx.settings.newtab.calendar;
  const app = CAL_APPS[cal.app] ?? CAL_APPS.google;
  const today = new Date();
  view ??= { y: today.getFullYear(), m: today.getMonth() };
  const ws = weekStartFor(locale);
  const title = h('h2', {});
  const grid = h('div', { class: 'cal-grid', role: 'grid' });
  const dayPanel = h('div', { class: 'cal-day', 'aria-live': 'polite' });
  // Small and medium sizes show what's next instead of the month.
  const upNext = h('div', { class: 'cal-next' });
  let events: CalEvent[] = [];
  const paintNext = () => {
    const now = Date.now();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const evs = occurrences(events, start, start + 7 * 86_400_000)
      .filter((e) => (e.allDay ? e.end > now : e.end > now))
      .slice(0, 3);
    const when = (e: CalEvent) => {
      const d = new Date(e.start);
      const day = sameDay(d, new Date()) ? '' : `${d.toLocaleDateString(locale, { weekday: 'short' })} `;
      return e.allDay ? `${day || 'Today '}all day`.trim() : `${day}${d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}`;
    };
    upNext.replaceChildren(
      ...(evs.length
        ? evs.map((e) => h('button', { type: 'button', class: 'cal-ev', style: { '--c': `var(--feed-${e.feed % 4})` }, title: e.location ?? e.title, onclick: () => (e.url ? void openUrl(ctx, e.url) : openDay(new Date(e.start))) }, h('span', { class: 'cal-ev-t' }, when(e)), h('span', { class: 'cal-ev-n' }, e.title)))
        : [h('div', { class: 'cal-empty' }, cal.feeds.length ? 'Nothing this week' : 'No calendars yet')]),
    );
  };

  const openDay = (d: Date) => void openUrl(ctx, app.day(d));
  const newEvent = (d: Date) => {
    const at = sameDay(d, new Date()) ? new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000) : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9);
    if (app.create) return void openUrl(ctx, app.create(at));
    if (cal.app === 'apple') {
      // Apple Calendar opens .ics files: hand it one for that day.
      const a = h('a', { href: URL.createObjectURL(new Blob([eventIcs('New event', at)], { type: 'text/calendar' })), download: 'event.ics' });
      a.click();
      return;
    }
    openDay(d);
  };

  const paintDay = () => {
    if (picked === null) return void dayPanel.replaceChildren();
    const d = new Date(picked);
    const from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const evs = occurrences(events, from, from + 86_400_000);
    dayPanel.replaceChildren(
      h('div', { class: 'cal-day-h' }, h('b', {}, d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' }))),
      ...(evs.length
        ? evs.map((e) =>
            h(
              'button',
              { type: 'button', class: 'cal-ev', style: { '--c': `var(--feed-${e.feed % 4})` }, title: e.location ?? e.title, onclick: () => (e.url ? void openUrl(ctx, e.url) : openDay(d)) },
              h('span', { class: 'cal-ev-t' }, e.allDay ? 'All day' : new Date(e.start).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })),
              h('span', { class: 'cal-ev-n' }, e.title),
            ),
          )
        : [h('div', { class: 'cal-empty' }, cal.feeds.length ? 'Nothing planned' : 'No events yet')]),
      h(
        'div',
        { class: 'cal-day-a' },
        h('button', { type: 'button', class: 'btn', onclick: () => openDay(d) }, `Open in ${app.name}`),
        h('button', { type: 'button', class: 'btn', onclick: () => newEvent(d) }, 'New event'),
      ),
    );
  };

  const paint = () => {
    const { y, m } = view!;
    title.textContent = new Date(y, m, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    const days = monthGrid(y, m, ws);
    // Five weeks when the sixth would be all next month.
    const shown = days.slice(0, days[35].getMonth() === m ? 42 : 35);
    const from = shown[0].getTime();
    const occ = occurrences(events, from, shown[shown.length - 1].getTime() + 86_400_000);
    const heads = Array.from({ length: 7 }, (_, i) => h('span', { class: 'cal-wd', 'aria-hidden': 'true' }, new Date(2024, 0, 7 + ((i + ws) % 7)).toLocaleDateString(locale, { weekday: 'narrow' })));
    grid.replaceChildren(
      ...heads,
      ...shown.map((d) => {
        const dots = occ.filter((e) => sameDay(e.start, d) || (e.allDay && e.start <= d.getTime() && e.end > d.getTime())).slice(0, 3);
        const label = `${d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })}${dots.length ? `, ${dots.length} event${dots.length === 1 ? '' : 's'}` : ''}`;
        return h(
          'button',
          {
            type: 'button',
            class: 'cal-d',
            'aria-label': label,
            'aria-pressed': String(picked !== null && sameDay(picked, d)),
            dataset: { other: String(d.getMonth() !== m), today: String(sameDay(d, today)) },
            onclick: () => {
              picked = picked !== null && sameDay(picked, d) ? null : d.getTime();
              paint();
            },
            ondblclick: () => openDay(d),
          },
          h('span', {}, String(d.getDate())),
          dots.length ? h('i', { class: 'cal-dots' }, dots.map((e) => h('b', { style: { background: `var(--feed-${e.feed % 4})` } }))) : null,
        );
      }),
    );
    paintDay();
    paintNext();
  };
  const step = (k: number) => {
    const d = new Date(view!.y, view!.m + k, 1);
    view = { y: d.getFullYear(), m: d.getMonth() };
    paint();
  };
  paint();
  void loadEvents(cal.feeds).then((evs) => {
    events = evs;
    if (evs.length) paint();
  });
  const head = h(
    'header',
    { class: 'nt-card-h' },
    title,
    h(
      'div',
      { class: 'nt-card-a' },
      iconBtn('back', 'Previous month', () => step(-1)),
      iconBtn('forward', 'Next month', () => step(1)),
      iconBtn('plus', `New event in ${app.name}`, () => newEvent(picked !== null ? new Date(picked) : new Date())),
    ),
  );
  // A two-cube desk calendar shows today; click it to come back to this month.
  const C = CUBES;
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const cubes = h('button', {
    type: 'button',
    class: 'fig fig-cubes iso',
    title: 'Back to today',
    'aria-label': `Today is ${now.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })}. Back to this month`,
    html: figureSvg(
      C.width,
      C.height,
      `${C.art}${faceText(C.dayFaces[0], dd[0], 10)}${faceText(C.dayFaces[1], dd[1], 10)}${faceText(C.monthFace, now.toLocaleDateString('en', { month: 'short' }).toUpperCase(), 5.6)}${faceText(C.weekdayFace, now.toLocaleDateString('en', { weekday: 'short' }).toUpperCase(), 3.4, 'lo')}`,
    ),
    onclick: () => {
      play('key');
      view = { y: now.getFullYear(), m: now.getMonth() };
      picked = now.getTime();
      paint();
    },
  });
  paintNext();
  return h('section', { class: 'nt-card nt-cal has-fig', 'aria-label': 'Calendar' }, cubes, head, grid, dayPanel, upNext);
}

// ---------------------------------------------------------------- pomodoro

const PHASE_NAME = { focus: 'Focus', short: 'Short break', long: 'Long break' } as const;

// The Anatomy kit's isometric camera, enough of it to move the needle.
const RAD = Math.PI / 180;
function isoPoint([x, y, z]: [number, number, number]): string {
  const P = TIMER.projection;
  const a = P.azimuth * RAD;
  const e = P.elevation * RAD;
  const k = P.scale * Math.sqrt(1.6);
  const sx = P.origin[0] + (x * Math.sin(a) - y * Math.cos(a)) * k;
  const sy = P.origin[1] + ((x * Math.cos(a) + y * Math.sin(a)) * Math.sin(e) - z * Math.cos(e)) * k;
  return `${sx.toFixed(1)} ${sy.toFixed(1)}`;
}
/** The needle for this many minutes left on a 60-minute dial. */
function needlePath(minutes: number): string {
  const t = (Math.max(0, Math.min(60, minutes)) / 60) * Math.PI * 2;
  const { x, y, z, tip } = TIMER.dial;
  return `M${isoPoint([x - Math.sin(t) * 3, y + Math.cos(t) * 3, z])}L${isoPoint([x + Math.sin(t) * tip, y - Math.cos(t) * tip, z])}`;
}

export async function pomodoroCard(ctx: Ctx): Promise<HTMLElement> {
  const cfg: PomoConfig = ctx.settings.newtab.pomodoro;
  let st = await getLocal<PomoState | null>('ntPomo', null) ?? freshPomo(cfg);
  // The timer is drawn as a real one (an Anatomy figure): the needle shows the minutes left.
  const fig = h('button', {
    type: 'button',
    class: 'pomo-figbtn',
    html: `<svg class="iso-svg" viewBox="0 0 ${TIMER.width} ${TIMER.height}" aria-hidden="true">${TIMER.below}<g class="pomo-bell">${TIMER.bell}</g>${TIMER.drum}<path class="iso-line pomo-sweep" data-tone="mid" d=""/><path class="iso-line pomo-needle" data-tone="lit" d=""/><g class="pomo-lever">${TIMER.lever}</g>${TIMER.above}</svg>`,
  });
  const needle = fig.querySelector<SVGPathElement>('.pomo-needle')!;
  const sweep = fig.querySelector<SVGPathElement>('.pomo-sweep')!;
  // While it runs, the needle glides and a thin seconds hand sweeps round, so it visibly works.
  const hands = (now: number) => {
    const left = msLeft(st, now);
    needle.setAttribute('d', needlePath(left / 60_000));
    sweep.setAttribute('d', st.running ? hand(TIMER.projection, TIMER.dial.x, TIMER.dial.y, TIMER.dial.z + 0.1, ((left / 1000) % 60) / 60, [2, TIMER.dial.tip - 2]) : '');
  };
  animate(fig, stillMotion() ? 1 : 24, (now) => st.running && hands(now));
  const lever = fig.querySelector<SVGGElement>('.pomo-lever')!;
  const time = h('div', { class: 'pomo-time', role: 'timer' });
  const phase = h('div', { class: 'pomo-phase' });
  const dots = h('div', { class: 'pomo-dots', 'aria-hidden': 'true' });
  const go = h('button', { type: 'button', class: 'btn primary pomo-go' });
  const save = async (s: PomoState) => {
    st = s;
    await setLocal('ntPomo', s);
  };
  const paint = () => {
    const now = Date.now();
    const done = settle(st, cfg, now);
    if (done.finished) {
      void save(done.state);
      play('arrive');
      // The bell rings: it shakes for a moment.
      fig.classList.remove('ringing');
      void fig.getBoundingClientRect();
      fig.classList.add('ringing');
      setTimeout(() => fig.classList.remove('ringing'), 1600);
      toast(done.finished === 'focus' ? 'Focus done. Take a break.' : 'Break over. Back to it.');
    }
    const left = msLeft(st, now);
    const total = phaseMs(st.phase, cfg);
    rollText(time, clockText(left));
    phase.textContent = PHASE_NAME[st.phase];
    hands(now);
    lever.style.transform = st.running ? `translate(${TIMER.leverShift[0]}px, ${TIMER.leverShift[1]}px)` : '';
    fig.setAttribute('aria-label', `${st.running ? 'Pause' : 'Start'}: ${clockText(left)} of ${PHASE_NAME[st.phase].toLowerCase()} left`);
    void total;
    root.dataset.phase = st.phase;
    root.dataset.running = String(st.running);
    go.textContent = st.running ? 'Pause' : left < total ? 'Resume' : 'Start';
    dots.replaceChildren(...Array.from({ length: cfg.every }, (_, i) => h('i', { class: i < st.rounds % cfg.every ? 'on' : '' })));
    document.title = st.running ? `${clockText(left)} ${PHASE_NAME[st.phase].toLowerCase()}` : 'New Tab';
  };
  const toggle = () => {
    play(st.running ? 'off' : 'on');
    void save(st.running ? pause(st, Date.now()) : start(st, Date.now())).then(paint);
  };
  go.addEventListener('click', toggle);
  fig.addEventListener('click', toggle);
  const root = card(
    'nt-pomo',
    'Pomodoro',
    [
      iconBtn('refresh', 'Reset', () => void save({ ...freshPomo(cfg), rounds: st.rounds }).then(paint)),
      iconBtn('next', 'Skip to next', () => void save(next(st, cfg)).then(paint)),
    ],
    h('div', { class: 'pomo-fig iso' }, fig),
    h('div', { class: 'pomo-row' }, h('div', { class: 'pomo-read' }, time, phase), dots, go),
  );
  paint();
  const timer = setInterval(() => (root.isConnected ? paint() : clearInterval(timer)), 1000);
  onLocalChanged('ntPomo', (v) => {
    if (!root.isConnected || !v) return;
    st = v as PomoState;
    paint();
  });
  return root;
}

// ---------------------------------------------------------------- sticky notes

interface Note {
  id: string;
  text: string;
  color: number;
}
const NOTE_COLORS = 5;

export async function notesCard(): Promise<HTMLElement> {
  let notes = await getLocal<Note[]>('ntNotes', []);
  const grid = h('div', { class: 'notes' });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const persist = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void setLocal('ntNotes', notes), 350);
  };
  let paint = () => {
    grid.replaceChildren(
      ...notes.map((n) => {
        const ta = h('textarea', { class: 'note-t', rows: 3, placeholder: 'Write something', 'aria-label': 'Note', maxlength: 600 });
        ta.value = n.text;
        ta.addEventListener('input', () => {
          n.text = ta.value;
          persist();
        });
        return h(
          'div',
          { class: 'note', dataset: { c: String(n.color) } },
          ta,
          h(
            'div',
            { class: 'note-a' },
            h('button', { type: 'button', class: 'note-c', title: 'Colour', 'aria-label': 'Change colour', onclick: () => ((n.color = (n.color + 1) % NOTE_COLORS), persist(), paint()) }),
            h(
              'button',
              {
                type: 'button',
                class: 'note-x',
                title: 'Delete',
                'aria-label': 'Delete note',
                onclick: () => {
                  play('dismiss');
                  notes = notes.filter((x) => x !== n);
                  persist();
                  paint();
                },
              },
              ico('close', 14),
            ),
          ),
        );
      }),
    );
  };
  paint();
  const add = () => {
    if (notes.length >= 12) return toast('Twelve notes is the limit here');
    notes = [{ id: `n${Date.now().toString(36)}`, text: '', color: notes.length % NOTE_COLORS }, ...notes];
    persist();
    paint();
    grid.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  };
  const empty = () => (notes.length ? null : h('button', { type: 'button', class: 'notes-empty', onclick: add }, 'Add a note'));
  // A sticky-note pad with a pen: the top sheet shows how many notes you have; tap it for a new one.
  const pad = h('button', { type: 'button', class: 'fig fig-pad iso', title: 'New note', 'aria-label': 'New note', onclick: () => add() });
  const paintPad = () => (pad.innerHTML = figureSvg(PAD.width, PAD.height, `${PAD.art}${faceText(PAD.countFace, String(notes.length), 11)}`));
  paintPad();
  const repaint = paint;
  paint = () => (repaint(), paintPad());
  const root = card('nt-notes has-fig', 'Notes', [iconBtn('plus', 'New note', add)], pad, grid);
  const e = empty();
  if (e) root.append(e);
  return root;
}

// ---------------------------------------------------------------- bookmarks

type Mark = chrome.bookmarks.BookmarkTreeNode;
const sitesLabel = (n: number) => `${n} ${n === 1 ? 'site' : 'sites'}`;
const hostName = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
};

/** A site's icon (the shared icon system picks a logo, the site icon or a letter). */
const markIcon = (url: string, title: string) => favicon(url, title || hostName(url), 'fav');

/** Folder colours: muted leathers and papers. */
export const FOLDER_TONES: [string, string][] = [
  ['oat', 'Oat'],
  ['sage', 'Sage'],
  ['slate', 'Slate'],
  ['clay', 'Clay'],
  ['rose', 'Rose'],
  ['ink', 'Ink'],
  ['graphite', 'Graphite'],
];
/** A folder's colour: the one you picked, or a steady one from its id. */
export function folderTone(ctx: Ctx, id: string): string {
  const mine = ctx.settings.newtab.folderTones?.[id];
  if (mine && FOLDER_TONES.some(([k]) => k === mine)) return mine;
  let n = 0;
  for (const ch of id) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return FOLDER_TONES[n % 5][0];
}

/** A pocket folder: a few of its sites peek out of the top like cards. */
function folderArt(f: Mark, kids: Mark[], tone = 'oat'): HTMLElement {
  const papers = kids
    .filter((k) => k.url)
    .slice(0, 3)
    .map((k) => h('span', { class: 'fold-paper' }, faviconOnly(k.url!, 'fav') ?? favicon(k.url!, k.title, 'fav')));
  return h(
    'span',
    { class: 'fold-art', 'aria-hidden': 'true', dataset: { tone } },
    h('span', { class: 'fold-back' }),
    h('span', { class: 'fold-papers', dataset: { n: String(papers.length) } }, papers),
    h('span', { class: 'fold-front' }),
  );
}

/** Small menu on right-click: open, remove. */
function tileMenu(ctx: Ctx, b: Mark, at: { x: number; y: number }, after: () => void) {
  document.querySelector('.shelf-menu')?.remove();
  const close = () => {
    menu.remove();
    removeEventListener('pointerdown', outside, true);
    removeEventListener('keydown', esc, true);
  };
  const outside = (e: Event) => !menu.contains(e.target as Node) && close();
  const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
  const item = (label: string, run: () => void | Promise<void>) =>
    h('button', { type: 'button', role: 'menuitem', onclick: async () => (close(), await run(), after()) }, label);
  const menu = h(
    'div',
    { class: 'shelf-menu', role: 'menu', style: { left: `${at.x}px`, top: `${at.y}px` } },
    b.url ? item('Open in a new tab', () => void ext.tabs.create({ url: b.url! })) : null,
    b.url
      ? null
      : h(
          'div',
          { class: 'menu-tones', role: 'group', 'aria-label': 'Folder colour' },
          FOLDER_TONES.map(([k, name]) =>
            h('button', {
              type: 'button',
              class: 'menu-tone',
              title: name,
              'aria-label': `${name} folder`,
              'aria-pressed': String(folderTone(ctx, b.id) === k),
              dataset: { tone: k },
              onclick: async () => {
                close();
                play('key');
                ctx.settings.newtab.folderTones = { ...ctx.settings.newtab.folderTones, [b.id]: k };
                await updateSettings((s) => void (s.newtab.folderTones = { ...s.newtab.folderTones, [b.id]: k }));
                after();
              },
            }),
          ),
        ),
    item(b.url ? 'Remove' : 'Remove folder and its sites', async () => {
      play('dismiss');
      await (b.url ? ext.bookmarks.remove(b.id) : ext.bookmarks.removeTree(b.id));
      toast(`Removed “${b.title || hostName(b.url ?? '')}”`);
    }),
  );
  document.body.append(menu);
  addEventListener('pointerdown', outside, true);
  addEventListener('keydown', esc, true);
  (menu.querySelector('button') as HTMLButtonElement | null)?.focus();
}

/**
 * Your bookmarks under the search box: sites as tiles, folders as folders you
 * open in place (with a trail back). One place for shortcuts; the sidebar keeps
 * your apps.
 */
export async function bookmarkShelf(ctx: Ctx): Promise<HTMLElement | null> {
  if (!ext.bookmarks) return null;
  const spaces = await spacesFor(ctx);
  const active = spaces.find((s) => s.id === ctx.settings.stacks.activeSpace) ?? spaces[0];
  if (!active) return null;
  const trail: Mark[] = [];
  const head = h('div', { class: 'shelf-head' });
  const grid = h('div', { class: 'nt-keys shelf-grid', role: 'list', 'aria-label': 'Bookmarks' });
  const form = h('form', { class: 'shelf-add nt-card', hidden: true });
  const root = h('section', { class: 'nt-shelf nt-card', 'aria-label': 'Bookmarks' }, head, grid, form);
  const here = () => trail[trail.length - 1]?.id ?? active.id;

  const tile = (label: string, icon: Node, props: Record<string, unknown>) =>
    h('div', { role: 'listitem', class: 'shelf-item' }, h('button', { type: 'button', class: 'nt-key', ...props }, icon, h('span', { class: 'nt-label' }, label)));

  const paint = async () => {
    const kids = await ext.bookmarks.getChildren(here()).catch(() => [] as Mark[]);
    const inner = await Promise.all(kids.map((k) => (k.url ? Promise.resolve([] as Mark[]) : ext.bookmarks.getChildren(k.id).catch(() => [] as Mark[]))));
    // The trail: space chips at the top level, "Bookmarks / Folder / Sub" inside.
    head.replaceChildren(
      ...(trail.length
        ? [
            iconBtn('back', 'Back', () => (trail.pop(), play('key'), void paint())),
            h(
              'nav',
              { class: 'shelf-trail', 'aria-label': 'Folder' },
              h('button', { type: 'button', onclick: () => ((trail.length = 0), void paint()) }, active.title || 'Bookmarks'),
              ...trail.flatMap((t, n) => [h('span', { 'aria-hidden': 'true' }, '/'), h('button', { type: 'button', 'aria-current': n === trail.length - 1 ? 'page' : undefined, onclick: () => ((trail.length = n + 1), void paint()) }, t.title || 'Folder')]),
            ),
          ]
        : spaces.length > 1
          ? [
              h(
                'div',
                { class: 'bm-spaces', role: 'tablist', 'aria-label': 'Bookmark spaces' },
                spaces.map((sp) => h('button', { type: 'button', class: 'nt-chip', role: 'tab', 'aria-selected': String(sp.id === active.id), onclick: () => void updateSettings((st) => void (st.stacks.activeSpace = sp.id)) }, sp.title || 'Untitled')),
              ),
            ]
          : []),
    );
    head.hidden = !head.childElementCount;
    const tiles = kids.map((k, n) => {
      const menu = (e: MouseEvent) => {
        e.preventDefault();
        tileMenu(ctx, k, { x: e.clientX, y: e.clientY }, () => void paint());
      };
      if (k.url) {
        const num = n < 9 ? String(n + 1) : '';
        return tile(k.title || hostName(k.url), h('span', { class: 'nt-cap' }, markIcon(k.url, k.title)), {
          title: `${k.title || hostName(k.url)}\n${k.url}`,
          'aria-keyshortcuts': num || undefined,
          onclick: (e: MouseEvent) => (play('key'), void openUrl(ctx, k.url!, e)),
          onauxclick: (e: MouseEvent) => e.button === 1 && void openUrl(ctx, k.url!, e),
          oncontextmenu: menu,
        });
      }
      const sites = inner[n].filter((x) => x.url).length;
      return tile(k.title || 'Folder', folderArt(k, inner[n], folderTone(ctx, k.id)), {
        class: 'nt-key is-folder',
        title: `${k.title || 'Folder'}: ${sitesLabel(sites)}`,
        'aria-label': `${k.title || 'Folder'} folder, ${sitesLabel(sites)}`,
        onclick: () => (play('key'), trail.push(k), void paint()),
        oncontextmenu: menu,
      });
    });
    // Add, as the last tile (like the first builds): a site or a folder, right where you are.
    tiles.push(
      tile('Add', h('span', { class: 'nt-cap nt-cap-add' }, ico('plus', 22)), {
        class: 'nt-key shelf-addkey',
        title: 'Add a site or a folder here',
        'aria-expanded': String(!form.hidden),
        onclick: () => {
          form.hidden = !form.hidden;
          play('key');
          if (!form.hidden) (form.querySelector('input') as HTMLInputElement | null)?.focus();
        },
      }),
    );
    reveal(grid, ...tiles);
    if (!kids.length && !trail.length) grid.prepend(h('p', { class: 'shelf-empty' }, 'Your bookmarks bar shows here. Add a site to start.'));
  };

  // Add a site (name and address) or a folder (name only), right where you are.
  const nameIn = h('input', { class: 'text-input', type: 'text', placeholder: 'Name', 'aria-label': 'Name', maxlength: 80 });
  const urlIn = h('input', { class: 'text-input', type: 'text', placeholder: 'Address, like example.com', 'aria-label': 'Address', inputmode: 'url', spellcheck: 'false' });
  const addSite = async () => {
    const raw = urlIn.value.trim();
    if (!raw) return void urlIn.focus();
    const url = /^[a-z][\w+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    try {
      new URL(url);
    } catch {
      return toast('That address doesn’t look right');
    }
    play('confirm');
    await ext.bookmarks.create({ parentId: here(), title: nameIn.value.trim() || hostName(url), url });
    nameIn.value = urlIn.value = '';
    form.hidden = true;
    await paint();
  };
  const addFolder = async () => {
    const title = nameIn.value.trim();
    if (!title) return void nameIn.focus();
    play('confirm');
    await ext.bookmarks.create({ parentId: here(), title });
    nameIn.value = urlIn.value = '';
    form.hidden = true;
    await paint();
  };
  form.append(
    nameIn,
    urlIn,
    h('div', { class: 'shelf-add-a' }, h('button', { type: 'submit', class: 'btn primary' }, 'Add site'), h('button', { type: 'button', class: 'btn', onclick: () => void addFolder() }, 'New folder'), h('button', { type: 'button', class: 'btn ghost', onclick: () => ((form.hidden = true), void paint()) }, 'Cancel')),
  );
  form.addEventListener('submit', (e) => (e.preventDefault(), void (urlIn.value.trim() ? addSite() : addFolder())));
  form.addEventListener('keydown', (e) => e.key === 'Escape' && ((form.hidden = true), void paint()));

  await paint();
  // Keep in step with changes made elsewhere (the sidebar, the bookmarks manager).
  let t: ReturnType<typeof setTimeout> | undefined;
  const later = () => {
    if (!root.isConnected) return;
    clearTimeout(t);
    t = setTimeout(() => void paint(), 150);
  };
  for (const ev of [ext.bookmarks.onCreated, ext.bookmarks.onRemoved, ext.bookmarks.onChanged, ext.bookmarks.onMoved]) ev?.addListener(later);
  return root;
}
