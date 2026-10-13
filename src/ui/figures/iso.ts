// The Anatomy kit's isometric camera (vendor/anatomy, MIT), just enough of it
// to move parts of the figures at runtime: points, lines on a top plane,
// lines in space and small rings.
export interface Projection {
  readonly origin: readonly number[];
  readonly scale: number;
  readonly azimuth: number;
  readonly elevation: number;
}
type V3 = readonly [number, number, number];

const RAD = Math.PI / 180;

export function iso(P: Projection, [x, y, z]: V3): [number, number] {
  const a = P.azimuth * RAD;
  const e = P.elevation * RAD;
  const k = P.scale * Math.sqrt(1.6);
  return [P.origin[0] + (x * Math.sin(a) - y * Math.cos(a)) * k, P.origin[1] + ((x * Math.cos(a) + y * Math.sin(a)) * Math.sin(e) - z * Math.cos(e)) * k];
}

const pt = (P: Projection, p: V3) => {
  const [x, y] = iso(P, p);
  return `${x.toFixed(1)} ${y.toFixed(1)}`;
};

/** A straight line between two points in space. */
export const line = (P: Projection, a: V3, b: V3) => `M${pt(P, a)}L${pt(P, b)}`;

/** A hand on a dial lying flat: from a short tail through the centre to the tip, at a turn of 0..1 (0 = twelve). */
export function hand(P: Projection, cx: number, cy: number, z: number, turn: number, [tail, tip]: readonly number[]): string {
  const t = turn * Math.PI * 2;
  return line(P, [cx - Math.sin(t) * tail, cy + Math.cos(t) * tail, z], [cx + Math.sin(t) * tip, cy - Math.cos(t) * tip, z]);
}

/** A closed polygon through points in space. */
export const poly = (P: Projection, pts: V3[]) => `${pts.map((p, i) => `${i ? 'L' : 'M'}${pt(P, p)}`).join('')}Z`;

/** A circle lying on a flat plane (closed path). */
export function ring(P: Projection, cx: number, cy: number, r: number, z: number, steps = 18): string {
  let d = '';
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    d += `${i ? 'L' : 'M'}${pt(P, [cx + Math.cos(t) * r, cy + Math.sin(t) * r, z])}`;
  }
  return `${d}Z`;
}

/** Wrap figure art in its SVG. */
export const figureSvg = (w: number, h: number, inner: string, label = '') =>
  `<svg class="iso-svg" viewBox="0 0 ${w} ${h}" ${label ? `role="img" aria-label="${label.replace(/"/g, '&quot;')}"` : 'aria-hidden="true"'}>${inner}</svg>`;

/** Text on a face of a figure (transform from the build). */
export const faceText = (transform: string, text: string, size: number, tone = 'hi', cls = '') =>
  `<text class="iso-face-text ${cls}" data-tone="${tone}" transform="${transform}" font-size="${size}" text-anchor="middle">${text.replace(/[<&]/g, '')}</text>`;
