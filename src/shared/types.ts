import type { EdKind } from './edition/types.ts';

export type Side = 'left' | 'right';
/** docked = always visible and the page makes room (like Opera); hover = slides over the page. */
export type RailMode = 'docked' | 'hover' | 'off';
/** Where an app opens. `panel` = the browser's own sidebar (logins work there). */
export type OpenIn = 'panel' | 'window' | 'tab' | 'drawer';
export type ThemeMode = 'system' | 'light' | 'dark' | 'page';
export type BadgeKind = 'parens' | 'gmail' | 'none';
/** New tab theme. "auto" matches the browser; the rest are sidegig's studio themes; "custom" is yours. */
export type NtLook = 'auto' | 'paper' | 'night' | 'ultramarine' | 'indigo' | 'cobalt' | 'field' | 'phosphor' | 'sand' | 'mono' | 'custom' | 'picture';
export type BgKind = 'none' | 'daily' | 'monuments' | 'photo' | 'gradient' | 'pattern' | 'upload' | 'url' | 'color' | 'collection';
/** How a picture is shown: as is, or one of the studio treatments. */
export type BgEffect = 'auto' | 'photo' | 'print' | 'film' | 'dream' | 'led' | 'mosaic' | 'ascii';
/** Risograph inks for the Print effect: the theme's two, or a named set (dark to light, the last is the paper). */
export type RisoInks = 'theme' | 'indigo' | 'lavender' | 'nova' | 'cobalt';
export interface NtBackground {
  kind: BgKind;
  /** Which one: a gallery id ("p:54", "m:3"), gradient or pattern id, upload id, URL or colour. */
  ref: string;
  /** auto = printed or filmed in studio themes, a photo in Match browser. */
  treatment: BgEffect;
  /** Print effect: which inks. */
  inks: RisoInks;
  /** Collections: a new picture every new tab, every hour or every day. */
  rotate?: 'tab' | 'hour' | 'day';
  /** 0–90: how much the page colour veils the picture. */
  dim: number;
  /** 0–24 px. */
  blur: number;
}

export interface AppEntry {
  id: string;
  name: string;
  url: string;
  openIn: OpenIn;
  /** Ask the site for its mobile layout (fits narrow panels better). */
  mobile: boolean;
  /** Show unread counts read from the page title. */
  badge: boolean;
  /** Catalog id when this came from the built-in catalog. */
  catalogId?: string;
}

export interface LinkRule {
  id: string;
  /** Hostname or glob, e.g. `notion.so` or `*.figma.com`. */
  pattern: string;
  action: 'window' | 'reuse-tab';
  enabled: boolean;
}

export interface Settings {
  version: number;
  rail: {
    mode: RailMode;
    side: Side;
    /** Width in px of the invisible edge zone that reveals the rail. */
    hotZone: number;
    /** Dwell time before the rail appears. */
    delay: number;
    size: 'compact' | 'comfortable';
    excluded: string[];
    /** Sites where the rail floats on hover instead of docking. */
    floatOn: string[];
    hideInFullscreen: boolean;
  };
  drawer: { width: number };
  theme: {
    mode: ThemeMode;
    base: string;
    accent: string;
    /** 0 (soft) to 100 (maximum contrast). */
    contrast: number;
    radius: number;
    /** Size of everything sidegig draws (new tab, sidebar, rail, settings), in percent. */
    scale: number;
    /** Site icons: each site's own (fitted to one size), or logos drawn in the theme's ink. */
    icons: 'original' | 'themed';
    customCss: string;
  };
  apps: AppEntry[];
  stacks: {
    /** Bookmark folder ids shown as spaces. Empty = bookmarks bar. */
    spaces: string[];
    activeSpace?: string;
  };
  ai: {
    defaultApp: string;
    /** Used when text is selected. Tokens: {text} {title} {url} */
    selectionTemplate: string;
    /** Used for the whole page. Tokens: {text} {title} {url} */
    pageTemplate: string;
    autoSend: boolean;
    maxChars: number;
  };
  status: {
    github: boolean;
    vercel: boolean;
    gmail: boolean;
    intervalMin: number;
  };
  rules: LinkRule[];
  sleep: { enabled: boolean; afterMin: number };
  newtab: {
    /** Use sidegig as the new tab page. Off sends new tabs straight to the browser's own. */
    enabled: boolean;
    look: NtLook;
    /** Show pictures in grayscale until you hover them, so thumbnails don't shout. */
    calmImages: boolean;
    clock: boolean;
    /** A Home | AI switch: your browser's own AI and every assistant's chats, one tab away. */
    aiTab: boolean;
    clockStyle: 'digital' | 'analog';
    /** Your name for the greeting. */
    name: string;
    /** What the new tab calls itself in the top corner (empty = sidegig). */
    title: string;
    /** The small tag next to it (empty = none). */
    tag: string;
    /** Shown instead of the time-of-day greeting when set. */
    message: string;
    /** Search engine for the search box ("default" = the browser's own). */
    engine: string;
    /** Accent colour override; empty = the look's own. */
    accent: string;
    background: NtBackground;
    /** Your own theme: page, ink and accent colours. */
    custom: { bg: string; ink: string; accent: string };
    /** Wallpaper collections you made from your own keywords. */
    collections: { id: string; name: string; terms: string[]; anime?: boolean; album?: boolean }[];
    /** Quiet interface sounds (opt-in). */
    sounds: boolean;
    weather: { enabled: boolean; place: string; lat: number; lon: number; units: 'f' | 'c' };
    todo: boolean;
    /** Which parts of the page show (each one can be turned off). */
    widgets: { greeting: boolean; brief: boolean; weather: boolean; calendar: boolean; pomodoro: boolean; notes: boolean; apps: boolean; bookmarks: boolean; feed: boolean };
    /** Cards over the wallpaper: frosted glass, clear, or solid. */
    panels: 'frosted' | 'clear' | 'solid';
    /** The calendar app clicks open, plus private calendar addresses to show events from. */
    calendar: { app: 'google' | 'outlook' | 'office' | 'notion' | 'apple' | 'proton'; feeds: string[] };
    /** Pomodoro lengths in minutes; a long break after `every` focus rounds. */
    pomodoro: { focus: number; short: number; long: number; every: number };
  };
  /** The new tab edition: a short, finite issue picked from your interests. */
  edition: {
    enabled: boolean;
    /** Items per edition. */
    size: number;
    /** A new edition every N hours. */
    refreshHours: number;
    kinds: Record<EdKind, boolean>;
    /** Let the browser's built-in model (Gemini Nano in Chrome) review picks and explain them. */
    onDeviceAi: boolean;
  };
}

/** Never synced; stays on this device. */
export interface Secrets {
  githubToken?: string;
  vercelToken?: string;
  vercelTeamId?: string;
}

export interface StatusCard {
  id: 'github' | 'vercel' | 'gmail';
  title: string;
  value: string;
  detail: string;
  url: string;
  items: { title: string; meta: string; url: string; state?: 'ok' | 'warn' | 'error' | 'busy' }[];
  /** Changes whenever there is something new to look at. */
  signature: string;
  error?: string;
  updatedAt: number;
}

export interface Workspace {
  id: string;
  name: string;
  created: number;
  tabs: { url: string; title: string; pinned: boolean; group?: { title: string; color: string } }[];
}

export interface PendingPrompt {
  id: string;
  appId: string;
  host: string;
  text: string;
  autoSend: boolean;
  created: number;
}
