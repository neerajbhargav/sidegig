// Records docs/screenshots/tour.gif from the preview's qa-tour.html scene: the page rail on hover,
// a fixture app in the drawer, then the Assistant reads the page (a scripted model, nothing online).
// Needs ffmpeg. Run `npm run preview`, serve dist/ on 127.0.0.1:8765, then:
//   node scripts/readme-gif.mjs            (E2E_CHANNEL=chrome uses an installed Google Chrome)
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '../docs/screenshots/tour.gif');
const size = { width: 900, height: 560 };
const dir = mkdtempSync(path.join(tmpdir(), 'sidegig-gif-'));
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chromium', headless: true });
const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2 });
const page = await context.newPage();
// Frames come from the DevTools screencast (Playwright's own video needs a separate ffmpeg download).
const cdp = await context.newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  frames.push({ data, t: metadata.timestamp });
  void cdp.send('Page.screencastFrameAck', { sessionId });
});
await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
// Headless video has no pointer: draw one so the viewer sees what is hovered.
await page.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;z-index:2147483647;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(20,20,30,.55);border:2px solid #fff;pointer-events:none;left:-40px;top:-40px;transition:transform .1s';
    document.documentElement.append(dot);
    addEventListener('mousemove', (e) => Object.assign(dot.style, { left: `${e.clientX}px`, top: `${e.clientY}px` }), true);
    addEventListener('mousedown', () => (dot.style.transform = 'scale(.7)'), true);
    addEventListener('mouseup', () => (dot.style.transform = ''), true);
  });
});
await page.goto('http://127.0.0.1:8765/preview/qa-tour.html');
await page.waitForTimeout(800);
await cdp.send('Page.startScreencast', { format: 'png' });
const pause = (ms) => page.waitForTimeout(ms);
// Rail buttons sit in a closed shadow root: find their centres through DevTools, as e2e/extension.spec.ts does.
async function railButton(label) {
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const find = (n) => (n.nodeName === 'SIDEGIG-RAIL' ? n : (n.children ?? []).map(find).find(Boolean));
  const shadow = find(root)?.shadowRoots?.[0];
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: shadow.nodeId, selector: `button[aria-label^="${label}"]` });
  const { model } = await cdp.send('DOM.getBoxModel', { nodeId });
  const [x1, y1, , , x2, y2] = model.border;
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}
await page.mouse.move(520, 300);
await pause(1200);
await page.mouse.move(2, 300, { steps: 25 });
// The rail slides in once it has read its settings and the pointer rests at the edge.
let app = await railButton('Field notes');
for (let i = 0; app.x < 0 && i < 40; i++) {
  await page.mouse.move(1, 300 + (i % 2));
  await pause(150);
  app = await railButton('Field notes');
}
await pause(700);
await page.mouse.move(app.x, app.y, { steps: 20 });
await pause(500);
await page.mouse.click(app.x, app.y);
await pause(2200);
const assistant = await railButton('Assistant');
await page.mouse.move(assistant.x, assistant.y, { steps: 25 });
await pause(500);
await page.mouse.click(assistant.x, assistant.y);
await pause(1200);
const drawer = page.frames().find((f) => f.url() === 'about:srcdoc');
if (!drawer) throw new Error('no drawer frame');
const input = drawer.locator('textarea.cc-in');
await input.waitFor();
await drawer.locator('.cc-pick[title="Choose a model"]:not([disabled])').waitFor();
const box = await input.boundingBox();
if (box) await page.mouse.move(box.x + 60, box.y + box.height / 2, { steps: 20 });
await input.click();
await input.pressSequentially('Sum up this page', { delay: 70 });
await pause(400);
await drawer.locator('.cc-send').click();
await drawer.getByText('only when something changed').waitFor({ timeout: 15000 });
await pause(2500);
await cdp.send('Page.stopScreencast');
frames.push({ ...frames[frames.length - 1], t: frames[frames.length - 1].t + 2.5 }); // hold the last frame
await context.close();
await browser.close();
// The screencast sends a frame only when the page changes: give each frame its real duration.
const list = frames.slice(0, -1).map((f, i) => {
  const file = path.join(dir, `f${String(i).padStart(4, '0')}.png`);
  writeFileSync(file, Buffer.from(f.data, 'base64'));
  return `file '${file}'\nduration ${(frames[i + 1].t - f.t).toFixed(3)}`;
});
writeFileSync(path.join(dir, 'list.txt'), `${list.join('\n')}\n`);
// Two passes: a palette from the whole clip, then the GIF at 12 fps and 900 px wide.
const concat = ['-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt')];
const filters = 'fps=12,scale=900:-1:flags=lanczos';
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...concat, '-vf', `${filters},palettegen=stats_mode=diff`, path.join(dir, 'p.png')]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...concat, '-i', path.join(dir, 'p.png'), '-lavfi', `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, OUT]);
console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
