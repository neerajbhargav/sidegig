// The design system holds: colour pairs read, and every style uses its tokens (docs/DESIGN.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { accentFill, contrast, luminance } from '../src/shared/legible.ts';
import { DUR, EASE } from '../src/ui/dom.ts';
// @ts-expect-error: plain JS module shared with the CLI
import { rules } from '../scripts/css-check.mjs';

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const STYLES = ['src/ui/ui.css', 'src/content/rail.css'];

/** Split on a separator outside parentheses and quotes. */
function split(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (const ch of s) {
    if (quote) quote = ch === quote ? '' : quote;
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === sep && !depth && !quote) out.push(cur), (cur = '');
    else cur += ch;
  }
  return [...out, cur].map((x) => x.trim()).filter(Boolean);
}

interface Decl { file: string; line: number; selector: string; prop: string; value: string; calm: boolean }

/** Every declaration in a style rule (not in @keyframes), and whether it sits in a reduced-motion block. */
function declarations(file: string): Decl[] {
  const css = read(file).replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const all = rules(css) as { at: boolean; start: number; open: number; end: number; selector?: string }[];
  const calm = all.filter((r) => r.at && /prefers-reduced-motion:\s*reduce/.test(css.slice(r.start, r.open)));
  const out: Decl[] = [];
  for (const r of all) {
    if (r.at) continue;
    let at = r.open + 1;
    for (const d of split(css.slice(r.open + 1, r.end - 1), ';')) {
      const i = d.indexOf(':');
      if (i < 0) continue;
      at = css.indexOf(d, at);
      out.push({
        file,
        line: css.slice(0, at).split('\n').length,
        selector: r.selector!,
        prop: d.slice(0, i).trim(),
        value: d.slice(i + 1).trim(),
        calm: calm.some((c) => c.start < r.start && r.end <= c.end),
      });
    }
  }
  return out;
}
const DECLS = STYLES.flatMap(declarations);
const where = (d: Decl) => `${d.file}:${d.line} ${d.selector.slice(0, 60)} { ${d.prop}: ${d.value.slice(0, 80)} }`;

const FLUID = /clamp\(|min\(|max\(|cq[hwib]|vw|vh|\dem\b|%|^inherit$|^unset$/;
const BASE_FONT = /^(:root|:host|html\[data-look\])$/;

test('type uses the seven steps (--t-1 … --t-7) or fluid display sizes', () => {
  const bad = DECLS.filter((d) => {
    if (d.prop === 'font-size') return !/^var\(--t-[1-7]\)( !important)?$/.test(d.value) && !FLUID.test(d.value);
    if (d.prop !== 'font' || /^(inherit|unset)$/.test(d.value) || BASE_FONT.test(d.selector)) return false;
    const size = /(?:^|\s)((?:var\([^)]*\)|calc\([^)]*\)|[\d.]+(?:rem|px)))(?=\s*\/|\s)/.exec(d.value)?.[1];
    return !!size && !/^var\(--t-[1-7]\)$/.test(size) && !FLUID.test(d.value);
  });
  assert.deepEqual(bad.map(where), []);
});

test('corners use the radius tokens', () => {
  const ok = /^(0|inherit|unset|\d+(\.\d+)?%|var\(--(r-[\w-]+|m-radius(-sm)?)(, ?[^)]*)?\)|calc\(.*var\(--(r-|m-radius).*\))$/;
  const bad = DECLS.filter((d) => /radius$/.test(d.prop) && !d.prop.startsWith('--') && split(d.value.replace(' !important', ''), ' ').some((t) => !ok.test(t)));
  assert.deepEqual(bad.map(where), []);
});

test('motion uses the durations and the one ease-out curve; only loops run linear or in-out', () => {
  const bad = DECLS.filter((d) => {
    if (d.calm || d.prop.startsWith('--') || !/^(transition|animation)/.test(d.prop) || /delay$/.test(d.prop)) return false;
    if (/duration$/.test(d.prop)) return split(d.value, ',').some((t) => !/^(var\(--dur-[a-z]+\)|0m?s)$/.test(t));
    // The one exception (owner, 2026-10-14): digits bounce when they change.
    const ease = /\.roll\b/.test(d.selector) ? /var\(--ease(-bounce)?\)/ : /var\(--ease\)/;
    if (/timing-function$/.test(d.prop)) return split(d.value, ',').some((t) => !ease.test(t));
    return split(d.value, ',').some((item) => {
      if (/^(none|unset|inherit)$/.test(item) || /\binfinite\b/.test(item)) return false;
      const bare = item.replace(/var\([^)]*\)/g, '');
      const times = split(bare, ' ').filter((t) => /^[\d.]+m?s$/.test(t));
      const easing = /cubic-bezier|steps\(|\bease(-in|-out|-in-out)?\b|\blinear\b/.test(bare);
      // A duration token and the ease token; a raw time after them is a delay, which may stay.
      return !/var\(--dur-[a-z]+\)/.test(item) || !ease.test(item) || easing || times.length > 1;
    });
  });
  assert.deepEqual(bad.map(where), []);
});

test('spacing sits on a 2px grid (0.125rem steps)', () => {
  const bad = DECLS.filter((d) => {
    if (!/^(gap|row-gap|column-gap|padding(-[a-z-]+)?|margin(-[a-z-]+)?)$/.test(d.prop)) return false;
    return [...d.value.matchAll(/(?<![\w.-])(-?[\d.]+)(rem|px)\b/g)].some(([, n, unit]) => {
      const v = Math.abs(+n);
      return unit === 'rem' ? Math.abs(v * 8 - Math.round(v * 8)) > 1e-6 : v > 1 && v % 2 !== 0;
    });
  });
  assert.deepEqual(bad.map(where), []);
});

test('no drop shadows or glows: shadows are none, inset, or a crisp ring', () => {
  const blurred = (v: string) =>
    split(v, ',').some((item) => {
      if (/^(none|unset|inherit)$/.test(item) || /^var\(--[\w-]+\)$/.test(item)) return false;
      const lens = split(item.replace(/^inset\s+/, '').replace(/(rgba?|oklab|oklch|color-mix|hsla?)\([^]*\)|#[\da-f]+|\b[a-z]+\b(?!\()/gi, ''), ' ');
      const blur = lens[2];
      return !!blur && !/^0(px|rem)?$/.test(blur);
    });
  const bad = DECLS.filter((d) => (d.prop === 'text-shadow' && !/^none( !important)?$/.test(d.value)) || ((d.prop === 'box-shadow' || /shadow$/.test(d.prop)) && d.prop !== 'text-shadow' && blurred(d.value.replace(' !important', ''))) || /drop-shadow\(/.test(d.value));
  assert.deepEqual(bad.map(where), []);
});

test('lift (the soft shadow) only on floating layers and the selected row, tile or segment (owner, 2026-10-23)', () => {
  const lifts = /(pop|menu|results|ai-host|nt-ask|nt-cz|toast|\.tip|flyout|frame-help|sp-dot|seg|cz-tabs|toggle|\.current|pressed|selected|\.on\b|:focus)/;
  const bad = DECLS.filter((d) => /shadow$/.test(d.prop) && /var\(--lift-/.test(d.value) && !lifts.test(d.selector));
  assert.deepEqual(bad.map(where), []);
});

test('a surface that changes the ink sets every colour role, so nothing turns white on white', () => {
  const roles = ['--c-ink', '--c-mute', '--c-bg', '--c-card', '--c-panel'];
  const blocks = new Map<string, Decl[]>();
  for (const d of DECLS) blocks.set(`${d.file}|${d.selector}|${d.line}`, []);
  const bySel = new Map<string, Set<string>>();
  for (const d of DECLS) {
    if (/^(:root|:host|html(\[[^\]]+\])*)$/.test(d.selector) || d.selector.startsWith('html[data-look') && !/\s/.test(d.selector)) continue;
    const k = `${d.file}|${d.selector}`;
    if (!bySel.has(k)) bySel.set(k, new Set());
    bySel.get(k)!.add(d.prop);
  }
  const bad = [...bySel].filter(([, props]) => props.has('--c-ink') && roles.some((r) => !props.has(r))).map(([k, props]) => `${k} sets ${roles.filter((r) => props.has(r)).join(', ')}`);
  assert.deepEqual(bad, []);
});

test('every token a stylesheet uses is defined in it', () => {
  for (const f of STYLES) {
    const css = read(f);
    const used = new Set([...css.matchAll(/var\((--(?:t|r|dur|ico)-[\w-]+|--ease)\b/g)].map((m) => m[1]));
    const missing = [...used].filter((t) => !new RegExp(`${t}:`).test(css));
    assert.deepEqual(missing, [], f);
  }
});

const TS = (() => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (n.endsWith('.ts')) out.push(p);
    }
  };
  walk(new URL('../src', import.meta.url).pathname);
  return out.map((p) => ({ p: p.slice(p.indexOf('src/')), s: readFileSync(p, 'utf8') }));
})();

test('icons come in four sizes: 16, 20, 24, 32', () => {
  const bad = TS.flatMap(({ p, s }) => [...s.matchAll(/\b(?:ico|icon|iconNode)\([^()]*(?:\([^()]*\)[^()]*)*,\s*(\d+)\)/g)].filter((m) => ![16, 20, 24, 32].includes(+m[1])).map((m) => `${p}: ${m[0]}`));
  assert.deepEqual(bad, []);
});

test('scripted motion uses DUR and EASE, which match the CSS tokens', () => {
  const css = read('src/ui/ui.css');
  for (const [k, ms] of Object.entries(DUR)) assert.match(css, new RegExp(`--dur-${k}: ${ms}ms;`), `--dur-${k}`);
  assert.ok(css.includes(`--ease: ${EASE};`), '--ease');
  const bad = TS.flatMap(({ p, s }) => [...s.matchAll(/\b(duration:\s*\d|easing:\s*['"`])/g)].map((m) => `${p}: ${m[0]}`));
  assert.deepEqual(bad, []);
});

test('text on an accent fill always reaches 4.5:1, and the fill stays close to the accent', () => {
  for (const accent of [[47, 107, 255], [255, 79, 0], [255, 216, 77], [119, 119, 119], [109, 147, 255], [0, 0, 0], [255, 255, 255], [30, 158, 90]] as [number, number, number][]) {
    const { fill, on } = accentFill(accent);
    const ink = on === '#ffffff' ? 1 : luminance(17, 17, 17);
    assert.ok(contrast(luminance(...fill), ink) >= 4.5, `${accent} -> ${fill} with ${on}`);
    assert.ok(fill.every((v, i) => Math.abs(v - accent[i]) <= 48), `${accent} moved too far: ${fill}`);
  }
  assert.deepEqual(accentFill([255, 216, 77]).fill, [255, 216, 77], 'an accent that already reads is left alone');
  assert.equal(accentFill([47, 107, 255]).on, '#ffffff');
});
