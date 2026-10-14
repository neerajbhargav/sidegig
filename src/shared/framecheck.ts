// Frame checks in minified site code, rewritten to "not in a frame" (used by
// content/framefit.ts inside sidegig's own app frames only).

/** Frame checks in minified code, rewritten to "not in a frame". Never after a "." (so x.top stays). */
const CHECKS: [RegExp, string][] = [
  [/(?<![\w$.])window\s*!==?\s*(?:window\.)?top\s*\|\|\s*window\.frameElement(?![\w$])/g, '!1'],
  [/(?<![\w$.])(?:window\.)?(?:self|window)\s*!==?\s*(?:window\.)?top(?![\w$])/g, '!1'],
  [/(?<![\w$.])(?:window\.)?top\s*!==?\s*(?:window\.)?(?:self|window)(?![\w$.])/g, '!1'],
  [/(?<![\w$.])(?:window\.)?(?:self|window)\s*===?\s*(?:window\.)?top(?![\w$])/g, '!0'],
  [/(?<![\w$.])(?:window\.)?top\s*===?\s*(?:window\.)?(?:self|window)(?![\w$.])/g, '!0'],
];

export function rewriteFrameChecks(code: string): string {
  let out = code;
  for (const [re, to] of CHECKS) out = out.replace(re, to);
  return out;
}

