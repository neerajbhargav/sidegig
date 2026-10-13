// Isometric figures for sidegig, drawn with the Anatomy kit (vendor/anatomy, MIT).
// Run: node scripts/build-figures.mjs  ->  src/ui/figures/timer.ts
//
// The Pomodoro timer is a mechanical kitchen timer on a small bench plate: a
// drum with a knurled bezel and a 60-minute dial, a bell on a post with its
// striker, a start lever in a slot, a ruler strip and a label plate. The needle
// is the one lit part: it points at the minutes left. The lever slides over
// when the timer runs. Everything else is static art built here once.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as k from '../vendor/anatomy/iso-kit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const WIDTH = 320;
const HEIGHT = 196;

const PLATE = { x: -78, y: -54, w: 156, d: 108, r: 10 };
const PLATE_H = 9;
const FOOT_H = 4;

const DRUM = [-10, -2];
const DRUM_R = 36;
const DRUM_H = 22;
const BEZEL_R = 38.5;
const BEZEL_Z = DRUM_H;
const BEZEL_H = 8;
const FACE_Z = BEZEL_Z + BEZEL_H;
const HUB_R = 6.4;
const HUB_H = 5;

const BELL = [-60, -38];
const BELL_POST_TOP = 17;
const BELL_R = 8;

const SLOT = { x: 30, y: 34, w: 34, d: 6, r: 3 };
const LEVER_W = 7;
const LEVER_TRAVEL = SLOT.w - LEVER_W - 2;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [DRUM[0], DRUM[1], FACE_Z + HUB_H + 2], [BELL[0], BELL[1], BELL_POST_TOP + 12], [DRUM[0] + BEZEL_R, DRUM[1], FACE_Z], [DRUM[0], DRUM[1] - BEZEL_R, FACE_Z]],
  WIDTH,
  HEIGHT,
  { pad: 8, azimuth: 40 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

function plate() {
  const out = [];
  for (const [x, y] of byDepth(k.corners(PLATE, 16))) {
    out.push(S(k.cylinder(x, y, 6.5, -PLATE_H - FOOT_H, 1.4, P, 28), { tone: 'lo' }));
    out.push(S(k.cylinder(x, y, 5, -PLATE_H - FOOT_H + 1.4, FOOT_H - 1.4, P, 28), { tone: 'mid' }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.4), { tone: 'mid' }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: 'lo' }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(''), { tone: 'lo' }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // Ruler strip along the front edge: a tick per minute, a long one every five.
  const strip = { x: -66, y: PLATE.y + PLATE.d - 14, w: 82, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: 'lo', crease: 'none' }));
  const ticks = k.topTicks(strip.x + 3, strip.x + strip.w - 3, 2.6, 5, strip.y + 0.8, 0.6, [2, 3.8], P);
  out.push(L(ticks.minor, { tone: 'lo' }), L(ticks.major, { tone: 'mid' }));
  out.push(D([at([strip.x + 1.6, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 1.6, strip.y + 3.5, 0.6])], { size: 0.42 }));
  // Label plate, back right: three rule lines and one engraved word.
  const label = { x: 40, y: -44, w: 28, d: 16, r: 1.5 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 3, 0.3), { tone: 'mid', crease: 'none' }));
  for (const [n, y] of [label.y + 9, label.y + 11.6, label.y + 14].entries()) out.push(L(k.lineOnTop([label.x + 3, y], [label.x + label.w - 3 - n * 4, y], 0.8, P), { tone: 'faint', free: 'end' }));
  out.push(k.faceTextSvg(k.topMatrix([label.x + 3, label.y + 6.4], 0.8, P, 'x'), 'MIN', { size: 3.4, tone: 'lo' }));
  out.push(D([at([label.x + 1.6, label.y + 1.6, 0.8]), at([label.x + label.w - 1.6, label.y + 1.6, 0.8]), at([label.x + 1.6, label.y + label.d - 1.6, 0.8]), at([label.x + label.w - 1.6, label.y + label.d - 1.6, 0.8])], { size: 0.38 }));
  // The lever's slot, sunk into the plate.
  out.push(S(k.slabOf(SLOT, -0.01, 0.01, P, 6), { tone: 'lo', flat: true }));
  out.push(L(k.planOutline(SLOT, 0, P, 6), { tone: 'mid' }));
  out.push(L(k.lineOnTop([SLOT.x + 3, SLOT.y + SLOT.d / 2], [SLOT.x + SLOT.w - 3, SLOT.y + SLOT.d / 2], 0.02, P), { tone: 'faint' }));
  return out.join('');
}

function bell() {
  const out = [];
  const [x, y] = BELL;
  out.push(S(k.cylinder(x, y, 3.4, 0, 1.2, P, 20), { tone: 'mid' }));
  out.push(S(k.cylinder(x, y, 1.3, 1.2, BELL_POST_TOP - 1.2, P, 14), { tone: 'mid', crease: 'none' }));
  // The bell: a short drum with a rounded shoulder and a cap, mouth down.
  out.push(S(k.cylinder(x, y, BELL_R, BELL_POST_TOP, 5, P, 40, 0.6), { tone: 'hi' }));
  out.push(L(k.sideArc(x, y, BELL_R, BELL_POST_TOP + 1.4, P, 24), { tone: 'faint' }));
  out.push(S(k.cylinder(x, y, BELL_R - 1.6, BELL_POST_TOP + 5, 2.4, P, 36, 0.8), { tone: 'hi' }));
  out.push(S(k.cylinder(x, y, BELL_R - 4.4, BELL_POST_TOP + 7.4, 1.8, P, 28, 0.5), { tone: 'hi' }));
  out.push(S(k.cylinder(x, y, 1.6, BELL_POST_TOP + 9.2, 1.2, P, 14), { tone: 'mid' }));
  // The striker: an arm from the drum to just under the bell's lip.
  const arm = { x: x + 4, y: y + 6.6, w: 17, d: 2.4, r: 1 };
  out.push(S(k.slabOf(arm, BELL_POST_TOP - 2.2, 1.6, P, 3, 0.3), { tone: 'mid' }));
  out.push(S(k.cylinder(x + 4.6, y + 7.8, 1.5, BELL_POST_TOP - 3, 2.8, P, 14), { tone: 'mid' }));
  return out.join('');
}

function drum() {
  const out = [];
  const [x, y] = DRUM;
  out.push(S(k.cylinder(x, y, DRUM_R + 1.6, 0, 1.6, P, 72, 0.4), { tone: 'lo' }));
  out.push(S(k.cylinder(x, y, DRUM_R, 1.6, DRUM_H - 1.6, P, 72, 0.6), { tone: 'mid' }));
  out.push(L(k.sideArc(x, y, DRUM_R, 8, P, 48), { tone: 'faint' }));
  out.push(L(k.sideArc(x, y, DRUM_R, 9.6, P, 48), { tone: 'faint' }));
  // Bezel you turn to wind it: knurled round its upper band.
  out.push(S(k.cylinder(x, y, BEZEL_R, BEZEL_Z, BEZEL_H, P, 96, 0.8), { tone: 'hi', crease: 'lo' }));
  out.push(L(k.knurl(x, y, BEZEL_R, BEZEL_Z + 2.4, BEZEL_Z + BEZEL_H - 0.6, 120, P, 0.3), { tone: 'lo' }));
  out.push(L(k.sideArc(x, y, BEZEL_R, BEZEL_Z + 2.4, P, 60), { tone: 'faint' }));
  // Dial face: a ring, a minute tick for each of 60, a long tick every five.
  out.push(L(k.ring(x, y, BEZEL_R - 2.4, FACE_Z, P, 96), { tone: 'lo' }));
  const ticks = k.radialTicks(x, y, BEZEL_R - 3.6, 60, 5, FACE_Z, [1.5, 3.6], P);
  out.push(L(ticks.minor, { tone: 'lo' }), L(ticks.major, { tone: 'mid' }));
  out.push(L(k.ring(x, y, 15, FACE_Z, P, 64), { tone: 'faint' }));
  // Zero mark: the one major tick drawn in the strongest tone.
  out.push(L(k.lineOnTop([x, y - (BEZEL_R - 3.6 - 4.6)], [x, y - (BEZEL_R - 3.6)], FACE_Z, P), { tone: 'hi' }));
  return out.join('');
}

function hub() {
  const out = [];
  const [x, y] = DRUM;
  out.push(S(k.cylinder(x, y, HUB_R, FACE_Z, HUB_H, P, 40, 0.6), { tone: 'hi' }));
  out.push(L(k.knurl(x, y, HUB_R, FACE_Z + 1, FACE_Z + HUB_H - 0.4, 36, P, 0.25), { tone: 'lo' }));
  out.push(S(k.cylinder(x, y, 2.2, FACE_Z + HUB_H, 1, P, 20), { tone: 'mid' }));
  out.push(D([at([x, y, FACE_Z + HUB_H + 1])], { size: 0.55, tone: 'hi' }));
  return out.join('');
}

function lever() {
  const out = [];
  const plan = { x: SLOT.x + 1, y: SLOT.y - 0.5, w: LEVER_W, d: SLOT.d + 1, r: 1.2 };
  out.push(S(k.slabOf(plan, 0, 3.2, P, 4, 0.4), { tone: 'mid' }));
  const kx = plan.x + LEVER_W / 2;
  const ky = plan.y + plan.d / 2;
  out.push(S(k.cylinder(kx, ky, 1.2, 3.2, 3.6, P, 12), { tone: 'mid', crease: 'none' }));
  out.push(S(k.cylinder(kx, ky, 2.6, 6.8, 3.4, P, 24, 0.5), { tone: 'hi' }));
  out.push(L(k.knurl(kx, ky, 2.6, 7.4, 10, 16, P, 0.2), { tone: 'lo' }));
  return out.join('');
}

const below = plate();
const bellSvg = bell();
const drumSvg = drum();
const leverSvg = lever();
const above = hub();
const [lx, ly] = k.axisVector(P, [LEVER_TRAVEL, 0, 0]);

const ts = `// GENERATED by scripts/build-figures.mjs with the Anatomy kit (vendor/anatomy, MIT). Do not edit.
/** Kitchen timer: projection, dial geometry and the static art around the moving parts. */
export const TIMER = {
  width: ${WIDTH},
  height: ${HEIGHT},
  projection: ${JSON.stringify(P)},
  dial: { x: ${DRUM[0]}, y: ${DRUM[1]}, z: ${FACE_Z + 0.2}, tip: ${BEZEL_R - 6}, tail: ${HUB_R + 1.4} },
  /** Screen shift of the lever from "stopped" (left) to "running" (right). */
  leverShift: [${Math.round(lx * 100) / 100}, ${Math.round(ly * 100) / 100}],
  below: ${JSON.stringify(below)},
  bell: ${JSON.stringify(bellSvg)},
  drum: ${JSON.stringify(drumSvg)},
  lever: ${JSON.stringify(leverSvg)},
  above: ${JSON.stringify(above)},
} as const;
`;
await mkdir(path.join(root, 'src/ui/figures'), { recursive: true });
await writeFile(path.join(root, 'src/ui/figures/timer.ts'), ts);
console.log('timer:', Math.round(ts.length / 1024), 'KB');
await import('./build-figures-more.mjs');
