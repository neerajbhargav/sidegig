import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// @ts-expect-error: plain JS module shared with the CLI (node scripts/css-check.mjs --fix)
import { CSS_FILES, deadSelectors, neededClasses, producedWords, splitList, withoutDead } from '../scripts/css-check.mjs';

test('every CSS selector can match: its classes are produced by sidegig’s own code', () => {
  const words = producedWords();
  for (const f of CSS_FILES) {
    const dead = deadSelectors(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), words);
    assert.deepEqual(dead.map((d: { line: number; selector: string }) => `${f}:${d.line} ${d.selector}`), [], 'remove them with: node scripts/css-check.mjs --fix');
  }
});

test('the checker keeps alternatives and negations, and drops only dead selectors', () => {
  assert.deepEqual(splitList('.a, :is(.b, .c) .d'), ['.a', ':is(.b, .c) .d']);
  assert.deepEqual(neededClasses('.a:not(.gone) :is(.x, .y) > .b'), ['a', 'b']);
  const words = new Set(['a', 'b']);
  const css = '.a, .gone { color: red; }\n.gone { color: blue; }\n@media (x) {\n.gone { top: 0; }\n}\n.b { left: 0; }\n';
  assert.equal(withoutDead(css, words), '.a { color: red; }\n.b { left: 0; }\n');
});
