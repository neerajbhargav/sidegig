import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from '../src/shared/calculate.ts';

test('calculator uses arithmetic precedence, parentheses, unary signs and decimal precision', () => {
  assert.equal(calculate('2 + 3 * 4'), 14);
  assert.equal(calculate('(24 + 18) ÷ 3'), 14);
  assert.equal(calculate('-2 × (3 − 5)'), 4);
  assert.equal(calculate('0.1 + 0.2'), 0.3);
  assert.equal(calculate('1e3 / 4'), 250);
});
test('calculator rejects scripts, unfinished expressions, zero division and overflow', () => {
  for (const text of ['alert(1)', '2 +', '()', '2(3)', '5 / 0', '2 % 0', '1e999', '(2+3', '']) assert.throws(() => calculate(text));
});
