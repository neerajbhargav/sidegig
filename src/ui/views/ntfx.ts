// Picture treatments for the new tab, after Super Visuals' background library:
//   Film   warm grain, crushed blacks, a vignette (CSS layers)
//   Dream  soft focus, lifted light, a fine dot grid (CSS layers)
//   LED    the picture as a glowing dot-matrix wall fading into black (canvas)
//   Mosaic big pixel tiles with hairline grid lines (canvas)
// plus the risograph print (ntwall.ts). Canvas work runs once per picture and
// size, then comes from a small cache.
import { paletteFromPixels, type Palette } from '../../shared/walls.ts';

export async function loadBitmap(url: string): Promise<ImageBitmap> {
  const r = await fetch(url, { credentials: 'omit' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return createImageBitmap(await r.blob());
}

/** Draw a picture covering w×h (centre crop). */
function cover(x: CanvasRenderingContext2D, img: ImageBitmap, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  x.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
}

function sample(img: ImageBitmap, cols: number, rows: number, levels = false): Uint8ClampedArray {
  const c = new OffscreenCanvas(cols, rows);
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.imageSmoothingQuality = 'high';
  cover(x as unknown as CanvasRenderingContext2D, img, cols, rows);
  const px = x.getImageData(0, 0, cols, rows).data;
  if (levels) autoLevels(px);
  return px;
}

/** Stretch the 2nd–98th percentile brightness to the full range, so dark photos still glow. */
function autoLevels(px: Uint8ClampedArray) {
  const hist = new Uint32Array(256);
  const n = px.length / 4;
  for (let i = 0; i < n; i++) hist[(0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) | 0]++;
  let acc = 0;
  let lo = 0;
  let hi = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc < n * 0.02) lo = v;
    if (acc < n * 0.98) hi = v;
  }
  const span = Math.max(24, hi - lo);
  for (let i = 0; i < px.length; i += 4) for (let k = 0; k < 3; k++) px[i + k] = Math.max(0, Math.min(255, ((px[i + k] - lo) * 255) / span));
}

async function out(c: OffscreenCanvas, type = 'image/jpeg', quality = 0.86): Promise<string> {
  const blob = await c.convertToBlob({ type, quality });
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}

/**
 * LED wall: one lit dot per cell, size and glow following the picture's
 * brightness, on black. A blurred copy added on top makes the bloom.
 */
export async function led(img: ImageBitmap, w: number, h: number, pitch = 9): Promise<string> {
  const cols = Math.ceil(w / pitch);
  const rows = Math.ceil(h / pitch);
  const px = sample(img, cols, rows, true);
  const c = new OffscreenCanvas(w, h);
  const x = c.getContext('2d')!;
  x.fillStyle = '#050505';
  x.fillRect(0, 0, w, h);
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const i = (r * cols + k) * 4;
      let [R, G, B] = [px[i], px[i + 1], px[i + 2]];
      const l = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
      // Push saturation a little: LEDs are pure colour.
      const m = (R + G + B) / 3;
      R = Math.min(255, m + (R - m) * 1.35);
      G = Math.min(255, m + (G - m) * 1.35);
      B = Math.min(255, m + (B - m) * 1.35);
      const rad = pitch * 0.5 * (0.34 + 0.6 * Math.sqrt(l));
      x.fillStyle = `rgb(${R | 0},${G | 0},${B | 0})`;
      x.beginPath();
      x.arc(k * pitch + pitch / 2, r * pitch + pitch / 2, rad, 0, Math.PI * 2);
      x.fill();
    }
  }
  // Bloom.
  const glow = new OffscreenCanvas(w, h);
  const g = glow.getContext('2d')!;
  g.filter = `blur(${Math.round(pitch * 1.4)}px)`;
  g.drawImage(c, 0, 0);
  x.globalCompositeOperation = 'lighter';
  x.globalAlpha = 0.7;
  x.drawImage(glow, 0, 0);
  return out(c, 'image/jpeg', 0.9);
}

/**
 * ASCII: the picture drawn in characters, darker to denser, in the theme's ink
 * on the page colour, with the brightest cells in the accent.
 */
export async function ascii(img: ImageBitmap, w: number, h: number, bg: number[], ink: number[], accent: number[], cell = 11): Promise<string> {
  const ramp = ' .·:-=+*%#@';
  const cw = cell * 0.62;
  const cols = Math.ceil(w / cw);
  const rows = Math.ceil(h / cell);
  const px = sample(img, cols, rows, true);
  const c = new OffscreenCanvas(w, h);
  const x = c.getContext('2d')!;
  // Dark pages: letters glow on the page colour. Light pages: ink letters on paper.
  const darkPage = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2] < 128;
  x.fillStyle = `rgb(${bg.join(',')})`;
  x.fillRect(0, 0, w, h);
  x.font = `500 ${Math.round(cell * 0.95)}px "IBM Plex Mono", ui-monospace, Menlo, monospace`;
  x.textBaseline = 'top';
  const mix = (a: number[], b: number[], t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const i = (r * cols + k) * 4;
      let l = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      if (!darkPage) l = 1 - l;
      const ch = ramp[Math.min(ramp.length - 1, Math.floor(l * ramp.length))];
      if (ch === ' ') continue;
      x.fillStyle = l > 0.86 ? mix(bg, accent, 0.95) : mix(bg, ink, 0.35 + l * 0.6);
      x.fillText(ch, k * cw, r * cell);
    }
  }
  return out(c, 'image/png');
}

/** Mosaic: the picture as big square tiles with hairline grid lines in the page colour. */
export async function mosaic(img: ImageBitmap, w: number, h: number, grid: string, tile = 28): Promise<string> {
  const cols = Math.ceil(w / tile);
  const rows = Math.ceil(h / tile);
  const px = sample(img, cols, rows, true);
  const c = new OffscreenCanvas(w, h);
  const x = c.getContext('2d')!;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const i = (r * cols + k) * 4;
      x.fillStyle = `rgb(${px[i]},${px[i + 1]},${px[i + 2]})`;
      x.fillRect(k * tile, r * tile, tile, tile);
    }
  }
  x.strokeStyle = grid;
  x.globalAlpha = 0.55;
  x.lineWidth = 1;
  x.beginPath();
  for (let k = 0; k <= cols; k++) {
    x.moveTo(k * tile + 0.5, 0);
    x.lineTo(k * tile + 0.5, h);
  }
  for (let r = 0; r <= rows; r++) {
    x.moveTo(0, r * tile + 0.5);
    x.lineTo(w, r * tile + 0.5);
  }
  x.stroke();
  return out(c, 'image/png');
}

/** The picture's own theme colours (see paletteFromPixels). */
export function paletteOf(img: ImageBitmap): Palette {
  return paletteFromPixels(sample(img, 48, 28));
}
