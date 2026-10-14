// sidegig's AI engine: one shape for every model, whichever company serves it.

export type ProviderId = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'local' | 'builtin' | 'codex';

/** How hard the model thinks. Auto sends nothing and lets the model decide. */
export type Effort = 'auto' | 'off' | 'low' | 'medium' | 'high';

export interface ModelInfo {
  provider: ProviderId;
  id: string;
  label: string;
  /** Effort levels this model accepts (besides auto). Empty: it doesn't think. */
  efforts: Effort[];
  /** Can call tools (read tabs, MCP). */
  tools: boolean;
  /** Short note for the menu: "fast", "on this device", a context size. */
  note?: string;
}

/** A model is stored as "provider:modelId". */
export const modelKey = (m: Pick<ModelInfo, 'provider' | 'id'>) => `${m.provider}:${m.id}`;
export function parseModelKey(key: string): { provider: ProviderId; id: string } | null {
  const i = key.indexOf(':');
  if (i < 1) return null;
  return { provider: key.slice(0, i) as ProviderId, id: key.slice(i + 1) };
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface Msg {
  role: 'user' | 'assistant' | 'tool';
  /** Plain text (Markdown for the assistant). */
  content: string;
  /** Assistant: tools it asked for. */
  calls?: ToolCall[];
  /** Tool: which call this answers, and the tool's name. */
  callId?: string;
  name?: string;
  /** Assistant: what it thought, shown folded. */
  thinking?: string;
  /** Assistant: the provider's own content to send back unchanged next turn (Anthropic thinking signatures, Gemini thought signatures). */
  raw?: { provider: ProviderId; data: unknown };
  /** Tool: failed. */
  error?: boolean;
  /** For the chat only (never sent): what the user typed, tabs they attached, a tool's line. */
  display?: string;
  tabs?: { title: string; url: string }[];
  label?: string;
}

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema for the arguments. */
  schema: Record<string, unknown>;
}

/** What streams back while a model answers. */
export type Delta =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'call'; call: ToolCall }
  | { type: 'raw'; data: unknown }
  | { type: 'done'; stop: 'end' | 'tools' | 'length' | 'other'; usage?: { input?: number; output?: number } }
  | { type: 'error'; message: string; status?: number };

export interface TurnRequest {
  model: string;
  system: string;
  messages: Msg[];
  tools: ToolDef[];
  effort: Effort;
}
