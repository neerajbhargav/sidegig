// One size for everything sidegig draws. The setting is a percent (80 to 140);
// the CSS reads it as --ui-s, a plain multiplier.
export const SCALE_MIN = 80;
export const SCALE_MAX = 140;
export const clampScale = (pct: number) => Math.round(Math.max(SCALE_MIN, Math.min(SCALE_MAX, Number.isFinite(pct) ? pct : 100)));
export const scaleFactor = (pct: number) => clampScale(pct) / 100;

/** Apply the size to a page (or a shadow host) and remember it for the next paint. */
export function applyScale(el: HTMLElement, pct: number) {
  el.style.setProperty('--ui-s', String(scaleFactor(pct)));
  try {
    localStorage.setItem('sidegig.uiScale', String(scaleFactor(pct)));
  } catch {
    /* fine */
  }
}
