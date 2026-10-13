export type Side = 'left' | 'right';
/** docked = always visible and the page makes room (like Opera); hover = slides over the page. */
export type RailMode = 'docked' | 'hover' | 'off';
/** Where an app opens. `panel` = the browser's own sidebar (logins work there). */
export type OpenIn = 'panel' | 'window' | 'tab' | 'drawer';
export type ThemeMode = 'system' | 'light' | 'dark' | 'page';
export type BadgeKind = 'parens' | 'gmail' | 'none';

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
