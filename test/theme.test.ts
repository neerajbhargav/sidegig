import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hexToRgb, rgbToHex, rgbToOklch, oklchToRgb, contrastRatio, generateTokens, themeCss, modeForBackground, parseCssRgb,
} from '../src/shared/theme.ts';

test('hex <-> oklch round trip stays within 1/255', () => {
  for (const hex of ['#000000', '#ffffff', '#3b6ef5', '#7b7f87', '#e11d48', '#10b981', '#fbbf24']) {
    const back = rgbToHex(oklchToRgb(rgbToOklch(hexToRgb(hex))));
    const a = hexToRgb(hex);
    const b = hexToRgb(back);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(a[i] - b[i]) <= 1 / 255 + 1e-9, `${hex} -> ${back}`);
  }
});

test('out-of-gamut colors are mapped into sRGB', () => {
  const rgb = oklchToRgb({ l: 0.7, c: 0.4, h: 150 });
  assert.ok(rgb.every((v) => v >= 0 && v <= 1));
});

const inputs = [
  { base: '#7b7f87', accent: '#3b6ef5', contrast: 0 },
  { base: '#7b7f87', accent: '#3b6ef5', contrast: 50 },
  { base: '#7b7f87', accent: '#3b6ef5', contrast: 100 },
  { base: '#a16207', accent: '#e11d48', contrast: 30 },
  { base: '#0f766e', accent: '#fbbf24', contrast: 70 },
];

for (const mode of ['light', 'dark'] as const) {
  test(`${mode}: text stays readable at every contrast level`, () => {
    for (const input of inputs) {
      const t = generateTokens(mode, input);
      for (const surface of [t.bg, t.surface, t.surface2, t.hover]) {
        assert.ok(contrastRatio(t.fg, surface) >= 7, `fg on ${surface} (${JSON.stringify(input)})`);
        assert.ok(contrastRatio(t.fgMuted, surface) >= 4.5, `muted on ${surface} (${JSON.stringify(input)})`);
        assert.ok(contrastRatio(t.fgSubtle, surface) >= 3, `subtle on ${surface} (${JSON.stringify(input)})`);
      }
      assert.ok(contrastRatio(t.accentFg, t.accent) >= 4.5, `accent button text (${JSON.stringify(input)})`);
    }
  });
}

test('higher contrast setting never lowers text contrast', () => {
  for (const mode of ['light', 'dark'] as const) {
    let last = 0;
    for (const contrast of [0, 25, 50, 75, 100]) {
      const t = generateTokens(mode, { base: '#7b7f87', accent: '#3b6ef5', contrast });
      const r = contrastRatio(t.fg, t.bg);
      assert.ok(r >= last - 0.01, `${mode} contrast ${contrast}: ${r} < ${last}`);
      last = r;
    }
  }
});

test('system mode emits a dark media query', () => {
  const css = themeCss(':host', 'system', { base: '#7b7f87', accent: '#3b6ef5', contrast: 50 });
  assert.match(css, /prefers-color-scheme: dark/);
  assert.match(css, /--m-bg:#/);
});

test('page background decides light or dark', () => {
  assert.equal(modeForBackground('rgb(255, 255, 255)'), 'light');
  assert.equal(modeForBackground('rgb(18, 18, 18)'), 'dark');
  assert.equal(modeForBackground('rgba(0, 0, 0, 0)'), null);
  assert.deepEqual(parseCssRgb('rgb(255 0 0 / 0.5)'), [1, 0, 0, 0.5]);
});
