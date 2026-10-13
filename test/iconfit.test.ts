import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILL, FILL_SQUARE, measureIcon, iconPrint } from '../src/shared/iconfit.ts';

const canvas = (w: number, paint: (x: number, y: number) => [number, number, number, number] | null) => {
  const px = new Uint8ClampedArray(w * w * 4);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const c = paint(x, y);
    if (c) px.set(c, (y * w + x) * 4);
  }
  return px;
};

test('a padded logo is scaled up to the common size, a full square down and rounded', () => {
  const padded = measureIcon(canvas(64, (x, y) => (x >= 16 && x < 48 && y >= 16 && y < 48 ? [220, 60, 40, 255] : null)), 64, 64);
  assert.equal(padded.q, false);
  assert.ok(Math.abs(padded.s - FILL / 0.5) < 0.02, `scale ${padded.s}`);
  assert.equal(padded.x, 0);
  const square = measureIcon(canvas(64, () => [40, 120, 200, 255]), 64, 64);
  assert.equal(square.q, true);
  assert.equal(square.s, FILL_SQUARE);
});

test('an off-centre logo is shifted to the middle', () => {
  const f = measureIcon(canvas(64, (x, y) => (x < 32 && y >= 16 && y < 48 ? [0, 0, 0, 255] : null)), 64, 64);
  assert.ok(f.x > 0, 'moves right');
  assert.equal(f.y, 0);
});

test('black-only logos are flagged so dark surfaces can invert them', () => {
  const black = measureIcon(canvas(64, (x, y) => ((x - 32) ** 2 + (y - 32) ** 2 < 400 ? [12, 12, 12, 255] : null)), 64, 64);
  assert.equal(black.d, true);
  const colour = measureIcon(canvas(64, (x, y) => ((x - 32) ** 2 + (y - 32) ** 2 < 400 ? [230, 80, 60, 255] : null)), 64, 64);
  assert.equal(colour.d, false);
  assert.notEqual(iconPrint(canvas(8, () => [1, 2, 3, 255])), iconPrint(canvas(8, () => [3, 2, 1, 255])));
});
