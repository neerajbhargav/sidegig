import { faviconFor, ext } from '../shared/api.ts';
import { glyphFor, iconPixels, type Glyph } from '../shared/siteicon.ts';
import { fitTransform, iconPrint, measureIcon, type IconFit } from '../shared/iconfit.ts';
import { icon } from '../shared/icons.ts';

type Kid = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

/** Tiny element builder. Strings are inserted as text (safe); `html` is for our own icons only. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...kids: (Kid | Kid[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, String(sv));
        else (el.style as any)[sk] = sv;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(typeof kid === 'number' ? String(kid) : kid);
  }
  return el;
}

export const ico = (name: string, size = 18) => h('span', { html: icon(name, size), style: { display: 'grid', placeItems: 'center' } });

export function iconButton(name: string, label: string, onClick: (e: MouseEvent) => void, pressed?: boolean): HTMLButtonElement {
  return h('button', { class: 'iconbtn', type: 'button', title: label, 'aria-label': label, 'aria-pressed': pressed === undefined ? undefined : String(pressed), onclick: onClick, html: icon(name, 18) });
}

/** A letter for sites with no icon at all. */
function letterTile(name: string, cls: string): HTMLElement {
  return h('span', { class: `${cls} mono`, 'aria-hidden': 'true' }, (name.trim()[0] ?? '?').toUpperCase());
}

/** A bundled vector logo in the brand's own colour (black logos follow the ink so they never vanish). */
function glyphEl(g: Glyph, cls: string): HTMLElement {
  return h('span', {
    class: `${cls} glyph${g.dark ? ' glyph-dark' : ''}`,
    'aria-hidden': 'true',
    style: { '--glyph': `url("${ext.runtime.getURL(`icons/brands/${g.file}.svg`)}")`, '--brand': g.hex } as any,
  });
}

// ---------------------------------------------------------------- fitting

const fits = new Map<string, IconFit | 'blank'>();
let blankPrint: Promise<number | null> | undefined;

function pixelsOf(img: HTMLImageElement, size = 64): Uint8ClampedArray | null {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(img, 0, 0, size, size);
    return x.getImageData(0, 0, size, size).data;
  } catch {
    return null;
  }
}

/** The browser's blank globe, to spot sites it has no icon for yet. */
function blankGlobe(): Promise<number | null> {
  return (blankPrint ??= new Promise((done) => {
    const src = faviconFor('https://sidegig-blank.invalid/', 64);
    if (!src || !src.includes('_favicon')) return done(null);
    const i = new Image();
    i.onload = () => {
      const px = pixelsOf(i);
      done(px ? iconPrint(px) : null);
    };
    i.onerror = () => done(null);
    i.src = src;
  }));
}

export const applyFit = (el: HTMLElement, f: IconFit) => {
  el.style.transform = fitTransform(f);
  el.toggleAttribute('data-sq', f.q);
  el.toggleAttribute('data-ink', f.d);
};

/** Once the site icon loads: measure it, then size it like every other icon (or swap a blank globe). */
function fitOnLoad(img: HTMLImageElement, url: string, name: string, cls: string, catalogId?: string) {
  img.addEventListener(
    'load',
    async () => {
      let f = fits.get(img.src);
      if (!f) {
        const px = pixelsOf(img);
        if (!px) return void (img.dataset.fit = '');
        const blank = await blankGlobe();
        f = blank !== null && iconPrint(px) === blank ? 'blank' : measureIcon(px, 64, 64);
        fits.set(img.src, f);
      }
      if (f === 'blank') {
        const g = glyphFor(url, catalogId);
        img.replaceWith(g ? glyphEl(g, cls) : letterTile(name, cls));
        return;
      }
      applyFit(img, f);
      img.dataset.fit = '';
    },
    { once: true },
  );
}

/**
 * Every site icon goes through here: the site's own icon in its own colours,
 * requested at screen resolution and fitted to the same size as the rest;
 * the bundled logo when the browser has none; a letter when nothing is known.
 */
export function favicon(url: string, name: string, cls = 'fav', catalogId?: string): HTMLElement {
  // Browser and extension pages have no site icon (the browser draws a "blocked" glyph): use a letter.
  if (!/^https?:/i.test(url)) return letterTile(name, cls);
  // Themed: known services draw as crisp logos in the theme's ink.
  if (iconStyle === 'themed') {
    const g = (ext as { runtime?: unknown } | undefined)?.runtime ? glyphFor(url, catalogId) : null;
    if (g) return glyphEl(g, cls);
  }
  const src = faviconFor(url, iconPixels(cls.includes('xs') || cls.includes('sm') ? 16 : 32));
  if (!src) return letterTile(name, cls);
  const img = h('img', { class: cls, src, alt: '', decoding: 'async' });
  const cached = fits.get(src);
  if (cached && cached !== 'blank') {
    applyFit(img, cached);
    img.dataset.fit = '';
  } else fitOnLoad(img, url, name, cls, catalogId);
  img.addEventListener(
    'error',
    () => {
      const g = (ext as { runtime?: unknown } | undefined)?.runtime ? glyphFor(url, catalogId) : null;
      img.replaceWith(g ? glyphEl(g, cls) : letterTile(name, cls));
    },
    { once: true },
  );
  return img;
}

/** Original (each site's own icon) or themed (logos in the theme's ink). */
let iconStyle: 'original' | 'themed' = 'original';
export const setIconStyle = (s: 'original' | 'themed') => void (iconStyle = s);

/** Apps whose site icon the browser doesn't know yet (filled in by the background check). */
let favMissing = new Set<string>();
export const setFavMissing = (ids: string[]) => void (favMissing = new Set(ids));

/** An app's icon: its own site icon; the bundled logo if the browser has none yet. */
export function appFavicon(app: { id: string; catalogId?: string; url: string; name: string }, cls = 'fav'): HTMLElement {
  if (favMissing.has(app.id)) {
    const g = (ext as { runtime?: unknown } | undefined)?.runtime ? glyphFor(app.url, app.catalogId ?? app.id) : null;
    return g ? glyphEl(g, cls) : letterTile(app.name, cls);
  }
  return favicon(app.url, app.name, cls, app.catalogId ?? app.id);
}

/** Stable hue (0-359) for a site, used to tint its letter tile. */
export function hueOf(s: string): number {
  let host = s;
  try {
    host = new URL(s).hostname.replace(/^www\./, '');
  } catch {
    /* plain text */
  }
  let n = 0;
  for (const ch of host) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return n % 360;
}

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform) || (navigator as any).userAgentData?.platform === 'macOS';
/** Shortcut label in the platform's own style, e.g. ⌥⇧K on Mac. */
export const keys = (k: string) => (isMac ? `⌥⇧${k}` : `Alt+Shift+${k}`);

/** Site icon for tight spots: hides itself instead of showing a letter. */
export function faviconOnly(url: string, cls = 'fav sm'): HTMLElement | null {
  if (!/^https?:/i.test(url)) return null;
  const src = faviconFor(url, iconPixels(16));
  if (!src) return null;
  const img = h('img', { class: cls, src, alt: '', loading: 'lazy', decoding: 'async' });
  fitOnLoad(img, url, hostOf(url), cls);
  img.addEventListener('error', () => img.remove(), { once: true });
  return img;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

let toastTimer = 0;
export function toast(msg: string) {
  let el = document.querySelector<HTMLElement>('.toast');
  if (!el) {
    el = h('div', { class: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), 1800);
}

export const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h_ = Math.round(m / 60);
  return h_ < 48 ? `${h_}h ago` : `${Math.round(h_ / 24)}d ago`;
};
