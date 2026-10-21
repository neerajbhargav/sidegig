// The page-world half of the frame helper (runs in the site's own JavaScript
// world at document_start; see framefit.ts for the other half). Only inside
// sidegig's app frames: a frame named "sidegig-app…" whose outermost page is an
// extension page. Normal pages and other sites' frames are untouched.
import { rewriteFrameChecks, rewriteTopRefs, TOP_REWRITE_HOSTS } from '../shared/framecheck.ts';

/** Muted apps (a switch per app in settings) show no desktop notifications from inside
 * sidegig, in the sidebar and in a page's drawer. The other half says whether this app is muted. */
function quietNotifications() {
  let muted = false;
  document.addEventListener('sidegig-mute', (e) => {
    muted = !!(e as CustomEvent).detail;
  });
  const Real = window.Notification;
  if (!Real) return;
  const Quiet = function (title: string, options?: NotificationOptions) {
    if (!muted) return new Real(title, options);
    const quiet = Object.assign(new EventTarget(), { title, ...options, onclick: null, onclose: null, onerror: null, onshow: null });
    return Object.assign(quiet, { close() {} });
  } as unknown as typeof Notification;
  Quiet.prototype = Real.prototype;
  Object.defineProperty(Quiet, 'permission', { get: () => Real.permission });
  Object.defineProperty(Quiet, 'requestPermission', { value: (...a: Parameters<typeof Real.requestPermission>) => Real.requestPermission(...a) });
  Object.defineProperty(window, 'Notification', { configurable: true, writable: true, value: Quiet });
}

(() => {
  let anc = '';
  let parent = '';
  try {
    const a = location.ancestorOrigins;
    anc = a && a.length ? a[a.length - 1] : '';
    parent = a && a.length ? a[0] : '';
  } catch {
    return;
  }
  const extension = (o: string) => /^(chrome|moz|safari-web)-extension:\/\//.test(o);
  if (window.top === window || !window.name.startsWith('sidegig-app')) return;
  // An app in a page's drawer (web page > sidegig drawer > app) gets only the mute.
  if (!extension(anc)) return void (extension(parent) && quietNotifications());
  quietNotifications();

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
  // Gmail loads its code as <script src> from its own origin, written for a
  // top-level page (`top` is its own window). Load those scripts rewritten, in
  // the order the page added them; if a fetch fails, the original loads instead.
  if (TOP_REWRITE_HOSTS.has(location.hostname)) {
    // `x.top` reads in rewritten code: the app's own window when x is that window.
    Object.defineProperty(window, '__sidegigTop', { value: (o: { top: unknown }) => (o === (window as unknown) ? window : o.top) });
    const get = fetch.bind(window);
    let queue = Promise.resolve();
    const ownScript = (n: unknown): n is HTMLScriptElement => n instanceof HTMLScriptElement && !!n.src && n.src.startsWith(`${location.origin}/`);
    const proto = Node.prototype as unknown as Record<string, (this: Node, ...a: unknown[]) => Node>;
    for (const key of ['appendChild', 'insertBefore']) {
      const orig = proto[key];
      proto[key] = function (this: Node, ...a: unknown[]) {
        const n = a[0];
        if (!ownScript(n)) return orig.apply(this, a);
        const code = get(n.src, { credentials: 'include' }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))));
        queue = queue
          .then(() => code)
          .then((c) => void (n.src = URL.createObjectURL(new Blob([rewriteTopRefs(rewriteFrameChecks(c))], { type: 'text/javascript' }))))
          .catch(() => undefined)
          .then(() => void orig.apply(this, a))
          .catch(() => undefined); // a failed insert must not stop the scripts after it
        return n;
      };
    }
  }
  // A service worker registered from here would later answer with "don't frame me".
  try {
    const sw = navigator.serviceWorker;
    if (sw) Object.defineProperty(sw, 'register', { configurable: true, value: () => Promise.reject(new DOMException('Not in the sidebar', 'SecurityError')) });
  } catch {
    /* fine */
  }
})();
