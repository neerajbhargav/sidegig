// Theme engine: three inputs (base color, accent color, contrast) generate the
// whole palette in OKLCH, a perceptually uniform color space, so any combination
// stays readable. Output is hex for maximum browser compatibility.

export interface Oklch { l: number; c: number; h: number }
export type Mode = 'light' | 'dark';

/** Arc-style space colour: one to three colours, a grain amount and an intensity (both 0–100). */
export interface Space { colors: string[]; grain: number; intensity: number }
export const DEFAULT_SPACE: Space = { colors: ['#8fa8ff', '#f2b3d6'], grain: 30, intensity: 55 };

/** `accent` '' follows the space colour. */
export interface ThemeInput { base: string; accent: string; contrast: number; space?: Space }

export type Tokens = Record<
  | 'bg' | 'surface' | 'surface2' | 'hover' | 'border' | 'fg' | 'fgMuted' | 'fgSubtle'
  | 'accent' | 'accentFg' | 'accentSoft' | 'badge' | 'badgeFg' | 'scrim',
  string
>;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Bad hex color: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('');
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.sign(c) * Math.abs(c) ** (1 / 2.4) - 0.055);

export function rgbToOklch(rgb: [number, number, number]): Oklch {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.sqrt(A * A + B * B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h: c < 1e-4 ? 0 : h };
}

function oklchToRgbRaw({ l, c, h }: Oklch): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const A = c * Math.cos(hr);
  const B = c * Math.sin(hr);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const b = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;
  return [fromLinear(r), fromLinear(g), fromLinear(b)];
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** Convert to sRGB, reducing chroma (not lightness) until the color fits. */
export function oklchToRgb(color: Oklch): [number, number, number] {
  let rgb = oklchToRgbRaw(color);
  if (inGamut(rgb)) return rgb.map((v) => clamp(v)) as [number, number, number];
  let lo = 0;
  let hi = color.c;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToRgbRaw({ ...color, c: mid }))) lo = mid;
    else hi = mid;
  }
  rgb = oklchToRgbRaw({ ...color, c: lo });
  return rgb.map((v) => clamp(v)) as [number, number, number];
}

export const oklchHex = (c: Oklch) => rgbToHex(oklchToRgb(c));

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function generateTokens(mode: Mode, input: ThemeInput): Tokens {
  const k = clamp(input.contrast / 100);
  const base = rgbToOklch(hexToRgb(input.base));
  const acc = rgbToOklch(hexToRgb(input.accent));
  // Neutrals carry only a whisper of the base hue so the UI stays calm.
  const nc = Math.min(base.c, 0.035) * 0.3;
  const n = (l: number, c = nc) => oklchHex({ l: clamp(l), c, h: base.h });
  const a = (l: number, c = acc.c) => oklchHex({ l: clamp(l), c, h: acc.h });

  if (mode === 'dark') {
    const bg = 0.205 - 0.045 * k;
    return {
      bg: n(bg),
      surface: n(bg + 0.035),
      surface2: n(bg + 0.065),
      hover: n(bg + 0.055),
      border: n(bg + 0.095 + 0.07 * k),
      fg: n(0.93 + 0.06 * k, nc * 0.4),
      fgMuted: n(0.74 + 0.1 * k, nc * 0.6),
      fgSubtle: n(0.6 + 0.1 * k),
      accent: a(0.74, Math.min(acc.c, 0.17)),
      accentFg: a(0.2, Math.min(acc.c, 0.06)),
      accentSoft: a(bg + 0.09, Math.min(acc.c, 0.06)),
      badge: oklchHex({ l: 0.56, c: 0.19, h: 25 }),
      badgeFg: '#ffffff',
      scrim: 'rgba(0,0,0,0.45)',
    };
  }
  return {
    bg: n(0.99 - 0.005 * k),
    surface: n(0.968 - 0.012 * k),
    surface2: n(0.94 - 0.02 * k),
    hover: n(0.935 - 0.015 * k),
    border: n(0.9 - 0.09 * k),
    fg: n(0.24 - 0.1 * k, nc * 0.6),
    fgMuted: n(0.47 - 0.1 * k, nc * 0.8),
    fgSubtle: n(0.6 - 0.1 * k),
    accent: a(0.53, Math.min(acc.c, 0.2)),
    accentFg: '#ffffff',
    accentSoft: a(0.94, Math.min(acc.c, 0.05)),
    badge: oklchHex({ l: 0.56, c: 0.21, h: 25 }),
    badgeFg: '#ffffff',
    scrim: 'rgba(0,0,0,0.18)',
  };
}

export interface SpaceTokens {
  /** The colours the frame is painted with, fitted to the mode. */
  stops: string[];
  /** A CSS gradient through the stops. */
  frame: string;
  ink: string;
  mute: string;
  /** Accent text that reads on every stop. */
  accent: string;
  hover: string;
  selected: string;
  /** Wells sunk into the frame (the address pill, favorites tiles, cards): a shade of the hue, like Arc's. */
  card: string;
  /** What a well looks like over each stop, for contrast checks. */
  wells: string[];
  line: string;
  /** The colour soft shadows take on the frame, so a lift reads as the same hue. */
  shade: string;
  /** Opacity of the grain layer. */
  grain: number;
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const spaceColors = (s: Space) => {
  const ok = (s.colors ?? []).filter((c) => typeof c === 'string' && HEX.test(c.trim())).slice(0, 3);
  return ok.length ? ok : DEFAULT_SPACE.colors;
};

/** The most colourful of the space's colours: the one its accent comes from. */
export function spaceAccent(s: Space): string {
  return spaceColors(s).reduce((best, c) => (rgbToOklch(hexToRgb(c)).c > rgbToOklch(hexToRgb(best)).c ? c : best));
}

/** Move a colour's lightness (keeping its hue) until it reads on every surface. */
function readable(start: Oklch, on: string[], min: number, step: number): string {
  let c = start;
  for (let i = 0; i < 100 && on.some((s) => contrastRatio(oklchHex(c), s) < min); i++) c = { ...c, l: clamp(c.l + step) };
  return oklchHex(c);
}

/**
 * The frame colours for a mode. Arc keeps the hue you pick and sets how light it
 * sits from the mode: pastel in light, deep in dark; intensity adds colour.
 */
export function spaceTokens(mode: Mode, s: Space): SpaceTokens {
  const k = clamp((s.intensity ?? 50) / 100);
  const picked = spaceColors(s).map((c) => rgbToOklch(hexToRgb(c)));
  const fit = ({ c, h }: Oklch): Oklch =>
    mode === 'light' ? { l: 0.93 - 0.2 * k, c: Math.min(c, 0.2) * (0.4 + 0.6 * k), h } : { l: 0.25 + 0.1 * k, c: Math.min(c, 0.2) * (0.35 + 0.5 * k), h };
  const fitted = picked.map(fit);
  const stops = fitted.map(oklchHex);
  // One colour still gets a quiet second stop, so the frame has depth.
  const ends = stops.length > 1 ? stops : [stops[0], oklchHex({ ...fitted[0], l: fitted[0].l + (mode === 'light' ? -0.035 : 0.035), h: fitted[0].h + 10 })];
  const frame = `linear-gradient(160deg, ${ends.map((c, i) => `${c} ${Math.round((i / (ends.length - 1)) * 100)}%`).join(', ')})`;
  const h = fitted[0].h;
  const c = fitted[0].c;
  const hue = rgbToOklch(hexToRgb(spaceAccent(s)));
  const dark = mode === 'dark';
  // Values measured from arc.net's own window mock (2026-10-23): wells a few points darker than
  // the frame, muted text a dark shade of the hue, the open tab a white with a whisper of it.
  const tint = (l: number, a: number) => `oklch(${l} ${Math.min(c * 1.4, 0.12).toFixed(3)} ${h.toFixed(1)} / ${a})`;
  // Text must read on the frame and in the wells sunk into it (the well colour blended over each stop).
  const wellInk = dark ? ([1, 1, 1] as [number, number, number]) : oklchToRgb({ l: 0.32, c: Math.min(c * 1.4, 0.12), h });
  const wellA = dark ? 0.08 : 0.075;
  const wells = ends.map((stop) => rgbToHex(hexToRgb(stop).map((v, i) => v * (1 - wellA) + wellInk[i] * wellA) as [number, number, number]));
  const surfaces = [...ends, ...wells];
  return {
    stops,
    frame,
    ink: readable({ l: dark ? 0.97 : 0.2, c: 0.012, h }, surfaces, 7, dark ? 0.01 : -0.01),
    mute: readable({ l: dark ? 0.72 : 0.46, c: Math.min(c * 1.2, 0.09), h }, surfaces, 4.5, dark ? 0.01 : -0.01),
    accent: readable({ l: dark ? 0.78 : 0.45, c: Math.min(hue.c, 0.16), h: hue.h }, surfaces, 4.5, dark ? 0.01 : -0.01),
    hover: dark ? 'rgb(255 255 255 / 0.06)' : 'rgb(255 255 255 / 0.3)',
    selected: dark ? oklchHex({ l: Math.min(fitted[0].l + 0.1, 0.42), c: c * 0.6, h }) : oklchHex({ l: 0.985, c: Math.min(c * 0.15, 0.012), h }),
    card: dark ? `rgb(255 255 255 / ${wellA})` : tint(0.32, wellA),
    wells,
    line: dark ? 'rgb(255 255 255 / 0.1)' : tint(0.3, 0.1),
    shade: dark ? '#000000' : oklchHex({ l: 0.3, c: Math.min(c * 1.4, 0.12), h }),
    grain: Math.round(clamp((s.grain ?? 0) / 100) * 0.4 * 100) / 100,
  };
}

/** Soft shadows for floating layers and the selected row, in the hue of the frame (stronger on dark). */
function lifts(t: SpaceTokens, mode: Mode): string {
  const [r, g, b] = hexToRgb(t.shade).map((v) => Math.round(v * 255));
  const k = mode === 'dark' ? 2.2 : 1;
  const a = (x: number) => `rgb(${r} ${g} ${b} / ${Math.min(0.6, x * k).toFixed(2)})`;
  return `--lift-1:0 1px 3px ${a(0.14)}, 0 0 0 0.5px ${a(0.08)};--lift-2:0 14px 36px -8px ${a(0.26)}, 0 2px 8px ${a(0.08)}, 0 0 0 0.5px ${a(0.12)};`;
}

function spaceCss(t: SpaceTokens, mode: Mode): string {
  const [a, b = a, c = b] = t.stops;
  return `--sp-1:${a};--sp-2:${b};--sp-3:${c};--sp-frame:${t.frame};--sp-ink:${t.ink};--sp-mute:${t.mute};--sp-accent:${t.accent};` +
    `--sp-hover:${t.hover};--sp-sel:${t.selected};--sp-card:${t.card};--sp-line:${t.line};--sp-shade:${t.shade};--sp-grain:${t.grain};` + lifts(t, mode);
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

export function tokensToCss(t: Tokens): string {
  return Object.entries(t)
    .map(([k, v]) => `--m-${kebab(k)}:${v};`)
    .join('');
}

/**
 * CSS for a selector. `mode` 'system' emits light tokens plus a dark media query.
 */
export function themeCss(selector: string, mode: 'system' | Mode, input: ThemeInput, radius = 10): string {
  const r = `--m-radius:${radius}px;--m-radius-sm:${Math.max(4, radius - 4)}px;`;
  // The space colour tints the neutrals and lends the accent unless you picked one.
  const space = input.space ?? DEFAULT_SPACE;
  const fed: ThemeInput = { ...input, base: spaceColors(space)[0], accent: input.accent || spaceAccent(space) };
  const one = (m: Mode) => tokensToCss(generateTokens(m, fed)) + spaceCss(spaceTokens(m, space), m);
  if (mode === 'system') {
    return `${selector}{${one('light')}${r}color-scheme:light}@media (prefers-color-scheme: dark){${selector}{${one('dark')}color-scheme:dark}}`;
  }
  return `${selector}{${one(mode)}${r}color-scheme:${mode}}`;
}

/** Parse a CSS rgb()/rgba() string (from getComputedStyle) to [r,g,b,a] in 0..1. */
export function parseCssRgb(css: string): [number, number, number, number] | null {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some((p) => Number.isNaN(p))) return null;
  return [parts[0] / 255, parts[1] / 255, parts[2] / 255, parts[3] ?? 1];
}

/** Decide light or dark from a page background color; null if transparent/unknown. */
export function modeForBackground(css: string): Mode | null {
  const rgba = parseCssRgb(css);
  if (!rgba || rgba[3] < 0.5) return null;
  const lum = luminance(rgbToHex([rgba[0], rgba[1], rgba[2]]));
  return lum < 0.35 ? 'dark' : 'light';
}
