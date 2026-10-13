// Geometry for docking: given a fixed-position element's box, how far to move
// it (and whether to narrow it) so it stays clear of the rail. Pure functions,
// so they can be unit tested without a browser.

export type DockSide = 'left' | 'right';
export interface Box { left: number; right: number; width: number }
export interface Fix { tx: number; maxWidth: number | null }

const EPS = 0.5;

/** Does this box overlap the strip the rail occupies? */
export function intrudes(r: Box, vw: number, w: number, side: DockSide): boolean {
  if (r.width <= 0) return false;
  if (r.right <= EPS || r.left >= vw - EPS) return false; // off screen
  return side === 'left' ? r.left < w - EPS : r.right > vw - w + EPS;
}

/**
 * First guess, made from the element's natural box.
 * Left rail: page content moves right by w, so fixed things move right by w
 * too, and anything that would then spill past the right edge gets narrowed.
 * Right rail: page content stays; things touching the right edge move left,
 * and full-width things get narrowed instead.
 */
export function firstGuess(r: Box, vw: number, w: number, side: DockSide): Fix {
  if (side === 'left') {
    const spill = r.right + w > vw + EPS;
    return { tx: w, maxWidth: spill ? Math.max(0, vw - w - Math.max(0, r.left)) : null };
  }
  const narrow = r.left - w >= -EPS;
  if (narrow) return { tx: -w, maxWidth: null };
  return { tx: 0, maxWidth: Math.max(0, vw - w - Math.max(0, r.left)) };
}

/** Second pass: measure where the element actually landed and nudge it into place. */
export function correct(after: Box, vw: number, w: number, side: DockSide, tx: number): number {
  let next = tx;
  if (side === 'left') {
    if (after.left < w - EPS) next += w - after.left;
    else if (after.right > vw + EPS) next -= Math.min(after.right - vw, after.left - w);
  } else {
    if (after.right > vw - w + EPS) next -= after.right - (vw - w);
    else if (after.left < -EPS) next += Math.min(-after.left, vw - w - after.right);
  }
  return Math.round(next * 100) / 100;
}
