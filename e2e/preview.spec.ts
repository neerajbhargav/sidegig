// The preview smoke flows (scripts/*-smoke.js) against the fixture preview on 127.0.0.1:8765.
// The scripts were written for the Aside CLI's REPL; these few globals stand in for it, so the
// same files run here and in CI. Build the preview first: `npm run preview`.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const SCRIPTS = ['product-smoke.js', 'portable-smoke.js', 'responsive-smoke.js', 'refinement-smoke.js'];
const AsyncFunction = (async () => {}).constructor as new (...args: string[]) => (...values: unknown[]) => Promise<void>;

test.use({ viewport: { width: 1440, height: 900 } });

for (const script of SCRIPTS) {
  test(script, async ({ context }, info) => {
    // Fixtures name real sites (their icons); keep the run offline and fast.
    await context.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (route) => route.abort());
    const log: string[] = [];
    const globals = {
      openTab: async (url: string) => {
        const page = await context.newPage();
        await page.goto(url);
        return page;
      },
      closeTab: (page: Page) => page.close(),
      // Aside's snapshot also lets the page settle; two animation frames do that here.
      snapshot: async (page: Page) => {
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        return { tree: '', diff: '' };
      },
      fs,
      pwd: info.outputDir,
      console: { log: (...parts: unknown[]) => log.push(parts.join(' ')) },
    };
    const body = await fs.readFile(path.resolve(import.meta.dirname, '../scripts', script), 'utf8');
    // The scripts save screenshots under ./, which here is this test's output folder.
    const cwd = process.cwd();
    await fs.mkdir(info.outputDir, { recursive: true });
    process.chdir(info.outputDir);
    try {
      await new AsyncFunction(...Object.keys(globals), body)(...Object.values(globals));
    } finally {
      process.chdir(cwd);
      await info.attach('log', { body: log.join('\n'), contentType: 'text/plain' });
    }
  });
}

// Settings, Ask AI, "Ask before sending page data out" as the chat wires it (qa-ask.html: a scripted
// model lists the tabs, then tries to open a link that carries their titles).
test('ask before sending: the chat asks with the setting on, and does not with it off', async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (route) => route.abort());
  const opened = (p: Page) => p.evaluate(() => (window as unknown as { __SIDEGIG_LOG__: { type: string; url?: string }[] }).__SIDEGIG_LOG__.filter((e) => e.type === 'tabs.create').map((e) => e.url));
  const on = await context.newPage();
  await on.goto('http://127.0.0.1:8765/preview/qa-ask.html');
  const ask = on.locator('.cm-ask');
  await expect(ask).toContainText('Open https://collect.example/?t=');
  await ask.getByRole('button', { name: 'Don’t allow' }).click();
  // The run has ended when the reply's actions (Copy, Ask again) show.
  await expect(on.locator('.cm-bot .cm-actions')).toBeVisible();
  await expect(ask).toHaveCount(0);
  expect(await opened(on)).toEqual([]);
  const off = await context.newPage();
  await off.goto('http://127.0.0.1:8765/preview/qa-ask.html?ask=off');
  await expect(off.locator('.cm-bot .cm-actions')).toBeVisible();
  await expect(off.locator('.cm-ask')).toHaveCount(0);
  expect((await opened(off)).map((u) => new URL(u!).hostname)).toEqual(['collect.example']);
});
