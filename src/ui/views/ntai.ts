// The new tab's AI side: one box to ask any assistant, your browser's own AI
// first, and your recent chats from every assistant underneath (read from your
// local browser history; nothing leaves the device).
import { ext, uid } from '../../shared/api.ts';
import { getLocal, setLocal } from '../../shared/storage.ts';
import { appFromCatalog } from '../../shared/defaults.ts';
import { catalogById } from '../../shared/catalog.ts';
import type { AppEntry, PendingPrompt } from '../../shared/types.ts';
import type { Edition } from '../../shared/edition/types.ts';
import { providerOrder, type AiProvider } from '../../shared/browserai.ts';
import { detectBrowser } from '../browser.ts';
import { voiceButton } from './ntwidgets.ts';
import { play } from '../sound.ts';
import { h, ico, toast, isMac, appFavicon } from '../dom.ts';
import { chatUi, loadChats, type ChatUi } from './ntchat.ts';
import { type Ctx, openApp } from '../ctx.ts';


const appFor = (ctx: Ctx, id: string): AppEntry | undefined =>
  ctx.settings.apps.find((a) => (a.catalogId ?? a.id) === id) ?? (catalogById(id) ? appFromCatalog(id) : undefined);

async function currentTabId(): Promise<number | undefined> {
  return (await ext.tabs.getCurrent().catch(() => undefined))?.id;
}

/** Hand the question to an assistant: here (replacing the new tab) or in the sidebar. */
async function ask(ctx: Ctx, p: AiProvider, q: string, side: boolean) {
  const text = q.trim();
  if (side && p.appId) {
    const app = appFor(ctx, p.appId);
    if (app) {
      // The sidebar has to open inside the keypress, before anything async.
      openApp(ctx, { ...app, openIn: 'panel' });
      if (text) {
        const pending: PendingPrompt = { id: uid('p_'), appId: app.id, host: new URL(app.url).hostname, text, autoSend: true, created: Date.now() };
        void setLocal('aiPending', pending);
      }
      return;
    }
  }
  if (p.native) {
    // Built-in assistants have no address that takes a question, so it travels by clipboard.
    if (text) await navigator.clipboard.writeText(text).catch(() => undefined);
    const id = await currentTabId();
    const url = p.newChat ?? p.home;
    if (id !== undefined) await ext.tabs.update(id, { url });
    else await ext.tabs.create({ url });
    if (text) toast(`Question copied. Paste it into ${p.name} with ${isMac ? '⌘V' : 'Ctrl+V'}.`);
    return;
  }
  if (!text) return void (location.href = p.home);
  if (p.ask) return void (location.href = p.ask(text));
  if (p.appId) {
    const pending: PendingPrompt = { id: uid('p_'), appId: p.appId, host: new URL(p.home).hostname, text, autoSend: true, created: Date.now() };
    await setLocal('aiPending', pending);
    location.href = p.home;
    return;
  }
  // No way to hand it over: carry it on the clipboard.
  await navigator.clipboard.writeText(text).catch(() => undefined);
  toast(`Question copied. Paste it into ${p.name} with ${isMac ? '⌘V' : 'Ctrl+V'}.`);
  location.href = p.home;
}

export interface AiParts {
  /** The question box (goes inside the page's search box). */
  box: HTMLTextAreaElement;
  /** Send: opens the chat over the page and asks. */
  send: HTMLButtonElement;
  /** Voice input for the box. */
  voice: HTMLElement | null;
  /** The model and effort menus, for the box's bar. */
  pickers: HTMLElement;
  /** Under the box: recent chats, and asking elsewhere. */
  below: HTMLElement;
  /** The conversation, shown over the page once you ask. */
  chat: ChatUi;
}

/**
 * The AI side of the new tab: a chat built into the browser (your models, your
 * keys or plan, tools that read your tabs). Asking ChatGPT, Claude, Gemini or
 * the browser's own assistant on their sites is still a click away.
 */
export async function aiParts(ctx: Ctx, onHome: () => void): Promise<AiParts> {
  const chat = await chatUi(ctx, { where: 'newtab' });
  const box = h('textarea', { class: 'ai-input', rows: 1, placeholder: 'Ask anything', spellcheck: 'true', 'aria-label': 'Ask AI' });
  const send = h('button', { class: 'ask-go round', type: 'button', title: 'Ask', 'aria-label': 'Ask' }, ico('send', 20));
  const fire = () => {
    const q = box.value.trim();
    if (!q) return chat.open();
    box.value = '';
    grow();
    void chat.send(q);
  };
  send.addEventListener('click', fire);
  const grow = () => {
    box.style.height = 'auto';
    box.style.height = `${Math.min(220, box.scrollHeight)}px`;
  };
  box.addEventListener('input', grow);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      fire();
    } else if (e.key === 'Tab' && !e.shiftKey && !box.value) {
      e.preventDefault();
      onHome();
    }
  });

  // Recent chats, then asking an assistant on its own site (no setup needed).
  const native = await detectBrowser();
  const providers = providerOrder(native.provider, ctx.settings.ai.defaultApp).slice(0, 6);
  const recent = (await loadChats()).slice(0, 4);
  const below = h(
    'section',
    { class: 'nt-ai nt-card' },
    recent.length
      ? h(
          'div',
          { class: 'ai-sec ai-recent' },
          h('div', { class: 'cc-group' }, 'Recent chats'),
          recent.map((c) => h('button', { type: 'button', class: 'cv-recent', onclick: () => (chat.open(), void loadInto(chat, c.id)) }, h('span', {}, c.title), h('span', { class: 'cc-opt-n' }, new Date(c.updated).toLocaleDateString()))),
        )
      : null,
    h(
      'div',
      { class: 'ai-sec ai-elsewhere' },
      h('span', { class: 'ai-to-label' }, 'Or ask on'),
      providers.map((p) =>
        h(
          'button',
          { type: 'button', class: 'ai-key', title: p.native ? `${p.name}, built into ${native.browser}` : `Open ${p.name} with your question`, onclick: (e: MouseEvent) => (play('send'), void ask(ctx, p, box.value, e.metaKey || e.ctrlKey)) },
          appFavicon({ id: p.id, catalogId: p.id, url: p.home.startsWith('http') ? p.home : 'https://aside.com', name: p.name }, 'fav xs'),
          p.name,
        ),
      ),
    ),
  );
  return { box, send, voice: voiceButton(box, grow), pickers: chat.pickerBar(), below, chat };
}

/** Open a saved chat in the chat view. */
async function loadInto(chat: ChatUi, id: string) {
  const c = (await loadChats()).find((x) => x.id === id);
  if (c) chat.load(c);
}
