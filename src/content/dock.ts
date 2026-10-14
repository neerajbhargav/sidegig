// Docking: make room for the rail the way Opera's sidebar does, so it never
// covers the page. Browsers don't let extensions change their own window, so
// we narrow the page itself:
//   1. the page's root element gets a margin the width of the dock;
//   2. fixed-position elements (headers, side navs, overlays) don't follow
//      that margin, so each one that would land under the rail is moved or
//      narrowed with a tagged stylesheet rule;
//   3. the page is watched for new or changed fixed elements.
// Everything is undone when the rail undocks, goes fullscreen or is removed.
import { needsFix, firstGuess, correct, type DockSide, type Box } from '../shared/dockmath.ts';

const ATTR = 'data-sidegig-dock';

export class Dock {
  private style = document.createElement('style');
  private width = 0;
  private side: DockSide = 'left';
  private fixes = new Map<Element, { id: string; tx: number; maxWidth: number | null }>();
  private seq = 0;
  private observer: MutationObserver | null = null;
  private dirty = false;
  private timer = 0;
  private lastScan = 0;
  private clipX = false;
  private suspended = false;
  /** Decided once, before our own rules exist, so our rule can't feed back into the check. */
  private relative: boolean | null = null;

  constructor() {
    this.style.id = 'sidegig-dock';
    this.style.setAttribute('data-sidegig', '');
  }

  get active(): boolean {
    return this.width > 0 && !this.suspended;
  }

  /** Reserve `width` px on `side`; 0 undocks. */
  set(width: number, side: DockSide) {
    const changed = width !== this.width || side !== this.side;
    this.width = Math.max(0, Math.round(width));
    this.side = side;
    if (!changed) return;
    if (!this.active) return this.teardown();
    this.mount();
    this.full();
  }

  /** Temporarily undock (fullscreen video, presentations). */
  suspend(on: boolean) {
    if (this.suspended === on) return;
    this.suspended = on;
    if (on) this.teardown(false);
    else if (this.width > 0) {
      this.mount();
      this.full();
    }
  }

  private mount() {
    if (!this.style.isConnected) (document.head ?? document.documentElement).append(this.style);
    if (!this.observer) {
      this.observer = new MutationObserver(() => this.schedule());
      this.observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] });
      window.addEventListener('resize', this.onResize, { passive: true });
    }
  }

  private teardown(forget = true) {
    this.observer?.disconnect();
    this.observer = null;
    window.removeEventListener('resize', this.onResize);
    clearTimeout(this.timer);
    for (const el of this.fixes.keys()) el.removeAttribute(ATTR);
    this.fixes.clear();
    this.clipX = false;
    this.style.remove();
    this.relative = null;
    if (forget) this.width = this.suspended ? this.width : 0;
  }

  private onResize = () => {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.full(), 150);
  };

  private schedule() {
    // Some frameworks rebuild <head>/<html> children on load; put our rules straight back.
    if (this.active && !this.style.isConnected) (document.head ?? document.documentElement).append(this.style);
    else if (this.active && document.head && this.style.parentNode === document.documentElement) document.head.append(this.style);
    this.dirty = true;
    if (this.timer) return;
    const wait = Math.max(250, 800 - (Date.now() - this.lastScan));
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      if (this.dirty) this.incremental();
    }, wait);
  }

  private rootRule(): string {
    const w = this.width;
    const html = document.documentElement;
    const parts = [
      this.side === 'left' ? `margin-left:${w}px!important` : `margin-right:${w}px!important`,
      `width:calc(100% - ${w}px)!important`,
      `min-width:0!important`,
    ];
    // Absolutely positioned page layers (no positioned ancestor) should move with the page.
    if (this.relative === null) this.relative = getComputedStyle(html).position === 'static';
    if (this.relative) parts.push('position:relative!important');
    if (this.clipX) parts.push('overflow-x:clip!important');
    return `html{${parts.join(';')}}`;
  }

  private write() {
    let css = this.rootRule();
    for (const f of this.fixes.values()) {
      css += `[${ATTR}="${f.id}"]{translate:${f.tx}px 0!important;${f.maxWidth !== null ? `max-width:${f.maxWidth}px!important;` : ''}}`;
    }
    this.style.textContent = css;
  }

  /** All visible fixed-position elements on the page (except sidegig's own). */
  private fixedElements(): Element[] {
    const out: Element[] = [];
    const all = document.body ? document.body.getElementsByTagName('*') : [];
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (el.hasAttribute('data-sidegig')) continue;
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' && cs.display !== 'none' && cs.visibility !== 'hidden') out.push(el);
    }
    return out;
  }

  private box(el: Element): Box {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width };
  }

  /** Re-measure everything from scratch (dock width, side or window size changed). */
  private full() {
    if (!this.active) return;
    for (const el of this.fixes.keys()) el.removeAttribute(ATTR);
    this.fixes.clear();
    const before = document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
    this.write();
    this.place(this.fixedElements());
    // If narrowing the page created sideways scrolling that wasn't there, clip it.
    const after = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    if (before && after && !this.clipX) {
      this.clipX = true;
      this.write();
    }
    this.lastScan = Date.now();
  }

  /** Handle new fixed elements and re-check ones the page has moved. */
  private incremental() {
    this.dirty = false;
    if (!this.active) return;
    const vw = document.documentElement.clientWidth;
    const current = this.fixedElements();
    const set = new Set(current);
    for (const el of [...this.fixes.keys()]) {
      if (!set.has(el) || !el.isConnected) {
        el.removeAttribute(ATTR);
        this.fixes.delete(el);
      }
    }
    const recheck: Element[] = [];
    for (const el of current) {
      const f = this.fixes.get(el);
      if (!f) {
        recheck.push(el);
        continue;
      }
      const r = this.box(el);
      // Pages move things after load (new containing blocks, JS layout). Release a
      // shift that's no longer needed, and redo one that left the element under
      // the rail or past the window edge.
      const natural = { left: r.left - f.tx, right: r.right - f.tx, width: r.width };
      const stale = f.maxWidth === null && !needsFix(natural, vw, this.width, this.side);
      const wrong = needsFix(r, vw, this.width, this.side) || r.left < -1;
      if (stale || wrong) {
        el.removeAttribute(ATTR);
        this.fixes.delete(el);
        if (wrong && !stale) recheck.push(el);
      }
    }
    this.write();
    if (recheck.length) this.place(recheck);
    this.lastScan = Date.now();
  }

  /** Move or narrow the given elements so none of them sits under the rail. */
  private place(els: Element[]) {
    const vw = document.documentElement.clientWidth;
    const w = this.width;
    const natural = els.map((el) => [el, this.box(el)] as const);
    const placed: { el: Element; target: number | null }[] = [];
    for (const [el, r] of natural) {
      if (!needsFix(r, vw, w, this.side)) continue;
      const guess = firstGuess(r, vw, w, this.side);
      // max-width applies to the content box unless the page uses border-box sizing.
      let maxWidth = guess.maxWidth;
      if (maxWidth !== null) {
        const cs = getComputedStyle(el);
        if (cs.boxSizing !== 'border-box') {
          const extra = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].reduce((n, k) => n + (parseFloat((cs as any)[k]) || 0), 0);
          maxWidth = Math.max(0, maxWidth - extra);
        }
      }
      const id = String(++this.seq);
      this.fixes.set(el, { id, tx: guess.tx, maxWidth });
      el.setAttribute(ATTR, id);
      placed.push({ el, target: guess.maxWidth });
    }
    if (!placed.length) return;
    this.write();
    // Then check where each one actually landed (anchoring and sizing vary) and nudge.
    for (let pass = 0; pass < 2; pass++) {
      let again = false;
      for (const { el, target } of placed) {
        const f = this.fixes.get(el)!;
        const after = this.box(el);
        if (target !== null && f.maxWidth !== null && after.width > target + 0.5) {
          f.maxWidth = Math.max(0, f.maxWidth - (after.width - target));
          again = true;
          continue;
        }
        const tx = correct(after, vw, w, this.side, f.tx);
        if (tx !== f.tx) {
          f.tx = tx;
          again = true;
        }
      }
      if (!again) break;
      this.write();
    }
  }
}
