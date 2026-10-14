import type { AppEntry, Settings } from './types.ts';
import { CATALOG, DEFAULT_PINNED, catalogById, PHONE_FIT } from './catalog.ts';

export const SETTINGS_VERSION = 10;

export function appFromCatalog(id: string): AppEntry {
  const c = catalogById(id);
  if (!c) throw new Error(`Unknown catalog app: ${id}`);
  return { id: c.id, name: c.name, url: c.url, openIn: 'panel', mobile: PHONE_FIT.has(c.id), badge: c.badge !== 'none', catalogId: c.id };
}

export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    rail: {
      mode: 'docked',
      side: 'left',
      hotZone: 6,
      delay: 120,
      size: 'comfortable',
      excluded: [],
      floatOn: [],
      hideInFullscreen: true,
    },
    drawer: { width: 400 },
    theme: {
      mode: 'page',
      base: '#808080',
      accent: '#0b57d0',
      contrast: 50,
      radius: 10,
      scale: 100,
      icons: 'original',
      customCss: '',
    },
    apps: DEFAULT_PINNED.filter((id) => CATALOG.some((c) => c.id === id)).map(appFromCatalog),
    stacks: { spaces: [], activeSpace: '' },
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
    newtab: {
      enabled: true,
      look: 'auto',
      calmImages: true,
      clock: true,
      aiTab: true,
      clockStyle: 'digital',
      name: '',
      title: '',
      tag: '',
      message: '',
      engine: 'default',
      accent: '',
      background: { kind: 'none', ref: '', treatment: 'photo', inks: 'theme', dim: 0, blur: 0, rotate: 'tab' },
      collections: [],
      custom: { bg: '#f1ede4', ink: '#1d1b16', accent: '#ff4f00' },
      sounds: false,
      weather: { enabled: false, place: '', lat: 0, lon: 0, units: 'f' },
      todo: true,
      widgets: { greeting: true, brief: false, weather: true, calendar: true, pomodoro: true, notes: true, apps: true, bookmarks: true, feed: true },
      panels: 'clear',
      layout: {},
      folderTones: {},
      calendar: { app: 'google', feeds: [] },
      pomodoro: { focus: 25, short: 5, long: 15, every: 4 },
    },
    edition: {
      enabled: true,
      size: 12,
      refreshHours: 12,
      kinds: { read: true, watch: true, podcast: true, book: true, paper: false, discuss: true, music: true },
      onDeviceAi: true,
    },
  };
}
