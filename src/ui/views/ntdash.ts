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
  const kids = [...text].map((ch, i) => {
    const old = el.children[i] as HTMLElement | undefined;
    if (old && prev && prev.length === text.length && prev[i] === ch) return old;
    return h('span', { class: prev ? 'roll in' : 'roll' }, ch);
  });
  el.replaceChildren(...kids);
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

export function timeBlock(ctx: Ctx): HTMLElement {
  const n = ctx.settings.newtab;
  const date = h('div', { class: 'nt-date' });
  const paintDate = () => (date.textContent = new Date().toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' }));
  paintDate();
  if (!n.clock) return h('section', { class: 'nt-timeblock nt-card' }, date);
  if (n.clockStyle === 'analog') return h('section', { class: 'nt-timeblock nt-card analog' }, analogClockEl(), date);
  const digits = h('span', { class: 'nt-hm' });
  const ampmEl = h('span', { class: 'nt-ampm' });
  const time = h('div', { class: 'nt-time' }, digits, ampmEl);
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
  return h('section', { class: 'nt-timeblock nt-card' }, time, date);
}

// ---------------------------------------------------------------- weather

async function loadWeather(ctx: Ctx): Promise<WeatherNow | null> {
  const w = ctx.settings.newtab.weather;
  const cached = await getLocal<WeatherNow | null>('ntWeather', null);
  if (cached && cached.place === w.place && cached.units === w.units && cached.days && Date.now() - cached.at < 30 * 60_000) return cached;
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
  void loadWeather(ctx).then((now) => {
    if (!now) return void reveal(body, h('span', { class: 'muted' }, 'Weather is unavailable right now'));
    const { label, icon } = weatherLabel(now.code, now.isDay);
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
  return card('nt-wx', w.place.split(',')[0], [], body);
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
  let events: CalEvent[] = [];

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
  return h('section', { class: 'nt-card nt-cal', 'aria-label': 'Calendar' }, head, grid, dayPanel);
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
    html: `<svg class="iso-svg" viewBox="0 0 ${TIMER.width} ${TIMER.height}" aria-hidden="true">${TIMER.below}<path class="iso-line pomo-needle" data-tone="lit" d=""/><g class="pomo-lever">${TIMER.lever}</g>${TIMER.above}</svg>`,
  });
  const needle = fig.querySelector<SVGPathElement>('.pomo-needle')!;
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
      toast(done.finished === 'focus' ? 'Focus done. Take a break.' : 'Break over. Back to it.');
    }
    const left = msLeft(st, now);
    const total = phaseMs(st.phase, cfg);
    rollText(time, clockText(left));
    phase.textContent = PHASE_NAME[st.phase];
    needle.setAttribute('d', needlePath(left / 60_000));
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
  const paint = () => {
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
  const root = card('nt-notes', 'Notes', [iconBtn('plus', 'New note', add)], grid);
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

/** A folder you can see into: a few of its sites peek out of the top, like papers. */
function folderArt(f: Mark, kids: Mark[]): HTMLElement {
  const papers = kids
    .filter((k) => k.url)
    .slice(0, 3)
    .map((k) => h('span', { class: 'fold-paper' }, faviconOnly(k.url!, 'fav') ?? favicon(k.url!, k.title, 'fav')));
  return h(
    'span',
    { class: 'fold-art', 'aria-hidden': 'true' },
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
    head.append(
      h('span', { class: 'ask-gap' }),
      h(
        'button',
        {
          type: 'button',
          class: 'nt-chip shelf-addbtn',
          'aria-expanded': String(!form.hidden),
          title: 'Add a site or a folder here',
          onclick: () => {
            form.hidden = !form.hidden;
            if (!form.hidden) (form.querySelector('input') as HTMLInputElement | null)?.focus();
            void paint();
          },
        },
        ico('plus', 18),
        h('span', {}, 'Add'),
      ),
    );
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
      return tile(k.title || 'Folder', folderArt(k, inner[n]), {
        class: 'nt-key is-folder',
        title: `${k.title || 'Folder'}: ${sitesLabel(sites)}`,
        'aria-label': `${k.title || 'Folder'} folder, ${sitesLabel(sites)}`,
        onclick: () => (play('key'), trail.push(k), void paint()),
        oncontextmenu: menu,
      });
    });
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
