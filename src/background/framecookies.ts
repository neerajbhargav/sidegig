// Cookies for apps shown inside sidegig's frames.
//
// In the sidebar a site is "embedded" in sidegig's page, so its scripts can't read
// its own same-site cookies (SameSite=Lax/Strict, or unset). Some apps need one:
// X reads its ct0 anti-forgery token. The frame helper (content/framefit-main.ts)
// asks for those and merges them into the page's own document.cookie reads.
//
// Requests are left alone: the browser already sends these cookies from sidegig's
// frames, and adding them again made Google answer with its CookieMismatch page.
import { ext } from '../shared/api.ts';

const hostOf = (u: string) => {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' ? x.hostname : '';
  } catch {
    return '';
  }
};

/** The site's same-site cookies a page may read itself (not HttpOnly), as "a=1; b=2". */
export async function pageCookies(url: string): Promise<string> {
  const host = hostOf(url);
  const ck = (ext as any).cookies;
  if (!host || !ck?.getAll) return '';
  const all: chrome.cookies.Cookie[] = await ck.getAll({ url: `https://${host}/` }).catch(() => []);
  return all
    .filter((c) => c.sameSite !== 'no_restriction' && !(c as { partitionKey?: unknown }).partitionKey && !c.httpOnly)
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}
