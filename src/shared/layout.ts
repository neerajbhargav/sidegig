// Where each widget sits on the new tab: a 12 × 8 grid that fills one screen.
// The default arrangement uses the available space without empty bands. Moving one onto another slides the other to the nearest free spot.

export const COLS = 12;
export const ROWS = 8;

export type WidgetId = 'clock' | 'weather' | 'calendar' | 'pomodoro' | 'todo' | 'notes' | 'search' | 'bookmarks' | 'reading' | 'tabs' | 'calculator';
/** In grid cells, 0-based. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Layout = Partial<Record<WidgetId, Box>>;

/** The sizes each widget comes in (the first is its usual one), as [columns, rows]. */
export const SIZES: Record<WidgetId, [number, number][]> = {
  reading: [[4, 2], [2, 2], [4, 4]],
  tabs: [[4, 2], [2, 2], [4, 4]],
  calculator: [[3, 3], [2, 2], [4, 4]],
  clock: [[4, 2], [2, 2], [6, 3]],
  weather: [[4, 2], [2, 2], [4, 3]],
  calendar: [[2, 2], [4, 2], [4, 4]],
  pomodoro: [[2, 2], [4, 2], [3, 3]],
  todo: [[2, 2], [4, 2], [4, 4]],
  notes: [[2, 2], [4, 2], [4, 4]],
  search: [[8, 2], [6, 2], [10, 2]],
  bookmarks: [[8, 2], [8, 3], [6, 2], [10, 2], [4, 4]],
};

/** A name for a size, for buttons and screen readers. */
export function sizeName(id: WidgetId, w: number, h: number): string {
  const area = w * h;
  const sizes = SIZES[id].map(([a, b]) => a * b).sort((a, b) => a - b);
  if (sizes.length && area === sizes[0]) return 'Small';
  if (area === sizes[sizes.length - 1]) return 'Large';
  return 'Medium';
}

/** The size class a widget draws itself at. */
export function sizeClass(b: Box): 's' | 'm' | 'l' {
  if (b.w <= 2 && b.h <= 2) return 's';
  if (b.h <= 2) return 'm';
  return 'l';
}

/** Search and bookmarks lead; daily tools fill the remaining grid. */
export const DEFAULT_LAYOUT: Record<WidgetId, Box> = {
  reading: { x: 4, y: 6, w: 2, h: 2 },
  tabs: { x: 6, y: 6, w: 2, h: 2 },
  calculator: { x: 6, y: 0, w: 2, h: 2 },
  clock: { x: 0, y: 0, w: 4, h: 2 },
  weather: { x: 0, y: 2, w: 4, h: 2 },
  search: { x: 4, y: 0, w: 8, h: 2 },
  bookmarks: { x: 4, y: 2, w: 8, h: 2 },
  calendar: { x: 0, y: 4, w: 4, h: 4 },
  pomodoro: { x: 4, y: 4, w: 4, h: 2 },
  todo: { x: 8, y: 4, w: 4, h: 4 },
  notes: { x: 4, y: 6, w: 4, h: 2 },
};

/** Who gets their spot first when two want the same place. */
export const PRIORITY: WidgetId[] = ['search', 'bookmarks', 'clock', 'weather', 'calendar', 'pomodoro', 'todo', 'notes', 'reading', 'tabs', 'calculator'];

export const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const fits = (b: Box) => b.x >= 0 && b.y >= 0 && b.x + b.w <= COLS && b.y + b.h <= ROWS;
const clampBox = (b: Box): Box => {
  const w = Math.max(1, Math.min(COLS, Math.round(b.w)));
  const h = Math.max(1, Math.min(ROWS, Math.round(b.h)));
  return { w, h, x: Math.max(0, Math.min(COLS - w, Math.round(b.x))), y: Math.max(0, Math.min(ROWS - h, Math.round(b.y))) };
};
const validSize = (id: WidgetId, b: Box) => SIZES[id].some(([w, h]) => w === b.w && h === b.h);

/** The free spot nearest to `want` for a box of its size, or null when nothing fits. */
export function nearestFree(want: Box, taken: Box[]): Box | null {
  let best: Box | null = null;
  let bestD = Infinity;
  for (let y = 0; y + want.h <= ROWS; y++) {
    for (let x = 0; x + want.w <= COLS; x++) {
      const b = { x, y, w: want.w, h: want.h };
      if (taken.some((t) => overlaps(t, b))) continue;
      // Sideways moves read as calmer than vertical ones.
      const d = Math.abs(x - want.x) + Math.abs(y - want.y) * 1.3;
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
  }
  return best;
}

/**
 * Every shown widget with a valid place: stored spots where they fit, defaults
 * otherwise, collisions settled by priority. When a saved desk is too full for
 * widgets switched on later, the largest boxes shrink one size step at a time,
 * least important first and never search, keeping their spots, until every
 * widget fits. Only widgets that still can't fit are listed in `hidden`.
 */
export function resolve(layout: Layout, shown: WidgetId[]): { boxes: Partial<Record<WidgetId, Box>>; hidden: WidgetId[] } {
  let r = settle(layout, shown);
  if (!r.hidden.length) return r;
  const wishes: Layout = { ...r.boxes };
  const area = (b: Box) => b.w * b.h;
  const smaller = (id: WidgetId, b: Box) => SIZES[id].filter(([w, h]) => w * h < area(b)).sort((a, b2) => b2[0] * b2[1] - a[0] * a[1])[0];
  const leastFirst = [...PRIORITY].reverse().filter((id) => shown.includes(id) && id !== 'search');
  for (let round = 0; round < 30 && r.hidden.length; round++) {
    const next = leastFirst
      .filter((id) => wishes[id] && smaller(id, wishes[id]!))
      .sort((a, b) => area(wishes[b]!) - area(wishes[a]!))[0];
    if (!next) break;
    const [w, h] = smaller(next, wishes[next]!);
    wishes[next] = { ...wishes[next]!, w, h };
    r = settle(wishes, shown);
    for (const id of Object.keys(r.boxes) as WidgetId[]) wishes[id] = r.boxes[id];
  }
  // Widgets switched on after the desk was arranged try each of their sizes, so
  // the packed desk is as full as it can be instead of leaving a hole.
  const fresh = shown.filter((id) => !layout[id]);
  if (!r.hidden.length && fresh.length && fresh.length <= 4) {
    const used = (x: typeof r) => Object.values(x.boxes).reduce((n, b) => n + area(b!), 0);
    const fixed: Layout = { ...wishes };
    for (const id of fresh) delete fixed[id];
    let combos: [number, number][][] = [[]];
    for (const id of fresh) combos = combos.flatMap((c) => SIZES[id].map((sz) => [...c, sz]));
    for (const combo of combos) {
      if (used(r) === COLS * ROWS) break;
      const trial: Layout = { ...fixed };
      fresh.forEach((id, i) => {
        trial[id] = { ...DEFAULT_LAYOUT[id], w: combo[i][0], h: combo[i][1] };
      });
      const t = settle(trial, shown);
      if (!t.hidden.length && used(t) > used(r)) r = t;
    }
  }
  return r;
}

function settle(layout: Layout, shown: WidgetId[]): { boxes: Partial<Record<WidgetId, Box>>; hidden: WidgetId[] } {
  const boxes: Partial<Record<WidgetId, Box>> = {};
  const hidden: WidgetId[] = [];
  const taken: Box[] = [];
  const order = PRIORITY.filter((id) => shown.includes(id));
  for (const id of order) {
    const stored = layout[id];
    let want = stored && validSize(id, stored) ? clampBox(stored) : { ...DEFAULT_LAYOUT[id] };
    if (!stored) {
      for (let y = 0; y < want.y; y++) {
        const earlier = { ...want, y };
        if (!taken.some((box) => overlaps(box, earlier))) { want = earlier; break; }
      }
    }
    let spot = taken.some((t) => overlaps(t, want)) ? nearestFree(want, taken) : want;
    // Shrink before giving up.
    if (!spot) {
      for (const [w, h] of [...SIZES[id]].sort((a, b) => a[0] * a[1] - b[0] * b[1])) {
        want = { ...want, w, h };
        spot = nearestFree(clampBox(want), taken);
        if (spot) break;
      }
    }
    // Adding a tool may need a smaller default neighbour. Keep user-arranged
    // boxes intact; only compact widgets that are still using defaults.
    if (!spot) {
      const [w, h] = [...SIZES[id]].sort((a, b) => a[0] * a[1] - b[0] * b[1])[0];
      want = { ...want, w, h };
      for (const previous of [...order].reverse()) {
        const box = boxes[previous];
        if (!box || layout[previous] || previous === 'search') continue;
        const smaller = [...SIZES[previous]].filter(([w, h]) => w * h < box.w * box.h).sort((a, b) => a[0] * a[1] - b[0] * b[1])[0];
        if (!smaller) continue;
        boxes[previous] = { ...box, w: smaller[0], h: smaller[1] };
        taken.splice(0, taken.length, ...Object.values(boxes) as Box[]);
        spot = nearestFree(clampBox(want), taken);
        if (spot) break;
      }
    }
    if (!spot) {
      hidden.push(id);
      continue;
    }
    boxes[id] = spot;
    taken.push(spot);
  }
  return { boxes, hidden };
}

/**
 * Put `id` at `to` (size included); anything in the way slides to the nearest
 * free spot. Returns the new layout, or null when there's no room for that.
 */
export function place(current: Partial<Record<WidgetId, Box>>, id: WidgetId, to: Box): Partial<Record<WidgetId, Box>> | null {
  const target = clampBox(to);
  if (!fits(target) || !validSize(id, target)) return null;
  const next: Partial<Record<WidgetId, Box>> = { ...current, [id]: target };
  const others = (Object.keys(current) as WidgetId[]).filter((k) => k !== id);
  const bumped = others.filter((k) => overlaps(current[k]!, target));
  const settled = others.filter((k) => !bumped.includes(k)).map((k) => current[k]!);
  settled.push(target);
  // Nearest first, so the closest neighbours keep the closest spots.
  bumped.sort((a, b) => dist(current[a]!, target) - dist(current[b]!, target));
  for (const k of bumped) {
    const spot = nearestFree(current[k]!, settled);
    if (!spot) return null;
    next[k] = spot;
    settled.push(spot);
  }
  return next;
}
const dist = (a: Box, b: Box) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** The next size up (wrapping round) for a size button. */
export function nextSize(id: WidgetId, b: Box): [number, number] {
  const sizes = SIZES[id];
  const i = sizes.findIndex(([w, h]) => w === b.w && h === b.h);
  return sizes[(i + 1) % sizes.length];
}

/** A new size for a box: it stays centred sideways and grows down, inside the grid. */
export function resizeAround(b: Box, [w, h]: [number, number]): Box {
  return clampBox({ x: b.x + Math.round((b.w - w) / 2), y: b.y, w, h });
}
