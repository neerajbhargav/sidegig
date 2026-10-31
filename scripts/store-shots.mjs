// Store listing images from the fixture preview: five 1280x800 screenshots and the 440x280 promo tile.
// Run `npm run preview`, serve dist/ on 127.0.0.1:8765, then:
//   node scripts/store-shots.mjs            (E2E_CHANNEL=chrome uses an installed Google Chrome)
// Output: docs/store/*.png. No network: every non-local request is blocked.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '../docs/store');
const BASE = 'http://127.0.0.1:8765/preview/';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chromium', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
const page = await context.newPage();
const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

// 1. The rail and drawer beside a page, with the Assistant's answer (same steps as readme-gif.mjs).
await page.goto(`${BASE}qa-tour.html`);
await page.waitForTimeout(800);
const cdp = await context.newCDPSession(page);
async function railButton(label) {
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const find = (n) => (n.nodeName === 'SIDEGIG-RAIL' ? n : (n.children ?? []).map(find).find(Boolean));
  const shadow = find(root)?.shadowRoots?.[0];
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: shadow.nodeId, selector: `button[aria-label^="${label}"]` });
  const { model } = await cdp.send('DOM.getBoxModel', { nodeId });
  const [x1, y1, , , x2, y2] = model.border;
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}
// The rail slides in once it has read its settings and the pointer rests at the edge.
await page.mouse.move(520, 300);
await page.mouse.move(2, 300, { steps: 10 });
let assistant = { x: -1, y: 0 };
for (let i = 0; assistant.x < 0 && i < 40; i++) {
  await page.mouse.move(1, 300 + (i % 2));
  await page.waitForTimeout(150);
  assistant = await railButton('Assistant').catch(() => ({ x: -1, y: 0 }));
}
await page.mouse.click(assistant.x, assistant.y);
const drawer = await (async () => {
  for (let i = 0; i < 40; i++) {
    const f = page.frames().find((x) => x.url() === 'about:srcdoc');
    if (f) return f;
    await page.waitForTimeout(150);
  }
  throw new Error('no drawer frame');
})();
const input = drawer.locator('textarea.cc-in');
await drawer.locator('.cc-pick[title="Choose a model"]:not([disabled])').waitFor();
await input.fill('Sum up this page');
await drawer.locator('.cc-send').click();
await drawer.getByText('only when something changed').waitFor({ timeout: 15000 });
await page.mouse.move(640, 400);
await page.waitForTimeout(800);
await shot('1-assistant');

// 2 to 5. Single pages.
for (const [url, name] of [['qa-newtab.html', '2-newtab'], ['options.html#welcome', '3-welcome'], ['qa-desk.html', '4-newtab-dark'], ['qa-settings.html', '5-settings']]) {
  await page.goto(BASE + url);
  await page.waitForTimeout(2000);
  await shot(name);
}

// Promo tile, 440x280: the icon, the name and one line.
const icon = readFileSync(path.resolve(import.meta.dirname, '../dist/chrome/icons/128.png')).toString('base64');
await page.setViewportSize({ width: 440, height: 280 });
await page.setContent(`<body style="margin:0;width:440px;height:280px;display:grid;place-content:center;gap:14px;justify-items:center;background:linear-gradient(135deg,#b4c0f5,#e3b8d8);font-family:-apple-system,'Inter',system-ui,sans-serif;color:#15161c">
  <img src="data:image/png;base64,${icon}" width="72" height="72" style="border-radius:16px;box-shadow:0 6px 20px rgb(0 0 0/.15)">
  <div style="font-size:34px;font-weight:650;letter-spacing:-.02em">sidegig</div>
  <div style="font-size:16px;opacity:.75">Your apps and AI, beside any page</div></body>`);
await page.screenshot({ path: path.join(OUT, 'promo-440x280.png') });
await browser.close();
console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
