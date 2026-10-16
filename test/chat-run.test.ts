import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ModelInfo } from '../src/shared/ai/types.ts';

(globalThis as any).chrome = { storage: { local: { get: async () => ({ aiKeys: { local: 'http://fixture.invalid' } }) } } };
const { runChat } = await import('../src/shared/ai/run.ts');
const model: ModelInfo = { provider: 'local', id: 'fixture', label: 'Fixture', tools: true, efforts: [] };

test('stopping chat prevents remaining tools and leaves a result for every tool call', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response([
    `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [
      { index: 0, id: 'first', function: { name: 'read', arguments: '{}' } },
      { index: 1, id: 'second', function: { name: 'read', arguments: '{}' } },
    ] } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] })}\n\n`,
    'data: [DONE]\n\n',
  ].join(''), { headers: { 'content-type': 'text/event-stream' } });
  try {
    for (const stopAt of ['message', 'tool']) {
      const ctrl = new AbortController();
      const executed: string[] = [];
      const added = await runChat({ model, effort: 'auto', system: '', history: [{ role: 'user', content: 'Read the fixture' }], signal: ctrl.signal,
        tools: { defs: [{ name: 'read', description: 'Read a fixture', schema: { type: 'object' } }], describe: () => 'Read', run: async (call, signal) => {
          assert.equal(signal, ctrl.signal);
          executed.push(call.id);
          ctrl.abort();
          return { content: 'First result' };
        } },
        on: (event) => { if (stopAt === 'message' && event.type === 'message') ctrl.abort(); },
      });
      assert.deepEqual(executed, stopAt === 'message' ? [] : ['first']);
      assert.deepEqual(added.filter((m) => m.role === 'tool').map((m) => m.callId), ['first', 'second']);
      const last = added.at(-1)!;
      assert.equal(last.error, true);
      assert.match(last.content, /Stopped before this tool ran/);
    }
  } finally { globalThis.fetch = originalFetch; }
});
