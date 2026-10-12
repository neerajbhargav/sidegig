// Built-in app presets. Only plain data here: this file is also imported by the
// build script (Node strips the types) to generate content-script matches.

export interface CatalogApp {
  id: string;
  name: string;
  url: string;
  category: 'AI' | 'Messaging' | 'Google' | 'Music' | 'Social' | 'Work';
  badge: 'parens' | 'gmail' | 'none';
  /** For AI apps: selectors for the prompt box, tried in order. */
  aiInput?: string[];
  /** Optional selector for the send button. */
  aiSend?: string[];
}

export const CATALOG: CatalogApp[] = [
  {
    id: 'claude',
    name: 'Claude',
    url: 'https://claude.ai/new',
    category: 'AI',
    badge: 'none',
    aiInput: ['div[contenteditable="true"].ProseMirror', 'div[contenteditable="true"]', 'textarea'],
    aiSend: ['button[aria-label="Send message"]', 'button[aria-label*="Send"]'],
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    url: 'https://chatgpt.com/',
    category: 'AI',
    badge: 'none',
    aiInput: ['#prompt-textarea', 'div[contenteditable="true"]', 'textarea'],
    aiSend: ['button[data-testid="send-button"]', 'button[aria-label*="Send"]'],
  },
  {
    id: 'gemini',
    name: 'Gemini',
    url: 'https://gemini.google.com/app',
    category: 'AI',
    badge: 'none',
    aiInput: ['rich-textarea div[contenteditable="true"]', 'div.ql-editor[contenteditable="true"]', 'textarea'],
    aiSend: ['button[aria-label*="Send"]'],
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    url: 'https://www.perplexity.ai/',
    category: 'AI',
    badge: 'none',
    aiInput: ['textarea', 'div[contenteditable="true"]'],
    aiSend: ['button[aria-label*="Submit"]', 'button[aria-label*="Send"]'],
  },
  {
    id: 'grok',
    name: 'Grok',
    url: 'https://grok.com/',
    category: 'AI',
    badge: 'none',
    aiInput: ['textarea', 'div[contenteditable="true"]'],
    aiSend: ['button[type="submit"]'],
  },
  { id: 'whatsapp', name: 'WhatsApp', url: 'https://web.whatsapp.com/', category: 'Messaging', badge: 'parens' },
  { id: 'telegram', name: 'Telegram', url: 'https://web.telegram.org/a/', category: 'Messaging', badge: 'parens' },
  { id: 'messenger', name: 'Messenger', url: 'https://www.messenger.com/', category: 'Messaging', badge: 'parens' },
  { id: 'slack', name: 'Slack', url: 'https://app.slack.com/client', category: 'Messaging', badge: 'parens' },
  { id: 'discord', name: 'Discord', url: 'https://discord.com/channels/@me', category: 'Messaging', badge: 'parens' },
  { id: 'gmail', name: 'Gmail', url: 'https://mail.google.com/mail/u/0/', category: 'Google', badge: 'gmail' },
  { id: 'calendar', name: 'Calendar', url: 'https://calendar.google.com/calendar/u/0/r', category: 'Google', badge: 'none' },
  { id: 'keep', name: 'Keep', url: 'https://keep.google.com/', category: 'Google', badge: 'none' },
  { id: 'translate', name: 'Translate', url: 'https://translate.google.com/', category: 'Google', badge: 'none' },
  { id: 'ytmusic', name: 'YouTube Music', url: 'https://music.youtube.com/', category: 'Music', badge: 'none' },
  { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com/', category: 'Music', badge: 'none' },
  { id: 'x', name: 'X', url: 'https://x.com/home', category: 'Social', badge: 'parens' },
  { id: 'linkedin', name: 'LinkedIn', url: 'https://www.linkedin.com/feed/', category: 'Social', badge: 'parens' },
  { id: 'reddit', name: 'Reddit', url: 'https://www.reddit.com/', category: 'Social', badge: 'none' },
  { id: 'instagram', name: 'Instagram', url: 'https://www.instagram.com/', category: 'Social', badge: 'parens' },
  { id: 'notion', name: 'Notion', url: 'https://www.notion.so/', category: 'Work', badge: 'none' },
  { id: 'linear', name: 'Linear', url: 'https://linear.app/', category: 'Work', badge: 'none' },
  { id: 'github', name: 'GitHub', url: 'https://github.com/notifications', category: 'Work', badge: 'parens' },
  { id: 'todoist', name: 'Todoist', url: 'https://app.todoist.com/app', category: 'Work', badge: 'none' },
];

export const DEFAULT_PINNED = ['claude', 'chatgpt', 'gemini', 'whatsapp', 'gmail', 'ytmusic'];

export function catalogById(id: string): CatalogApp | undefined {
  return CATALOG.find((a) => a.id === id);
}

export function catalogByHost(hostname: string): CatalogApp | undefined {
  return CATALOG.find((a) => new URL(a.url).hostname === hostname);
}
