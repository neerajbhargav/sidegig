// Finds CSS selectors that can never match, because a class they need is never
// produced by sidegig's own code (src/**/*.ts, *.js, *.html). `--fix` removes them.
//
//   node scripts/css-check.mjs          list dead selectors (exit 1 if any)
//   node scripts/css-check.mjs --fix    remove them from src/ui/ui.css and src/content/rail.css
//
// A class counts as produced when its name appears as a whole word anywhere in the
// source, or starts with a prefix the code builds from a template (`cv-${where}`).
// Classes inside :is(), :where(), :not() and :has() are not checked (an alternative
// or a negation can match without them), so the check errs on the side of keeping.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const CSS_FILES = ['src/ui/ui.css', 'src/content/rail.css'];
/** Class prefixes the code completes at run time (`cv-${where}`, `wall-${id}`, …). */
export const DYNAMIC = ['ctx-', 'cv-', 'feed-', 'fx-', 'wall-', 'sidegig-'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|js|mjs|html)$/.test(name)) out.push(p);
  }
  return out;
}

/** Every word-like token in sidegig's own code. */
export function producedWords(root = ROOT) {
  const words = new Set();
  for (const f of walk(join(root, 'src'))) for (const w of readFileSync(f, 'utf8').match(/[A-Za-z0-9_-]+/g) ?? []) words.add(w);
  return words;
}

/** Comments replaced by spaces, so offsets still point into the original text. */
const blankComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

/** Style rules (selector list + block), recursing into @media, @supports, @container and @layer. */
export function rules(css) {
  const src = blankComments(css);
  const out = [];
  const scan = (from, to) => {
    let i = from;
    while (i < to) {
      const open = src.indexOf('{', i);
      if (open < 0 || open >= to) return;
      const prelude = src.slice(i, open);
      let depth = 1;
      let j = open + 1;
      while (j < to && depth) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') depth--;
        j++;
      }
      const head = prelude.trim();
      const lead = i + prelude.indexOf(head);
      if (/^@(media|supports|container|layer)\b/.test(head)) out.push({ at: true, start: lead, open, end: j }), scan(open + 1, j - 1);
      else if (!head.startsWith('@')) out.push({ at: false, start: lead, open, end: j, selector: head });
      i = j;
    }
  };
  scan(0, src.length);
  return out;
}

/** Split a selector list on top-level commas (not the ones inside :is(…)). */
export function splitList(sel) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of sel) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) parts.push(cur.trim()), (cur = '');
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/** Classes one selector needs (outside functional pseudo-classes). */
export function neededClasses(sel) {
  let s = sel;
  // Drop :is(), :where(), :not(), :has() and their contents, innermost first.
  for (let k = 0; k < 10 && /:(is|where|not|has)\(/.test(s); k++) s = s.replace(/:(is|where|not|has)\(([^()]*)\)/g, '');
  return [...s.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]);
}

export function isProduced(cls, words) {
  return words.has(cls) || DYNAMIC.some((p) => cls.startsWith(p));
}

/** Dead selectors in one stylesheet, with their line numbers. */
export function deadSelectors(css, words) {
  const dead = [];
  for (const r of rules(css)) {
    if (r.at) continue;
    for (const s of splitList(r.selector)) {
      const missing = neededClasses(s).filter((c) => !isProduced(c, words));
      if (missing.length) dead.push({ line: css.slice(0, r.start).split('\n').length, selector: s, missing });
    }
  }
  return dead;
}

/** The stylesheet without dead selectors; rules and at-blocks left empty are removed too. */
export function withoutDead(css, words) {
  let out = css;
  // Work from the end so earlier offsets stay valid.
  for (const r of rules(css).filter((x) => !x.at).sort((a, b) => b.start - a.start)) {
    const keep = splitList(r.selector).filter((s) => neededClasses(s).every((c) => isProduced(c, words)));
    if (keep.length === splitList(r.selector).length) continue;
    if (keep.length) out = out.slice(0, r.start) + keep.join(', ') + ' ' + out.slice(r.open);
    else {
      // Remove the whole rule, and the line break after it when it stood alone.
      let end = r.end;
      if (out[end] === '\n' && (r.start === 0 || out[r.start - 1] === '\n')) end++;
      out = out.slice(0, r.start) + out.slice(end);
    }
  }
  // At-blocks that no longer hold any rule.
  let again = true;
  while (again) {
    again = false;
    for (const r of rules(out).filter((x) => x.at).sort((a, b) => b.start - a.start)) {
      if (blankComments(out.slice(r.open + 1, r.end - 1)).trim()) continue;
      let end = r.end;
      if (out[end] === '\n' && (r.start === 0 || out[r.start - 1] === '\n')) end++;
      out = out.slice(0, r.start) + out.slice(end);
      again = true;
      break;
    }
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const words = producedWords();
  const fix = process.argv.includes('--fix');
  let total = 0;
  for (const f of CSS_FILES) {
    const path = join(ROOT, f);
    const css = readFileSync(path, 'utf8');
    const dead = deadSelectors(css, words);
    total += dead.length;
    for (const d of dead) console.log(`${relative(ROOT, path)}:${d.line}  ${d.selector}  (never produced: ${d.missing.join(', ')})`);
    if (fix && dead.length) {
      const next = withoutDead(css, words);
      writeFileSync(path, next);
      console.log(`${f}: removed ${dead.length} selectors, ${css.split('\n').length - next.split('\n').length} lines`);
    }
  }
  if (!fix && total) process.exit(1);
}
