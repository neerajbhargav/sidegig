import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intrudes, spills, needsFix, firstGuess, correct, type Box } from '../src/shared/dockmath.ts';
import { migrate, mergeSettings } from '../src/shared/storage.ts';
import { defaultSettings } from '../src/shared/defaults.ts';

const VW = 1440;
const W = 52;
const box = (left: number, right: number): Box => ({ left, right, width: right - left });
/** Simulate where an element lands: anchoring decides which edge a max-width keeps. */
function land(r: Box, f: { tx: number; maxWidth: number | null }, anchor: 'left' | 'right'): Box {
  let { left, right } = r;
  if (f.maxWidth !== null && right - left > f.maxWidth) {
    if (anchor === 'left') right = left + f.maxWidth;
    else left = right - f.maxWidth;
  }
  return box(left + f.tx, right + f.tx);
}
function dock(r: Box, side: 'left' | 'right', anchor: 'left' | 'right'): Box {
  const g = firstGuess(r, VW, W, side);
  const tx = correct(land(r, g, anchor), VW, W, side, g.tx);
  return land(r, { tx, maxWidth: g.maxWidth }, anchor);
}
const clear = (b: Box, side: 'left' | 'right') => (side === 'left' ? b.left >= W - 0.5 && b.right <= VW + 0.5 : b.right <= VW - W + 0.5 && b.left >= -0.5);

test('only boxes under the rail need moving', () => {
  assert.ok(intrudes(box(0, VW), VW, W, 'left'));
  assert.ok(!intrudes(box(300, 900), VW, W, 'left'));
  assert.ok(!intrudes(box(-300, 0), VW, W, 'left'), 'closed off-screen drawers are left alone');
  assert.ok(intrudes(box(VW - 300, VW), VW, W, 'right'));
  assert.ok(!intrudes(box(0, 600), VW, W, 'right'));
});

for (const side of ['left', 'right'] as const) {
  for (const anchor of ['left', 'right'] as const) {
    test(`${side} rail: full-width bar anchored ${anchor} ends up beside the rail`, () => {
      const out = dock(box(0, VW), side, anchor);
      assert.ok(clear(out, side), JSON.stringify(out));
      assert.ok(out.width >= VW - W - 1, 'keeps all the remaining width');
    });
  }
}

test('left rail: a left side nav moves right with the page content', () => {
  const out = dock(box(0, 240), 'left', 'left');
  assert.deepEqual([out.left, out.right], [W, 240 + W]);
});

test('left rail: an element slightly inset keeps its offset and still fits', () => {
  const out = dock(box(30, VW), 'left', 'left');
  assert.ok(clear(out, 'left'), JSON.stringify(out));
  assert.equal(out.left, 30 + W);
});

test('right rail: a right-anchored panel moves left; a left-anchored one is untouched', () => {
  const out = dock(box(VW - 320, VW), 'right', 'right');
  assert.deepEqual([out.left, out.right], [VW - 320 - W, VW - W]);
  assert.ok(!intrudes(box(0, 320), VW, W, 'right'));
});

test('settings: the old floating "pinned" rail migrates to docked', () => {
  const m = mergeSettings(defaultSettings(), migrate({ version: 1, rail: { mode: 'pinned', side: 'right' } }));
  assert.equal(m.rail.mode, 'docked');
  assert.equal(m.rail.side, 'right');
  assert.equal(m.version, 2);
  assert.equal(defaultSettings().rail.mode, 'docked');
});

test('left rail: a full-width bar that follows the page shift is narrowed, not moved', () => {
  // position: fixed; width: 100%; left: auto -> starts beside the rail, runs past the edge.
  const r = box(W, VW + W);
  assert.ok(!intrudes(r, VW, W, 'left'));
  assert.ok(spills(r, VW, W, 'left'));
  const out = dock(r, 'left', 'left');
  assert.deepEqual([out.left, out.right], [W, VW]);
  assert.ok(!needsFix(box(W, VW), VW, W, 'left'), 'once fitted, it stays put');
});
