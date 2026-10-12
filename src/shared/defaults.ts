import type { AppEntry, Settings } from './types.ts';
import { CATALOG, DEFAULT_PINNED, catalogById } from './catalog.ts';

export const SETTINGS_VERSION = 1;

export function appFromCatalog(id: string): AppEntry {
  const c = catalogById(id);
  if (!c) throw new Error(`Unknown catalog app: ${id}`);
  return { id: c.id, name: c.name, url: c.url, openIn: 'panel', mobile: false, badge: c.badge !== 'none', catalogId: c.id };
}

export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    rail: {
      mode: 'hover',
      side: 'left',
      hotZone: 6,
      delay: 120,
      size: 'comfortable',
      excluded: [],
      hideInFullscreen: true,
    },
    drawer: { width: 340 },
    theme: {
      mode: 'page',
      base: '#808080',
      accent: '#0b57d0',
      contrast: 50,
      radius: 10,
      customCss: '',
    },
    apps: DEFAULT_PINNED.filter((id) => CATALOG.some((c) => c.id === id)).map(appFromCatalog),
    stacks: { spaces: [] },
    ai: {
      defaultApp: 'claude',
      selectionTemplate: '{text}\n\nSource: {title}\n{url}',
      pageTemplate: 'Summarize this page and point out anything I should pay attention to.\n\nTitle: {title}\nURL: {url}\n\n{text}',
      autoSend: false,
      maxChars: 12000,
    },
    status: { github: false, vercel: false, gmail: false, intervalMin: 5 },
    rules: [],
    sleep: { enabled: false, afterMin: 60 },
  };
}
