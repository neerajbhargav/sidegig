// Agents (Claude Code, Codex, Cursor) use this browser through the local
// bridge, only as far as you allow in Settings, AI: off (the default), read
// only, or full. While access is on, the worker keeps one paired connection to
// the bridge and answers its browser_* tool calls. A tab an agent works in
// shows a banner with Stop, which turns access off.
import { ext } from '../shared/api.ts';
import { getLocal, setLocal } from '../shared/storage.ts';
import { openBridge } from '../shared/ai/bridge.ts';
import { isRestricted } from '../shared/rules.ts';
import { neutralize } from '../shared/prompt.ts';

export type AgentAccess = 'off' | 'read' | 'full';
export interface AgentLink { state: 'off' | 'waiting' | 'connected'; at: number; error?: string }
type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
type Result = { content: Content[]; isError?: boolean };

/** Tools that change something: only with full access. */
export const ACTIONS = new Set(['browser_open', 'browser_click', 'browser_type', 'browser_press', 'browser_scroll', 'browser_back', 'browser_close']);
export const READS = new Set(['browser_tabs', 'browser_read', 'browser_screenshot', 'browser_history']);

/** Why a call is refused, or '' when access allows it. */
export function refusal(name: string, access: AgentAccess): string {
  if (!ACTIONS.has(name) && !READS.has(name)) return `sidegig has no tool called ${name}.`;
  if (access === 'off') return 'Agent access is off. The user can turn it on in sidegig Settings, AI.';
  if (ACTIONS.has(name) && access !== 'full') return 'sidegig gives agents read-only access. The user can allow actions in sidegig Settings, AI.';
  return '';
}

/** What browser_read returns. Everything from the page is neutralized, so it cannot close <page> or fake a turn. */
export const agentPage = (id: number, r: { title: string; url: string; controls: string[]; text: string }) =>
  `Tab ${id}: ${neutralize(r.title)}\n${r.url}\n\nControls (use the number as ref):\n${neutralize(r.controls.join('\n')) || '(none)'}\n\n<page>\n${neutralize(r.text)}\n</page>`;

const text = (t: string, isError = false): Result => ({ content: [{ type: 'text', text: t }], isError });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let sock: WebSocket | null = null;
let connecting = false;

/** Connect, stay connected, or disconnect to match the access setting. */
export async function agentLink(): Promise<void> {
  const access = await getLocal<AgentAccess>('agentAccess', 'off');
  // While access is on, check the connection every minute (the bridge may start later).
  if (access === 'off') await ext.alarms.clear('agent');
  else if (!(await ext.alarms.get('agent'))) ext.alarms.create('agent', { periodInMinutes: 1 });
  if (access === 'off') {
    sock?.close();
    sock = null;
    await setLocal('agentLink', { state: 'off', at: Date.now() } satisfies AgentLink);
    return;
  }
  if (sock || connecting) return;
  connecting = true;
  try {
    const { ws } = await openBridge('host', 3000);
    sock = ws;
    await setLocal('agentLink', { state: 'connected', at: Date.now() } satisfies AgentLink);
    ws.addEventListener('message', (e) => void onBridge(ws, String(e.data)));
    ws.addEventListener('close', () => {
      if (sock !== ws) return;
      sock = null;
      void setLocal('agentLink', { state: 'waiting', at: Date.now() } satisfies AgentLink);
    });
  } catch (e) {
    await setLocal('agentLink', { state: 'waiting', at: Date.now(), error: (e as Error).message } satisfies AgentLink);
  } finally {
    connecting = false;
  }
}

async function onBridge(ws: WebSocket, raw: string) {
  let m: { type?: string; id?: string; name?: string; args?: Record<string, unknown> };
  try {
    m = JSON.parse(raw);
  } catch {
    return;
  }
  if (m.type !== 'tool' || !m.id || !m.name) return;
  const r = await runTool(m.name, m.args ?? {}).catch((e) => text((e as Error).message || 'That didn’t work.', true));
  try {
    ws.send(JSON.stringify({ type: 'tool.result', id: m.id, content: r.content, isError: !!r.isError }));
  } catch {
    /* the bridge went away */
  }
}

async function targetTab(args: Record<string, unknown>): Promise<chrome.tabs.Tab> {
  const tab = typeof args.tabId === 'number' ? await ext.tabs.get(args.tabId) : (await ext.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (!tab?.id) throw new Error('No tab to work in.');
  if (isRestricted(tab.url)) throw new Error('The browser doesn’t let extensions work in that tab (a settings, store or browser page).');
  return tab;
}

async function inPage<A extends unknown[], R>(tabId: number, func: (...a: A) => R, args: A): Promise<R> {
  const [res] = await ext.scripting.executeScript({ target: { tabId }, func: func as any, args: args as any });
  return res?.result as R;
}

async function runTool(name: string, args: Record<string, unknown>): Promise<Result> {
  const no = refusal(name, await getLocal<AgentAccess>('agentAccess', 'off'));
  if (no) return text(no, true);
  switch (name) {
    case 'browser_tabs': {
      const tabs = (await ext.tabs.query({})).filter((t) => /^https?:/.test(t.url ?? ''));
      return text(tabs.map((t) => `${t.id}\t${t.active ? '(active) ' : ''}${neutralize(t.title ?? '')}\t${t.url}`).join('\n') || 'No web tabs are open.');
    }
    case 'browser_history': {
      const days = Math.max(1, Math.min(365, Number(args.days) || 30));
      const items = await ext.history.search({ text: String(args.query ?? ''), startTime: Date.now() - days * 86_400_000, maxResults: 30 });
      return text(items.map((i) => `${new Date(i.lastVisitTime ?? 0).toISOString().slice(0, 10)}\t${neutralize(i.title ?? '')}\t${i.url}`).join('\n') || 'Nothing in history matches.');
    }
    case 'browser_open': {
      const url = String(args.url ?? '');
      if (!/^https?:\/\//.test(url)) return text('Only http and https addresses can be opened.', true);
      const tab = typeof args.tabId === 'number' ? await ext.tabs.update(args.tabId, { url, active: true }) : await ext.tabs.create({ url, active: true });
      if (tab?.id !== undefined) await waitLoaded(tab.id);
      if (tab?.id !== undefined) void banner(tab.id);
      return text(`Opened in tab ${tab?.id}.`);
    }
  }
  const tab = await targetTab(args);
  const id = tab.id!;
  void banner(id);
  switch (name) {
    case 'browser_read': {
      const r = await inPage(id, snapshotPage, [20_000]);
      if (!r) return text('The page didn’t answer.', true);
      return text(agentPage(id, r));
    }
    case 'browser_screenshot': {
      await ext.tabs.update(id, { active: true });
      await ext.windows.update(tab.windowId, { focused: true });
      await sleep(350);
      const url = await ext.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 70 });
      return { content: [{ type: 'image', data: url.slice(url.indexOf(',') + 1), mimeType: 'image/jpeg' }] };
    }
    case 'browser_click':
    case 'browser_type':
    case 'browser_press':
    case 'browser_scroll': {
      const r = await inPage(id, actInPage, [name, args.ref ?? null, String(args.text ?? ''), !!args.submit, String(args.key ?? ''), String(args.direction ?? 'down')]);
      await sleep(300);
      return text(r ?? 'The page didn’t answer.', !r || r.startsWith('No element'));
    }
    case 'browser_back':
      await ext.tabs.goBack(id);
      await waitLoaded(id);
      return text('Went back.');
    case 'browser_close':
      await ext.tabs.remove(id);
      return text(`Closed tab ${id}.`);
  }
  return text(`sidegig has no tool called ${name}.`, true);
}

async function waitLoaded(tabId: number) {
  for (let i = 0; i < 40; i++) {
    const t = await ext.tabs.get(tabId).catch(() => null);
    if (!t || t.status === 'complete') return;
    await sleep(250);
  }
}

/** Turn agent access off (the banner's Stop, or the user in settings). */
export async function stopAgents(): Promise<void> {
  await setLocal('agentAccess', 'off');
  await agentLink();
}

// ------------------------------------------------------------ in the page (no closures: serialized by executeScript)

/** The page's text and its controls, each numbered so an agent can act on it. */
function snapshotPage(max: number) {
  for (const old of document.querySelectorAll('[data-sidegig-ref]')) old.removeAttribute('data-sidegig-ref');
  const sel = 'a[href], button, input:not([type="hidden"]), textarea, select, summary, [role="button"], [role="link"], [role="checkbox"], [role="tab"], [role="menuitem"], [role="option"], [contenteditable=""], [contenteditable="true"]';
  const controls: string[] = [];
  let n = 0;
  for (const el of document.querySelectorAll<HTMLElement>(sel)) {
    if (n >= 300) break;
    const box = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    if (!box.width || !box.height || st.visibility === 'hidden' || st.display === 'none') continue;
    const ref = ++n;
    el.setAttribute('data-sidegig-ref', String(ref));
    const input = el as HTMLInputElement;
    const tag = el.tagName;
    const role =
      el.getAttribute('role') ||
      (tag === 'A' ? 'link' : tag === 'BUTTON' || tag === 'SUMMARY' || input.type === 'submit' || input.type === 'button' ? 'button' : input.type === 'checkbox' || input.type === 'radio' ? input.type : tag === 'SELECT' ? 'select' : 'field');
    const label = (el.getAttribute('aria-label') || input.labels?.[0]?.innerText || (role === 'field' ? '' : el.innerText) || input.placeholder || el.title || el.getAttribute('alt') || (role === 'button' ? input.value : '') || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    // Field contents, except passwords.
    const value = role === 'field' && input.type !== 'password' && (input.value || el.isContentEditable) ? ` value="${(input.value ?? el.innerText ?? '').slice(0, 60)}"` : '';
    const state = (role === 'checkbox' || role === 'radio') && input.checked ? ' checked' : '';
    const href = tag === 'A' ? ` -> ${(el.getAttribute('href') ?? '').slice(0, 80)}` : '';
    controls.push(`[${ref}] ${role} "${label}"${value}${state}${href}`);
  }
  const pick = document.querySelector('article, main, [role="main"]') as HTMLElement | null;
  const root = pick && pick.innerText.trim().length > 400 ? pick : document.body;
  const body = (root?.innerText ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title: document.title, url: location.href, controls, text: body.length > max ? `${body.slice(0, max)}\n[…trimmed]` : body };
}

/** Click, type, press a key or scroll. Returns a line for the agent. */
function actInPage(tool: string, ref: unknown, value: string, submit: boolean, key: string, direction: string): string {
  const find = () => document.querySelector<HTMLElement>(`[data-sidegig-ref="${Number(ref)}"]`);
  if (tool === 'browser_scroll') {
    scrollBy({ top: (direction === 'up' ? -0.8 : 0.8) * innerHeight });
    return `Scrolled ${direction === 'up' ? 'up' : 'down'}.`;
  }
  if (tool === 'browser_press') {
    const target = (document.activeElement as HTMLElement | null) ?? document.body;
    if (key === 'PageDown' || key === 'PageUp') {
      scrollBy({ top: (key === 'PageUp' ? -0.9 : 0.9) * innerHeight });
      return `Pressed ${key}.`;
    }
    if (key === 'Tab') {
      const all = [...document.querySelectorAll<HTMLElement>('a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter((e) => e.offsetParent !== null);
      all[(all.indexOf(target) + 1) % all.length]?.focus();
      return 'Pressed Tab.';
    }
    for (const type of ['keydown', 'keyup']) target.dispatchEvent(new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true }));
    if (key === 'Enter') (target as HTMLInputElement).form?.requestSubmit();
    return `Pressed ${key}.`;
  }
  const el = find();
  if (!el) return 'No element with that ref. Call browser_read again: the page may have changed.';
  el.scrollIntoView({ block: 'center' });
  if (tool === 'browser_click') {
    el.focus();
    el.click();
    return `Clicked [${ref}].`;
  }
  el.focus();
  if (el.isContentEditable) {
    document.execCommand('selectAll');
    document.execCommand('insertText', false, value);
  } else {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (submit) {
    for (const type of ['keydown', 'keyup']) el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    (el as HTMLInputElement).form?.requestSubmit();
  }
  return `Typed into [${ref}]${submit ? ' and pressed Enter' : ''}.`;
}

/** "An agent is using this tab" with Stop, for 8 seconds after its last action. */
async function banner(tabId: number) {
  await ext.scripting
    .executeScript({
      target: { tabId },
      func: () => {
        const w = window as unknown as { __sidegigAgent?: { host: HTMLElement; timer: number } };
        let a = w.__sidegigAgent;
        if (!a?.host.isConnected) {
          const host = document.createElement('sidegig-agent');
          host.style.cssText = 'all:initial;position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;';
          const root = host.attachShadow({ mode: 'closed' });
          root.innerHTML = `<style>
            div{display:flex;align-items:center;gap:10px;padding:6px 6px 6px 14px;border-radius:999px;background:#0b57d0;color:#fff;font:500 13px/1.2 system-ui,sans-serif;border:1px solid rgba(255,255,255,.35)}
            i{width:8px;height:8px;border-radius:50%;background:#fff;opacity:.9}
            button{all:unset;cursor:pointer;padding:6px 12px;border-radius:999px;background:#fff;color:#0b57d0;font-weight:600;text-align:center}
            button:focus-visible{outline:2px solid #fff;outline-offset:2px}
          </style><div role="status"><i></i><span>An agent is using this tab through sidegig</span><button type="button">Stop</button></div>`;
          root.querySelector('button')!.addEventListener('click', () => {
            void chrome.runtime.sendMessage({ type: 'agent-stop' });
            host.remove();
          });
          (document.body ?? document.documentElement).append(host);
          a = w.__sidegigAgent = { host, timer: 0 };
        }
        clearTimeout(a.timer);
        const live = a;
        a.timer = window.setTimeout(() => live.host.remove(), 8000);
      },
    })
    .catch(() => undefined);
}
