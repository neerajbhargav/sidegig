// Keep widget text readable on the Clear surface.
// We keep a small copy of the wallpaper as it's drawn on screen (fit, blur and
// veil included), then for each widget read the patch behind it and set its
// text tone for its bounded tint (see shared/legible.ts for the maths).
import { colorsIn, deskTone, legibilityFor, patchOf, patchOfColors, type Patch } from '../../shared/legible.ts';
import { onArranged } from './ntgrid.ts';

type Sample = { px: Uint8ClampedArray; W: number; H: number } | { flat: Patch };

const SAMPLE_W = 200;

/** Any CSS colour (vars, color-mix) as RGB, read through a probe. */
function rgbOf(css: string, host: HTMLElement): [number, number, number] {
  const probe = h0('i');
  probe.style.cssText = `position:absolute;visibility:hidden;color:${css}`;
  host.append(probe);
  const m = getComputedStyle(probe).color.match(/[\d.]+/g) ?? ['255', '255', '255'];
  probe.remove();
  return [+m[0], +m[1], +m[2]];
}
const h0 = (tag: string) => document.createElement(tag);

/** Something canvas can read without tainting: the image itself (same origin), or a fetched copy. */
async function readable(img: HTMLImageElement): Promise<CanvasImageSource | null> {
  try {
    await img.decode();
  } catch {
    if (!img.complete || !img.naturalWidth) return null;
  }
  const src = img.currentSrc || img.src;
  if (/^(data|blob):/.test(src) || new URL(src, location.href).origin === location.origin) return img;
  try {
    return await createImageBitmap(await (await fetch(src, { credentials: 'omit' })).blob());
  } catch {
    return null;
  }
}

/** Draw an image the way CSS draws it (object-fit and object-position) into the sample. */
function drawLike(x: OffscreenCanvasRenderingContext2D, src: CanvasImageSource, img: HTMLImageElement, k: number) {
  const r = img.getBoundingClientRect();
  const cs = getComputedStyle(img);
  const nw = (src as ImageBitmap).width || img.naturalWidth;
  const nh = (src as ImageBitmap).height || img.naturalHeight;
  if (!nw || !nh || !r.width) return;
  const s = cs.objectFit === 'contain' ? Math.min(r.width / nw, r.height / nh) : cs.objectFit === 'fill' ? 0 : Math.max(r.width / nw, r.height / nh);
  const pos = cs.objectPosition.split(/\s+/).map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5));
  const dw = s ? nw * s : r.width;
  const dh = s ? nh * s : r.height;
  const ox = r.left + (r.width - dw) * (pos[0] ?? 0.5);
  const oy = r.top + (r.height - dh) * (pos[1] ?? 0.5);
  x.drawImage(src, ox * k, oy * k, dw * k, dh * k);
}

async function sampleOf(wall: HTMLElement, root: HTMLElement): Promise<Sample | null> {
  const dim = parseFloat(wall.style.getPropertyValue('--wall-dim')) || 0;
  const bg = rgbOf('var(--c-bg)', root);
  const veil = dim * 0.55;
  const fill = wall.querySelector<HTMLElement>('.wall-fill');
  if (fill) {
    const cs = getComputedStyle(fill);
    const cols = colorsIn(`${cs.backgroundImage} ${cs.backgroundColor}`).map((c) => c.map((v, i) => v * (1 - veil) + bg[i] * veil) as [number, number, number]);
    return { flat: patchOfColors(cols.length ? cols : [bg]) };
  }
  const imgs = [...wall.querySelectorAll<HTMLImageElement>('img.wall-backdrop, img.wall-photo, img.riso, img[class^="fx-"]')];
  if (!imgs.length) return null;
  const W = SAMPLE_W;
  const H = Math.max(1, Math.round((SAMPLE_W * innerHeight) / innerWidth));
  const k = W / innerWidth;
  const c = new OffscreenCanvas(W, H);
  const x = c.getContext('2d', { willReadFrequently: true });
  if (!x) return null;
  x.fillStyle = `rgb(${bg.join(',')})`;
  x.fillRect(0, 0, W, H);
  const blur = parseFloat(wall.style.getPropertyValue('--wall-blur')) || 0;
  let drew = false;
  for (const img of imgs) {
    const src = await readable(img);
    if (!src) continue;
    x.filter = img.classList.contains('wall-backdrop') ? `blur(${Math.max(2, 24 * k)}px)` : blur ? `blur(${blur * k}px)` : 'none';
    drawLike(x, src, img, k);
    drew = true;
  }
  if (!drew) return null;
  x.filter = 'none';
  // The veil: an even wash plus a soft band under the top bar.
  x.fillStyle = `rgba(${bg.join(',')},${veil})`;
  x.fillRect(0, 0, W, H);
  const band = x.createLinearGradient(0, 0, 0, 128 * k);
  band.addColorStop(0, `rgba(${bg.join(',')},${Math.min(1, dim * 0.5 + 0.22)})`);
  band.addColorStop(1, `rgba(${bg.join(',')},0)`);
  x.fillStyle = band;
  x.fillRect(0, 0, W, 128 * k);
  try {
    return { px: x.getImageData(0, 0, W, H).data, W, H };
  } catch {
    return null;
  }
}

/**
 * Start keeping widgets readable. Returns a stop function. Only runs for the
 * Clear surface on a wallpaper; otherwise it clears any tones it set.
 */
export function keepReadable(root: HTMLElement, wall: HTMLElement | null, on: boolean, signal: AbortSignal) {
  const widgets = () => [...root.querySelectorAll<HTMLElement>('.gw:not([data-w="search"]):not(.is-open)')];
  if (!on || !wall) {
    delete root.dataset.deskTone;
    for (const w of widgets()) {
      delete w.dataset.tone;
      w.style.removeProperty('--lg-a');
    }
    return;
  }
  let sample: Sample | null = null;
  let failed = false;
  const refresh = () => {
    if (!root.isConnected) return;
    if (!sample) {
      // The picture couldn't be read (it hasn't loaded, or its host won't share pixels):
      // Fall back to the page tone and its bounded panel surface.
      if (!failed) return;
      const dark = document.documentElement.dataset.pal === 'dark' || matchMedia('(prefers-color-scheme: dark)').matches;
      for (const w of widgets()) {
        w.dataset.tone = dark ? 'light' : 'dark';
      }
      return;
    }
    // One tone for the whole desk: light and dark cards side by side read as a fault.
    const cards: { w: HTMLElement; patch: Patch; area: number }[] = [];
    for (const w of widgets()) {
      const r = w.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const frac = { x: r.left / innerWidth, y: r.top / innerHeight, w: r.width / innerWidth, h: r.height / innerHeight };
      cards.push({ w, patch: 'flat' in sample ? sample.flat : patchOf(sample.px, sample.W, sample.H, frac), area: r.width * r.height });
    }
    const desk = deskTone(cards);
    // The top bar (name, pages, tools) wears the same tone, so it reads over the picture too.
    root.dataset.deskTone = desk.tone;
    cards.forEach((c, i) => {
      c.w.dataset.tone = desk.tone;
      c.w.style.setProperty('--lg-a', String(desk.alphas[i]));
      c.w.dataset.ratio = String(legibilityFor(c.patch).ratio);
    });
    root.dataset.readable = 'true';
  };
  let pending: ReturnType<typeof setTimeout> | undefined;
  const resample = (delay = 120) => {
    clearTimeout(pending);
    pending = setTimeout(async () => {
      sample = await sampleOf(wall, root);
      if (signal.aborted) return;
      // Only call it failed once there's a picture that should have been readable.
      failed = !sample && !!wall.querySelector('img[src]');
      refresh();
    }, delay);
  };
  resample(0);
  // Pictures arrive late (effects render, collections load): read again when they do.
  const mo = new MutationObserver(() => resample());
  mo.observe(wall, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
  wall.addEventListener('load', () => resample(), { capture: true, signal });
  addEventListener('resize', () => resample(200), { signal });
  onArranged(refresh, signal);
  // Widgets fill in (weather arrives, a task is added): measure again, quietly.
  let soon: ReturnType<typeof setTimeout> | undefined;
  const grid = root.querySelector('.nt-grid');
  const ticking = (n: Node) => !!(n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement)?.closest('.pomo-time, .nt-time, .pomo-read, .iso-svg');
  const content = new MutationObserver((records) => {
    if (records.every((r) => ticking(r.target))) return;
    clearTimeout(soon);
    soon = setTimeout(refresh, 250);
  });
  if (grid) content.observe(grid, { subtree: true, childList: true, characterData: true });
  signal.addEventListener('abort', () => { clearTimeout(pending); clearTimeout(soon); content.disconnect(); mo.disconnect(); }, { once: true });
}
