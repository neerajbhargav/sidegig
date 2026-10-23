import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refusal, ACTIONS, READS } from '../src/background/agent.ts';

test('agent access: off refuses everything, read refuses actions, full allows both', () => {
  for (const t of [...READS, ...ACTIONS]) assert.match(refusal(t, 'off'), /off/, t);
  for (const t of READS) assert.equal(refusal(t, 'read'), '', t);
  for (const t of ACTIONS) assert.match(refusal(t, 'read'), /read-only/, t);
  for (const t of [...READS, ...ACTIONS]) assert.equal(refusal(t, 'full'), '', t);
  assert.match(refusal('browser_eval', 'full'), /no tool/, 'unknown tools are refused even with full access');
});

test('the agent gate covers every tool the bridge offers', async () => {
  const src = (await import('node:fs')).readFileSync('bridge/sidegig-bridge.mjs', 'utf8');
  const offered = [...src.matchAll(/name: '(browser_\w+)'/g)].map((m) => m[1]);
  assert.ok(offered.length >= 10);
  for (const name of offered) assert.ok(READS.has(name) || ACTIONS.has(name), `${name} has an access rule`);
});
