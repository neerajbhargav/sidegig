// The AI side of the new tab. Knows which AI your browser ships with (Aside,
// Copilot in Edge, Leo in Brave, Gemini in Chrome, Perplexity in Comet), how
// to hand each assistant a question, and how to recognize your past chats in
// your own browser history. Pure functions, unit-tested.

export const ASIDE_EXTENSION = 'fjdhphbdlfjogobdofoaagnlnkoibdge';
const asidePage = (path: string) => `chrome-extension://${ASIDE_EXTENSION}/${path}`;

export interface AiProvider {
  id: string;
  name: string;
  /** Where "open" goes. */
  home: string;
  /** A URL that starts a new chat with the question filled in (and usually sent). */
  ask?: (q: string) => string;
  /** No ask URL: sidegig types the question in itself (catalog app id for the bridge). */
  appId?: string;
  /** Built into the browser: no ask URL and no page we can type into, so the question goes via the clipboard. */
  native?: boolean;
  /** Where your chats with it live. */
  chats?: string;
  newChat?: string;
  /** Matches one chat's URL in history. */
  chat?: RegExp;
  /** History search text that finds those chats. */
  historyText?: string;
  /** Strip the site name from a chat's title. */
  strip?: RegExp;
  /** Titles that say nothing about the chat ("Google Gemini"). */
  generic?: RegExp;
}

const enc = encodeURIComponent;

export const PROVIDERS: Record<string, AiProvider> = {
  aside: {
    id: 'aside',
    name: 'Aside',
    home: asidePage('newtab.html'),
    native: true,
    newChat: asidePage('main.html#/u/0/tasks/new'),
    chats: asidePage('main.html#/u/0/tasks'),
  },
  claude: {
    id: 'claude',
    name: 'Claude',
    home: 'https://claude.ai/new',
    ask: (q) => `https://claude.ai/new?q=${enc(q)}`,
    appId: 'claude',
    chats: 'https://claude.ai/recents',
    chat: /^https:\/\/claude\.ai\/chat\/[0-9a-f-]{36}/,
    historyText: 'claude.ai/chat',
    strip: /\s*[-–|]\s*Claude\s*$/,
    generic: /^(Claude|New chat)$/i,
  },
  chatgpt: {
    id: 'chatgpt',
    name: 'ChatGPT',
    home: 'https://chatgpt.com/',
    ask: (q) => `https://chatgpt.com/?q=${enc(q)}`,
    appId: 'chatgpt',
    chat: /^https:\/\/chatgpt\.com\/(g\/[^/]+\/)?c\/[\w-]+/,
    historyText: 'chatgpt.com/c/',
    strip: /^ChatGPT\s*[-–|:]\s*|\s*[-–|]\s*ChatGPT\s*$/,
    generic: /^ChatGPT$/i,
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    home: 'https://gemini.google.com/app',
    appId: 'gemini',
    chat: /^https:\/\/gemini\.google\.com\/(u\/\d+\/)?app\/[0-9a-f]{8,}/,
    historyText: 'gemini.google.com/app/',
    strip: /\s*[-–|]\s*(Google\s+)?Gemini\s*$/,
    generic: /^(Google\s+)?Gemini$/i,
  },
  perplexity: {
    id: 'perplexity',
    name: 'Perplexity',
    home: 'https://www.perplexity.ai/',
    ask: (q) => `https://www.perplexity.ai/search?q=${enc(q)}`,
    appId: 'perplexity',
    chat: /^https:\/\/www\.perplexity\.ai\/search\/[\w.-]+/,
    historyText: 'perplexity.ai/search/',
    strip: /\s*[-–|]\s*Perplexity\s*$/,
  },
  aimode: {
    id: 'aimode',
    name: 'AI Mode',
    home: 'https://www.google.com/search?udm=50',
    ask: (q) => `https://www.google.com/search?udm=50&q=${enc(q)}`,
    chat: /^https:\/\/www\.google\.[a-z.]+\/search\?(?=.*\budm=50\b).*\bq=/,
    historyText: 'udm=50',
    strip: /\s*[-–]\s*Google (Search|AI Mode)\s*$/,
  },
  copilot: {
    id: 'copilot',
    name: 'Copilot',
    home: 'https://copilot.microsoft.com/',
    ask: (q) => `https://copilot.microsoft.com/?q=${enc(q)}`,
    chat: /^https:\/\/copilot\.microsoft\.com\/chats\/[\w-]+/,
    historyText: 'copilot.microsoft.com/chats',
    strip: /\s*[-–|]\s*(Microsoft\s+)?Copilot.*$/,
    generic: /^(Microsoft\s+)?Copilot/i,
  },
  grok: {
    id: 'grok',
    name: 'Grok',
    home: 'https://grok.com/',
    ask: (q) => `https://grok.com/?q=${enc(q)}`,
    appId: 'grok',
    chat: /^https:\/\/grok\.com\/c\/[\w-]+/,
    historyText: 'grok.com/c/',
    strip: /\s*[-–|]\s*Grok\s*$/,
    generic: /^Grok$/i,
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    home: 'https://chat.deepseek.com/',
    chat: /^https:\/\/chat\.deepseek\.com\/a?\/?chat\/s\/[\w-]+/,
    strip: /\s*[-–|]\s*DeepSeek\s*$/,
    generic: /^DeepSeek/i,
  },
  lechat: {
    id: 'lechat',
    name: 'Le Chat',
    home: 'https://chat.mistral.ai/chat',
    ask: (q) => `https://chat.mistral.ai/chat?q=${enc(q)}`,
    chat: /^https:\/\/chat\.mistral\.ai\/chat\/[\w-]{8,}/,
    strip: /\s*[-–|]\s*Le Chat\s*$/,
    generic: /^Le Chat/i,
  },
  leo: {
    id: 'leo',
    name: 'Leo',
    home: 'brave://leo-ai',
    native: true,
    newChat: 'brave://leo-ai',
  },
};

export interface BrowserInfo {
  brands: string[];
  brave?: boolean;
  /** Aside's agent extension answered. */
  aside?: boolean;
  /** Arc paints its space colours into pages as --arc-palette-* variables. */
  arc?: boolean;
  /** Build target, for the non-Chromium builds. */
  target?: string;
}

/** Which browser family, for matching its look. */
export type BrowserId = 'aside' | 'chrome' | 'edge' | 'brave' | 'opera' | 'vivaldi' | 'arc' | 'dia' | 'comet' | 'chromium' | 'firefox' | 'safari';

export interface NativeInfo {
  id: BrowserId;
  browser: string;
  /** The assistant built into it, if any. */
  provider?: string;
  /** The browser's own new tab, for when you'd rather not use sidegig's. */
  ntp: string;
}

/** The browser and the assistant it ships with, best guess first. */
export function nativeAi(b: BrowserInfo): NativeInfo {
  const has = (re: RegExp) => b.brands.some((x) => re.test(x));
  if (b.target === 'firefox') return { id: 'firefox', browser: 'Firefox', ntp: 'about:home' };
  if (b.target === 'safari') return { id: 'safari', browser: 'Safari', ntp: 'about:blank' };
  if (b.aside) return { id: 'aside', browser: 'Aside', provider: 'aside', ntp: asidePage('newtab.html') };
  if (b.arc) return { id: 'arc', browser: 'Arc', ntp: 'about:blank' };
  if (b.brave || has(/^Brave/)) return { id: 'brave', browser: 'Brave', provider: 'leo', ntp: 'about:blank' };
  if (has(/Edge/)) return { id: 'edge', browser: 'Edge', provider: 'copilot', ntp: 'about:blank' };
  if (has(/Comet|Perplexity/)) return { id: 'comet', browser: 'Comet', provider: 'perplexity', ntp: 'chrome://new-tab-page/' };
  if (has(/^Opera/)) return { id: 'opera', browser: 'Opera', ntp: 'opera://startpage' };
  if (has(/^Vivaldi/)) return { id: 'vivaldi', browser: 'Vivaldi', ntp: 'chrome://vivaldi-webui/startpage' };
  if (has(/^Dia$/)) return { id: 'dia', browser: 'Dia', ntp: 'about:blank' };
  if (has(/Google Chrome/)) return { id: 'chrome', browser: 'Chrome', provider: 'gemini', ntp: 'chrome://new-tab-page/' };
  return { id: 'chromium', browser: 'Chromium', ntp: 'chrome://new-tab-page/' };
}

/** Your browser's own AI first, then the assistant you picked for Ask AI, then the rest. */
export function providerOrder(native: string | undefined, preferred: string | undefined): AiProvider[] {
  const base = ['claude', 'chatgpt', 'gemini', 'perplexity', 'aimode', 'grok', 'copilot', 'deepseek', 'lechat'];
  const ids = [native, preferred, ...base].filter((x): x is string => !!x && !!PROVIDERS[x]);
  return [...new Set(ids)].map((id) => PROVIDERS[id]);
}

export interface Chat {
  provider: string;
  title: string;
  url: string;
  at: number;
}

/** Turn history entries into a clean, de-duplicated list of chats, newest first. */
export function chatsFromHistory(items: { url?: string; title?: string; lastVisitTime?: number }[], limit = 30): Chat[] {
  const seen = new Set<string>();
  const out: Chat[] = [];
  for (const it of [...items].sort((a, b) => (b.lastVisitTime ?? 0) - (a.lastVisitTime ?? 0))) {
    const url = it.url ?? '';
    const p = Object.values(PROVIDERS).find((x) => x.chat?.test(url));
    if (!p) continue;
    const key = p.id === 'aimode' ? `aimode:${new URL(url).searchParams.get('q') ?? url}` : url.replace(/[?#].*$/, '');
    if (seen.has(key)) continue;
    let title = (it.title ?? '').trim();
    if (p.strip) title = title.replace(p.strip, '').trim();
    if (p.generic?.test(title)) title = '';
    if (!title && p.id === 'aimode') title = new URL(url).searchParams.get('q') ?? '';
    if (!title) continue;
    seen.add(key);
    out.push({ provider: p.id, title, url, at: it.lastVisitTime ?? 0 });
    if (out.length >= limit) break;
  }
  return out;
}

/** A question about today's edition, ready to paste into any assistant. */
export function editionPrompt(items: { title: string; url: string; kind: string; by?: string }[], ask = 'Give me a two-minute briefing on these, then tell me which one to start with and why.'): string {
  const lines = items.slice(0, 14).map((i, n) => `${n + 1}. [${i.kind}] ${i.title}${i.by ? ` (${i.by})` : ''}: ${i.url}`);
  return `${ask}\n\n${lines.join('\n')}`;
}
