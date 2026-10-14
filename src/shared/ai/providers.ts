// Who serves the models: your own keys (kept on this device, never synced),
// OpenRouter, a model on your computer, the browser's own, or your ChatGPT
// subscription through the Codex app (via the sidegig bridge).
import { getLocal, setLocal } from '../storage.ts';
import { sseEvents } from './sse.ts';
import { anthropicBody, anthropicDecoder, geminiBody, geminiDecoder, openaiBody, openaiDecoder, type Decoder, type OpenAiFlavor } from './wire.ts';
import type { Delta, Effort, ModelInfo, ProviderId, TurnRequest } from './types.ts';
import { codexModels, codexTurn } from './bridge.ts';

export interface Keys {
  openai?: string;
  anthropic?: string;
  google?: string;
  openrouter?: string;
  /** Base address of a model server on this computer (Ollama, LM Studio). */
  local?: string;
  /** "1" when you've turned on your ChatGPT subscription (through the bridge). */
  codex?: string;
}
const KEYS = 'aiKeys';
export const getKeys = () => getLocal<Keys>(KEYS, {});
export async function setKeys(change: Partial<Keys>) {
  const k = { ...(await getKeys()), ...change };
  for (const [p, v] of Object.entries(k)) if (v === '' || v === undefined) delete (k as Record<string, unknown>)[p];
  await setLocal(KEYS, k);
  await setLocal(MODELS, {});
}

export interface ProviderMeta {
  name: string;
  /** One line under the name. */
  note: string;
  /** Where to make a key. */
  keyUrl?: string;
  keyHint?: string;
}
export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  openai: { name: 'OpenAI', note: 'GPT models, with your OpenAI API key', keyUrl: 'https://platform.openai.com/api-keys', keyHint: 'sk-…' },
  anthropic: { name: 'Anthropic', note: 'Claude models, with your Anthropic API key', keyUrl: 'https://console.anthropic.com/settings/keys', keyHint: 'sk-ant-…' },
  google: { name: 'Google', note: 'Gemini models, with a Google AI Studio key', keyUrl: 'https://aistudio.google.com/apikey', keyHint: 'AIza…' },
  openrouter: { name: 'OpenRouter', note: 'One sign-in for hundreds of models', keyUrl: 'https://openrouter.ai/keys', keyHint: 'sk-or-…' },
  local: { name: 'On this computer', note: 'Ollama, LM Studio or any OpenAI-compatible server' },
  builtin: { name: 'This browser', note: 'The browser’s own model: free, private, on this device' },
  codex: { name: 'ChatGPT subscription', note: 'Your ChatGPT plan, through the Codex app and the sidegig bridge' },
};
export const DEFAULT_LOCAL = 'http://localhost:11434';

// ------------------------------------------------------------ model lists

const MODELS = 'aiModels';
type ModelCache = Partial<Record<ProviderId, { at: number; models: ModelInfo[] }>>;
const DAY = 86_400_000;

const getJson = async (url: string, headers: Record<string, string> = {}) => {
  const r = await fetch(url, { headers, credentials: 'omit' });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};
const anthropicHeaders = (key: string) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' });
const ALL: Effort[] = ['off', 'low', 'medium', 'high'];
const THINKS: Effort[] = ['low', 'medium', 'high'];

/** The browser's own model, when it has one (Chrome's Prompt API). */
export async function builtinState(): Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'> {
  const LM = (globalThis as { LanguageModel?: { availability: () => Promise<string> } }).LanguageModel;
  if (!LM) return 'unavailable';
  try {
    return (await LM.availability()) as 'available';
  } catch {
    return 'unavailable';
  }
}

async function fetchModels(p: ProviderId, k: Keys): Promise<ModelInfo[]> {
  switch (p) {
    case 'openai': {
      if (!k.openai) return [];
      const j = await getJson('https://api.openai.com/v1/models', { Authorization: `Bearer ${k.openai}` });
      return (j.data as { id: string }[])
        .map((m) => m.id)
        .filter((id) => /^(gpt-|o\d|chatgpt-)/.test(id) && !/(audio|realtime|tts|transcribe|image|search|embedding|instruct|moderation|dall|whisper|davinci|babbage|-\d{4}-\d{2}-\d{2}$)/.test(id))
        .sort()
        .reverse()
        .map((id) => ({ provider: p, id, label: id.replace(/^gpt-/, 'GPT-'), efforts: /^(o\d|gpt-5)/.test(id) && !/chat/.test(id) ? ALL : [], tools: true }));
    }
    case 'anthropic': {
      if (!k.anthropic) return [];
      const j = await getJson('https://api.anthropic.com/v1/models?limit=100', anthropicHeaders(k.anthropic));
      return (j.data as { id: string; display_name?: string }[]).map((m) => ({
        provider: p,
        id: m.id,
        label: m.display_name ?? m.id,
        efforts: /claude-3-(5|opus|sonnet|haiku)|claude-2|claude-instant/.test(m.id) ? [] : ['off', ...THINKS],
        tools: true,
      }));
    }
    case 'google': {
      if (!k.google) return [];
      const j = await getJson('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { 'x-goog-api-key': k.google });
      return (j.models as { name: string; displayName?: string; supportedGenerationMethods?: string[]; thinking?: boolean }[])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && /gemini/.test(m.name) && !/(embedding|image|tts|live|native-audio|robotics|computer-use|aqa)/.test(m.name))
        .map((m) => {
          const id = m.name.replace(/^models\//, '');
          return { provider: p, id, label: m.displayName ?? id, efforts: m.thinking ? (/flash/.test(id) ? ALL : THINKS) : [], tools: true };
        })
        .reverse();
    }
    case 'openrouter': {
      const j = await getJson('https://openrouter.ai/api/v1/models');
      return (j.data as { id: string; name: string; supported_parameters?: string[]; context_length?: number }[])
        .filter((m) => !/(:free$)/.test(m.id) || true)
        .map((m) => ({
          provider: p,
          id: m.id,
          label: m.name.replace(/^[^:]+:\s*/, ''),
          note: m.id.split('/')[0],
          efforts: m.supported_parameters?.includes('reasoning') ? ALL : [],
          tools: !!m.supported_parameters?.includes('tools'),
        }));
    }
    case 'local': {
      const base = (k.local || DEFAULT_LOCAL).replace(/\/+$/, '');
      const j = await getJson(`${base}/v1/models`);
      return (j.data as { id: string }[]).map((m) => ({ provider: p, id: m.id, label: m.id, note: 'on this computer', efforts: [], tools: true }));
    }
    case 'builtin':
      return (await builtinState()) === 'unavailable' ? [] : [{ provider: p, id: 'on-device', label: 'On-device model', note: 'private, no key', efforts: [], tools: false }];
    case 'codex':
      return k.codex ? codexModels() : [];
  }
}

/** Providers you've set up (a key, a local server address, the browser's own model). */
export async function configured(k?: Keys): Promise<ProviderId[]> {
  k ??= await getKeys();
  const out: ProviderId[] = [];
  for (const p of ['openai', 'anthropic', 'google', 'openrouter'] as const) if (k[p]) out.push(p);
  if (k.local) out.push('local');
  if (k.codex) out.push('codex');
  if ((await builtinState()) !== 'unavailable') out.push('builtin');
  return out;
}

/** Every model you can use, grouped by provider; cached for a day. */
export async function listModels(force = false): Promise<{ models: ModelInfo[]; failed: ProviderId[] }> {
  const k = await getKeys();
  const cache = await getLocal<ModelCache>(MODELS, {});
  const ps = await configured(k);
  const failed: ProviderId[] = [];
  const lists = await Promise.all(
    ps.map(async (p) => {
      const hit = cache[p];
      if (!force && hit && Date.now() - hit.at < DAY) return hit.models;
      try {
        const models = await fetchModels(p, k);
        cache[p] = { at: Date.now(), models };
        return models;
      } catch {
        failed.push(p);
        return hit?.models ?? [];
      }
    }),
  );
  await setLocal(MODELS, cache);
  return { models: lists.flat(), failed };
}

/** Does a key work? Lists the provider's models with it. */
export async function checkKey(p: ProviderId, k: Keys): Promise<{ ok: boolean; count: number; message?: string }> {
  try {
    const models = await fetchModels(p, k);
    return { ok: true, count: models.length };
  } catch (e) {
    const s = String((e as Error).message);
    return { ok: false, count: 0, message: s === '401' || s === '403' ? 'That key was turned down.' : s === 'Failed to fetch' ? 'Couldn’t reach it.' : `It answered ${s}.` };
  }
}

// ------------------------------------------------------------ one turn

function friendly(p: ProviderId, status: number, body: string): string {
  const name = PROVIDERS[p].name;
  let msg = '';
  try {
    const j = JSON.parse(body);
    msg = j.error?.message ?? j.message ?? (typeof j.error === 'string' ? j.error : '');
  } catch {
    msg = body.slice(0, 200);
  }
  if (status === 401 || status === 403) return `${name} turned down the key. Check it in Settings, under AI.`;
  if (status === 429) return `${name} says slow down, or the account is out of credit. ${msg}`.trim();
  if (status === 404) return `That model isn’t available on your ${name} account. ${msg}`.trim();
  if (status >= 500) return `${name} had a problem on its side (${status}). Try again in a moment.`;
  return msg || `${name} answered ${status}.`;
}

interface Endpoint {
  url: string;
  headers: Record<string, string>;
  body: (r: TurnRequest) => Record<string, unknown>;
  decoder: () => Decoder;
}
function endpoint(p: ProviderId, id: string, k: Keys): Endpoint | null {
  const oa = (flavor: OpenAiFlavor) => (r: TurnRequest) => openaiBody(r, flavor);
  switch (p) {
    case 'openai':
      return { url: 'https://api.openai.com/v1/chat/completions', headers: { Authorization: `Bearer ${k.openai ?? ''}` }, body: oa('openai'), decoder: openaiDecoder };
    case 'openrouter':
      return {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: { Authorization: `Bearer ${k.openrouter ?? ''}`, 'HTTP-Referer': 'https://github.com/neerajbhargav/sidegig', 'X-Title': 'sidegig' },
        body: oa('openrouter'),
        decoder: openaiDecoder,
      };
    case 'local':
      return { url: `${(k.local || DEFAULT_LOCAL).replace(/\/+$/, '')}/v1/chat/completions`, headers: {}, body: oa('local'), decoder: openaiDecoder };
    case 'anthropic':
      return { url: 'https://api.anthropic.com/v1/messages', headers: anthropicHeaders(k.anthropic ?? ''), body: anthropicBody, decoder: anthropicDecoder };
    case 'google':
      return { url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(id)}:streamGenerateContent?alt=sse`, headers: { 'x-goog-api-key': k.google ?? '' }, body: geminiBody, decoder: geminiDecoder };
    default:
      return null;
  }
}

/** Ask a model once and stream its answer. Retries without effort or tools if the model refuses them. */
export async function* streamTurn(model: ModelInfo, req: TurnRequest, signal?: AbortSignal): AsyncGenerator<Delta> {
  if (model.provider === 'builtin') return yield* builtinTurn(req, signal);
  if (model.provider === 'codex') return yield* codexTurn(req, signal);
  const k = await getKeys();
  const ep = endpoint(model.provider, model.id, k);
  if (!ep) return yield { type: 'error', message: 'No way to reach that model.' };
  let r = { ...req, model: model.id };
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(ep.url, { method: 'POST', headers: { 'content-type': 'application/json', ...ep.headers }, body: JSON.stringify(ep.body(r)), signal, credentials: 'omit' });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      const local = model.provider === 'local';
      return yield { type: 'error', message: local ? `Couldn’t reach the model server at ${k.local || DEFAULT_LOCAL}. Is it running?` : `Couldn’t reach ${PROVIDERS[model.provider].name}. Check your connection.` };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // Some models take no effort setting, some no tools: try once more without.
      if (res.status === 400 && r.effort !== 'auto' && /reason|think|effort|budget/i.test(body)) {
        r = { ...r, effort: 'auto' };
        continue;
      }
      if ((res.status === 400 || res.status === 404) && r.tools.length && /tool|function/i.test(body)) {
        r = { ...r, tools: [] };
        continue;
      }
      return yield { type: 'error', status: res.status, message: friendly(model.provider, res.status, body) };
    }
    const d = ep.decoder();
    for await (const e of sseEvents(res, signal)) yield* d.feed(e);
    if (signal?.aborted) return;
    yield* d.finish();
    return;
  }
}

/** The browser's own model (Chrome's Prompt API): text only, no tools. */
async function* builtinTurn(req: TurnRequest, signal?: AbortSignal): AsyncGenerator<Delta> {
  type Session = { promptStreaming: (t: string, o?: object) => AsyncIterable<string>; destroy: () => void };
  const LM = (globalThis as { LanguageModel?: { create: (o: object) => Promise<Session> } }).LanguageModel;
  if (!LM) return yield { type: 'error', message: 'This browser doesn’t have a built-in model.' };
  const turns = req.messages.filter((m) => m.role !== 'tool' && m.content.trim());
  const last = turns.pop();
  if (!last) return yield { type: 'done', stop: 'end' };
  let session: Session;
  try {
    session = await LM.create({ initialPrompts: [{ role: 'system', content: req.system }, ...turns.map((m) => ({ role: m.role, content: m.content }))], signal });
  } catch (e) {
    return yield { type: 'error', message: `The built-in model couldn’t start: ${(e as Error).message}` };
  }
  try {
    let sofar = '';
    for await (const chunk of session.promptStreaming(last.content, { signal })) {
      // Older versions stream the whole answer so far; newer ones stream pieces.
      const piece = sofar && chunk.startsWith(sofar) ? chunk.slice(sofar.length) : chunk;
      sofar = sofar && chunk.startsWith(sofar) ? chunk : sofar + piece;
      if (piece) yield { type: 'text', text: piece };
    }
    yield { type: 'done', stop: 'end' };
  } catch (e) {
    if ((e as Error).name !== 'AbortError') yield { type: 'error', message: (e as Error).message };
  } finally {
    session.destroy();
  }
}

// ------------------------------------------------------------ OpenRouter sign-in

const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Sign in with OpenRouter (OAuth with PKCE): no key to copy, one account for every model. */
export async function signInOpenRouter(): Promise<boolean> {
  const id = (globalThis as { chrome?: typeof chrome }).chrome?.identity ?? (globalThis as unknown as { browser?: { identity?: typeof chrome.identity } }).browser?.identity;
  if (!id?.launchWebAuthFlow) throw new Error('This browser can’t open a sign-in window for extensions. Paste a key instead.');
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const redirect = id.getRedirectURL('openrouter');
  const url = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(redirect)}&code_challenge=${challenge}&code_challenge_method=S256`;
  const back = await id.launchWebAuthFlow({ url, interactive: true });
  const code = back ? new URL(back).searchParams.get('code') : null;
  if (!code) return false;
  const r = await fetch('https://openrouter.ai/api/v1/auth/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }) });
  if (!r.ok) throw new Error(`OpenRouter answered ${r.status}`);
  const { key } = (await r.json()) as { key?: string };
  if (!key) return false;
  await setKeys({ openrouter: key });
  return true;
}
