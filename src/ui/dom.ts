import { faviconFor, ext } from '../shared/api.ts';
import { BRAND_ICONS, DARK_BRANDS } from '../shared/brands.ts';
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

/** Site icon with a lettered fallback when the favicon can't load. */
export function favicon(url: string, name: string, cls = 'fav'): HTMLElement {
  const letter = (name.trim()[0] ?? '?').toUpperCase();
  const fallback = () => h('span', { class: `${cls} mono`, style: { '--h': String(hueOf(url)) } as any }, letter);
  // Browser and extension pages have no site icon (the browser draws a "blocked" glyph): use a letter.
  if (!/^https?:/i.test(url)) return fallback();
  const src = faviconFor(url, 32);
  if (!src) return fallback();
  const img = h('img', { class: cls, src, alt: '', loading: 'lazy', decoding: 'async' });
  img.addEventListener('error', () => img.replaceWith(fallback()), { once: true });
  return img;
}

/** Apps whose site icon the browser doesn't know yet (filled in by the background check). */
let favMissing = new Set<string>();
export const setFavMissing = (ids: string[]) => void (favMissing = new Set(ids));

/**
 * An app's icon: the site's own icon when the browser has it; otherwise (and
 * always for black logos, which vanish on dark surfaces) the bundled brand icon.
 */
export function appFavicon(app: { id: string; catalogId?: string; url: string; name: string }, cls = 'fav'): HTMLElement {
  const cat = app.catalogId ?? app.id;
  if (BRAND_ICONS.has(cat) && (favMissing.has(app.id) || DARK_BRANDS.has(cat)) && ext?.runtime?.getURL) {
    const img = h('img', { class: `${cls} brandmark${DARK_BRANDS.has(cat) ? ' brandmark-dark' : ''}`, src: ext.runtime.getURL(`icons/brands/${cat}.svg`), alt: '', decoding: 'async' });
    img.addEventListener('error', () => img.replaceWith(favicon(app.url, app.name, cls)), { once: true });
    return img;
  }
  // No icon known and no bundled one: a tinted letter beats a blank globe.
  if (favMissing.has(app.id)) return h('span', { class: `${cls} mono`, style: { '--h': String(hueOf(app.url)) } as any }, (app.name.trim()[0] ?? '?').toUpperCase());
  return favicon(app.url, app.name, cls);
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
export function faviconOnly(url: string, cls = 'fav sm'): HTMLImageElement | null {
  const src = faviconFor(url, 32);
  if (!src) return null;
  const img = h('img', { class: cls, src, alt: '', loading: 'lazy', decoding: 'async' });
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
