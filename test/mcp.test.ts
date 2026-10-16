import { test } from 'node:test';
import assert from 'node:assert/strict';

(globalThis as any).chrome = { storage: { local: { get: async () => ({}), set: async () => {} } } };
const { mcpTools } = await import('../src/shared/ai/mcp.ts');

test('cached MCP tools use the current chat turn signal after an earlier turn was stopped', async () => {
  const originalFetch = globalThis.fetch;
  const signals: (AbortSignal | null | undefined)[] = [];
  globalThis.fetch = async (_input, options) => {
    options?.signal?.throwIfAborted();
    signals.push(options?.signal);
    const msg = JSON.parse(String(options?.body));
    const result = msg.method === 'initialize' ? {} : msg.method === 'tools/list'
      ? { tools: [{ name: 'read', description: 'Read a fixture', inputSchema: { type: 'object' } }] }
      : { content: [{ type: 'text', text: 'Fixture result' }] };
    return Response.json({ jsonrpc: '2.0', id: msg.id, result });
  };
  try {
    const first = new AbortController();
    const { set } = await mcpTools([{ id: 'fixture', name: 'Fixture', url: 'https://fixture.invalid/mcp', enabled: true }], first.signal);
    assert.equal(set.defs.length, 1);
    first.abort();
    const current = new AbortController();
    const result = await set.run({ id: 'call-1', name: set.defs[0].name, args: {} }, current.signal);
    assert.equal(result.content, 'Fixture result');
    assert.equal(result.error, false);
    assert.equal(signals.at(-1), current.signal);
  } finally { globalThis.fetch = originalFetch; }
});
