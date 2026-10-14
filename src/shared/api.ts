// One handle for the extension API across browsers.
// Firefox and Safari expose `browser` (promise based); Chromium exposes `chrome`
// (promise based in MV3). We use whichever exists.

declare const __TARGET__: string;

export type Target = 'chrome' | 'opera' | 'firefox' | 'safari' | 'preview';
export const TARGET: Target = (typeof __TARGET__ !== 'undefined' ? __TARGET__ : 'chrome') as Target;

const g = globalThis as unknown as { browser?: typeof chrome; chrome?: typeof chrome; opr?: any };
export const ext: typeof chrome = (g.browser ?? g.chrome) as typeof chrome;

export const features = {
  get sidePanel(): boolean {
    return !!(ext as any)?.sidePanel?.open;
  },
  get tabGroups(): boolean {
    return !!(ext as any)?.tabGroups && !!(ext as any)?.tabs?.group;
  },
  get faviconApi(): boolean {
    return TARGET === 'chrome' || TARGET === 'opera';
  },
};

/** Best available site icon URL for a page. */
export function faviconFor(pageUrl: string, size = 32): string {
  if (features.faviconApi && ext?.runtime?.getURL) {
    const u = new URL(ext.runtime.getURL('/_favicon/'));
    u.searchParams.set('pageUrl', pageUrl);
    u.searchParams.set('size', String(size));
    return u.toString();
  }
  try {
    const { origin } = new URL(pageUrl);
    return `${origin}/favicon.ico`;
  } catch {
    return '';
  }
}

export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
