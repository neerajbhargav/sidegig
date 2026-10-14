// The three wire formats every model speaks one of: OpenAI-style chat
// completions (OpenAI, OpenRouter, Ollama, LM Studio and most others),
// Anthropic messages, and Gemini. Each side is pure: build a request body,
// decode streamed events into Deltas. Written from the public API docs.
import type { Delta, Effort, Msg, ToolCall, TurnRequest } from './types.ts';
import type { SseEvent } from './sse.ts';

let n = 0;
export const callId = () => `call_${Date.now().toString(36)}${(n++).toString(36)}`;
const json = (s: string): Record<string, unknown> => {
  if (!s.trim()) return {};
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : { value: v };
  } catch {
    return { _unparsed: s };
  }
};
const parse = (s: string): any => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

export interface Decoder {
  feed(e: SseEvent): Delta[];
  finish(): Delta[];
}

// ------------------------------------------------------------ OpenAI-style

export type OpenAiFlavor = 'openai' | 'openrouter' | 'local';

export function openaiBody(req: TurnRequest, flavor: OpenAiFlavor): Record<string, unknown> {
  const messages: Record<string, unknown>[] = [{ role: flavor === 'openai' ? 'developer' : 'system', content: req.system }];
  for (const m of req.messages) {
    if (m.role === 'user') messages.push({ role: 'user', content: m.content });
    else if (m.role === 'assistant') {
      if (!m.content && !m.calls?.length) continue;
      const msg: Record<string, unknown> = { role: 'assistant', content: m.content || null };
      if (m.calls?.length) msg.tool_calls = m.calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } }));
      messages.push(msg);
    } else messages.push({ role: 'tool', tool_call_id: m.callId, content: m.content });
  }
  const body: Record<string, unknown> = { model: req.model, messages, stream: true };
  if (req.tools.length) body.tools = req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } }));
  if (flavor !== 'local') body.stream_options = { include_usage: true };
  if (req.effort !== 'auto') {
    if (flavor === 'openai') body.reasoning_effort = req.effort === 'off' ? 'minimal' : req.effort;
    else if (flavor === 'openrouter') body.reasoning = req.effort === 'off' ? { enabled: false } : { effort: req.effort };
  }
  return body;
}

export function openaiDecoder(): Decoder {
  const calls = new Map<number, { id: string; name: string; args: string }>();
  let stop = '';
  let usage: { input?: number; output?: number } | undefined;
  return {
    feed(e) {
      if (e.data === '[DONE]') return [];
      const j = parse(e.data);
      if (!j) return [];
      if (j.error) return [{ type: 'error', message: j.error.message ?? String(j.error) }];
      const out: Delta[] = [];
      const ch = j.choices?.[0];
      const d = ch?.delta ?? {};
      const think = d.reasoning ?? d.reasoning_content;
      if (typeof think === 'string' && think) out.push({ type: 'thinking', text: think });
      if (typeof d.content === 'string' && d.content) out.push({ type: 'text', text: d.content });
      for (const tc of d.tool_calls ?? []) {
        const i = tc.index ?? calls.size;
        const cur = calls.get(i) ?? { id: '', name: '', args: '' };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name && !cur.name) cur.name = tc.function.name;
        if (tc.function?.arguments) cur.args += tc.function.arguments;
        calls.set(i, cur);
      }
      if (ch?.finish_reason) stop = ch.finish_reason;
      if (j.usage) usage = { input: j.usage.prompt_tokens, output: j.usage.completion_tokens };
      return out;
    },
    finish() {
      const out: Delta[] = [...calls.values()].filter((c) => c.name).map((c) => ({ type: 'call', call: { id: c.id || callId(), name: c.name, args: json(c.args) } }));
      out.push({ type: 'done', stop: out.length ? 'tools' : stop === 'length' ? 'length' : 'end', usage });
      return out;
    },
  };
}

// ------------------------------------------------------------ Anthropic

/** Thinking budgets in tokens for each effort. */
export const ANTHROPIC_BUDGET: Partial<Record<Effort, number>> = { low: 2048, medium: 8192, high: 24576 };

export function anthropicBody(req: TurnRequest): Record<string, unknown> {
  const msgs: { role: 'user' | 'assistant'; content: unknown[] }[] = [];
  const push = (role: 'user' | 'assistant', blocks: unknown[]) => {
    if (!blocks.length) return;
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else msgs.push({ role, content: [...blocks] });
  };
  for (const m of req.messages) {
    if (m.role === 'user') push('user', [{ type: 'text', text: m.content || '…' }]);
    else if (m.role === 'assistant') {
      if (m.raw?.provider === 'anthropic' && Array.isArray(m.raw.data) && m.raw.data.length) push('assistant', m.raw.data);
      else {
        const blocks: unknown[] = [];
        if (m.content) blocks.push({ type: 'text', text: m.content });
        for (const c of m.calls ?? []) blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args });
        push('assistant', blocks);
      }
    } else push('user', [{ type: 'tool_result', tool_use_id: m.callId, content: m.content || '(empty)', ...(m.error ? { is_error: true } : {}) }]);
  }
  const body: Record<string, unknown> = { model: req.model, max_tokens: 8192, system: req.system, messages: msgs, stream: true };
  if (req.tools.length) body.tools = req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema }));
  const budget = ANTHROPIC_BUDGET[req.effort];
  if (budget) {
    body.thinking = { type: 'enabled', budget_tokens: budget };
    body.max_tokens = budget + 8192;
  }
  return body;
}

export function anthropicDecoder(): Decoder {
  const blocks: Record<string, any>[] = [];
  let stop = '';
  const usage: { input?: number; output?: number } = {};
  return {
    feed(e) {
      const j = parse(e.data);
      if (!j) return [];
      const out: Delta[] = [];
      switch (j.type) {
        case 'message_start':
          usage.input = j.message?.usage?.input_tokens;
          break;
        case 'content_block_start': {
          const b = { ...j.content_block };
          if (b.type === 'tool_use') b._json = '';
          if (b.type === 'text') b.text = b.text ?? '';
          if (b.type === 'thinking') b.thinking = b.thinking ?? '';
          blocks[j.index] = b;
          break;
        }
        case 'content_block_delta': {
          const b = blocks[j.index];
          const d = j.delta ?? {};
          if (!b) break;
          if (d.type === 'text_delta') {
            b.text += d.text;
            out.push({ type: 'text', text: d.text });
          } else if (d.type === 'thinking_delta') {
            b.thinking += d.thinking;
            out.push({ type: 'thinking', text: d.thinking });
          } else if (d.type === 'signature_delta') b.signature = (b.signature ?? '') + d.signature;
          else if (d.type === 'input_json_delta') b._json += d.partial_json;
          break;
        }
        case 'content_block_stop': {
          const b = blocks[j.index];
          if (b?.type === 'tool_use') {
            b.input = json(b._json ?? '');
            delete b._json;
            out.push({ type: 'call', call: { id: b.id, name: b.name, args: b.input } });
          }
          break;
        }
        case 'message_delta':
          if (j.delta?.stop_reason) stop = j.delta.stop_reason;
          if (j.usage?.output_tokens) usage.output = j.usage.output_tokens;
          break;
        case 'error':
          out.push({ type: 'error', message: j.error?.message ?? 'The model stopped with an error' });
          break;
      }
      return out;
    },
    finish() {
      const raw = blocks.filter(Boolean).map((b) => {
        const { _json, ...rest } = b;
        return rest;
      });
      return [
        { type: 'raw', data: raw.filter((b) => !(b.type === 'text' && !b.text)) },
        { type: 'done', stop: stop === 'tool_use' ? 'tools' : stop === 'max_tokens' ? 'length' : 'end', usage },
      ];
    },
  };
}

// ------------------------------------------------------------ Gemini

const GEMINI_SCHEMA_KEYS = new Set(['type', 'format', 'description', 'nullable', 'enum', 'properties', 'required', 'items', 'minItems', 'maxItems', 'minimum', 'maximum', 'anyOf', 'propertyOrdering']);
/** Gemini takes an OpenAPI subset of JSON Schema: keep what it understands. */
export function geminiSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(geminiSchema);
  if (!s || typeof s !== 'object') return s;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
    if (!GEMINI_SCHEMA_KEYS.has(k)) continue;
    if (k === 'type' && Array.isArray(v)) {
      const t = v.filter((x) => x !== 'null');
      out.type = t[0] ?? 'string';
      if (v.includes('null')) out.nullable = true;
    } else if (k === 'properties' && v && typeof v === 'object') {
      out.properties = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [pk, geminiSchema(pv)]));
    } else out[k] = k === 'items' || k === 'anyOf' ? geminiSchema(v) : v;
  }
  return out;
}

export const GEMINI_BUDGET: Partial<Record<Effort, number>> = { off: 0, low: 1024, medium: 8192, high: 24576 };

export function geminiBody(req: TurnRequest): Record<string, unknown> {
  const contents: { role: 'user' | 'model'; parts: unknown[] }[] = [];
  const push = (role: 'user' | 'model', parts: unknown[]) => {
    if (!parts.length) return;
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(...parts);
    else contents.push({ role, parts: [...parts] });
  };
  for (const m of req.messages) {
    if (m.role === 'user') push('user', [{ text: m.content || '…' }]);
    else if (m.role === 'assistant') {
      if (m.raw?.provider === 'google' && Array.isArray(m.raw.data) && m.raw.data.length) push('model', m.raw.data);
      else {
        const parts: unknown[] = [];
        if (m.content) parts.push({ text: m.content });
        for (const c of m.calls ?? []) parts.push({ functionCall: { name: c.name, args: c.args } });
        push('model', parts);
      }
    } else push('user', [{ functionResponse: { name: m.name ?? 'tool', response: m.error ? { error: m.content } : { result: m.content } } }]);
  }
  const body: Record<string, unknown> = { contents, systemInstruction: { parts: [{ text: req.system }] } };
  if (req.tools.length) body.tools = [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parameters: geminiSchema(t.schema) })) }];
  const thinking: Record<string, unknown> = { includeThoughts: true };
  if (req.effort !== 'auto') {
    if (/gemini-3/.test(req.model)) thinking.thinkingLevel = req.effort === 'high' || req.effort === 'medium' ? 'high' : 'low';
    else thinking.thinkingBudget = GEMINI_BUDGET[req.effort];
  }
  body.generationConfig = { thinkingConfig: thinking };
  return body;
}

export function geminiDecoder(): Decoder {
  const raw: Record<string, any>[] = [];
  let stop = '';
  let usage: { input?: number; output?: number } | undefined;
  let called = false;
  return {
    feed(e) {
      const j = parse(e.data);
      if (!j) return [];
      if (j.error) return [{ type: 'error', message: j.error.message ?? 'The model stopped with an error' }];
      const out: Delta[] = [];
      const cand = j.candidates?.[0];
      for (const p of cand?.content?.parts ?? []) {
        if (p.functionCall) {
          called = true;
          const call: ToolCall = { id: p.functionCall.id ?? callId(), name: p.functionCall.name, args: p.functionCall.args ?? {} };
          out.push({ type: 'call', call });
          raw.push(p);
        } else if (typeof p.text === 'string') {
          if (p.thought) {
            out.push({ type: 'thinking', text: p.text });
            if (p.thoughtSignature) raw.push({ thought: true, text: '', thoughtSignature: p.thoughtSignature });
            continue;
          }
          out.push({ type: 'text', text: p.text });
          const last = raw[raw.length - 1];
          if (last && typeof last.text === 'string' && !last.thought && !last.thoughtSignature && !p.thoughtSignature) last.text += p.text;
          else raw.push({ ...p });
        } else if (p.thoughtSignature) raw.push(p);
      }
      if (cand?.finishReason) stop = cand.finishReason;
      if (j.usageMetadata) usage = { input: j.usageMetadata.promptTokenCount, output: j.usageMetadata.candidatesTokenCount };
      return out;
    },
    finish() {
      return [
        { type: 'raw', data: raw.filter((p) => !(p.thought && !p.thoughtSignature)) },
        { type: 'done', stop: called ? 'tools' : stop === 'MAX_TOKENS' ? 'length' : 'end', usage },
      ];
    },
  };
}

/** Assistant text that isn't empty, for the next request. */
export const visible = (m: Msg) => m.content.trim().length > 0 || (m.calls?.length ?? 0) > 0;
