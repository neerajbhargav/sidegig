// One icon system for every site sidegig shows (rail, sidebar, new tab,
// bookmarks, search, edition). Known services get their vector logo (crisp at
// any size, coloured by the theme or in the brand's own colour); anything else
// gets the browser's sharpest site icon; nothing known gets a quiet letter.
import { BRAND_DOMAINS, BRAND_HEX, BRAND_ICONS, DARK_BRANDS } from './brands.ts';

export type IconStyle = 'themed' | 'color';

export interface Glyph {
  /** icons/brands/<file>.svg */
  file: string;
  /** Brand colour, #rrggbb. */
  hex: string;
  /** Near-black logos: drawn in the ink colour even in colour mode. */
  dark: boolean;
}

const lum = (hex: string) => {
  const [r, g, b] = [0, 2, 4].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The vector logo for a site or a catalog app, if sidegig ships one. */
export function glyphFor(url: string, catalogId?: string): Glyph | null {
  if (catalogId && BRAND_ICONS.has(catalogId)) {
    const hex = BRAND_HEX[catalogId] ?? '1f1f1f';
    return { file: catalogId, hex: `#${hex}`, dark: DARK_BRANDS.has(catalogId) || lum(hex) < 0.14 };
  }
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  // The host, then its parents: mail.google.com, then google.com.
  for (let h = host; h.includes('.'); h = h.slice(h.indexOf('.') + 1)) {
    const file = BRAND_DOMAINS[h];
    if (file) {
      const hex = BRAND_HEX[file] ?? '1f1f1f';
      return { file, hex: `#${hex}`, dark: lum(hex) < 0.14 };
    }
  }
  return null;
}

/** Ask the browser for a sharp icon: twice the drawn size, for high-density screens. */
export const iconPixels = (drawn: number) => Math.min(128, Math.max(32, Math.ceil(drawn * Math.max(2, globalThis.devicePixelRatio || 1))));
