// The built extension (dist/chrome) in a real Chromium, from a fresh profile per test:
// the rail on a web page, the rail-to-drawer channel, drawer embedding, the frame header
// rules and the new tab. A local server stands in for web sites; nothing goes online.
import { test as base, expect, chromium, type BrowserContext, type Frame, type Page, type Worker } from '@playwright/test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

const BUILD = path.resolve(import.meta.dirname, '../dist/chrome');

// /page: a plain page that records every message posted to it.
// /embed: a page that tries to frame the drawer at its plain address.
// /app: refuses to be framed and blocks inline scripts, so a script that runs shows that the headers were removed.
const PAGES: Record<string, { headers?: Record<string, string>; html: (q: URLSearchParams) => string }> = {
  '/page': {
    html: () =>
      `<!doctype html><html lang="en"><title>Local page</title><script>window.__messages = []; addEventListener('message', (e) => __messages.push(e.origin));</script><h1>A local test page</h1><p>${'Some text. '.repeat(80)}</p>`,
  },
  '/embed': {
    html: (q) => `<!doctype html><html lang="en"><title>Embed</title><iframe id="probe" src="chrome-extension://${q.get('id')}/drawer.html#ctx=drawer&view=home"></iframe>`,
  },
  '/app': {
    headers: { 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'; script-src 'none'" },
    html: () => `<!doctype html><html lang="en"><title>app</title><script>document.title = 'script ran';</script><p>app</p>`,
  },
};

type Extension = { id: string; worker: Worker };
const test = base.extend<{ site: string; context: BrowserContext; extension: Extension }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads fixture dependencies from this pattern.
  site: async ({}, use) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const page = PAGES[url.pathname];
      if (!page) return void res.writeHead(404).end();
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...page.headers }).end(page.html(url.searchParams));
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    await use(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    server.close();
  },
  context: async ({ channel }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel,
      headless: true,
      viewport: { width: 1280, height: 720 },
      // The build is loaded over CDP below: branded Chrome ignores --load-extension since 137.
      args: ['--enable-unsafe-extension-debugging'],
      ignoreDefaultArgs: ['--disable-extensions'],
    });
    await use(context);
    await context.close();
  },
  extension: async ({ context }, use) => {
    const browser = context.browser();
    if (!browser) throw new Error('no browser for the persistent context');
    const cdp = await browser.newBrowserCDPSession();
    const started = context.waitForEvent('serviceworker');
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: BUILD });
    const worker = await started;
    expect(worker.url()).toBe(`chrome-extension://${id}/background.js`);
    // The worker installs its network rules once it has read the settings.
    await expect.poll(() => worker.evaluate(async () => (await chrome.declarativeNetRequest.getSessionRules()).length)).toBeGreaterThan(0);
    await use({ id, worker });
  },
});

/** The margin the docked rail (and an open drawer) takes from the page. */
const dockMargin = (page: Page) =>
  page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return Math.max(Number.parseFloat(s.marginLeft), Number.parseFloat(s.marginRight));
  });

/** The rail's own drawer frame (its address carries the rail's nonce), once loaded. */
async function drawerFrame(page: Page): Promise<Frame> {
  let frame: Frame | undefined;
  await expect.poll(() => (frame = page.frames().find((f) => /^chrome-extension:\/\/[^/]+\/drawer\.html#.*\bn=/.test(f.url())))).toBeTruthy();
  const found = frame as Frame;
  await expect(found.locator('body.ctx-drawer')).toBeAttached();
  return found;
}

test('the rail appears on a web page, and the page makes room for it', async ({ context, extension, site }, info) => {
  expect(extension.id).toBeTruthy();
  const page = await context.newPage();
  await page.goto(`${site}/page`);
  await expect(page.locator('sidegig-rail')).toBeAttached();

  // The rail lives in a closed shadow root; DevTools can still measure it.
  const cdp = await context.newCDPSession(page);
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  type Node = { nodeId: number; nodeName: string; children?: Node[]; shadowRoots?: Node[] };
  const find = (n: Node): Node | undefined => (n.nodeName === 'SIDEGIG-RAIL' ? n : (n.children ?? []).map(find).find(Boolean));
  const shadow = find(root as Node)?.shadowRoots?.[0];
  expect(shadow).toBeTruthy();
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: (shadow as Node).nodeId, selector: 'nav.rail' });
  const { model } = await cdp.send('DOM.getBoxModel', { nodeId });
  const { nodeIds: buttons } = await cdp.send('DOM.querySelectorAll', { nodeId, selector: 'button' });
  const [x1, , x2] = model.border;
  expect(buttons.length).toBeGreaterThan(3);
  expect(model.height).toBeGreaterThan(200);
  // Docked: the page gives up a strip on one edge, and the rail sits inside that strip.
  const margin = await dockMargin(page);
  expect(margin).toBeGreaterThanOrEqual(x2 - x1);
  expect(x2 <= margin + 1 || x1 >= 1280 - margin - 1).toBe(true);
  await page.screenshot({ path: info.outputPath('rail.png') });
});

test('the drawer opens and closes over the private channel; the page sees no messages', async ({ context, extension, site }, info) => {
  const page = await context.newPage();
  await page.goto(`${site}/page`);
  const drawer = await drawerFrame(page); // preloaded on its home view
  const closed = await dockMargin(page);

  // Rail to drawer: the drawer already exists, so the new view travels only over the port.
  await extension.worker.evaluate(
    async ([url, view]) => {
      const [tab] = await chrome.tabs.query({ url });
      await chrome.tabs.sendMessage(tab.id as number, { type: 'open-view', view });
    },
    [`${site}/page`, 'search'],
  );
  await expect(drawer.getByPlaceholder('Search tabs, bookmarks, history, apps')).toBeVisible();
  await expect.poll(() => dockMargin(page)).toBeGreaterThan(closed);
  await page.screenshot({ path: info.outputPath('drawer-search.png') });

  // Drawer to rail: Close asks the rail to close the drawer and give the space back.
  await drawer.getByRole('button', { name: 'Close (Esc)' }).click();
  await expect.poll(() => dockMargin(page)).toBe(closed);

  // Nothing was posted to the page itself.
  expect(await page.evaluate(() => (window as unknown as { __messages: string[] }).__messages)).toEqual([]);
});

test('a web page cannot embed drawer.html', async ({ context, extension, site }) => {
  const page = await context.newPage();
  await page.goto(`${site}/embed?id=${extension.id}`);
  const probe = await (await page.locator('#probe').elementHandle())?.contentFrame();
  await expect.poll(() => probe?.url()).toBe('chrome-error://chromewebdata/');
  // The rail's own drawer, at its per-session address, loads on the same page.
  await drawerFrame(page);
});

test('frame header rules match sub-frames only, never a top-level page', async ({ context, extension, site }) => {
  const rules = await extension.worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules());
  const stripping = rules.filter((r) => r.action.responseHeaders?.some((h) => h.operation === 'remove'));
  expect(stripping.length).toBeGreaterThan(0);
  for (const r of stripping) expect(r.condition.resourceTypes).toEqual(['sub_frame']);
  // With default settings no rule matches main_frame at all. (Rule 4, the phone user agent
  // for a docked side window's own tab, is the one exception, and needs a side window.)
  expect(rules.filter((r) => r.condition.resourceTypes?.includes('main_frame' as chrome.declarativeNetRequest.ResourceType))).toEqual([]);

  // Behaviour: a sidegig page frames /app, and the headers are removed, so its script runs...
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extension.id}/newtab.html`);
  const app = `${site}/app`;
  await page.evaluate((src) => {
    const f = document.createElement('iframe');
    f.src = src;
    document.body.append(f);
  }, app);
  await expect.poll(() => page.frames().find((f) => f.url() === app)?.title()).toBe('script ran');
  // ...but the same page opened top-level by the same sidegig page keeps them: the script stays blocked.
  await page.evaluate((src) => {
    location.href = src;
  }, app);
  await page.waitForURL(app);
  await expect(page.locator('p')).toHaveText('app');
  expect(await page.title()).toBe('app');
});

test('the new tab fits 1280x720 without scrolling or clipping', async ({ context, extension }, info) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extension.id}/newtab.html`);
  await expect(page.locator('.nt-grid .gw').first()).toBeVisible();
  const r = await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const grid = document.querySelector<HTMLElement>('.nt-grid');
    return {
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      flow: grid?.dataset.flow,
      widgets: [...document.querySelectorAll<HTMLElement>('.nt-grid .gw')].map((w) => {
        const card = w.querySelector<HTMLElement>('.nt-card');
        return { id: w.dataset.w, hidden: w.hidden, bottom: w.getBoundingClientRect().bottom, clips: !!card && card.scrollHeight > card.clientHeight + 3 };
      }),
    };
  });
  expect([r.width, r.height]).toEqual([1280, 720]);
  expect(r.flow).toBe('false'); // the one-screen grid, not the scrolling fallback
  expect(r.scrollWidth).toBeLessThanOrEqual(r.width);
  expect(r.scrollHeight).toBeLessThanOrEqual(r.height);
  expect(r.widgets.length).toBeGreaterThanOrEqual(6);
  for (const w of r.widgets) expect(w, `widget ${w.id}`).toMatchObject({ hidden: false, clips: false });
  for (const w of r.widgets) expect(w.bottom, `widget ${w.id}`).toBeLessThanOrEqual(r.height);
  await page.screenshot({ path: info.outputPath('newtab-1280x720.png') });
});
