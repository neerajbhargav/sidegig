// Everyday tools for the new tab: the analog clock, the weather place lookup,
// the to-do list, the Google apps launcher and voice typing.
import { uid } from '../../shared/api.ts';
import { getLocal, setLocal } from '../../shared/storage.ts';
import { dailyReset, dayKey, sortTodos, type Todo } from '../../shared/ntdata.ts';
import { h, ico, iconButton, favicon, toast } from '../dom.ts';
import { SPIKE } from '../figures/spike.ts';
import { rollText } from './ntdash.ts';
import { figureSvg } from '../figures/iso.ts';
import type { Ctx } from '../ctx.ts';
import { play } from '../sound.ts';

// ---------------------------------------------------------------- analog clock

export function analogClockEl(): HTMLElement {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag: string, attrs: Record<string, string | number>) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    return e;
  };
  const svg = el('svg', { viewBox: '-100 -100 200 200', class: 'nt-analog', 'aria-hidden': 'true' }) as SVGSVGElement;
  svg.append(el('circle', { r: 96, class: 'face' }));
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    const a = (i / 60) * Math.PI * 2;
    const r1 = major ? 78 : 86;
    svg.append(el('line', { x1: Math.sin(a) * r1, y1: -Math.cos(a) * r1, x2: Math.sin(a) * 91, y2: -Math.cos(a) * 91, class: major ? 'tick major' : 'tick' }));
  }
  const hour = el('line', { x1: 0, y1: 10, x2: 0, y2: -48, class: 'hand hour' });
  const minute = el('line', { x1: 0, y1: 14, x2: 0, y2: -74, class: 'hand minute' });
  svg.append(hour, minute, el('circle', { r: 4.5, class: 'pin' }));
  const label = h('div', { class: 'sr-only' });
  const paint = () => {
    const d = new Date();
    const m = d.getMinutes() + d.getSeconds() / 60;
    const hr = (d.getHours() % 12) + m / 60;
    hour.setAttribute('transform', `rotate(${hr * 30})`);
    minute.setAttribute('transform', `rotate(${m * 6})`);
    label.textContent = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };
  paint();
  const wrap = h('div', { class: 'nt-analog-wrap', role: 'img', 'aria-label': 'Clock' }, svg as unknown as Node, label);
  const tick = () => setTimeout(() => (wrap.isConnected ? (paint(), tick()) : undefined), 60_000 - (Date.now() % 60_000) + 50);
  tick();
  return wrap;
}

// ---------------------------------------------------------------- weather

/** Look up a place for weather (Open-Meteo geocoding, free, no key). */
export async function findPlace(q: string): Promise<{ name: string; lat: number; lon: number }[]> {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`, { credentials: 'omit' });
  const d = await r.json();
  return (d?.results ?? []).map((x: any) => ({ name: [x.name, x.admin1, x.country_code].filter(Boolean).join(', '), lat: x.latitude, lon: x.longitude }));
}

// ---------------------------------------------------------------- to-do

export async function todoSection(ctx: Ctx): Promise<HTMLElement | null> {
  if (!ctx.settings.newtab.todo) return null;
  const today = dayKey();
  let todos = await getLocal<Todo[]>('ntTodos', []);
  const last = await getLocal<string>('ntTodoDay', today);
  if (last !== today) {
    todos = dailyReset(todos, last, today);
    await setLocal('ntTodos', todos);
  }
  await setLocal('ntTodoDay', today);

  const list = h('div', { class: 'todo-list' });
  const count = h('span', { class: 'nt-card-note' });
  let just = '';
  // A receipt spike: every task you finish today is a slip on it; a new one drops down the spike.
  const spike = h('div', {
    class: 'fig fig-spike iso',
    html: figureSvg(SPIKE.width, SPIKE.height, `${SPIKE.base}${SPIKE.segs.map((seg, i) => `${seg}<g class="slip" data-i="${i}" style="display:none">${SPIKE.slips[i]}</g>`).join('')}${SPIKE.tip}`),
  });
  const slips = [...spike.querySelectorAll<SVGGElement>('.slip')];
  let shown = -1;
  const paintSpike = () => {
    const done = Math.min(slips.length, todos.filter((t) => t.done).length);
    slips.forEach((g, i) => {
      g.style.display = i < done ? '' : 'none';
      g.classList.toggle('drop', shown >= 0 && i >= shown && i < done);
    });
    shown = done;
  };
  const save = async (next: Todo[]) => {
    todos = next;
    await setLocal('ntTodos', todos);
    paint();
    just = '';
  };
  const paint = () => {
    paintSpike();
    const open = todos.filter((t) => !t.done).length;
    rollText(count, todos.length ? `${open} open` : '');
    list.replaceChildren(
      ...sortTodos(todos).map((t) =>
        h(
          'div',
          { class: t.id === just ? 'todo just' : 'todo', dataset: { done: String(t.done), pinned: String(t.pinned) } },
          h(
            'button',
            {
              type: 'button',
              class: 'todo-check',
              role: 'checkbox',
              'aria-checked': String(t.done),
              'aria-label': t.done ? `Mark “${t.text}” not done` : `Mark “${t.text}” done`,
              onclick: () => {
                play(t.done ? 'off' : 'on');
                just = t.done ? '' : t.id;
                void save(todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
              },
            },
            t.done ? ico('check', 14) : null,
          ),
          h('span', { class: 'todo-text' }, t.text),
          iconButton(t.pinned ? 'pin' : 'pin', t.pinned ? 'Unpin (stops coming back each day)' : 'Pin (comes back each day)', () => void save(todos.map((x) => (x.id === t.id ? { ...x, pinned: !x.pinned } : x))), t.pinned),
          iconButton('close', 'Delete', () => {
            play('dismiss');
            void save(todos.filter((x) => x.id !== t.id));
          }),
        ),
      ),
    );
  };
  const input = h('input', { class: 'todo-input', placeholder: 'Add a task', 'aria-label': 'Add a task. Done tasks clear each morning; pinned ones come back.' });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      play('confirm');
      void save([...todos, { id: uid('t_'), text: input.value.trim().slice(0, 200), done: false, pinned: false, created: Date.now() }]);
      input.value = '';
    }
  });
  const sec = h('section', { class: 'nt-card nt-todo has-fig', 'aria-label': 'To-do' }, spike, h('header', { class: 'nt-card-h' }, h('h2', {}, 'To-do'), h('div', { class: 'nt-card-a' }, count)), list, input);
  paint();
  just = '';
  return sec;
}

// ---------------------------------------------------------------- Google apps launcher

const GOOGLE_APPS: [string, string][] = [
  ['Search', 'https://www.google.com/'],
  ['Gmail', 'https://mail.google.com/'],
  ['Drive', 'https://drive.google.com/'],
  ['Docs', 'https://docs.google.com/document/'],
  ['Sheets', 'https://docs.google.com/spreadsheets/'],
  ['Slides', 'https://docs.google.com/presentation/'],
  ['Calendar', 'https://calendar.google.com/'],
  ['Meet', 'https://meet.google.com/'],
  ['Maps', 'https://maps.google.com/'],
  ['Photos', 'https://photos.google.com/'],
  ['YouTube', 'https://www.youtube.com/'],
  ['Gemini', 'https://gemini.google.com/app'],
  ['NotebookLM', 'https://notebooklm.google.com/'],
  ['Keep', 'https://keep.google.com/'],
  ['Translate', 'https://translate.google.com/'],
  ['News', 'https://news.google.com/'],
];

export function launcherEl(signal?: AbortSignal): HTMLElement {
  const pop = h('div', { class: 'nt-pop nt-launch', role: 'menu', hidden: true }, GOOGLE_APPS.map(([name, url]) => h('a', { class: 'launch-item', href: url, role: 'menuitem' }, favicon(url, name, 'fav'), h('span', {}, name))));
  const btn = h('button', { class: 'nt-gear', type: 'button', title: 'Google apps', 'aria-label': 'Google apps', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, ico('grid', 18));
  const close = () => {
    pop.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    pop.hidden = !pop.hidden;
    btn.setAttribute('aria-expanded', String(!pop.hidden));
  });
  addEventListener('click', (e) => !pop.contains(e.target as Node) && close(), { signal });
  addEventListener('keydown', (e) => e.key === 'Escape' && close(), { signal });
  return h('div', { class: 'nt-pop-anchor' }, btn, pop);
}

// ---------------------------------------------------------------- voice typing

export function voiceButton(input: HTMLInputElement | HTMLTextAreaElement, onDone?: () => void): HTMLElement | null {
  const SR = (globalThis as any).webkitSpeechRecognition ?? (globalThis as any).SpeechRecognition;
  if (!SR) return null;
  const btn = h('button', { class: 'nt-mic', type: 'button', title: 'Voice typing', 'aria-label': 'Voice typing', 'aria-pressed': 'false' }, ico('mic', 18));
  let rec: any = null;
  btn.addEventListener('click', () => {
    if (rec) return rec.stop();
    rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    btn.setAttribute('aria-pressed', 'true');
    rec.onresult = (e: any) => {
      input.value = [...e.results].map((r: any) => r[0].transcript).join('');
      input.dispatchEvent(new Event('input'));
    };
    rec.onend = () => {
      rec = null;
      btn.setAttribute('aria-pressed', 'false');
      input.focus();
      onDone?.();
    };
    rec.onerror = () => toast('Couldn’t hear you. Check microphone access for sidegig.');
    rec.start();
  });
  return btn;
}


