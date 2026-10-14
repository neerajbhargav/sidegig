// The page-world half of the frame helper (runs in the site's own JavaScript
// world at document_start; see framefit.ts for the other half). Only inside
// sidegig's app frames: a frame named "sidegig-app…" whose outermost page is an
// extension page. Normal pages and other sites' frames are untouched.
(() => {
  let anc = '';
  try {
    const a = location.ancestorOrigins;
    anc = a && a.length ? a[a.length - 1] : '';
  } catch {
    return;
  }
  if (window.top === window || !window.name.startsWith('sidegig-app') || !/^(chrome|moz|safari-web)-extension:\/\//.test(anc)) return;

  // Inside the sidebar the site is "embedded", where browsers only accept cookies
  // that say they may be (SameSite=None; Secure). Sites write theirs without it
  // (Gmail's and Google sign-in's first check is writing a test cookie), so add it.
  // Same-site cookies the page may read (X's ct0) arrive from the other half.
  let extra = '';
  document.addEventListener('sidegig-cookies', (e) => {
    extra = String((e as CustomEvent).detail || '');
  });
  try {
    const d = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    if (d?.get && d.set) {
      const get = d.get;
      const set = d.set;
      Object.defineProperty(Document.prototype, 'cookie', {
        configurable: true,
        enumerable: d.enumerable,
        get(this: Document) {
          const own = String(get.call(this));
          if (!extra) return own;
          const have = new Set(own.split(';').map((c) => c.split('=')[0].trim()));
          const add = extra.split('; ').filter((c) => !have.has(c.split('=')[0]));
          return add.length ? (own ? `${own}; ` : '') + add.join('; ') : own;
        },
        set(this: Document, v: string) {
          let c = String(v);
          if (!/;\s*samesite\s*=/i.test(c)) c += '; SameSite=None';
          if (/samesite\s*=\s*none/i.test(c) && !/;\s*secure\b/i.test(c)) c += '; Secure';
          set.call(this, c);
          // A same-site cookie the page writes: remember it for reads too.
          const [nv] = c.split(';');
          const name = nv.split('=')[0].trim();
          if (extra && name) extra = extra.split('; ').filter((x) => x.split('=')[0] !== name).join('; ');
        },
      });
    }
  } catch {
    /* leave cookies alone */
  }
  // A service worker registered from here would later answer with "don't frame me".
  try {
    const sw = navigator.serviceWorker;
    if (sw) Object.defineProperty(sw, 'register', { configurable: true, value: () => Promise.reject(new DOMException('Not in the sidebar', 'SecurityError')) });
  } catch {
    /* fine */
  }
  // DIAGNOSTIC (temporary): report uncaught errors and Gmail's error-page reasons to sidegig.
  const report = (kind: string, msg: string) => {
    try {
      window.top?.postMessage({ ns: 'sidegig-frame', type: 'diag', kind, msg: msg.slice(0, 600), url: location.href }, '*');
    } catch {
      /* fine */
    }
  };
  addEventListener('error', (e) => report('error', `${e.message} @ ${e.filename}:${e.lineno}:${e.colno} ${e.error?.stack ?? ''}`), true);
  addEventListener('unhandledrejection', (e) => report('rejection', String(e.reason?.stack ?? e.reason)));
  for (const k of ['error', 'warn', 'log', 'info'] as const) {
    const orig = console[k].bind(console);
    console[k] = (...a: unknown[]) => {
      const text = a.map((x) => (x instanceof Error ? `${x.message} ${x.stack}` : typeof x === 'string' ? x : '')).join(' ');
      if (/error page|exception|errorPageCause|SecurityError|denied|blocked/i.test(text)) report(`console.${k}`, text);
      orig(...a);
    };
  }
  const ready = () => document.dispatchEvent(new Event('sidegig-shim-ready'));
  ready();
  document.addEventListener('DOMContentLoaded', ready, { once: true });
})();
