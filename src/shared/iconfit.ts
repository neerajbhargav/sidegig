// Make every site icon look the same size. Favicons differ: some fill their
// square edge to edge (SoFi, Y Combinator, X), most float in padding (GitHub,
// Gmail, Claude). We measure the drawn part once and scale it so every logo
// fills the same share of its slot; edge-to-edge squares get rounded corners
// and sit a touch smaller, because a full square reads bigger than a shape.

export interface IconFit {
  /** Scale to apply around the centre. */
  s: number;
  /** Shift (fraction of the slot) that centres the drawn part. */
  x: number;
  y: number;
  /** Fills its square edge to edge. */
  q: boolean;
  /** Only black or near-black ink: inverted on dark surfaces so it stays visible. */
  d: boolean;
}

/** Share of the slot the drawn part should fill. */
export const FILL = 0.86;
export const FILL_SQUARE = 0.9;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Measure an RGBA buffer (w × h) and say how to draw it. */
export function measureIcon(px: ArrayLike<number>, w: number, h: number): IconFit {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  let ink = 0;
  let lightInk = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (px[i + 3] <= 24) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (px[i + 3] > 128) {
        ink++;
        if (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2] > 70) lightInk++;
      }
    }
  }
  if (x1 < 0) return { s: 1, x: 0, y: 0, q: false, d: false };
  const bw = (x1 - x0 + 1) / w;
  const bh = (y1 - y0 + 1) / h;
  const opaque = (fx: number, fy: number) => px[(Math.round(fy * (h - 1)) * w + Math.round(fx * (w - 1))) * 4 + 3] > 200;
  const corners = [opaque(0.12, 0.12), opaque(0.88, 0.12), opaque(0.12, 0.88), opaque(0.88, 0.88)].filter(Boolean).length;
  const q = bw > 0.92 && bh > 0.92 && corners >= 3;
  const s = Math.max(0.72, Math.min(1.8, (q ? FILL_SQUARE : FILL) / Math.max(bw, bh)));
  const cx = (x0 + x1 + 1) / 2 / w;
  const cy = (y0 + y1 + 1) / 2 / h;
  return { s: r2(s), x: r2((0.5 - cx) * s), y: r2((0.5 - cy) * s), q, d: !q && ink > 0 && lightInk / ink < 0.04 };
}

/** The CSS transform for a fit. */
export const fitTransform = (f: IconFit) => `translate(${f.x * 100}%, ${f.y * 100}%) scale(${f.s})`;

/** A cheap fingerprint of an icon's pixels (to spot the browser's blank globe). */
export function iconPrint(px: ArrayLike<number>): number {
  let hsh = 2166136261;
  for (let i = 0; i < px.length; i += 7) hsh = Math.imul(hsh ^ px[i], 16777619) >>> 0;
  return hsh;
}
