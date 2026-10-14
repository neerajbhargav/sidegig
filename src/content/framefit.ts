// Runs in every frame at document_start, but only acts inside sidegig's own app
// frames (the sidebar panel and the in-page drawer): a frame named "sidegig-app"
// whose outermost page is this extension. There it lets sites that refuse to
// run in a frame start normally:
//
//  - Gmail's first script decides "in a frame? then navigate the top window to
//    me, and don't start". We rewrite that check in inline scripts before they
//    run, so the app starts inside the sidebar.
//  - Service workers registered from inside the frame would answer later loads
//    with "don't frame me" headers, so registration is turned off here.
//  - The frame says hello to the panel, so the panel knows it loaded.
//
// Normal tabs are never touched: the check below fails and the script returns.
import { ext } from '../shared/api.ts';
import { rewriteFrameChecks } from '../shared/framecheck.ts';

const ANCESTOR = (() => {
  try {
    const a = location.ancestorOrigins;
    return a && a.length ? a[a.length - 1] : '';
  } catch {
    return '';
  }
})();
const OURS = (() => {
  try {
    return new URL(ext.runtime.getURL('/')).origin;
  } catch {
    return '';
  }
})();
const framedByUs = window.top !== window && window.name.startsWith('sidegig-app') && !!OURS && ANCESTOR === OURS;
/** What the helper saw and did, readable from sidegig's own scripts (same isolated world). */
const state = { framedByUs, ancestor: ANCESTOR, name: window.name, scripts: 0, rewrote: 0, late: 0, shim: false };
(globalThis as unknown as { __sidegigFrame: typeof state }).__sidegigFrame = state;

function start() {
  document.addEventListener('sidegig-shim-ready', () => (state.shim = true));
  // Same-site cookies the page may read but the browser hides inside a frame (X's ct0).
  void ext.runtime
    .sendMessage({ type: 'frame-cookies', url: location.href })
    .then((c: string) => c && document.dispatchEvent(new CustomEvent('sidegig-cookies', { detail: c })))
    .catch(() => undefined);
  // Inline scripts: fix the frame check before the parser runs them. The parser
  // adds a script tag first and its code afterwards (in pieces, for big scripts),
  // and runs a microtask checkpoint, where these records arrive, right before it
  // runs the script. So every time a script's text changes, check it again.
  const checked = new WeakMap<HTMLScriptElement, number>();
  const fix = (n: Node | null) => {
    if (!(n instanceof HTMLScriptElement) || n.src) return;
    const t = n.textContent ?? '';
    if (checked.get(n) === t.length) return;
    if (!checked.has(n)) state.scripts++;
    checked.set(n, t.length);
    if (!/\btop\b|GM_showErrorPageCalled/.test(t)) return;
    // DIAGNOSTIC (temporary): keep the reason Gmail shows its error page.
    const next = rewriteFrameChecks(t).replace(/(\w+)\.GM_showErrorPageCalled=!0;/, '$1.GM_showErrorPageCalled=!0;try{sessionStorage.setItem("sidegig-err",String(arguments[0])+" | "+String(arguments[1])+" | "+String(arguments[2]&&arguments[2].stack||arguments[2]||""))}catch(_e){};');
    if (next !== t) {
      n.textContent = next;
      checked.set(n, next.length);
      state.rewrote++;
    }
  };
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      if (r.target instanceof HTMLScriptElement) fix(r.target);
      else if (r.type === 'characterData') fix(r.target.parentNode);
      for (const n of r.addedNodes) fix(n.nodeType === Node.TEXT_NODE ? n.parentNode : n);
    }
  });
  mo.observe(document, { childList: true, subtree: true, characterData: true });
  for (const sc of document.scripts) fix(sc);
  addEventListener('DOMContentLoaded', () => setTimeout(() => mo.disconnect(), 4000), { once: true });
  const hello = () => {
    try {
      window.parent.postMessage({ ns: 'sidegig-frame', type: 'hello', url: location.href, title: document.title, scripts: state.scripts, rewrote: state.rewrote, shim: state.shim, err: (() => { try { return sessionStorage.getItem('sidegig-err') ?? ''; } catch { return 'no storage'; } })(), cookies: document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter(Boolean) }, '*');
    } catch {
      /* fine */
    }
  };
  addEventListener('DOMContentLoaded', hello, { once: true });
  addEventListener('load', hello, { once: true });
  // Some apps rewrite their document (document.open drops listeners): say hello on a timer too.
  for (const ms of [1500, 4000, 9000]) setTimeout(hello, ms);
}

if (framedByUs) start();
