// Finds text that does not stand out from the surface under it (white on white).
// A function expression: evaluate it in a page, for example from scripts/design-smoke.js.
// Text on a widget card over the wallpaper is skipped: the desk tone (src/shared/legible.ts) checks it
// against the photo. Text straight on the wallpaper is listed in `loose`.
(() => {
  // A canvas turns any CSS colour (oklab, color-mix, named) into sRGB bytes.
  const pen = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  const parse = (c) => {
    if (!c || c === 'transparent') return null;
    pen.clearRect(0, 0, 1, 1);
    pen.fillStyle = 'rgba(0, 0, 0, 0)';
    pen.fillStyle = c;
    pen.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = pen.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  };
  const over = (top, under) => {
    const a = top.a + under.a * (1 - top.a);
    const mix = (k) => (a ? (top[k] * top.a + under[k] * under.a * (1 - top.a)) / a : 0);
    return { r: mix('r'), g: mix('g'), b: mix('b'), a };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (x, y) => {
    const [hi, lo] = [lum(x), lum(y)].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
  };
  /** The colour behind an element, or null when the wallpaper shows through. */
  const surface = (el) => {
    let bg = { r: 0, g: 0, b: 0, a: 0 };
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage !== 'none' && !n.matches('html, body')) return bg.a >= 0.85 ? bg : 'wall';
      const c = parse(s.backgroundColor);
      if (c?.a) bg = over(bg, c);
      if (bg.a >= 0.85) return bg;
      if (n.matches('.gw')) return null;
      if (n.matches('.nt-wall')) return 'wall';
    }
    return bg.a >= 0.85 ? bg : document.querySelector('.nt-wall img, .nt-wall canvas') ? 'wall' : null;
  };
  const out = [];
  const loose = [];
  for (const el of document.querySelectorAll('body *')) {
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    const field = el.matches('input, textarea') && (el.value || el.placeholder);
    if (!text && !field) continue;
    if (!el.getClientRects().length || el.closest('[hidden]')) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || +s.opacity === 0) continue;
    const fg = parse(el.matches('input:placeholder-shown, textarea:placeholder-shown') ? getComputedStyle(el, '::placeholder').color : s.color);
    const bg = surface(el);
    if (bg === 'wall') loose.push(String(text || field).slice(0, 30));
    if (!fg || !bg || bg === 'wall') continue;
    const r = ratio(over(fg, bg), bg);
    const large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && +s.fontWeight >= 600);
    if (r < (large ? 3 : 4.5)) out.push({ text: String(text || field).slice(0, 40), ratio: +r.toFixed(2), where: el.className && String(el.className).slice(0, 40), widget: el.closest('.gw')?.dataset.w ?? '' });
  }
  // fails: text below 4.5:1 (3:1 when large). loose: text straight on the wallpaper, listed for a look.
  return { fails: out, loose };
})()
