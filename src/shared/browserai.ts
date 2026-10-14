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
  /** Opens a fresh chat. */
  newChat?: string;
}

const enc = encodeURIComponent;

export const PROVIDERS: Record<string, AiProvider> = {
  aside: {
    id: 'aside',
    name: 'Aside',
    home: asidePage('newtab.html'),
    native: true,
    newChat: asidePage('main.html#/u/0/tasks/new'),
  },
  claude: {
    id: 'claude',
    name: 'Claude',
    home: 'https://claude.ai/new',
    ask: (q) => `https://claude.ai/new?q=${enc(q)}`,
    appId: 'claude',
  },
  chatgpt: {
    id: 'chatgpt',
    name: 'ChatGPT',
    home: 'https://chatgpt.com/',
    ask: (q) => `https://chatgpt.com/?q=${enc(q)}`,
    appId: 'chatgpt',
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    home: 'https://gemini.google.com/app',
    appId: 'gemini',
  },
  perplexity: {
    id: 'perplexity',
    name: 'Perplexity',
    home: 'https://www.perplexity.ai/',
    ask: (q) => `https://www.perplexity.ai/search?q=${enc(q)}`,
    appId: 'perplexity',
  },
  aimode: {
    id: 'aimode',
    name: 'AI Mode',
    home: 'https://www.google.com/search?udm=50',
    ask: (q) => `https://www.google.com/search?udm=50&q=${enc(q)}`,
  },
  copilot: {
    id: 'copilot',
    name: 'Copilot',
    home: 'https://copilot.microsoft.com/',
    ask: (q) => `https://copilot.microsoft.com/?q=${enc(q)}`,
  },
  grok: {
    id: 'grok',
    name: 'Grok',
    home: 'https://grok.com/',
    ask: (q) => `https://grok.com/?q=${enc(q)}`,
    appId: 'grok',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    home: 'https://chat.deepseek.com/',
  },
  lechat: {
    id: 'lechat',
    name: 'Le Chat',
    home: 'https://chat.mistral.ai/chat',
    ask: (q) => `https://chat.mistral.ai/chat?q=${enc(q)}`,
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
