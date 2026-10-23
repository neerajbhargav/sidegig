import type { Layout } from './layout.ts';
import type { EdKind } from './edition/types.ts';
import type { Space } from './theme.ts';

export type Side = 'left' | 'right';
/** docked = always visible and the page makes room (like Opera); hover = slides over the page. */
export type RailMode = 'docked' | 'hover' | 'off';
/** Where an app opens. `panel` = the browser's own sidebar (logins work there). */
export type OpenIn = 'panel' | 'window' | 'tab' | 'drawer';
export type ThemeMode = 'system' | 'light' | 'dark' | 'page';
export type BadgeKind = 'parens' | 'gmail' | 'none';
/** New tab theme. "auto" matches the browser; the rest are sidegig's studio themes; "custom" is yours. */
export type NtLook = 'space' | 'auto' | 'paper' | 'night' | 'ultramarine' | 'indigo' | 'cobalt' | 'field' | 'phosphor' | 'sand' | 'mono' | 'custom' | 'picture';
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
  /** Never unload its frame while hidden. Unset: messaging apps keep running. */
  keepAlive?: boolean;
  /** No desktop notifications from it while it runs inside sidegig. */
  muted?: boolean;
}

export interface LinkRule {
  id: string;
  /** Hostname or glob, e.g. `notion.so` or `*.figma.com`. */
  pattern: string;
  /** `sidebar`: the matching app in the open sidebar, else a mini window. */
  action: 'window' | 'reuse-tab' | 'sidebar';
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
  /** `apps`: the width you dragged each app's drawer to; others use `width`. */
  drawer: { width: number; apps: Record<string, number> };
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
    /** Arc-style space colour: the sidebar, rail and Space new tab wear it. */
    space: Space;
  };
  apps: AppEntry[];
  stacks: {
    /** Bookmark folder ids shown as spaces. Empty = bookmarks bar. */
    spaces: string[];
    activeSpace: string;
  };
  ai: {
    /** Extra instructions for the built-in chat. */
    instructions: string;
    defaultApp: string;
    /** Used when text is selected. Tokens: {text} {title} {url} */
    selectionTemplate: string;
    /** Used for the whole page. Tokens: {text} {title} {url} */
    pageTemplate: string;
    autoSend: boolean;
    maxChars: number;
    /** Built-in chat: after it reads a page, an email or your history, ask before a tool sends anything out (open_url, MCP). */
    askBeforeSending: boolean;
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
    /** A second clock, like a world-time watch: a time zone such as Asia/Kolkata, or '' for none. */
    zone2: string;
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
    widgets: { greeting: boolean; brief: boolean; weather: boolean; calendar: boolean; pomodoro: boolean; notes: boolean; bookmarks: boolean; reading: boolean; tabs: boolean; calculator: boolean; feed: boolean };
    /** How widgets sit on the wallpaper: clear (bounded tint with an adaptive text tone), glass, or solid. */
    panels: 'frosted' | 'clear' | 'solid';
    /** Where each widget sits on the 12 × 8 grid (missing ones use their usual spot). */
    layout: Layout;
    /** A colour per bookmark folder (folder id -> tone name). */
    folderTones: Record<string, string>;
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
  /** Gmail rows also carry the sign-in code found in them, when they arrived, the message id and the sender's address. */
  items: { title: string; meta: string; url: string; state?: 'ok' | 'warn' | 'error' | 'busy'; code?: string; at?: number; mid?: string; email?: string }[];
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
