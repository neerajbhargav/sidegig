// Text that stays readable straight on the wallpaper.
//
// For each widget we look at the patch of wallpaper behind it (like Android's
// per-region wallpaper colours), pick white or dark text, and add only as much
// soft dimming as that text needs to reach a contrast target (Apple's advice
// for clear glass: a local dimming layer, only when what's behind is bright).
// Busy patches also get a little blur, since texture hurts reading as much as
// brightness does. Calm patches get nothing at all.

/** sRGB channel (0–255) to linear light. */
const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
/** Linear light to an sRGB value (0–1). */
const enc = (l: number) => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055);
const dec = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** WCAG relative luminance of an sRGB colour. */
export const luminance = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
/** WCAG contrast ratio of two luminances. */
export const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * A button filled with the accent: the text colour that reads better on it, and the accent
 * nudged darker (or lighter) just enough for that text to reach 4.5:1. Mid-tone accents
 * such as #2f6bff otherwise land a hair under with either white or near-black.
 */
export function accentFill(rgb: [number, number, number]): { fill: [number, number, number]; on: '#ffffff' | '#111111' } {
  const dark = luminance(17, 17, 17);
  const L = luminance(...rgb);
  const on = contrast(L, 1) >= contrast(L, dark) ? '#ffffff' : '#111111';
  const toward = on === '#ffffff' ? 0 : 255;
  const ink = on === '#ffffff' ? 1 : dark;
  let fill = rgb;
  for (let t = 0; t <= 1 && contrast(luminance(...fill), ink) < 4.5; t += 0.02) fill = rgb.map((v) => Math.round(v + (toward - v) * t)) as [number, number, number];
  return { fill, on };
}

export interface Patch {
  /** Luminance percentiles of the patch: darkest tenth, middle, brightest tenth. */
  p10: number;
  p50: number;
  p90: number;
  /** How busy it is: mean luminance change between neighbouring samples (sRGB scale, 0–1). */
  busy: number;
}

/** A rectangle as fractions of the sample (0–1). */
export interface Frac {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Read a patch of an RGBA sample (as from getImageData). */
export function patchOf(px: Uint8ClampedArray | number[], W: number, H: number, r: Frac): Patch {
  const x0 = Math.max(0, Math.floor(r.x * W));
  const y0 = Math.max(0, Math.floor(r.y * H));
  const x1 = Math.min(W, Math.max(x0 + 1, Math.ceil((r.x + r.w) * W)));
  const y1 = Math.min(H, Math.max(y0 + 1, Math.ceil((r.y + r.h) * H)));
  const lum: number[] = [];
  let edge = 0;
  let edges = 0;
  const vAt = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return enc(luminance(px[i], px[i + 1], px[i + 2]));
  };
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      lum.push(luminance(px[i], px[i + 1], px[i + 2]));
      if (x + 1 < x1) {
        edge += Math.abs(vAt(x + 1, y) - vAt(x, y));
        edges++;
      }
      if (y + 1 < y1) {
        edge += Math.abs(vAt(x, y + 1) - vAt(x, y));
        edges++;
      }
    }
  }
  lum.sort((a, b) => a - b);
  const at = (q: number) => lum[Math.min(lum.length - 1, Math.max(0, Math.round(q * (lum.length - 1))))] ?? 0;
  return { p10: at(0.1), p50: at(0.5), p90: at(0.9), busy: edges ? edge / edges : 0 };
}

/** A flat patch from a few colours (gradients, patterns): spread from darkest to lightest. */
export function patchOfColors(rgbs: [number, number, number][]): Patch {
  const l = rgbs.map(([r, g, b]) => luminance(r, g, b)).sort((a, b) => a - b);
  if (!l.length) return { p10: 0.9, p50: 0.9, p90: 0.9, busy: 0 };
  return { p10: l[0], p50: l[Math.floor(l.length / 2)], p90: l[l.length - 1], busy: 0 };
}

export interface Legibility {
  /** light = white text (the patch is dark), dark = near-black text. */
  tone: 'light' | 'dark';
  /** Opacity of the dimming layer: black under light text, white under dark text. 0–cap. */
  dim: number;
  /** Blur behind the text in CSS pixels. */
  blur: number;
  /** The contrast the text reaches against the patch's worst tenth after dimming. */
  ratio: number;
}

/** White text, and the near-black we use for dark text (#141414). */
const LIGHT_INK = 1;
const DARK_INK = luminance(20, 20, 20);

/**
 * How to make text readable over a patch: the tone that needs the least
 * dimming to reach `target` (5:1 leaves room for secondary text), the dimming,
 * and a blur for busy patches.
 */
export function legibilityFor(p: Patch, target = 5, cap = 0.62): Legibility {
  // White text needs the brightest tenth darkened to `maxL`: v' = v (1 - a).
  const maxL = (LIGHT_INK + 0.05) / target - 0.05;
  const vHi = enc(p.p90);
  const aLight = vHi <= enc(maxL) ? 0 : 1 - enc(maxL) / vHi;
  // Dark text needs the darkest tenth lifted to `minL`: v' = v + (1 - v) a.
  const minL = target * (DARK_INK + 0.05) - 0.05;
  const vLo = enc(p.p10);
  const aDark = vLo >= enc(minL) ? 0 : (enc(minL) - vLo) / (1 - vLo);
  // Prefer white text on the darker half when both are close: photos read richer that way.
  const tone: 'light' | 'dark' = aLight <= aDark + (p.p50 < 0.18 ? 0.08 : -0.02) ? 'light' : 'dark';
  let dim = Math.min(cap, tone === 'light' ? aLight : aDark);
  // Texture: a little blur from fairly busy upward, and a whisper of dim so the blur reads as a surface.
  const busy = Math.max(0, Math.min(1, (p.busy - 0.035) / 0.09));
  const blur = Math.round(busy * 14);
  // Without a blur behind the text, busy patches get a little more dimming instead.
  if (busy > 0) dim = Math.min(cap, Math.max(dim + 0.2 * busy, 0.32 * busy));
  dim = Math.round(dim * 100) / 100;
  const after = tone === 'light' ? dec(vHi * (1 - dim)) : dec(vLo + (1 - vLo) * dim);
  return { tone, dim, blur, ratio: Math.round(contrast(tone === 'light' ? LIGHT_INK : DARK_INK, after) * 10) / 10 };
}

/** Parse the colours out of a CSS background (gradient stops, rgb() or hex). */
export function colorsIn(css: string): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const m of css.matchAll(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/g)) out.push([+m[1], +m[2], +m[3]]);
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    out.push([parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]);
  }
  return out;
}

/** The tint a card needs behind `tone` text to reach `target` contrast over this patch (0–1). */
function alphaFor(p: Patch, tone: 'light' | 'dark', target = 5): number {
  if (tone === 'light') {
    const maxL = (LIGHT_INK + 0.05) / target - 0.05;
    const vHi = enc(p.p90);
    return vHi <= enc(maxL) ? 0 : 1 - enc(maxL) / vHi;
  }
  const minL = target * (DARK_INK + 0.05) - 0.05;
  const vLo = enc(p.p10);
  return vLo >= enc(minL) ? 0 : (enc(minL) - vLo) / (1 - vLo);
}

/**
 * One text tone for every card on the desk (mixed light and dark cards read as
 * a fault): the tone that needs the least tint over the cards' total area.
 * Each card keeps the usual 62% tint, or more where its patch needs it, up to 90%.
 */
export function deskTone(cards: { patch: Patch; area: number }[]): { tone: 'light' | 'dark'; alphas: number[] } {
  const cost = (tone: 'light' | 'dark') => cards.reduce((n, c) => n + c.area * alphaFor(c.patch, tone), 0);
  const tone = cards.length && cost('dark') < cost('light') ? 'dark' : 'light';
  return { tone, alphas: cards.map((c) => Math.round(Math.min(0.9, Math.max(0.62, alphaFor(c.patch, tone, 4.5))) * 100) / 100) };
}
