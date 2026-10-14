// Which browser are we in? Used to match its look (so sidegig feels at home in
// Chrome, Edge, Arc, Dia, Aside, Opera, Brave...) and to find its own AI and
// its own new tab. Cached so the new tab can paint the right look instantly.
import { TARGET } from '../shared/api.ts';
import { getLocal, setLocal } from '../shared/storage.ts';
import { ASIDE_EXTENSION, nativeAi, type NativeInfo } from '../shared/browserai.ts';

export interface DetectedBrowser extends NativeInfo {
  /** Arc's current space colours, when Arc shares them. */
  arcPalette?: Record<string, string>;
}

const ARC_KEYS = ['background', 'foregroundPrimary', 'foregroundSecondary', 'title', 'subtitle', 'hover', 'focus', 'cutoutColor', 'maxContrastColor', 'minContrastColor'];

function arcPalette(): Record<string, string> | undefined {
  const cs = getComputedStyle(document.documentElement);
  const out: Record<string, string> = {};
  for (const k of ARC_KEYS) {
    const v = cs.getPropertyValue(`--arc-palette-${k}`).trim();
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

let cached: Promise<DetectedBrowser> | null = null;

export function detectBrowser(): Promise<DetectedBrowser> {
  cached ??= (async () => {
    const brands = ((navigator as any).userAgentData?.brands ?? []).map((b: { brand: string }) => b.brand) as string[];
    let aside = (await getLocal<{ aside?: boolean } | null>('browserAi', null))?.aside ?? false;
    if (!aside && TARGET !== 'firefox' && TARGET !== 'safari') {
      try {
        aside = (await fetch(`chrome-extension://${ASIDE_EXTENSION}/iframe.html`, { method: 'HEAD' })).ok;
      } catch {
        /* not Aside, or the browser won't say from here: the rail checks from a web page */
      }
    }
    const palette = arcPalette();
    const info: DetectedBrowser = { ...nativeAi({ brands, brave: !!(navigator as any).brave, aside, arc: !!palette, target: TARGET }), arcPalette: palette };
    void setLocal('browserInfo', { id: info.id, browser: info.browser, ntp: info.ntp });
    try {
      localStorage.setItem('sidegig.ntBrowser', info.id);
      localStorage.setItem('sidegig.ntFallback', info.ntp);
    } catch {
      /* fine */
    }
    return info;
  })();
  return cached;
}
