// The sign-in code detector on its labeled corpus. Thresholds are the measured
// values recorded in docs/evals/mail-codes-*.json; a change that scores lower fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCodeRows, metrics, scoreRow } from '../scripts/eval-mail-codes.ts';

test('the corpus is labeled and large enough', () => {
  const rows = loadCodeRows();
  assert.ok(rows.length >= 300, `n = ${rows.length}`);
  assert.ok(rows.filter((r) => r.code).length >= 150 && rows.filter((r) => !r.code).length >= 100);
  for (const r of rows) if (r.code) assert.ok(`${r.subject}\n${r.snippet}`.replace(/[\s-]/g, '').includes(r.code.replace(/[\s-]/g, '')), `${r.id}: the label appears in the mail`);
});

test('findCode keeps its measured precision and recall on the corpus', () => {
  const m = metrics(loadCodeRows().map((r) => scoreRow(r)));
  assert.ok(m.precision >= 1, `precision ${m.precision}`);
  assert.ok(m.recall >= 1, `recall ${m.recall}`);
});
