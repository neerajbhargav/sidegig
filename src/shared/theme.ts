// Theme engine: three inputs (base color, accent color, contrast) generate the
// whole palette in OKLCH, a perceptually uniform color space, so any combination
// stays readable. Output is hex for maximum browser compatibility.

export interface Oklch { l: number; c: number; h: number }
export type Mode = 'light' | 'dark';

export interface ThemeInput { base: string; accent: string; contrast: number }

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
  if (mode === 'system') {
    return (
      `${selector}{${tokensToCss(generateTokens('light', input))}${r}color-scheme:light}` +
      `@media (prefers-color-scheme: dark){${selector}{${tokensToCss(generateTokens('dark', input))}color-scheme:dark}}`
    );
  }
  return `${selector}{${tokensToCss(generateTokens(mode, input))}${r}color-scheme:${mode}}`;
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
