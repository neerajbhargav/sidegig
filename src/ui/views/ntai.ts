// The new tab's AI side: one box to ask any assistant, your browser's own AI
// first, and your recent chats from every assistant underneath (read from your
// local browser history; nothing leaves the device).
import { ext, uid } from '../../shared/api.ts';
import { getLocal, setLocal } from '../../shared/storage.ts';
import { appFromCatalog } from '../../shared/defaults.ts';
import { catalogById } from '../../shared/catalog.ts';
import type { AppEntry, PendingPrompt } from '../../shared/types.ts';
import type { Edition } from '../../shared/edition/types.ts';
import { PROVIDERS, providerOrder, chatsFromHistory, editionPrompt, type AiProvider, type Chat } from '../../shared/browserai.ts';
import { detectBrowser } from '../browser.ts';
import { voiceButton } from './ntwidgets.ts';
import { play } from '../sound.ts';
import { h, favicon, toast, ago, isMac, hostOf, appFavicon } from '../dom.ts';
import { type Ctx, openApp } from '../ctx.ts';

async function loadChats(): Promise<Chat[]> {
  if (!ext.history?.search) return [];
  const items = await ext.history.search({ text: '', startTime: Date.now() - 60 * 86_400_000, maxResults: 3000 }).catch(() => []);
  return chatsFromHistory(items, 40);
}

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
  /** The main button: "Ask Claude". */
  send: HTMLButtonElement;
  /** Voice input for the box. */
  voice: HTMLElement | null;
  /** Under the box: who to ask, tabs to include, starters, your chats. */
  below: HTMLElement;
}

/** The AI side of the new tab, in parts the page arranges. */
export async function aiParts(ctx: Ctx, onHome: () => void): Promise<AiParts> {
  const native = await detectBrowser();
  const preferred = ctx.settings.ai.defaultApp;
  const providers = providerOrder(native.provider, preferred);
  let chosen = (await getLocal<string>('ntAiProvider', '')) || providers[0].id;
  if (!PROVIDERS[chosen]) chosen = providers[0].id;

  const box = h('textarea', { class: 'ai-input', rows: 1, placeholder: 'Ask anything', spellcheck: 'true', 'aria-label': 'Ask AI' });
  const keysRow = h('div', { class: 'ai-to', role: 'radiogroup', 'aria-label': 'Ask with' });
  const paintKeys = () => {
    keysRow.replaceChildren(
      h('span', { class: 'ai-to-label' }, 'Ask with'),
      ...providers.map((p) =>
        h(
          'button',
          {
            type: 'button',
            class: 'ai-key',
            role: 'radio',
            'aria-checked': String(p.id === chosen),
            title: p.native ? `${p.name}, built into ${native.browser}` : p.name,
            onclick: () => {
              chosen = p.id;
              void setLocal('ntAiProvider', p.id);
              paintKeys();
              send.textContent = sendLabel();
              box.focus();
            },
          },
          h('b', { class: 'ai-led' }),
          appFavicon({ id: p.id, catalogId: p.id, url: p.home.startsWith('http') ? p.home : 'https://aside.com', name: p.name }, 'fav xs'),
          p.name,
          p.native ? h('span', { class: 'ai-native' }, 'built in') : null,
        ),
      ),
    );
  };
  const sendLabel = () => `Ask ${PROVIDERS[chosen].name}`;
  const send = h('button', { class: 'ask-go', type: 'button' }, sendLabel());

  // Like Dia's @tabs: pick open tabs to send along as context.
  const openTabs = (await ext.tabs.query({ currentWindow: true }).catch(() => [] as chrome.tabs.Tab[])).filter((t) => /^https?:/.test(t.url ?? '')).slice(0, 10);
  const picked = new Set<number>();
  const contextRow = openTabs.length
    ? h(
        'div',
        { class: 'ai-context' },
        h('span', { class: 'ai-to-label' }, 'Add tabs'),
        openTabs.map((t, n) =>
          h(
            'button',
            {
              type: 'button',
              class: 'ai-tab',
              'aria-pressed': 'false',
              title: t.url,
              onclick: (e: MouseEvent) => {
                const b = e.currentTarget as HTMLElement;
                if (picked.has(n)) picked.delete(n);
                else picked.add(n);
                b.setAttribute('aria-pressed', String(picked.has(n)));
                box.focus();
              },
            },
            favicon(t.url!, t.title ?? '', 'fav xs'),
            h('span', {}, t.title || hostOf(t.url!)),
          ),
        ),
      )
    : null;
  const withContext = () => {
    const tabsText = [...picked].map((n) => `- ${openTabs[n].title}: ${openTabs[n].url}`).join('\n');
    return tabsText ? `${box.value.trim()}\n\nContext, from my open tabs:\n${tabsText}` : box.value;
  };
  const fire = (side: boolean) => {
    play('send');
    void ask(ctx, PROVIDERS[chosen], withContext(), side);
  };
  send.addEventListener('click', (e) => fire(e.metaKey || e.ctrlKey));
  paintKeys();

  const grow = () => {
    box.style.height = 'auto';
    box.style.height = `${Math.min(220, box.scrollHeight)}px`;
  };
  box.addEventListener('input', () => {
    grow();
    renderChats();
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      fire(e.metaKey || e.ctrlKey);
    } else if (e.key === 'Tab' && !e.shiftKey && !box.value) {
      e.preventDefault();
      onHome();
    }
  });

  // Starters: questions that use what's already on this page.
  const starters = h('div', { class: 'ai-starters' });
  const ed = await getLocal<Edition | null>('edition', null);
  const starter = (label: string, make: () => Promise<string> | string) =>
    h(
      'button',
      {
        type: 'button',
        class: 'ai-starter',
        onclick: async () => {
          box.value = await make();
          grow();
          box.focus();
        },
      },
      label,
    );
  if (ed?.items.length) {
    starters.append(
      starter('Brief me on today’s edition', () => editionPrompt(ed.items)),
      starter('What should I read first?', () => editionPrompt(ed.items, 'Which one of these is most worth my time today, and what should I take away from it?')),
    );
  }
  starters.append(
    starter('Tidy my open tabs', async () => {
      const ts = (await ext.tabs.query({ currentWindow: true }).catch(() => [])).filter((t) => /^https?:/.test(t.url ?? '')).slice(0, 40);
      return `Group these open tabs by topic, tell me which I can close, and what I seem to be working on:\n\n${ts.map((t) => `- ${t.title}: ${t.url}`).join('\n')}`;
    }),
  );

  // Chats from every assistant, newest first.
  const chatsAll = await loadChats();
  let filterProvider = 'all';
  const list = h('div', { class: 'ai-chats' });
  const chips = h('div', { class: 'ai-chips' });
  const renderChats = () => {
    const q = box.value.trim().toLowerCase();
    const words = q.split(/\s+/).filter((w) => w.length > 2);
    const shown = chatsAll.filter((c) => (filterProvider === 'all' || c.provider === filterProvider) && (!words.length || words.some((w) => c.title.toLowerCase().includes(w))));
    list.replaceChildren(
      ...shown.slice(0, 14).map((c) =>
        h(
          'a',
          { class: 'ai-chat', href: c.url },
          favicon(c.url, PROVIDERS[c.provider].name, 'fav xs'),
          h('span', { class: 'ai-chat-t' }, c.title),
          h('span', { class: 'ai-chat-p' }, PROVIDERS[c.provider].name),
          h('span', { class: 'ai-chat-a' }, ago(c.at)),
        ),
      ),
    );
    if (!shown.length)
      list.append(h('div', { class: 'ai-empty' }, chatsAll.length ? 'No chats match. Press Enter to ask instead.' : 'Chats you have with Claude, ChatGPT, Gemini, Perplexity, Copilot or Grok show up here, straight from your browser history.'));
  };
  const providersWithChats = [...new Set(chatsAll.map((c) => c.provider))];
  const paintChips = () =>
    chips.replaceChildren(
      ...['all', ...providersWithChats].map((id) =>
        h(
          'button',
          { type: 'button', class: 'nt-space', 'aria-pressed': String(filterProvider === id), onclick: () => ((filterProvider = id), paintChips(), renderChats()) },
          id === 'all' ? `All ${chatsAll.length}` : PROVIDERS[id].name,
        ),
      ),
    );
  paintChips();
  renderChats();

  // Aside keeps its own chats (and routines) in its agent; link straight to them.
  const asideRow =
    native.provider === 'aside'
      ? h(
          'div',
          { class: 'ai-native-row' },
          h('span', { class: 'ai-native-mark' }, '◆'),
          h('span', { class: 'ai-native-text' }, 'Your Aside chats, projects and routines live in Aside.'),
          h('button', { type: 'button', class: 'ai-link', onclick: () => void ask(ctx, PROVIDERS.aside, '', false) }, 'New Aside chat'),
          h(
            'button',
            {
              type: 'button',
              class: 'ai-link',
              onclick: async () => {
                const id = await currentTabId();
                if (id !== undefined) await ext.tabs.update(id, { url: PROVIDERS.aside.chats! });
              },
            },
            'All Aside chats →',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'ai-link',
              title: 'Aside’s own new tab page',
              onclick: async () => {
                const id = await currentTabId();
                if (id !== undefined) await ext.tabs.update(id, { url: PROVIDERS.aside.home });
              },
            },
            'Aside home',
          ),
        )
      : null;

  const below = h(
    'section',
    { class: 'nt-ai' },
    keysRow,
    contextRow,
    starters.childElementCount ? starters : null,
    asideRow,
    h('section', { class: 'nt-card ai-sec', 'aria-label': 'Chats' }, h('header', { class: 'nt-card-h' }, h('h2', {}, 'Chats'), h('div', { class: 'nt-card-a' }, chips)), list),
  );
  return { box, send, voice: voiceButton(box, grow), below };
}
