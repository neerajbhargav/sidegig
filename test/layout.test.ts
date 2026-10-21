import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLS, DEFAULT_LAYOUT, ROWS, SIZES, nearestFree, nextSize, overlaps, place, resolve, sizeClass, type WidgetId } from '../src/shared/layout.ts';
import { colorsIn, contrast, deskTone, legibilityFor, luminance, patchOf, patchOfColors } from '../src/shared/legible.ts';

const ALL = Object.keys(DEFAULT_LAYOUT) as WidgetId[];
const noOverlap = (boxes: Record<string, { x: number; y: number; w: number; h: number }>) => {
  const v = Object.values(boxes);
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) assert.ok(!overlaps(v[i], v[j]), `overlap ${JSON.stringify(v[i])} ${JSON.stringify(v[j])}`);
  for (const b of v) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= COLS && b.y + b.h <= ROWS);
};

test('the default layout fits every available widget and uses valid sizes', () => {
  const { boxes, hidden } = resolve({}, ALL);
  assert.deepEqual(hidden, []);
  noOverlap(boxes as never);
  for (const id of ALL) assert.ok(SIZES[id].some(([w, h]) => w === boxes[id]!.w && h === boxes[id]!.h), id);
  assert.equal(boxes.search?.y, 0, 'search does not leave an empty band above it');
  assert.ok(Object.values(boxes).reduce((sum, box) => sum + box!.w * box!.h, 0) >= 80, 'the grid uses available space');
});

test('stored spots win; clashes slide to the nearest free spot; junk is repaired', () => {
  const { boxes } = resolve({ notes: { x: 2, y: 2, w: 2, h: 2 }, todo: { x: 99, y: -4, w: 2, h: 2 }, clock: { x: 0, y: 0, w: 5, h: 5 } }, ALL);
  noOverlap(boxes as never);
  // Search outranks notes, so notes moved off the search box.
  assert.deepEqual(boxes.search, DEFAULT_LAYOUT.search);
  assert.ok(!overlaps(boxes.notes!, boxes.search!));
  // An impossible size falls back to the default.
  assert.deepEqual([boxes.clock!.w, boxes.clock!.h], [4, 2]);
  assert.equal(boxes.todo!.x + boxes.todo!.w <= COLS, true);
});

test('moving a widget onto another bumps it aside; no room means no move', () => {
  const start = resolve({}, ALL).boxes;
  const target = { ...start.todo!, w: 2, h: 2 };
  const moved = place(start, 'calendar', target);
  assert.ok(moved);
  assert.deepEqual(moved!.calendar, target);
  noOverlap(moved as never);
  assert.notDeepEqual(moved!.todo, start.todo);
  // A whole-grid widget can't fit.
  assert.equal(place(start, 'calendar', { x: 0, y: 0, w: 12, h: 8 }), null);
});

test('sizes cycle and classify', () => {
  assert.deepEqual(nextSize('calendar', { x: 0, y: 0, w: 2, h: 2 }), [4, 2]);
  assert.deepEqual(nextSize('calendar', { x: 0, y: 0, w: 4, h: 4 }), [2, 2]);
  assert.equal(sizeClass({ x: 0, y: 0, w: 2, h: 2 }), 's');
  assert.equal(sizeClass({ x: 0, y: 0, w: 4, h: 2 }), 'm');
  assert.equal(sizeClass({ x: 0, y: 0, w: 4, h: 4 }), 'l');
  assert.equal(nearestFree({ x: 0, y: 0, w: 12, h: 8 }, [{ x: 0, y: 0, w: 1, h: 1 }]), null);
});

const flat = (r: number, g: number, b: number, n = 16) => {
  const px: number[] = [];
  for (let i = 0; i < n * n; i++) px.push(r, g, b, 255);
  return px;
};
const checker = (a: number, b: number, n = 16) => {
  const px: number[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = (x + y) % 2 ? a : b;
    px.push(v, v, v, 255);
  }
  return px;
};

test('calm patches get no dimming: white text on dark, dark text on light', () => {
  const dark = legibilityFor(patchOf(flat(20, 30, 40), 16, 16, { x: 0, y: 0, w: 1, h: 1 }));
  assert.equal(dark.tone, 'light');
  assert.equal(dark.dim, 0);
  assert.equal(dark.blur, 0);
  assert.ok(dark.ratio >= 5);
  const light = legibilityFor(patchOf(flat(235, 230, 220), 16, 16, { x: 0, y: 0, w: 1, h: 1 }));
  assert.equal(light.tone, 'dark');
  assert.equal(light.dim, 0);
  assert.ok(light.ratio >= 5);
});

test('mid-grey and busy patches get just enough dimming and some blur', () => {
  const mid = legibilityFor(patchOf(flat(128, 128, 128), 16, 16, { x: 0, y: 0, w: 1, h: 1 }));
  assert.ok(mid.dim > 0 && mid.dim <= 0.62);
  assert.ok(mid.ratio >= 4.9, `ratio ${mid.ratio}`);
  const busy = legibilityFor(patchOf(checker(30, 220), 16, 16, { x: 0, y: 0, w: 1, h: 1 }));
  assert.ok(busy.blur > 0);
  assert.ok(busy.dim > 0);
});

test('contrast maths and colour parsing match WCAG', () => {
  assert.equal(Math.round(contrast(luminance(255, 255, 255), luminance(0, 0, 0))), 21);
  assert.deepEqual(colorsIn('linear-gradient(#ff0000, rgb(0, 128, 255) 50%, #fff)'), [[0, 128, 255], [255, 0, 0], [255, 255, 255]]);
  const g = patchOfColors([[0, 0, 0], [255, 255, 255]]);
  assert.ok(g.p10 < 0.01 && g.p90 > 0.99);
});

const OWNER_LAYOUT = {
  bookmarks: { x: 4, y: 2, w: 8, h: 2 }, calendar: { x: 0, y: 4, w: 4, h: 4 }, clock: { x: 0, y: 0, w: 4, h: 2 }, notes: { x: 4, y: 6, w: 4, h: 2 },
  pomodoro: { x: 4, y: 4, w: 4, h: 2 }, search: { x: 4, y: 0, w: 8, h: 2 }, todo: { x: 8, y: 4, w: 4, h: 4 }, weather: { x: 0, y: 2, w: 4, h: 2 },
};
const EVERY: WidgetId[] = ['search', 'bookmarks', 'clock', 'weather', 'calendar', 'pomodoro', 'todo', 'notes', 'reading', 'tabs', 'calculator'];

test('a full saved grid makes room for widgets turned on later, instead of hiding them', () => {
  // The owner's saved desk fills all 96 cells; reading, tabs and calculator were switched on afterwards.
  const { boxes, hidden } = resolve(OWNER_LAYOUT, EVERY);
  assert.deepEqual(hidden, [], 'every enabled widget has a place');
  const placed = EVERY.map((id) => [id, boxes[id]!] as const);
  for (const [id, b] of placed) {
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= COLS && b.y + b.h <= ROWS, `${id} inside the grid`);
    assert.ok(SIZES[id].some(([w, h]) => w === b.w && h === b.h), `${id} at one of its sizes`);
  }
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) assert.ok(!overlaps(placed[i][1], placed[j][1]), `${placed[i][0]} and ${placed[j][0]} don't overlap`);
  assert.deepEqual(boxes.search, OWNER_LAYOUT.search, 'search keeps its place and size');
  assert.equal(placed.reduce((n, [, b]) => n + b.w * b.h, 0), COLS * ROWS, 'no empty holes: newcomers take the sizes that fill the desk');
  // The rest of the arrangement stays recognisable: widgets stay near where they were.
  for (const id of ['clock', 'weather', 'calendar', 'bookmarks'] as const) {
    const was = OWNER_LAYOUT[id];
    const now = boxes[id]!;
    assert.ok(Math.abs(now.x - was.x) + Math.abs(now.y - was.y) <= 3, `${id} stays near its spot`);
  }
});

test('packing still keeps a saved arrangement untouched when everything already fits', () => {
  const shown: WidgetId[] = ['search', 'bookmarks', 'clock', 'weather', 'calendar', 'pomodoro', 'todo', 'notes'];
  const { boxes, hidden } = resolve(OWNER_LAYOUT, shown);
  assert.deepEqual(hidden, []);
  for (const id of shown) assert.deepEqual(boxes[id], OWNER_LAYOUT[id as keyof typeof OWNER_LAYOUT], `${id} unchanged`);
});

test('one tone for the whole desk; a card on the odd patch gets a stronger tint, not the other tone', () => {
  const whole = { x: 0, y: 0, w: 1, h: 1 };
  const dark = patchOf(flat(25, 25, 30), 16, 16, whole);
  const bright = patchOf(flat(245, 245, 245), 16, 16, whole);
  const desk = deskTone([{ patch: dark, area: 4 }, { patch: dark, area: 4 }, { patch: dark, area: 2 }, { patch: bright, area: 2 }]);
  assert.equal(desk.tone, 'light', 'white text: most of the desk is dark');
  assert.equal(desk.alphas.length, 4);
  assert.ok(desk.alphas.every((a) => a >= 0.62 && a <= 0.9), 'every card keeps at least the usual tint, never more than 90%');
  // White text over the bright card's tint (blended in encoded sRGB, as the browser does) still reads.
  const enc = (l: number) => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055);
  const dec = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  assert.ok(contrast(1, dec(enc(luminance(245, 245, 245)) * (1 - desk.alphas[3]))) >= 4.5);
  assert.equal(deskTone([{ patch: bright, area: 3 }, { patch: dark, area: 1 }]).tone, 'dark', 'mostly bright desks get dark text');
  assert.equal(deskTone([]).tone, 'light');
});
