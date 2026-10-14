// The sidegig bridge: a small open-source helper you run on your computer
// (bridge/sidegig-bridge.mjs). It lets the chat use your ChatGPT subscription
// through the official Codex app (Codex owns the sign-in), and lets agents like
// Claude Code, Codex and Cursor use this browser over MCP.
import type { Delta, Effort, ModelInfo, Msg, TurnRequest } from './types.ts';

export const BRIDGE_PORT = 47617;
export const BRIDGE_WS = `ws://127.0.0.1:${BRIDGE_PORT}/ext`;

export interface BridgeHello {
  type: 'ready';
  version: string;
  codex: { installed: boolean; signedIn: boolean; models: { slug: string; name: string; efforts: string[] }[] };
  agents: { url: string; token: string };
}

/** Open a connection to the bridge and wait for its hello. */
export function openBridge(role: 'page' | 'host', timeout = 1500): Promise<{ ws: WebSocket; hello: BridgeHello }> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(BRIDGE_WS);
    } catch (e) {
      return reject(e);
    }
    const t = setTimeout(() => (ws.close(), reject(new Error('The sidegig bridge isn’t running.'))), timeout);
    ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'hello', role, app: 'sidegig', version: 1 })));
    ws.addEventListener('message', function first(e) {
      let m: { type?: string; message?: string };
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (m.type === 'ready') {
        clearTimeout(t);
        ws.removeEventListener('message', first);
        resolve({ ws, hello: m as BridgeHello });
      } else if (m.type === 'refused') {
        clearTimeout(t);
        ws.close();
        reject(new Error(m.message ?? 'The bridge turned this browser down.'));
      }
    });
    ws.addEventListener('error', () => (clearTimeout(t), reject(new Error('The sidegig bridge isn’t running.'))));
  });
}

/** Is the bridge up, and what can Codex do there? */
export async function bridgeStatus(): Promise<BridgeHello | null> {
  try {
    const { ws, hello } = await openBridge('page');
    ws.close();
    return hello;
  } catch {
    return null;
  }
}

const EFFORT_MAP: Record<string, Effort> = { low: 'low', medium: 'medium', high: 'high', xhigh: 'high', max: 'high' };
/** Your ChatGPT plan's models, as Codex lists them. */
export async function codexModels(): Promise<ModelInfo[]> {
  const h = await bridgeStatus();
  if (!h?.codex.installed || !h.codex.signedIn) return [];
  return h.codex.models.map((m) => ({
    provider: 'codex',
    id: m.slug,
    label: m.name,
    note: 'ChatGPT plan',
    efforts: [...new Set(m.efforts.map((e) => EFFORT_MAP[e]).filter(Boolean))] as Effort[],
    tools: false,
  }));
}

/** The conversation as one prompt (Codex runs each turn fresh). */
export function transcript(req: TurnRequest): string {
  const lines = [
    'You are answering in a chat box inside the user’s web browser, not working on code. Answer the latest message directly, in Markdown. Don’t run shell commands unless the user asks for something only a command can do.',
    req.system,
    '',
  ];
  const turns = req.messages.filter((m: Msg) => (m.role === 'user' || m.role === 'assistant') && m.content.trim());
  const last = turns.pop();
  if (turns.length) {
    lines.push('The conversation so far:');
    for (const m of turns) lines.push(`${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`, '');
  }
  lines.push('The user’s latest message:', last?.content.trim() ?? '');
  return lines.join('\n');
}

/** One turn through Codex on the bridge, with your ChatGPT plan. */
export async function* codexTurn(req: TurnRequest, signal?: AbortSignal): AsyncGenerator<Delta> {
  let conn: Awaited<ReturnType<typeof openBridge>>;
  try {
    conn = await openBridge('page');
  } catch (e) {
    return yield { type: 'error', message: `${(e as Error).message} Start it with: node bridge/sidegig-bridge.mjs (see Settings, AI).` };
  }
  const { ws } = conn;
  const id = `c${Date.now().toString(36)}`;
  const queue: Delta[] = [];
  let wake: (() => void) | null = null;
  let finished = false;
  const push = (d: Delta) => {
    queue.push(d);
    wake?.();
  };
  let wrote = false;
  ws.addEventListener('message', (e) => {
    let m: { type: string; id?: string; event?: any; message?: string };
    try {
      m = JSON.parse(String(e.data));
    } catch {
      return;
    }
    if (m.id !== id) return;
    if (m.type === 'codex.event') {
      const ev = m.event;
      const item = ev?.item;
      if (ev?.type === 'item.completed' && item?.type === 'agent_message' && item.text) {
        push({ type: 'text', text: (wrote ? '\n\n' : '') + item.text });
        wrote = true;
      } else if (ev?.type === 'item.completed' && item?.type === 'reasoning' && item.text) push({ type: 'thinking', text: `${item.text}\n` });
      else if (ev?.type === 'item.started' && item?.type === 'command_execution') push({ type: 'thinking', text: `Running: ${item.command}\n` });
      else if (ev?.type === 'turn.completed') push({ type: 'done', stop: 'end', usage: { input: ev.usage?.input_tokens, output: ev.usage?.output_tokens } });
      else if (ev?.type === 'turn.failed' || ev?.type === 'error') push({ type: 'error', message: ev.error?.message ?? ev.message ?? 'Codex stopped with an error.' });
    } else if (m.type === 'codex.error') push({ type: 'error', message: m.message ?? 'Codex stopped with an error.' });
    else if (m.type === 'codex.done') {
      finished = true;
      wake?.();
    }
  });
  ws.addEventListener('close', () => {
    finished = true;
    wake?.();
  });
  signal?.addEventListener('abort', () => {
    try {
      ws.send(JSON.stringify({ type: 'codex.stop', id }));
    } catch {
      /* closed */
    }
    finished = true;
    wake?.();
  });
  ws.send(JSON.stringify({ type: 'codex.run', id, prompt: transcript(req), model: req.model, effort: req.effort === 'auto' ? '' : req.effort === 'off' ? 'low' : req.effort }));
  try {
    while (true) {
      while (queue.length) yield queue.shift()!;
      if (finished) break;
      await new Promise<void>((r) => (wake = r));
      wake = null;
    }
  } finally {
    ws.close();
  }
}
