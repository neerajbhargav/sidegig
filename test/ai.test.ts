import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SseParser } from '../src/shared/ai/sse.ts';
import { anthropicBody, anthropicDecoder, geminiBody, geminiDecoder, geminiSchema, openaiBody, openaiDecoder, type Decoder } from '../src/shared/ai/wire.ts';
import type { Delta, TurnRequest } from '../src/shared/ai/types.ts';

const run = (d: Decoder, events: string[]): Delta[] => {
  const p = new SseParser();
  const out: Delta[] = [];
  for (const e of p.push(events.join(''))) out.push(...d.feed(e));
  for (const e of p.end()) out.push(...d.feed(e));
  out.push(...d.finish());
  return out;
};
const text = (ds: Delta[]) => ds.filter((d) => d.type === 'text').map((d) => (d as { text: string }).text).join('');
const sse = (o: unknown, event?: string) => `${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(o)}\n\n`;

test('SSE parser: split chunks, comments, CRLF, multi-line data', () => {
  const p = new SseParser();
  assert.deepEqual(p.push('event: a\r\nda'), []);
  assert.deepEqual(p.push('ta: 1\r\n: ping\r\ndata: 2\r\n\r\n'), [{ event: 'a', data: '1\n2' }]);
  assert.deepEqual(p.push('data: x'), []);
  assert.deepEqual(p.end(), [{ event: 'message', data: 'x' }]);
});

const REQ: TurnRequest = {
  model: 'm',
  system: 'Be brief.',
  effort: 'high',
  tools: [{ name: 'read_tab', description: 'Read a tab', schema: { type: 'object', properties: { tabId: { type: ['integer', 'null'] } }, additionalProperties: false } }],
  messages: [
    { role: 'user', content: 'What is on this page?' },
    { role: 'assistant', content: '', calls: [{ id: 'c1', name: 'read_tab', args: {} }] },
    { role: 'tool', callId: 'c1', name: 'read_tab', content: 'A recipe for bread.' },
  ],
};

test('OpenAI-style: request carries tools, results and effort; stream decodes text and split tool calls', () => {
  const b = openaiBody(REQ, 'openai') as any;
  assert.equal(b.reasoning_effort, 'high');
  assert.equal(b.messages[0].role, 'developer');
  assert.equal(b.messages[2].tool_calls[0].function.name, 'read_tab');
  assert.equal(b.messages[3].role, 'tool');
  assert.deepEqual((openaiBody(REQ, 'openrouter') as any).reasoning, { effort: 'high' });
  assert.equal((openaiBody({ ...REQ, effort: 'auto' }, 'local') as any).reasoning_effort, undefined);
  const out = run(openaiDecoder(), [
    sse({ choices: [{ delta: { reasoning: 'Thinking…' } }] }),
    sse({ choices: [{ delta: { content: 'It is ' } }] }),
    sse({ choices: [{ delta: { content: 'bread.' } }] }),
    sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'open_url', arguments: '{"url":' } }] } }] }),
    sse({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"https://a.b"}' } }] }, finish_reason: 'tool_calls' }] }),
    sse({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
    'data: [DONE]\n\n',
  ]);
  assert.equal(text(out), 'It is bread.');
  assert.deepEqual(out.find((d) => d.type === 'call'), { type: 'call', call: { id: 'call_1', name: 'open_url', args: { url: 'https://a.b' } } });
  assert.deepEqual(out.at(-1), { type: 'done', stop: 'tools', usage: { input: 10, output: 5 } });
});

test('Anthropic: thinking budget, tool_use/tool_result blocks; stream keeps signatures for the next turn', () => {
  const b = anthropicBody(REQ) as any;
  assert.deepEqual(b.thinking, { type: 'enabled', budget_tokens: 24576 });
  assert.ok(b.max_tokens > 24576);
  assert.equal(b.messages[1].content[0].type, 'tool_use');
  assert.equal(b.messages[2].content[0].type, 'tool_result');
  const out = run(anthropicDecoder(), [
    sse({ type: 'message_start', message: { usage: { input_tokens: 12 } } }, 'message_start'),
    sse({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } }),
    sse({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Hmm.' } }),
    sse({ type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'SIG' } }),
    sse({ type: 'content_block_stop', index: 0 }),
    sse({ type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }),
    sse({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Let me look.' } }),
    sse({ type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'tu_1', name: 'read_tab', input: {} } }),
    sse({ type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"tabId":' } }),
    sse({ type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '4}' } }),
    sse({ type: 'content_block_stop', index: 2 }),
    sse({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 30 } }),
  ]);
  assert.equal(text(out), 'Let me look.');
  assert.deepEqual((out.find((d) => d.type === 'call') as any).call, { id: 'tu_1', name: 'read_tab', args: { tabId: 4 } });
  const raw = (out.find((d) => d.type === 'raw') as any).data;
  assert.deepEqual(raw[0], { type: 'thinking', thinking: 'Hmm.', signature: 'SIG' });
  assert.equal(raw[2].input.tabId, 4);
  assert.equal((out.at(-1) as any).stop, 'tools');
});

test('Gemini: schema trimmed to what it accepts, thinking config by model, function calls and signatures', () => {
  assert.deepEqual(geminiSchema(REQ.tools[0].schema), { type: 'object', properties: { tabId: { type: 'integer', nullable: true } } });
  const b = geminiBody(REQ) as any;
  assert.equal(b.generationConfig.thinkingConfig.thinkingBudget, 24576);
  assert.equal((geminiBody({ ...REQ, model: 'gemini-3-pro' }) as any).generationConfig.thinkingConfig.thinkingLevel, 'high');
  assert.equal(b.contents[1].role, 'model');
  assert.ok(b.contents[2].parts[0].functionResponse);
  const out = run(geminiDecoder(), [
    sse({ candidates: [{ content: { role: 'model', parts: [{ text: 'Planning', thought: true }] } }] }),
    sse({ candidates: [{ content: { role: 'model', parts: [{ text: 'Bread ' }] } }] }),
    sse({ candidates: [{ content: { role: 'model', parts: [{ text: 'recipe.' }] } }] }),
    sse({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'open_url', args: { url: 'https://x.y' } }, thoughtSignature: 'TS' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4 } }),
  ]);
  assert.equal(text(out), 'Bread recipe.');
  assert.equal((out.find((d) => d.type === 'thinking') as any).text, 'Planning');
  const raw = (out.find((d) => d.type === 'raw') as any).data;
  assert.deepEqual(raw[0], { text: 'Bread recipe.' });
  assert.equal(raw[1].thoughtSignature, 'TS');
  assert.equal((out.at(-1) as any).stop, 'tools');
});

import { md, inline } from '../src/shared/ai/md.ts';

test('Markdown: escapes HTML, allows only http(s) links, renders code, lists, tables, quotes', () => {
  assert.equal(md('<img src=x onerror=alert(1)>'), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  assert.ok(!md('[x](javascript:alert(1))').includes('href'));
  assert.ok(md('see [docs](https://a.b/c?d=1&e=2)').includes('href="https://a.b/c?d=1&amp;e=2"'));
  assert.ok(md('go to https://example.com.').includes('<a href="https://example.com"'));
  assert.equal(inline('**bold** and *it* and `<b>`'), '<strong>bold</strong> and <em>it</em> and <code>&lt;b&gt;</code>');
  assert.equal(md('```js\nconst a = "<x>";\n```'), '<pre><code data-lang="js">const a = &quot;&lt;x&gt;&quot;;</code></pre>');
  // Still streaming: the fence isn't closed yet.
  assert.ok(md('```py\nprint(1)').startsWith('<pre><code data-lang="py">print(1)'));
  assert.equal(md('- a\n- b\n  - c\n- d'), '<ul><li>a</li><li>b<ul><li>c</li></ul></li><li>d</li></ul>');
  assert.equal(md('3. x\n4. y'), '<ol start="3"><li>x</li><li>y</li></ol>');
  assert.ok(md('| a | b |\n|---|:-:|\n| 1 | 2 |').includes('<th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td>'));
  assert.equal(md('> quoted\n\n# Title\ntext\nmore'), '<blockquote><p>quoted</p></blockquote><h3>Title</h3><p>text<br>more</p>');
  assert.equal(md('snake_case_name stays'), '<p>snake_case_name stays</p>');
});
