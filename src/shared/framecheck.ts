// Frame checks in minified site code, rewritten to "not in a frame" (used by
// content/framefit.ts inside sidegig's own app frames only).

/** Frame checks in minified code, rewritten to "not in a frame". Never after a "." (so x.top stays). */
const CHECKS: [RegExp, string][] = [
  [/(?<![\w$.])window\s*!==?\s*(?:window\.)?top\s*\|\|\s*window\.frameElement(?![\w$])/g, '!1'],
  [/(?<![\w$.])(?:window\.)?(?:self|window)\s*!==?\s*(?:window\.)?top(?![\w$.])/g, '!1'],
  [/(?<![\w$.])(?:window\.)?top\s*!==?\s*(?:window\.)?(?:self|window)(?![\w$.])/g, '!1'],
  [/(?<![\w$.])(?:window\.)?(?:self|window)\s*===?\s*(?:window\.)?top(?![\w$.])/g, '!0'],
  [/(?<![\w$.])(?:window\.)?top\s*===?\s*(?:window\.)?(?:self|window)(?![\w$.])/g, '!0'],
];

export function rewriteFrameChecks(code: string): string {
  let out = code;
  for (const [re, to] of CHECKS) out = out.replace(re, to);
  return out;
}

/** Sites whose own scripts sidegig loads rewritten with rewriteTopRefs (content/framefit*.ts). */
// ponytail: Gmail only; add a host when another app breaks on `top` the same way.
export const TOP_REWRITE_HOSTS = new Set(['mail.google.com']);

/**
 * Bare `top` used as a value becomes `self`. Gmail is written for a top-level
 * page and uses `top` as its own window (listeners, `top.document`, `top.js`);
 * inside sidegig `top` is the cross-origin panel, and the first such use throws.
 * Skips `x.top`, `{top:0}` and `a?top:b`. Text in strings is skipped only when it
 * doesn't look like code: "left,top,width" would change (none in Gmail's modules today).
 */
const TOP_REF = /(?<=[\n(,=!&|?:;{}[]|\b(?:in|delete|typeof|return|void) )top(?=[.[,)&|;}?]|[!=]=)/g;

/**
 * `a.b.top` read (not written or called): `__sidegigTop(a.b)`, which framefit-main.ts
 * defines as "the app's window if a.b is the app's window, else a.b.top". Gmail
 * reads `win.top` on its own window; rects and styles use `.top` too, so the
 * check happens at run time. Shapes it can't see whole (`f(x).top`, `a[0].top`) stay.
 */
const MEMBER_TOP = /(?<![\w$.\])"'`])((?:[\w$]+\.)*[\w$]+)\.top(?![\w$])(?!\s*(?:\(|(?:[-+*/%&|^]|\*\*|<<|>>>?|&&|\|\||\?\?)?=(?!=)|\+\+|--))/g;

export const rewriteTopRefs = (code: string): string => code.replace(TOP_REF, 'self').replace(MEMBER_TOP, '__sidegigTop($1)');
