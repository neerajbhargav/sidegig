// Runs inside app sites (WhatsApp, Gmail, Claude, ...), both in normal tabs and
// inside sidegig's panel. Three jobs:
//   1. report unread counts parsed from the page title (for rail badges)
//   2. for AI apps, type a prompt handed over from "Ask AI" into the input box
//   3. right after you ask your AI for your interests (new tab edition), read
//      back only that one JSON reply. Nothing else on the page is read, and
//      only while that request is pending.
import { ext } from '../shared/api.ts';
import { loadSettings, onLocalChanged, getLocal } from '../shared/storage.ts';
import { IMPORT_MARKER, parseImport } from '../shared/edition/profile.ts';
import { catalogByHost } from '../shared/catalog.ts';
import { parseBadge } from '../shared/badge.ts';
import type { PendingPrompt } from '../shared/types.ts';
import type { ToBackground } from '../shared/messages.ts';

const host = location.hostname;
const send = (m: ToBackground) => ext.runtime.sendMessage(m);

/** The app's own top document: a normal tab, or the frame sidegig's panel embeds. */
function isMainFrame(): boolean {
  if (window === window.top) return true;
  const anc = (location as any).ancestorOrigins as DOMStringList | undefined;
  if (anc && anc.length) return /^(chrome|moz|safari-web)-extension:/.test(anc[0]);
  return window.parent === window.top;
}

const visible = (el: Element) => {
  const r = (el as HTMLElement).getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

function findFirst(selectors: string[]): HTMLElement | null {
  for (const sel of selectors) {
    for (const el of document.querySelectorAll<HTMLElement>(sel)) if (visible(el)) return el;
  }
  return null;
}

function waitFor(selectors: string[], timeout = 20_000): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const found = findFirst(selectors);
    if (found) return resolve(found);
    const obs = new MutationObserver(() => {
      const el = findFirst(selectors);
      if (el) {
        obs.disconnect();
        clearTimeout(t);
        resolve(el);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    const t = setTimeout(() => (obs.disconnect(), resolve(null)), timeout);
  });
}

/**
 * Put a question in the composer, replacing what's there: AI sites keep unsent
 * text, so appending piled up old prompts from earlier asks.
 */
export function insertText(el: HTMLElement, text: string): boolean {
  el.focus();
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return el.value.includes(text.slice(0, 40));
  }
  // Rich editors (ProseMirror, Quill): select everything, then type over it.
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  sel?.removeAllRanges();
  sel?.addRange(range);
  const probe = text.slice(0, 40);
  if (document.execCommand('insertText', false, text) && el.innerText.includes(probe)) return true;
  // Fallback: a synthetic paste, which most editors handle.
  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  return el.innerText.includes(probe);
}

async function deliver(p: PendingPrompt, inputs: string[], sendSel: string[]) {
  const el = await waitFor(inputs);
  if (!el) return;
  const ok = insertText(el, p.text);
  if (ok && p.autoSend) {
    setTimeout(() => {
      const btn = findFirst(sendSel) as HTMLButtonElement | null;
      if (btn && !btn.disabled) btn.click();
    }, 450);
  }
}

async function main() {
  if (!isMainFrame()) return;
  const s = await loadSettings();
  const cat = catalogByHost(host);
  const app = s.apps.find((a) => {
    try {
      return new URL(a.url).hostname === host;
    } catch {
      return false;
    }
  });

  // 1. Unread badges from the title.
  const kind = cat?.badge ?? (app?.badge ? 'parens' : 'none');
  if (app?.badge && kind !== 'none') {
    let last = Number.NaN;
    let timer = 0;
    const report = () => {
      const b = parseBadge(document.title, kind);
      if (!b || b.count === last) return;
      last = b.count;
      void send({ type: 'badge', count: b.count }).catch(() => undefined);
    };
    const watch = () => {
      clearTimeout(timer);
      timer = window.setTimeout(report, 400);
    };
    report();
    new MutationObserver(watch).observe(document.head ?? document.documentElement, { subtree: true, childList: true, characterData: true });
  }

  // 2. Prompt hand-off for AI apps.
  if (cat?.aiInput?.length) {
    const tryClaim = async () => {
      const p = (await send({ type: 'ai-claim' }).catch(() => null)) as PendingPrompt | null;
      if (p) await deliver(p, cat.aiInput!, cat.aiSend ?? []);
    };
    void tryClaim();
    onLocalChanged('aiPending', (v) => {
      const p = v as PendingPrompt | null;
      if (p && p.host === host && document.visibilityState === 'visible') void tryClaim();
    });

    // 3. Read back the interest profile your AI writes for the new tab edition.
    void watchImport();
    onLocalChanged('edImport', () => void watchImport());
  }
}

let watching = false;

/** The newest block on the page that carries the profile marker and parses. */
function latestProfileText(): string | null {
  const blocks = [...document.querySelectorAll('pre, code')].map((e) => e.textContent ?? '').filter((t) => t.includes(IMPORT_MARKER));
  for (let i = blocks.length - 1; i >= 0; i--) if (parseImport(blocks[i])) return blocks[i];
  // Some apps render JSON as plain text: look after the last mention only (the prompt's own example never parses).
  const body = document.body?.innerText ?? '';
  const at = body.lastIndexOf(IMPORT_MARKER);
  if (at < 0) return null;
  const tail = body.slice(Math.max(0, body.lastIndexOf('{', at)));
  return parseImport(tail) ? tail : null;
}

async function watchImport() {
  const pending = await getLocal<{ host: string; at: number } | null>('edImport', null);
  if (watching || !pending || pending.host !== host || Date.now() - pending.at > 20 * 60_000) return;
  watching = true;
  let last = '';
  let since = 0;
  const stop = () => {
    clearInterval(timer);
    watching = false;
  };
  const timer = window.setInterval(() => {
    if (Date.now() - pending.at > 20 * 60_000) return stop();
    const text = latestProfileText();
    if (!text) return;
    // Replies stream in: wait until the block stops changing.
    if (text !== last) {
      last = text;
      since = Date.now();
      return;
    }
    if (Date.now() - since < 1500) return;
    stop();
    void send({ type: 'profile-import', text }).catch(() => undefined);
  }, 700);
}

void main();
