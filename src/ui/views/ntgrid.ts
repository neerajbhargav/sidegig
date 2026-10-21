// The new tab's widgets on a 12 × 8 grid that fills one screen.
//
// - Each widget draws small, medium or large from its grid size.
// - Small and medium ones open to full size in place when you click them.
// - Arrange mode: drag to move (others slide out of the way), the size button
//   cycles sizes, arrow keys move the focused widget, Reset puts everything back.
// - On narrow or short windows the grid becomes one column you scroll.
import { onSettingsChanged, updateSettings } from '../../shared/storage.ts';
import { PRIORITY, COLS, ROWS, SIZES, nearestFree, nextSize, place, resizeAround, resolve, sizeClass, sizeName, type Box, type WidgetId } from '../../shared/layout.ts';
import { DUR, EASE, h, ico, toast } from '../dom.ts';
import type { Ctx } from '../ctx.ts';
import { play } from '../sound.ts';

export interface GridItem {
  id: WidgetId;
  el: HTMLElement;
  label: string;
  /** Opens the full widget when its surface or Open button is activated. */
  expandable?: boolean;
  /** Take it off the page. */
  remove?: () => void;
}
export interface Grid {
  el: HTMLElement;
  edit: (on: boolean) => void;
  editing: () => boolean;
}

// A larger interface needs more room per widget. Switch to a scrolling list
// before fixed grid cells would clip controls or calendar labels.
const needsFlow = () => {
  const scale = Math.max(1, Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-s')) || 1);
  return innerWidth < 900 * scale || innerHeight < 700 * scale;
};
const ARRANGED = 'nt-arranged';
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Tell the page (readability, for one) that widgets moved. */
export const onArranged = (fn: () => void, signal?: AbortSignal) => addEventListener(ARRANGED, fn, { signal });
const arranged = () => dispatchEvent(new Event(ARRANGED));

export function widgetGrid(ctx: Ctx, items: GridItem[]): Grid {
  const signal = ctx.signal;
  const ids = items.map((i) => i.id);
  const resolved = resolve(ctx.settings.newtab.layout, ids);
  let boxes = resolved.boxes;
  const flow = { matches: needsFlow() || resolved.hidden.length > 0 };
  const el = h('div', { class: 'nt-grid', dataset: { flow: String(flow.matches) } });
  const wraps = new Map<WidgetId, HTMLElement>();
  const sizeLabels = new Map<WidgetId, HTMLElement>();
  let editing = false;
  let openId: WidgetId | null = null;
  let returnFocus: HTMLElement | null = null;

  const setBox = (id: WidgetId, b: Box | undefined) => {
    const w = wraps.get(id);
    if (!w) return;
    if (!b) { if (flow.matches) w.dataset.size = 'l'; return; }
    w.style.setProperty('--x', String(b.x + 1));
    w.style.setProperty('--y', String(b.y + 1));
    w.style.setProperty('--w', String(b.w));
    w.style.setProperty('--h', String(b.h));
    w.style.order = String(b.y * COLS + b.x);
    if (id !== openId) w.dataset.size = flow.matches ? 'l' : sizeClass(b);
    w.dataset.cells = `${b.w}x${b.h}`;
    const label = sizeLabels.get(id);
    if (label) label.textContent = sizeName(id, b.w, b.h);
  };

  /** Move everything (but `except`) to `next`, sliding from where it was. */
  const layoutTo = (next: Partial<Record<WidgetId, Box>>, except?: WidgetId) => {
    const before = new Map([...wraps].map(([id, w]) => [id, w.getBoundingClientRect()]));
    for (const id of ids) if (id !== except) setBox(id, next[id]);
    if (still()) return;
    for (const id of ids) {
      if (id === except) continue;
      const w = wraps.get(id)!;
      const a = before.get(id)!;
      const b = w.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (Math.abs(dx) + Math.abs(dy) < 1 && Math.abs(a.width - b.width) < 1) continue;
      w.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: DUR.change, easing: EASE });
    }
  };

  const save = () => {
    void updateSettings((s) => void (s.newtab.layout = Object.fromEntries(ids.filter((id) => boxes[id]).map((id) => [id, { ...boxes[id]! }]))));
    // After the slide settles, so widgets are measured where they land.
    setTimeout(arranged, 280);
  };

  // A layout saved somewhere else (Customize's Reset, another new tab) is drawn here
  // too: main.ts doesn't rebuild the page for layout-only saves. Our own saves match.
  const stop = onSettingsChanged((s) => {
    if (!el.isConnected) return stop();
    const next = resolve(s.newtab.layout, ids).boxes;
    if (ids.every((id) => ['x', 'y', 'w', 'h'].every((k) => next[id]?.[k as keyof Box] === boxes[id]?.[k as keyof Box]))) return;
    boxes = next;
    layoutTo(boxes);
  });
  if (signal?.aborted) stop();
  else signal?.addEventListener('abort', stop, { once: true });

  /** Cell size and step in pixels, from the grid as drawn. */
  const metrics = () => {
    const r = el.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const cw = (r.width - gap * (COLS - 1)) / COLS;
    const ch = (r.height - gap * (ROWS - 1)) / ROWS;
    return { r, gap, stepX: cw + gap, stepY: ch + gap, cw, ch };
  };
  const rectOf = (b: Box) => {
    const m = metrics();
    return { left: m.r.left + b.x * m.stepX, top: m.r.top + b.y * m.stepY, width: b.w * m.cw + (b.w - 1) * m.gap, height: b.h * m.ch + (b.h - 1) * m.gap };
  };

  // ------------------------------------------------ open a small widget in place
  const scrim = h('div', { class: 'gw-scrim', hidden: true, onclick: () => close() });
  const open = (id: WidgetId) => {
    if (openId || editing || flow.matches || !wraps.has(id)) return;
    const w = wraps.get(id)!;
    const b = boxes[id]!;
    const [bw, bh] = [...SIZES[id]].sort((p, q) => q[0] * q[1] - p[0] * p[1])[0];
    const big: Box = { w: bw, h: bh, x: clamp(b.x + Math.round((b.w - bw) / 2), 0, COLS - bw), y: clamp(b.y + b.h - bh > 0 && b.y + bh > ROWS ? ROWS - bh : b.y, 0, ROWS - bh) };
    const place = rectOf(big);
    const width = Math.min(innerWidth - 32, Math.max(place.width, id === 'bookmarks' ? 720 : 420));
    const height = Math.min(innerHeight - 48, Math.max(place.height, id === 'clock' ? 280 : 480));
    const to = { width, height, left: clamp(place.left, 16, innerWidth - width - 16), top: clamp(place.top, 24, innerHeight - height - 24) };
    openId = id;
    returnFocus = document.activeElement as HTMLElement | null;
    play('on');
    w.classList.add('is-open');
    w.setAttribute('role', 'dialog');
    w.setAttribute('aria-modal', 'true');
    for (const [other, wrap] of wraps) if (other !== id) wrap.inert = true;
    w.dataset.toneWas = w.dataset.tone ?? '';
    delete w.dataset.tone;
    w.dataset.size = 'l';
    Object.assign(w.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` });
    scrim.hidden = false;
    if (!still()) w.animate([{ opacity: 0.7 }, { opacity: 1 }], { duration: DUR.press, easing: EASE });
    (w.querySelector<HTMLElement>('input, textarea, button:not(.gw-btn)') ?? w).focus({ preventScroll: true });
  };
  const close = () => {
    if (!openId) return;
    const id = openId;
    const w = wraps.get(id)!;
    openId = null;
    play('off');
    w.classList.remove('is-open');
    w.setAttribute('role', 'group');
    w.removeAttribute('aria-modal');
    for (const wrap of wraps.values()) wrap.inert = false;
    for (const p of ['left', 'top', 'width', 'height'] as const) w.style.removeProperty(p);
    if (w.dataset.toneWas) w.dataset.tone = w.dataset.toneWas;
    delete w.dataset.toneWas;
    setBox(id, boxes[id]);
    scrim.hidden = true;
    w.querySelector('.nt-card')?.dispatchEvent(new Event('nt-widget-close'));
    const focus = returnFocus?.isConnected && !returnFocus.matches('input, textarea') ? returnFocus : w.querySelector<HTMLElement>('.gw-more');
    focus?.focus({ preventScroll: true });
    returnFocus = null;
  };
  addEventListener('nt-widget-dismiss', close, { signal });
  el.addEventListener('nt-widget-open', (e) => open((e as CustomEvent<WidgetId>).detail));

  // ------------------------------------------------ arrange mode
  const ghost = h('div', { class: 'gw-ghost', hidden: true, 'aria-hidden': 'true' });
  const cells = h('div', { class: 'grid-cells', 'aria-hidden': 'true' });
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) cells.append(h('i', { style: { gridColumn: String(x + 1), gridRow: String(y + 1) } }));

  const tryPlace = (id: WidgetId, to: Box): Partial<Record<WidgetId, Box>> | null => {
    const direct = place(boxes, id, to);
    if (direct) return direct;
    const others = ids.filter((k) => k !== id && boxes[k]).map((k) => boxes[k]!);
    const spot = nearestFree(to, others);
    return spot ? { ...boxes, [id]: spot } : null;
  };
  const cycleSize = (id: WidgetId) => {
    const b = boxes[id]!;
    const order = SIZES[id];
    let size = nextSize(id, b);
    for (let i = 0; i < order.length; i++) {
      const next = tryPlace(id, resizeAround(b, size));
      if (next) {
        boxes = next;
        layoutTo(boxes);
        play('key');
        save();
        return;
      }
      size = nextSize(id, { ...b, w: size[0], h: size[1] });
    }
    toast('No room for a bigger size here');
  };

  const bar = h(
    'div',
    { class: 'grid-bar', role: 'toolbar', 'aria-label': 'Arrange', hidden: true },
    h('span', { class: 'grid-bar-t' }, 'Drag to move. Use a widget’s size button to resize.'),
    h('button', { type: 'button', class: 'nt-chip', onclick: () => ((boxes = resolve({}, ids).boxes), layoutTo(boxes), play('dismiss'), save()) }, ico('undo', 16), h('span', {}, 'Reset')),
    h('button', { type: 'button', class: 'nt-chip primary', onclick: () => edit(false) }, 'Done'),
  );

  const edit = (on: boolean, quiet = false) => {
    if (on === editing) return;
    if (on && flow.matches) { toast('Use a wider or taller window to arrange the grid. You can choose widgets in Customize.'); return; }
    if (on) close();
    editing = on;
    el.toggleAttribute('data-edit', on);
    document.documentElement.toggleAttribute('data-arranging', on);
    bar.hidden = !on;
    for (const [, w] of wraps) {
      if (on) w.tabIndex = 0;
      else if (items.find((it) => it.id === w.dataset.w)?.expandable && !flow.matches) w.tabIndex = 0;
      else w.removeAttribute('tabindex');
    }
    if (!quiet) play(on ? 'on' : 'off');
    if (on) wraps.get(ids[0])?.focus({ preventScroll: true });
  };

  // Most important first: the keyboard reaches search first, and the small-window
  // columns start with search and bookmarks across the top.
  for (const it of [...items].sort((a, b) => PRIORITY.indexOf(a.id) - PRIORITY.indexOf(b.id))) {
    const sizeLabel = h('span', {});
    sizeLabels.set(it.id, sizeLabel);
    const chrome = h(
      'div',
      { class: 'gw-chrome' },
      h('span', { class: 'gw-name' }, ico('drag', 16), it.label),
      h('button', { type: 'button', class: 'gw-btn', title: 'Change size', 'aria-label': `Change the size of ${it.label}`, onclick: () => cycleSize(it.id) }, ico('resize', 16), sizeLabel),
      it.remove ? h('button', { type: 'button', class: 'gw-btn', title: `Remove ${it.label}`, 'aria-label': `Remove ${it.label}`, onclick: () => (play('dismiss'), it.remove!()) }, ico('close', 16)) : null,
    );
    const openLabel = it.id === 'tabs' ? 'Expand Open tabs' : `Open ${it.label}`;
    const more = it.expandable ? h('button', { type: 'button', class: 'gw-more', title: openLabel, 'aria-label': openLabel, onclick: () => open(it.id) }, ico('expand', 16)) : null;
    const dismiss = it.expandable ? h('button', { type: 'button', class: 'gw-close', 'aria-label': `Close ${it.label}`, onclick: close }, ico('close', 20)) : null;
    const w = h('div', { class: 'gw', dataset: { w: it.id }, 'aria-label': it.label, role: 'group' }, it.el, more, dismiss, chrome);
    wraps.set(it.id, w);
    setBox(it.id, boxes[it.id]);
    if (!boxes[it.id]) w.hidden = !flow.matches;

    // The widget surface opens it. Controls keep their own action, so clicking
    // a task, link or timer never opens something over that action.
    if (it.expandable) {
      if (!flow.matches) w.tabIndex = 0;
      w.addEventListener('keydown', (e) => {
        if (!editing && e.target === w && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(it.id); }
      });
      w.addEventListener('click', (e) => {
        if ((e.target as Element).closest('button, a, input, textarea, select, [contenteditable="true"], .gw-chrome')) return;
        open(it.id);
      });
    }

    // Drag to move.
    w.addEventListener('pointerdown', (e) => {
      if (!editing || e.button !== 0 || (e.target as Element).closest('.gw-btn')) return;
      e.preventDefault();
      const m = metrics();
      const start = { x: e.clientX, y: e.clientY };
      const from = boxes[it.id]!;
      let preview: Partial<Record<WidgetId, Box>> | null = boxes;
      let last = `${from.x},${from.y}`;
      w.setPointerCapture(e.pointerId);
      w.classList.add('dragging');
      ghost.hidden = false;
      for (const [k, v] of Object.entries({ '--x': from.x + 1, '--y': from.y + 1, '--w': from.w, '--h': from.h })) ghost.style.setProperty(k, String(v));
      ghost.dataset.ok = 'true';
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        w.style.transform = `translate(${dx}px, ${dy}px)`;
        const to = { ...from, x: clamp(Math.round(from.x + dx / m.stepX), 0, COLS - from.w), y: clamp(Math.round(from.y + dy / m.stepY), 0, ROWS - from.h) };
        const key = `${to.x},${to.y}`;
        if (key === last) return;
        last = key;
        ghost.style.setProperty('--x', String(to.x + 1));
        ghost.style.setProperty('--y', String(to.y + 1));
        preview = place(boxes, it.id, to);
        ghost.dataset.ok = String(!!preview);
        layoutTo(preview ?? boxes, it.id);
      };
      const up = () => {
        w.removeEventListener('pointermove', move);
        w.removeEventListener('pointerup', up);
        w.removeEventListener('pointercancel', up);
        ghost.hidden = true;
        const before = w.getBoundingClientRect();
        w.style.transform = '';
        w.classList.remove('dragging');
        const changed = !!preview && preview !== boxes && JSON.stringify(preview[it.id]) !== JSON.stringify(from);
        if (changed) boxes = preview!;
        layoutTo(boxes, it.id);
        setBox(it.id, boxes[it.id]);
        const after = w.getBoundingClientRect();
        if (!still()) w.animate([{ transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)` }, { transform: 'none' }], { duration: DUR.change, easing: EASE });
        if (changed) {
          play('key');
          save();
        }
      };
      w.addEventListener('pointermove', move);
      w.addEventListener('pointerup', up);
      w.addEventListener('pointercancel', up);
    });

    // Arrow keys move the focused widget while arranging.
    w.addEventListener('keydown', (e) => {
      if (!editing || e.target !== w) return;
      const d = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key];
      if (!d) return;
      e.preventDefault();
      const b = boxes[it.id]!;
      const next = place(boxes, it.id, { ...b, x: clamp(b.x + d[0], 0, COLS - b.w), y: clamp(b.y + d[1], 0, ROWS - b.h) });
      if (!next) return play('fail');
      boxes = next;
      layoutTo(boxes);
      play('key');
      save();
    });
  }

  el.append(cells, ghost, ...wraps.values(), scrim);
  // Rebuilt mid-arrange (removing a widget saves settings, which rebuilds the page):
  // carry on arranging, so the page-wide flag and this grid agree.
  if (document.documentElement.hasAttribute('data-arranging')) edit(true, true);
  addEventListener('keydown', (e) => {
    if (openId && e.key === 'Tab') {
      const controls = [...wraps.get(openId)!.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href], [tabindex="0"]')].filter((node) => !node.hidden && node.getClientRects().length && !(node as HTMLButtonElement).disabled);
      const first = controls[0], last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
    if (e.key !== 'Escape' || !el.isConnected) return;
    if (openId) close();
    else if (editing) edit(false);
  }, { signal });
  // Fill exactly what's left of the window under the top bar, so the page never scrolls by a few pixels.
  const fit = () => {
    if (!el.isConnected || !el.getClientRects().length) return;
    const nextFlow = needsFlow() || resolved.hidden.length > 0;
    if (nextFlow !== flow.matches) {
      if (nextFlow && editing) edit(false);
      close();
      flow.matches = nextFlow;
      el.dataset.flow = String(nextFlow);
      for (const id of ids) {
        const w = wraps.get(id)!;
        setBox(id, boxes[id]);
        if (!boxes[id]) w.dataset.size = 'l';
        w.hidden = !boxes[id] && !nextFlow;
        if (items.find((it) => it.id === id)?.expandable) w.tabIndex = nextFlow ? -1 : 0;
      }
      arranged();
    }
    const top = el.getBoundingClientRect().top + scrollY;
    const page = el.closest('.nt-page');
    const pad = page ? parseFloat(getComputedStyle(page).paddingBottom) : 0;
    el.style.setProperty('--nt-avail', `${Math.max(320, Math.floor(innerHeight - top - pad))}px`);
  };
  // Runs when the grid lands on the page and whenever the window changes.
  const observer = new ResizeObserver(fit);
  if (!signal?.aborted) observer.observe(el);
  signal?.addEventListener('abort', () => observer.disconnect(), { once: true });
  addEventListener('resize', () => requestAnimationFrame(fit), { signal });
  requestAnimationFrame(arranged);
  return { el: h('div', { class: 'nt-grid-wrap' }, el, bar), edit, editing: () => editing };
}
