// The assistant, built into the browser: a chat with a model menu and an
// effort menu, answers that stream in, tabs you can attach, tools that read
// your browser and any MCP servers you connect. Works on the new tab (as an
// overlay) and in the sidebar (inline, with "this page" attached).
import { ext, uid } from '../../shared/api.ts';
import { getLocal, setLocal, onLocalChanged } from '../../shared/storage.ts';
import { h, ico, toast, favicon } from '../dom.ts';
import { play } from '../sound.ts';
import { openOptions, type Ctx } from '../ctx.ts';
import { md } from '../../shared/ai/md.ts';
import { DEFAULT_LOCAL, PROVIDERS, builtinState, checkKey, getKeys, listModels, setKeys, signInOpenRouter, streamTurn } from '../../shared/ai/providers.ts';
import { runChat, systemPrompt, titleFor, type RunEvent } from '../../shared/ai/run.ts';
import { asPage, browserTools, combine, likelyTab, readTab, type ToolSet } from '../../shared/ai/tools.ts';
import { mcpTools, type McpServer, type McpStatus } from '../../shared/ai/mcp.ts';
import { openBridge, type BridgeHello } from '../../shared/ai/bridge.ts';
import { modelKey, type Effort, type ModelInfo, type Msg, type ProviderId } from '../../shared/ai/types.ts';

// ------------------------------------------------------------ saved chats and picks

export interface Chat {
  id: string;
  title: string;
  model: string;
  created: number;
  updated: number;
  messages: Msg[];
}
const CHATS = 'aiChats';
const PICK = 'aiPick';
const RECENT = 'aiRecent';
export const loadChats = () => getLocal<Chat[]>(CHATS, []);
async function saveChat(c: Chat) {
  const all = (await loadChats()).filter((x) => x.id !== c.id);
  await setLocal(CHATS, [c, ...all].slice(0, 100));
}
async function deleteChat(id: string) {
  await setLocal(CHATS, (await loadChats()).filter((x) => x.id !== id));
}
export const MCP_SERVERS = 'mcpServers';
export const loadServers = () => getLocal<McpServer[]>(MCP_SERVERS, []);

const EFFORT_TEXT: Record<Effort, [string, string]> = {
  auto: ['Auto', 'The model decides'],
  off: ['Off', 'Answer straight away'],
  low: ['Low', 'A quick think'],
  medium: ['Medium', 'Think it through'],
  high: ['High', 'Take its time on hard questions'],
};

/** Shared state: the models you can use and the one you picked. Both menus (new tab box and chat) follow it. */
class Picks {
  loading = true;
  failed: ProviderId[] = [];
  models: ModelInfo[] = [];
  model: ModelInfo | null = null;
  effort: Effort = 'auto';
  recent: string[] = [];
  private subs = new Set<() => void>();
  on(fn: () => void) {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }
  emit() {
    for (const f of this.subs) f();
  }
  async load(force = false) {
    this.loading = true;
    this.emit();
    const [{ models, failed }, pick, recent] = await Promise.all([listModels(force), getLocal<{ model?: string; effort?: Effort }>(PICK, {}), getLocal<string[]>(RECENT, [])]);
    this.models = models;
    this.failed = failed;
    this.recent = recent;
    this.model = models.find((m) => modelKey(m) === pick.model) ?? models.find((m) => recent.includes(modelKey(m))) ?? models[0] ?? null;
    this.effort = pick.effort ?? 'auto';
    this.loading = false;
    this.emit();
  }
  async choose(m: ModelInfo) {
    this.model = m;
    const k = modelKey(m);
    this.recent = [k, ...this.recent.filter((x) => x !== k)].slice(0, 5);
    await Promise.all([setLocal(PICK, { model: k, effort: this.effort }), setLocal(RECENT, this.recent)]);
    this.emit();
  }
  async setEffort(e: Effort) {
    this.effort = e;
    await setLocal(PICK, { model: this.model ? modelKey(this.model) : '', effort: e });
    this.emit();
  }
  /** The effort that will actually be sent to this model. */
  effective(): Effort {
    return this.model && this.model.efforts.includes(this.effort) ? this.effort : 'auto';
  }
}

/**
 * One answer from the model picked in chat, without tools or history (mail
 * summaries and drafts). Streams the text so far to `on`. Resolves to '' when
 * done, 'no-model' when nothing is connected, or an error message.
 */
export async function askPicked(prompt: string, on: (text: string) => void, signal: AbortSignal): Promise<string> {
  const picks = new Picks();
  await picks.load();
  if (!picks.model) return 'no-model';
  let text = '';
  for await (const d of streamTurn(picks.model, { model: picks.model.id, system: systemPrompt(), messages: [{ role: 'user', content: prompt }], tools: [], effort: picks.effective() }, signal)) {
    if (d.type === 'text') on((text += d.text));
    else if (d.type === 'error') return d.message;
  }
  return signal.aborted ? 'Stopped.' : '';
}

// ------------------------------------------------------------ menus

let openPop: HTMLElement | null = null;
function popover(anchor: HTMLElement, content: HTMLElement, cls = '') {
  closePop();
  const pop = h('div', { class: `cc-pop ${cls}`, role: 'dialog' }, content);
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  const below = r.bottom + 8 + 360 < innerHeight || r.top < 380;
  pop.style.left = `${Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.left))}px`;
  if (below) pop.style.top = `${r.bottom + 6}px`;
  else pop.style.bottom = `${innerHeight - r.top + 6}px`;
  openPop = pop;
  const off = (e: Event) => {
    if (!pop.contains(e.target as Node) && e.target !== anchor && !anchor.contains(e.target as Node)) closePop();
  };
  const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), closePop(), anchor.focus());
  setTimeout(() => addEventListener('pointerdown', off, true));
  addEventListener('keydown', esc, true);
  (pop as HTMLElement & { _off?: () => void })._off = () => {
    removeEventListener('pointerdown', off, true);
    removeEventListener('keydown', esc, true);
  };
  return pop;
}
function closePop() {
  if (!openPop) return;
  (openPop as HTMLElement & { _off?: () => void })._off?.();
  openPop.remove();
  openPop = null;
}

const providerIcon = (p: ProviderId) =>
  ({
    openai: favicon('https://openai.com', 'OpenAI', 'fav xs', 'chatgpt'),
    anthropic: favicon('https://claude.ai', 'Anthropic', 'fav xs', 'claude'),
    google: favicon('https://gemini.google.com', 'Google', 'fav xs', 'gemini'),
    openrouter: favicon('https://openrouter.ai', 'OpenRouter', 'fav xs'),
    codex: favicon('https://chatgpt.com', 'ChatGPT', 'fav xs', 'chatgpt'),
    local: ico('window', 16),
    builtin: ico('globe', 16),
  })[p];

/** The model menu: recent first, then by provider; type to filter. */
function modelMenu(picks: Picks, anchor: HTMLElement, onSetup: () => void) {
  const find = h('input', { class: 'cc-find', type: 'search', placeholder: 'Find a model', 'aria-label': 'Find a model' });
  const list = h('div', { class: 'cc-list', role: 'listbox', 'aria-label': 'Models' });
  const expanded = new Set<string>();
  const row = (m: ModelInfo) =>
    h(
      'button',
      {
        type: 'button',
        role: 'option',
        class: 'cc-opt',
        'aria-selected': String(picks.model ? modelKey(picks.model) === modelKey(m) : false),
        onclick: () => {
          play('key');
          void picks.choose(m);
          closePop();
        },
      },
      h('span', { class: 'cc-opt-t' }, m.label),
      h('span', { class: 'cc-opt-n' }, [m.note, m.efforts.length ? 'thinks' : '', m.tools ? '' : 'no tools'].filter(Boolean).join(', ')),
      picks.model && modelKey(picks.model) === modelKey(m) ? ico('check', 16) : null,
    );
  const paint = () => {
    const q = find.value.trim().toLowerCase();
    const match = (m: ModelInfo) => !q || `${m.label} ${m.id} ${m.note ?? ''} ${PROVIDERS[m.provider].name}`.toLowerCase().includes(q);
    const kids: HTMLElement[] = [];
    const recent = picks.recent.map((k) => picks.models.find((m) => modelKey(m) === k)).filter((m): m is ModelInfo => !!m && match(m));
    if (recent.length && !q) kids.push(h('div', { class: 'cc-group' }, 'Recent'), ...recent.map(row));
    const order: ProviderId[] = ['codex', 'anthropic', 'openai', 'google', 'openrouter', 'local', 'builtin'];
    for (const p of order) {
      const ms = picks.models.filter((m) => m.provider === p && match(m));
      if (!ms.length) continue;
      const cap = q || expanded.has(p) ? ms.length : 8;
      kids.push(h('div', { class: 'cc-group' }, providerIcon(p), PROVIDERS[p].name), ...ms.slice(0, cap).map(row));
      if (ms.length > cap) kids.push(h('button', { type: 'button', class: 'cc-more', onclick: () => (expanded.add(p), paint()) }, `Show all ${ms.length}`));
    }
    if (!kids.length) kids.push(h('p', { class: 'cc-none' }, picks.models.length ? 'No model by that name.' : 'No models yet.'));
    list.replaceChildren(...kids);
  };
  find.addEventListener('input', paint);
  paint();
  const foot = h('button', { type: 'button', class: 'cc-foot', onclick: () => (closePop(), onSetup()) }, ico('plus', 16), 'Add a model or key');
  popover(anchor, h('div', { class: 'cc-models' }, find, list, foot), 'cc-pop-models');
  find.focus();
}

function effortMenu(picks: Picks, anchor: HTMLElement) {
  const m = picks.model;
  const opts: Effort[] = ['auto', ...(m?.efforts ?? [])];
  popover(
    anchor,
    h(
      'div',
      { class: 'cc-list', role: 'listbox', 'aria-label': 'Effort' },
      opts.map((e) =>
        h(
          'button',
          { type: 'button', role: 'option', class: 'cc-opt', 'aria-selected': String(picks.effective() === e), onclick: () => (play('key'), void picks.setEffort(e), closePop()) },
          h('span', { class: 'cc-opt-t' }, EFFORT_TEXT[e][0]),
          h('span', { class: 'cc-opt-n' }, EFFORT_TEXT[e][1]),
          picks.effective() === e ? ico('check', 16) : null,
        ),
      ),
    ),
    'cc-pop-effort',
  );
}

/** The two menus, as buttons: "Claude Sonnet 4.6 ▾" and "Medium ▾". Can be made more than once; they stay in step. */
export function pickerBar(picks: Picks, onSetup: () => void): HTMLElement {
  const model = h('button', { type: 'button', class: 'cc-pick', 'aria-haspopup': 'listbox', title: 'Choose a model' });
  const effort = h('button', { type: 'button', class: 'cc-pick', 'aria-haspopup': 'listbox', title: 'How hard it thinks' });
  model.addEventListener('click', () => (picks.models.length ? modelMenu(picks, model, onSetup) : onSetup()));
  effort.addEventListener('click', () => effortMenu(picks, effort));
  const paint = () => {
    const m = picks.model;
    model.disabled = picks.loading;
    model.replaceChildren(m ? providerIcon(m.provider) : ico('plus', 16), h('span', {}, picks.loading ? 'Loading models…' : m ? m.label : 'Connect a model'), ico('chevron', 16));
    effort.hidden = !m?.efforts.length;
    effort.replaceChildren(ico('effort', 16), h('span', {}, EFFORT_TEXT[picks.effective()][0]), ico('chevron', 16));
  };
  picks.on(paint);
  paint();
  return h('div', { class: 'cc-picks' }, model, effort);
}

// ------------------------------------------------------------ setup

/** How to connect a model: sign in, a key, this computer, this browser, your ChatGPT plan. */
export async function aiSetup(onDone: () => void): Promise<HTMLElement> {
  const keys = await getKeys();
  const builtin = await builtinState();
  const box = h('div', { class: 'ai-setup' });
  const status = h('p', { class: 'ai-setup-status', role: 'status' });
  const say = (t: string) => (status.textContent = t);
  const choice = (icon: Node, title: string, note: string, run: () => void | Promise<void>, on = false) =>
    h('button', { type: 'button', class: 'ai-choice', 'aria-pressed': String(on), onclick: () => void run() }, h('span', { class: 'ai-choice-i' }, icon), h('span', { class: 'ai-choice-t' }, h('b', {}, title), h('span', {}, note)));

  // Paste a key.
  const which = h('select', { class: 'text-input', 'aria-label': 'Provider' }, (['anthropic', 'openai', 'google', 'openrouter'] as const).map((p) => h('option', { value: p }, PROVIDERS[p].name)));
  const key = h('input', { class: 'text-input', type: 'password', placeholder: 'Paste your API key', autocomplete: 'off', 'aria-label': 'API key' });
  const getKey = h('a', { class: 'ai-keylink', target: '_blank', rel: 'noopener', href: PROVIDERS.anthropic.keyUrl! }, 'Get a key');
  which.addEventListener('change', () => {
    const p = PROVIDERS[which.value as ProviderId];
    getKey.setAttribute('href', p.keyUrl ?? '#');
    key.placeholder = `Paste your ${p.name} key (${p.keyHint ?? ''})`;
  });
  const keyForm = h(
    'form',
    { class: 'ai-keyform', hidden: true },
    h('div', { class: 'ai-row' }, which, key),
    h('div', { class: 'ai-row' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save key'), getKey, h('span', { class: 'ai-note' }, 'Kept on this device only. It never syncs.')),
  );
  keyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = which.value as 'openai' | 'anthropic' | 'google' | 'openrouter';
    const v = key.value.trim();
    if (!v) return key.focus();
    say('Checking the key…');
    const r = await checkKey(p, { [p]: v });
    if (!r.ok) return say(`${PROVIDERS[p].name}: ${r.message}`);
    await setKeys({ [p]: v });
    key.value = '';
    play('confirm');
    say(`${PROVIDERS[p].name} is connected: ${r.count} models.`);
    onDone();
  });

  // A server on this computer.
  const url = h('input', { class: 'text-input', type: 'url', value: keys.local || DEFAULT_LOCAL, 'aria-label': 'Model server address' });
  const localForm = h(
    'form',
    { class: 'ai-keyform', hidden: true },
    h('div', { class: 'ai-row' }, url, h('button', { type: 'submit', class: 'btn primary' }, 'Connect')),
    h('p', { class: 'ai-note' }, 'Ollama listens on port 11434 and LM Studio on 1234. Anything that speaks the OpenAI API works.'),
  );
  localForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    say('Looking for models…');
    const r = await checkKey('local', { local: url.value.trim() });
    if (!r.ok) return say(`Couldn’t reach ${url.value.trim()}. Is it running? ${r.message ?? ''}`);
    await setKeys({ local: url.value.trim() });
    play('confirm');
    say(`Found ${r.count} models on this computer.`);
    onDone();
  });

  // Your ChatGPT plan, through Codex and the bridge.
  const pairCode = h('input', { class: 'text-input', placeholder: 'Pairing code, like K7QM-2XRP', 'aria-label': 'Bridge pairing code', autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
  void getLocal<string>('bridgeCode', '').then((c) => (pairCode.value = c));
  const bridgeHelp = h(
    'div',
    { class: 'ai-keyform', hidden: true },
    h('p', { class: 'ai-note' }, 'This uses the official Codex app, so OpenAI handles the sign-in. In a terminal:'),
    h(
      'ol',
      { class: 'ai-steps' },
      h('li', {}, 'Install Codex and sign in with ChatGPT: ', h('code', {}, 'npm i -g @openai/codex && codex login')),
      h('li', {}, 'Start the sidegig bridge from the sidegig folder: ', h('code', {}, 'node bridge/sidegig-bridge.mjs')),
      h('li', {}, 'Paste the pairing code it prints. Only this browser can then use it.'),
    ),
    h('div', { class: 'ai-row' }, pairCode),
    h(
      'button',
      {
        type: 'button',
        class: 'btn primary',
        onclick: async () => {
          await setLocal('bridgeCode', pairCode.value.trim().toUpperCase());
          say('Looking for the bridge…');
          let s: BridgeHello;
          try {
            s = (await openBridge('page')).hello;
          } catch (e) {
            return say((e as Error).message === 'The sidegig bridge isn’t running.' ? 'The bridge isn’t running yet.' : (e as Error).message);
          }
          if (!s.codex.installed) return say('The bridge is running, but Codex isn’t installed.');
          if (!s.codex.signedIn) return say('Codex is installed but not signed in. Run: codex login');
          await setKeys({ codex: '1' });
          play('confirm');
          say(`Connected: ${s.codex.models.length} models on your ChatGPT plan.`);
          onDone();
        },
      },
      'Connect',
    ),
  );
  const forms = [keyForm, localForm, bridgeHelp];
  const show = (f: HTMLElement) => {
    for (const x of forms) x.hidden = x !== f || !x.hidden;
    (f.querySelector('input') as HTMLInputElement | null)?.focus();
  };

  box.append(
    h('h3', {}, 'Connect a model'),
    h('p', { class: 'ai-lede' }, 'Use what you already pay for, or something free. Keys stay on this device.'),
    h(
      'div',
      { class: 'ai-choices' },
      choice(providerIcon('codex'), 'Your ChatGPT plan', 'Through the Codex app on this computer', () => show(bridgeHelp), !!keys.codex),
      choice(providerIcon('openrouter'), 'Sign in with OpenRouter', 'One account, hundreds of models', async () => {
        try {
          say('Opening OpenRouter…');
          if (await signInOpenRouter()) {
            play('confirm');
            say('OpenRouter is connected.');
            onDone();
          } else say('Sign-in was cancelled.');
        } catch (e) {
          say((e as Error).message);
        }
      }, !!keys.openrouter),
      choice(ico('key', 18), 'An API key', 'OpenAI, Anthropic, Google or OpenRouter', () => show(keyForm), !!(keys.openai || keys.anthropic || keys.google)),
      choice(ico('window', 18), 'A model on this computer', 'Ollama, LM Studio', () => show(localForm), !!keys.local),
      builtin !== 'unavailable'
        ? choice(ico('globe', 18), 'This browser’s own model', builtin === 'available' ? 'Ready: private, free, on this device' : 'Downloads once, then works offline', async () => {
            say(builtin === 'available' ? 'Ready.' : 'It will download the first time you ask something.');
            onDone();
          })
        : null,
    ),
    ...forms,
    status,
    h('p', { class: 'ai-fine' }, 'Claude and Gemini subscriptions can’t be used outside their own apps (their terms forbid it), so those need an API key.'),
  );
  return box;
}

// ------------------------------------------------------------ the chat

export interface ChatUi {
  /** The conversation (overlay on the new tab, the whole panel in the sidebar). */
  view: HTMLElement;
  picks: Picks;
  pickerBar: () => HTMLElement;
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
  send: (text: string, tabs?: number[]) => Promise<void>;
  newChat: () => void;
  /** Show a saved chat. */
  load: (c: Chat) => void;
  focus: () => void;
}

export async function chatUi(ctx: Ctx, o: { where: 'newtab' | 'panel'; hostTabId?: number }): Promise<ChatUi> {
  const picks = new Picks();
  const modelsReady = picks.load().catch(() => { picks.loading = false; picks.emit(); });
  let chat: Chat = { id: uid('c_'), title: 'New chat', model: '', created: Date.now(), updated: Date.now(), messages: [] };
  let running: AbortController | null = null;
  let mcp: { set: ToolSet; status: McpStatus[]; at: number; config: string } | null = null;
  const stopKeys = onLocalChanged('aiKeys', () => {
    if (!ctx.signal?.aborted) void picks.load(true);
  });
  if (ctx.signal?.aborted) stopKeys();
  else ctx.signal?.addEventListener('abort', stopKeys, { once: true });
  const attached = new Map<number, { title: string; url: string }>();

  const view = h('section', { class: `cv cv-${o.where}`, 'aria-label': 'Assistant', hidden: o.where === 'newtab' });
  const title = h('h2', { class: 'cv-title' }, 'New chat');
  const thread = h('div', { class: 'cv-thread', role: 'log', 'aria-live': 'polite' });
  const scroller = h('div', { class: 'cv-scroll' }, thread);
  const input = h('textarea', { class: 'cc-in', rows: 1, placeholder: 'Ask anything', 'aria-label': 'Message' });
  const ctxRow = h('div', { class: 'cc-ctx' });
  const sendBtn = h('button', { type: 'button', class: 'cc-send', title: 'Send', 'aria-label': 'Send' }, ico('send', 20));
  const toolsNote = h('span', { class: 'cc-toolsn' });
  const setupHost = h('div', { class: 'cv-setup', hidden: true });

  const showSetup = async () => {
    setupHost.replaceChildren(
      await aiSetup(async () => {
        await picks.load(true);
        if (picks.models.length) {
          setupHost.hidden = true;
          paintEmpty();
        }
      }),
    );
    if (picks.failed.length) {
      const retry = h('button', { class: 'btn', type: 'button', onclick: async () => {
        retry.disabled = true;
        retry.textContent = 'Checking connection…';
        await picks.load(true);
        if (picks.models.length) { setupHost.hidden = true; void paintEmpty(); }
        else void showSetup();
      } }, 'Try again');
      setupHost.prepend(h('div', { class: 'cv-connection-error', role: 'status' }, h('p', {}, `Could not connect to ${picks.failed.map((p) => p === 'local' ? 'your local model server' : PROVIDERS[p].name).join(', ')}. Your connection settings are still saved.`), retry));
    }
    setupHost.hidden = false;
    thread.hidden = true;
  };

  // ---- attaching tabs
  const paintCtx = () => {
    ctxRow.replaceChildren(
      ...[...attached].map(([id, t]) =>
        h('span', { class: 'cc-chip', title: t.url }, favicon(t.url, t.title, 'fav xs'), h('span', {}, t.title || t.url), h('button', { type: 'button', 'aria-label': `Remove ${t.title}`, onclick: () => (attached.delete(id), paintCtx()) }, ico('close', 14))),
      ),
      h('button', { type: 'button', class: 'cc-addtab', title: 'Attach an open tab', onclick: (e: MouseEvent) => void tabMenu(e.currentTarget as HTMLElement) }, ico('attach', 16), attached.size ? null : h('span', {}, o.where === 'panel' ? 'Add a tab' : 'Attach tabs')),
    );
  };
  const tabMenu = async (anchor: HTMLElement) => {
    const tabs = (await ext.tabs.query({}).catch(() => [] as chrome.tabs.Tab[])).filter((t) => /^https?:/.test(t.url ?? '') && t.id !== undefined).slice(0, 40);
    popover(
      anchor,
      h(
        'div',
        { class: 'cc-list', role: 'listbox', 'aria-label': 'Open tabs', 'aria-multiselectable': 'true' },
        tabs.length
          ? tabs.map((t) =>
              h(
                'button',
                {
                  type: 'button',
                  role: 'option',
                  class: 'cc-opt',
                  'aria-selected': String(attached.has(t.id!)),
                  onclick: (e: MouseEvent) => {
                    if (attached.has(t.id!)) attached.delete(t.id!);
                    else attached.set(t.id!, { title: t.title ?? '', url: t.url! });
                    (e.currentTarget as HTMLElement).setAttribute('aria-selected', String(attached.has(t.id!)));
                    paintCtx();
                  },
                },
                favicon(t.url!, t.title ?? '', 'fav xs'),
                h('span', { class: 'cc-opt-t' }, t.title || t.url),
              ),
            )
          : h('p', { class: 'cc-none' }, 'No web tabs are open.'),
      ),
      'cc-pop-tabs',
    );
  };
  if (o.where === 'panel') {
    const t = await likelyTab(o.hostTabId);
    if (t?.id !== undefined) attached.set(t.id, { title: t.title ?? '', url: t.url ?? '' });
    // Text you chose "Ask the sidegig Assistant" on: quoted, ready for your question.
    const prefill = (v: unknown) => {
      const p = v as { text?: string; ts?: number } | null;
      if (!p?.text || !p.ts || Date.now() - p.ts > 30_000) return;
      void setLocal('chatPrefill', null);
      input.value = `${p.text.trim().split('\n').map((l) => `> ${l}`).join('\n')}\n\n`;
      input.dispatchEvent(new Event('input'));
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    };
    void getLocal('chatPrefill', null).then(prefill);
    const stopPrefill = onLocalChanged('chatPrefill', prefill);
    ctx.signal?.addEventListener('abort', stopPrefill, { once: true });
  }
  paintCtx();

  // ---- rendering
  const nearBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
  const toBottom = () => (scroller.scrollTop = scroller.scrollHeight);
  const userEl = (m: Msg) =>
    h(
      'div',
      { class: 'cm cm-user' },
      m.tabs?.length ? h('div', { class: 'cm-tabs' }, m.tabs.map((t) => h('span', { class: 'cc-chip', title: t.url }, favicon(t.url, t.title, 'fav xs'), h('span', {}, t.title || t.url)))) : null,
      h('div', { class: 'cm-text' }, m.display ?? m.content),
    );
  /** One answer: its steps (thinking, text, tools) and, at the end, its actions. */
  const turnEl = () => h('div', { class: 'cm cm-bot' });
  const segment = (turn: HTMLElement) => {
    const think = h('details', { class: 'cm-think', hidden: true }, h('summary', {}, 'Thinking'), h('div', { class: 'cm-think-b' }));
    const body = h('div', { class: 'cm-md' });
    const tools = h('div', { class: 'cm-tools' });
    const seg = h('div', { class: 'cm-seg' }, think, body, tools);
    turn.append(seg);
    return { think, body, tools };
  };
  const toolRow = (label: string, state: 'running' | 'done' | 'failed') => h('div', { class: 'cm-tool', dataset: { state } }, h('i', { class: 'cm-tool-dot' }), h('span', {}, label));
  const actions = (turn: HTMLElement, userIndex: number, modelLabel: string) => {
    const text = [...turn.querySelectorAll('.cm-md')].map((e) => (e as HTMLElement).innerText).join('\n\n').trim();
    turn.append(
      h(
        'div',
        { class: 'cm-actions' },
        h('button', { type: 'button', class: 'cm-act', title: 'Copy', onclick: () => void navigator.clipboard.writeText(text).then(() => toast('Copied')) }, ico('copy', 16)),
        h('button', { type: 'button', class: 'cm-act', title: 'Ask again', onclick: () => void retry(userIndex) }, ico('refresh', 16)),
        h('span', { class: 'cm-model' }, modelLabel),
      ),
    );
  };
  const errorEl = (turn: HTMLElement, message: string, userIndex: number) =>
    turn.append(
      h(
        'div',
        { class: 'cm-err', role: 'alert' },
        h('span', {}, message),
        h('button', { type: 'button', class: 'btn', onclick: () => void retry(userIndex) }, 'Try again'),
        /key|Settings|sign/i.test(message) ? h('button', { type: 'button', class: 'btn', onclick: () => void showSetup() }, 'Fix connection') : null,
      ),
    );

  /** Draw a saved conversation. */
  const paintChat = () => {
    thread.hidden = false;
    setupHost.hidden = true;
    title.textContent = chat.messages.length ? chat.title : 'New chat';
    thread.replaceChildren();
    if (!chat.messages.length) return paintEmpty();
    let turn: HTMLElement | null = null;
    let lastUser = -1;
    chat.messages.forEach((m, i) => {
      if (m.role === 'user') {
        if (turn) actions(turn, lastUser, chat.model.split(':').slice(1).join(':'));
        thread.append(userEl(m));
        turn = null;
        lastUser = i;
        return;
      }
      if (!turn) thread.append((turn = turnEl()));
      if (m.role === 'assistant') {
        const s = segment(turn);
        if (m.thinking) {
          s.think.hidden = false;
          (s.think.firstChild as HTMLElement).textContent = 'Thought it through';
          (s.think.lastChild as HTMLElement).textContent = m.thinking;
        }
        s.body.innerHTML = md(m.content);
      } else {
        const segs = turn.querySelectorAll('.cm-tools');
        segs[segs.length - 1]?.append(toolRow(m.label ?? m.name ?? 'Tool', m.error ? 'failed' : 'done'));
      }
    });
    if (turn) actions(turn, lastUser, chat.model.split(':').slice(1).join(':'));
    requestAnimationFrame(toBottom);
  };

  /** The empty chat: a question, some starters, your recent chats. */
  const paintEmpty = async () => {
    thread.hidden = false;
    if (picks.loading) thread.replaceChildren(h('p', { class: 'muted', role: 'status' }, 'Loading your models…'));
    await modelsReady;
    if (ctx.signal?.aborted || chat.messages.length) return;
    if (!picks.models.length) return void showSetup();
    const recents = (await loadChats()).slice(0, 5);
    // A question may have been asked while we were loading.
    if (chat.messages.length) return;
    const starter = (label: string, prompt: string) => h('button', { type: 'button', class: 'cv-starter', onclick: () => void send(prompt) }, label);
    const starters =
      o.where === 'panel'
        ? [starter('Sum up this page', 'Sum up this page in a few bullet points, then tell me the one thing worth remembering.'), starter('What should I ask about this?', 'What are three good questions to ask about this page? Answer them briefly.'), starter('Explain it simply', 'Explain this page simply, as if I were new to the topic.')]
        : [
            starter('Sum up my open tabs', 'Look at my open tabs and group them by what I seem to be working on. Tell me which ones I can close.'),
            starter('What did I read about this week?', 'Search my history from the last seven days and tell me the main topics I read about, with links.'),
            starter('Find something I bookmarked', 'Help me find something in my bookmarks. Ask me what it was about first.'),
          ];
    thread.replaceChildren(
      h(
        'div',
        { class: 'cv-empty' },
        h('h3', {}, o.where === 'panel' ? 'Ask about this page' : 'What can I help with?'),
        h('div', { class: 'cv-starters' }, starters),
        recents.length
          ? h(
              'div',
              { class: 'cv-recents' },
              h('div', { class: 'cc-group' }, 'Recent chats'),
              recents.map((c) => h('button', { type: 'button', class: 'cv-recent', onclick: () => loadChat(c) }, h('span', {}, c.title), h('span', { class: 'cc-opt-n' }, new Date(c.updated).toLocaleDateString()))),
            )
          : null,
      ),
    );
  };

  // ---- tools: the browser's, plus your MCP servers (connected once, refreshed every ten minutes)
  const toolsFor = async (signal: AbortSignal): Promise<ToolSet> => {
    const base = browserTools({ hostTabId: o.hostTabId });
    const servers = (await loadServers()).filter((s) => s.enabled);
    if (!servers.length) return base;
    const config = JSON.stringify(servers);
    if (!mcp || mcp.config !== config || Date.now() - mcp.at > 600_000) {
      const r = await mcpTools(servers, signal).catch(() => null);
      if (signal.aborted) return base;
      if (r) mcp = { ...r, at: Date.now(), config };
    }
    const signin = mcp?.status.filter((s) => s.state === 'signin') ?? [];
    if (signin.length) toast(`${signin.map((s) => s.server.name).join(', ')} needs you to sign in (Settings, AI).`);
    return mcp ? combine(base, mcp.set) : base;
  };

  // ---- sending
  const setRunning = (on: boolean) => {
    sendBtn.replaceChildren(ico(on ? 'stop' : 'send', 20));
    sendBtn.title = on ? 'Stop' : 'Send';
    sendBtn.setAttribute('aria-label', on ? 'Stop' : 'Send');
    view.toggleAttribute('data-running', on);
  };

  const stop = () => {
    const ctrl = running;
    running = null;
    ctrl?.abort();
    setRunning(false);
  };
  ctx.signal?.addEventListener('abort', () => {
    stop();
    closePop();
    if (o.where === 'newtab') document.documentElement.removeAttribute('data-chat');
  }, { once: true });

  async function runFrom(userIndex: number, ctrl = new AbortController()) {
    const model = picks.model;
    if (!model) return void showSetup();
    const target = chat;
    running = ctrl;
    const current = () => chat === target && running === ctrl && !ctx.signal?.aborted;
    setRunning(true);
    const turn = turnEl();
    thread.append(turn);
    let seg: ReturnType<typeof segment> | null = null;
    let painting = false;
    let lastMsg: Msg | null = null;
    const paint = () => {
      if (painting || !seg || !lastMsg) return;
      painting = true;
      requestAnimationFrame(() => {
        painting = false;
        if (!seg || !lastMsg || !current()) return;
        const stick = nearBottom();
        seg.body.innerHTML = md(lastMsg.content);
        if (lastMsg.thinking) {
          seg.think.hidden = false;
          (seg.think.lastChild as HTMLElement).textContent = lastMsg.thinking;
        }
        if (stick) toBottom();
      });
    };
    const rows = new Map<string, HTMLElement>();
    const on = (e: RunEvent) => {
      if (!current()) return;
      if (e.type === 'start') {
        seg = segment(turn);
        lastMsg = e.msg;
        seg.body.classList.add('cm-wait');
      } else if (e.type === 'text' || e.type === 'thinking') {
        lastMsg = e.msg;
        seg?.body.classList.remove('cm-wait');
        paint();
      } else if (e.type === 'message') {
        lastMsg = e.msg;
        seg?.body.classList.remove('cm-wait');
        if (seg && e.msg.thinking) (seg.think.firstChild as HTMLElement).textContent = 'Thought it through';
        paint();
      } else if (e.type === 'tool') {
        let r = rows.get(e.call.id);
        if (!r) {
          r = toolRow(e.label ?? e.call.name, e.state);
          rows.set(e.call.id, r);
          seg?.tools.append(r);
        }
        r.dataset.state = e.state;
        (r.lastChild as HTMLElement).textContent = e.label ?? e.call.name;
        if (nearBottom()) toBottom();
      } else if (e.type === 'error') {
        errorEl(turn, e.message, userIndex);
        play('fail');
      }
    };
    const history = target.messages.slice(0, userIndex + 1);
    try {
      const tools = model.tools ? await toolsFor(ctrl.signal) : browserTools();
      if (ctrl.signal.aborted || !current()) return;
      const extra = ctx.settings.ai.instructions;
      const added = await runChat({ model, effort: picks.effective(), system: systemPrompt(extra), history, tools, signal: ctrl.signal, on });
      if (!current()) return;
      target.messages = [...history, ...added];
      target.model = modelKey(model);
      target.updated = Date.now();
      await saveChat(target);
      if (!current()) return;
      turn.querySelectorAll('.cm-wait').forEach((x) => x.classList.remove('cm-wait'));
      [...turn.querySelectorAll('.cm-seg')].forEach((s) => {
        if (!s.textContent?.trim() && !s.querySelector('.cm-tool')) s.remove();
      });
      if (!turn.querySelector('.cm-err')) actions(turn, userIndex, model.label);
      if (!ctrl.signal.aborted && !turn.querySelector('.cm-err')) play('arrive');
    } catch (e) {
      if (current() && !ctrl.signal.aborted) errorEl(turn, (e as Error).message || 'The assistant could not finish. Try again.', userIndex);
    } finally {
      if (running === ctrl) {
        running = null;
        setRunning(false);
      }
    }
  }

  async function send(text: string, tabIds?: number[]) {
    const q = text.trim();
    if (!q || running) return;
    open();
    // Keep the question visible while models load or connection setup is needed.
    input.value = q;
    grow();
    await modelsReady;
    if (running || ctx.signal?.aborted) return;
    if (!picks.model) return void showSetup();
    const target = chat;
    const ctrl = new AbortController();
    running = ctrl;
    setRunning(true);
    try {
      if (!chat.messages.length) {
        chat.title = titleFor(q);
        title.textContent = chat.title;
        thread.replaceChildren();
      }
      // Attached tabs travel with the question, read now.
      const ids = tabIds ?? [...attached.keys()];
      const pages: string[] = [];
      const shown: { title: string; url: string }[] = [];
      for (const id of ids) {
        try {
          const p = await readTab(id, 16_000);
          pages.push(asPage(p));
          shown.push({ title: p.title, url: p.url });
        } catch {
          toast('This page could not be read. Remove its attachment or choose another page, then send again.');
          input.value = q;
          grow();
          return;
        }
        if (ctrl.signal.aborted || chat !== target || ctx.signal?.aborted) return;
      }
      if (ctrl.signal.aborted || chat !== target || ctx.signal?.aborted) return;
      const msg: Msg = { role: 'user', content: pages.length ? `${q}\n\n${pages.join('\n\n')}` : q, display: q, ...(shown.length ? { tabs: shown } : {}) };
      chat.messages.push(msg);
      await saveChat(target);
      if (ctrl.signal.aborted || chat !== target || ctx.signal?.aborted) return;
      thread.append(userEl(msg));
      toBottom();
      input.value = '';
      grow();
      if (o.where === 'newtab') {
        attached.clear();
        paintCtx();
      }
      play('send');
      await runFrom(target.messages.length - 1, ctrl);
    } finally {
      if (running === ctrl) {
        running = null;
        setRunning(false);
      }
    }
  }

  async function retry(userIndex: number) {
    if (running) return;
    chat.messages = chat.messages.slice(0, userIndex + 1);
    paintChat();
    const turns = thread.querySelectorAll('.cm-bot');
    turns[turns.length - 1]?.remove();
    await runFrom(userIndex);
  }

  const grow = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(220, input.scrollHeight)}px`;
  };
  input.addEventListener('input', grow);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void send(input.value);
    } else if (e.key === 'Escape' && running) {
      e.preventDefault();
      running.abort();
    }
  });
  sendBtn.addEventListener('click', () => (running ? running.abort() : void send(input.value)));

  // ---- header: history, new chat, close
  const historyMenu = async (anchor: HTMLElement) => {
    const all = await loadChats();
    const list = h('div', { class: 'cc-list', role: 'listbox', 'aria-label': 'Chats' });
    const paintList = (items: Chat[]) =>
      list.replaceChildren(
        ...(items.length
          ? items.map((c) =>
              h(
                'div',
                { class: 'cc-optrow' },
                h('button', { type: 'button', role: 'option', class: 'cc-opt', 'aria-selected': String(c.id === chat.id), onclick: () => (loadChat(c), closePop()) }, h('span', { class: 'cc-opt-t' }, c.title), h('span', { class: 'cc-opt-n' }, new Date(c.updated).toLocaleDateString())),
                h('button', { type: 'button', class: 'cc-del', title: 'Delete', 'aria-label': `Delete ${c.title}`, onclick: async () => (await deleteChat(c.id), paintList((await loadChats()).filter((x) => x.id !== c.id)), c.id === chat.id && newChat()) }, ico('close', 14)),
              ),
            )
          : [h('p', { class: 'cc-none' }, 'No chats yet.')]),
      );
    paintList(all);
    popover(anchor, list, 'cc-pop-history');
  };
  const newChat = () => {
    stop();
    chat = { id: uid('c_'), title: 'New chat', model: '', created: Date.now(), updated: Date.now(), messages: [] };
    paintChat();
    input.focus();
  };
  function loadChat(c: Chat) {
    stop();
    chat = c;
    paintChat();
  }
  const close = () => {
    if (o.where !== 'newtab') return;
    view.hidden = true;
    document.documentElement.removeAttribute('data-chat');
    closePop();
  };
  function open() {
    if (o.where !== 'newtab' || !view.hidden) return;
    view.hidden = false;
    document.documentElement.setAttribute('data-chat', '');
    if (!chat.messages.length) void paintEmpty();
    requestAnimationFrame(() => input.focus());
  }
  const head = h(
    'header',
    { class: 'cv-head' },
    title,
    h('span', { class: 'ask-gap' }),
    h('button', { type: 'button', class: 'nt-gear', title: 'Chats', 'aria-label': 'Chats', onclick: (e: MouseEvent) => void historyMenu(e.currentTarget as HTMLElement) }, ico('history', 18)),
    h('button', { type: 'button', class: 'nt-gear', title: 'New chat', 'aria-label': 'New chat', onclick: newChat }, ico('plus', 18)),
    h('button', { type: 'button', class: 'nt-gear', title: 'AI settings', 'aria-label': 'AI settings', onclick: () => openOptions('ai') }, ico('sliders', 18)),
    o.where === 'newtab' ? h('button', { type: 'button', class: 'nt-gear', title: 'Close', 'aria-label': 'Close chat', onclick: close }, ico('close', 18)) : null,
  );
  const composer = h('div', { class: 'cc' }, ctxRow, input, h('div', { class: 'cc-bar' }, pickerBar(picks, () => void showSetup()), toolsNote, h('span', { class: 'ask-gap' }), sendBtn));
  view.append(head, h('div', { class: 'cv-main' }, scroller, setupHost), h('div', { class: 'cv-foot' }, composer));
  view.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !running && !openPop && o.where === 'newtab') {
      e.preventDefault();
      close();
    }
  });
  // Tools count beside the menus, so you know what it can reach.
  const paintToolsNote = async () => {
    const servers = (await loadServers()).filter((s) => s.enabled).length;
    toolsNote.replaceChildren();
    if (!picks.model) return;
    toolsNote.title = picks.model.tools ? `Can read your tabs, history and bookmarks${servers ? `, plus ${servers} MCP ${servers === 1 ? 'server' : 'servers'}` : ''}` : 'This model can’t use tools; attach tabs instead';
    toolsNote.append(ico('tools', 16), h('span', {}, picks.model.tools ? (servers ? `Browser + ${servers}` : 'Browser') : 'No tools'));
    toolsNote.dataset.off = String(!picks.model.tools);
  };
  picks.on(() => void paintToolsNote());
  void paintToolsNote();
  if (o.where === 'panel') void paintEmpty();

  return {
    view,
    picks,
    pickerBar: () => pickerBar(picks, () => (open(), void showSetup())),
    open,
    close,
    isOpen: () => !view.hidden,
    send,
    newChat,
    load: loadChat,
    focus: () => input.focus(),
  };
}
