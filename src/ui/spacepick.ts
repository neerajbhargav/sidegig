// The space colour picker, after Arc's theme editor: a colour field with one to
// three dots, Light / Auto / Dark, presets, intensity and grain. Dragging
// previews on the page at once; letting go saves.
import { DEFAULT_SPACE, hexToRgb, oklchHex, rgbToOklch, themeCss, type Space } from '../shared/theme.ts';
import type { Settings, ThemeMode } from '../shared/types.ts';
import { updateSettings } from '../shared/storage.ts';
import { h, ico } from './dom.ts';

/** Curated starting points: calm pairs, one bright trio, one neutral. */
export const SPACE_PRESETS: { name: string; colors: string[] }[] = [
  { name: 'Haze', colors: DEFAULT_SPACE.colors },
  { name: 'Dusk', colors: ['#ff8a5b', '#ffc46b'] },
  { name: 'Sea glass', colors: ['#5fd3c6', '#7aa7ff'] },
  { name: 'Moss', colors: ['#9ccf7a', '#e8d27a'] },
  { name: 'Rose', colors: ['#ff7a9c'] },
  { name: 'Ultraviolet', colors: ['#7a5cff', '#ff5ca8', '#ffb35c'] },
  { name: 'Mint', colors: ['#6be0a8', '#a7f0ff'] },
  { name: 'Graphite', colors: ['#8a8f98'] },
];

const CHROMA = 0.2;
const SHOWN_L = 0.72;
/** Field position (0–1 each, top is vivid) for a colour, and back. */
const toXY = (hex: string) => {
  const { c, h: hue } = rgbToOklch(hexToRgb(hex));
  return { x: hue / 360, y: 1 - Math.min(c, CHROMA) / CHROMA };
};
const fromXY = (x: number, y: number) => oklchHex({ l: SHOWN_L, c: (1 - y) * CHROMA, h: x * 360 });
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const preview = (() => {
  let el: HTMLStyleElement | null = null;
  let t = 0;
  return {
    show(css: string) {
      clearTimeout(t);
      el ??= document.head.appendChild(h('style', { 'data-space-preview': '' }));
      el.textContent = css;
    },
    // ponytail: drop the preview a beat after saving, once the saved theme has redrawn.
    settle() {
      t = window.setTimeout(() => (el?.remove(), (el = null)), 600);
    },
  };
})();

/** `modes: false` leaves Light / Auto / Dark to a page that already offers them. */
export function spacePicker(settings: Settings, opts: { compact?: boolean; modes?: boolean } = {}): HTMLElement {
  let space: Space = { ...DEFAULT_SPACE, ...settings.theme.space, colors: [...(settings.theme.space?.colors?.length ? settings.theme.space.colors : DEFAULT_SPACE.colors)].slice(0, 3) };
  let active = 0;
  const mode = settings.theme.mode;
  const live = () => preview.show(themeCss(':root', mode === 'page' ? 'system' : mode, { ...settings.theme, space }, settings.theme.radius));
  const save = () => {
    void updateSettings((s) => void (s.theme.space = { ...space, colors: [...space.colors] }));
    preview.settle();
  };

  const field = h('div', { class: 'sp-field', role: 'group', 'aria-label': 'Space colours' });
  const dots: HTMLButtonElement[] = [];
  const place = (i: number) => {
    const d = dots[i];
    const { x, y } = toXY(space.colors[i]);
    d.style.left = `${x * 100}%`;
    d.style.top = `${y * 100}%`;
    d.style.background = space.colors[i];
    d.setAttribute('aria-valuenow', String(Math.round(x * 360)));
    d.setAttribute('aria-valuetext', `hue ${Math.round(x * 360)} degrees, colour ${Math.round((1 - y) * 100)} percent`);
    d.setAttribute('aria-current', String(i === active));
  };
  const move = (i: number, x: number, y: number) => {
    space.colors[i] = fromXY(clamp01(x), clamp01(y));
    place(i);
    paintBar();
    live();
  };
  const drawDots = () => {
    for (const d of dots.splice(0)) d.remove();
    space.colors.forEach((_, i) => {
      const d = h('button', { type: 'button', class: 'sp-dot', role: 'slider', 'aria-label': `Colour ${i + 1} of ${space.colors.length}`, 'aria-valuemin': '0', 'aria-valuemax': '360' }) as HTMLButtonElement;
      d.addEventListener('focus', () => ((active = i), dots.forEach((_, j) => place(j))));
      d.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 0.1 : 0.02;
        const { x, y } = toXY(space.colors[i]);
        const delta = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[e.key];
        if (!delta) return;
        e.preventDefault();
        move(i, (x + delta[0] + 1) % 1, y + delta[1]);
      });
      d.addEventListener('keyup', (e) => e.key.startsWith('Arrow') && save());
      dots.push(d);
      field.append(d);
      place(i);
    });
  };
  // Drag a dot, or press anywhere on the field to bring the current dot there.
  field.addEventListener('pointerdown', (e) => {
    const hit = dots.indexOf(e.target as HTMLButtonElement);
    if (hit >= 0) active = hit;
    const r = field.getBoundingClientRect();
    const at = (ev: PointerEvent) => move(active, (ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height);
    e.preventDefault();
    dots[active]?.focus();
    field.setPointerCapture(e.pointerId);
    at(e);
    // One drag, one set of listeners: whichever ends it removes them all.
    const drag = new AbortController();
    const done = () => {
      drag.abort();
      save();
    };
    field.addEventListener('pointermove', at, { signal: drag.signal });
    field.addEventListener('pointerup', done, { signal: drag.signal });
    field.addEventListener('pointercancel', done, { signal: drag.signal });
  });

  const bar = h('span', { class: 'sp-bar', 'aria-hidden': 'true' });
  const paintBar = () => (bar.style.background = space.colors.length > 1 ? `linear-gradient(90deg, ${space.colors.join(', ')})` : space.colors[0]);
  const add = h('button', { type: 'button', class: 'iconbtn', title: 'Add a colour', 'aria-label': 'Add a colour' }, ico('plus', 20));
  const remove = h('button', { type: 'button', class: 'iconbtn', title: 'Remove this colour', 'aria-label': 'Remove this colour' }, ico('minus', 20));
  const counts = () => {
    add.disabled = space.colors.length >= 3;
    remove.disabled = space.colors.length <= 1;
  };
  add.addEventListener('click', () => {
    const { x, y } = toXY(space.colors[space.colors.length - 1]);
    space.colors.push(fromXY((x + 0.14) % 1, y));
    active = space.colors.length - 1;
    drawDots();
    counts();
    paintBar();
    live();
    save();
  });
  remove.addEventListener('click', () => {
    space.colors.splice(active, 1);
    active = Math.max(0, active - 1);
    drawDots();
    counts();
    paintBar();
    live();
    save();
  });

  const slider = (label: string, key: 'intensity' | 'grain') => {
    const value = h('span', { class: 'cz-val' }, String(space[key]));
    const input = h('input', { type: 'range', min: '0', max: '100', step: '1', value: String(space[key]), 'aria-label': label }) as HTMLInputElement;
    input.addEventListener('input', () => {
      space[key] = Number(input.value);
      value.textContent = input.value;
      live();
    });
    input.addEventListener('change', save);
    return h('label', { class: 'sp-row' }, h('span', { class: 'sp-label' }, label), input, value);
  };

  const modes: [ThemeMode, string, string][] = [['light', 'Light', 'sun'], ['page', 'Auto', 'auto'], ['dark', 'Dark', 'moon']];
  const modeSeg = h('div', { class: 'seg sp-modes', role: 'group', 'aria-label': 'Light or dark' });
  for (const [m, label, glyph] of modes) {
    const on = m === mode || (m === 'page' && mode === 'system');
    modeSeg.append(h('button', { type: 'button', 'aria-pressed': String(on), onclick: () => void updateSettings((s) => void (s.theme.mode = m)) }, ico(glyph, 16), label));
  }

  const presets = h(
    'div',
    { class: 'sp-presets', role: 'group', 'aria-label': 'Presets' },
    SPACE_PRESETS.map((p) =>
      h('button', {
        type: 'button',
        class: 'sp-preset',
        title: p.name,
        'aria-label': p.name,
        'aria-pressed': String(p.colors.join() === space.colors.join()),
        style: { background: p.colors.length > 1 ? `linear-gradient(135deg, ${p.colors.join(', ')})` : p.colors[0] },
        onclick: () => {
          space = { ...space, colors: [...p.colors] };
          active = 0;
          drawDots();
          counts();
          paintBar();
          live();
          save();
        },
      }),
    ),
  );

  drawDots();
  counts();
  paintBar();
  return h(
    'div',
    { class: `sp${opts.compact ? ' sp-compact' : ''}` },
    opts.modes === false ? null : modeSeg,
    field,
    h('div', { class: 'sp-tools' }, bar, remove, add),
    presets,
    slider('Intensity', 'intensity'),
    slider('Grain', 'grain'),
  );
}
