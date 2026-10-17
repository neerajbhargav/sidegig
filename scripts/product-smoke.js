// Run after `npm run preview` and serve dist/ on 127.0.0.1:8765:
//   aside repl "$(cat scripts/product-smoke.js)"
// This changes only the local preview's fixture data. It never opens the installed extension.
const base = 'http://127.0.0.1:8765/preview/';
const ensure = (value, message) => { if (!value) throw new Error(message); };
const tab = await openTab(base);
try {
  console.log((await snapshot(tab, { interactive: true })).tree);
  await tab.locator('#reset').click();
  await snapshot(tab, { interactive: true });
  await tab.goto(base + 'options.html#welcome');
  console.log((await snapshot(tab, { interactive: true })).tree);
  await tab.locator('.welcome-row button').filter({ hasText: 'Right' }).click();
  await snapshot(tab, { interactive: true });
  await tab.locator('.welcome-app').filter({ hasText: 'Spotify' }).click();
  await snapshot(tab, { interactive: true });
  await tab.locator('.welcome-start').click();
  console.log((await snapshot(tab, { interactive: true })).tree);
  const setup = await tab.evaluate(async () => {
    const s = (await chrome.storage.sync.get('settings')).settings;
    return { right: s.rail.side === 'right', app: s.apps.some((a) => a.id === 'spotify'), choice: (await chrome.storage.local.get('ntChoiceMade')).ntChoiceMade };
  });
  ensure(setup.right && setup.app && setup.choice, 'First-use choices were not saved');
  await tab.locator('button[aria-label="New note"]:not(.fig)').click();
  await snapshot(tab, { interactive: true });
  ensure(await tab.evaluate(() => document.querySelector('.note-t').getBoundingClientRect().height > 0 && document.activeElement.matches('.note-t')), 'New note did not open a visible editor');
  await tab.locator('.note-t').fill('A note worth keeping');
  ensure(await tab.evaluate(async () => (await chrome.storage.local.get('ntNotes')).ntNotes[0].text === 'A note worth keeping'), 'Note was not saved during input');
  ensure(await tab.evaluate(async () => {
    const editor = document.querySelector('.note-t');
    for (const text of ['A note worth keepin', 'A note worth keep', 'A note worth keeping']) {
      editor.value = text;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await new Promise((r) => setTimeout(r, 100));
    return document.activeElement === editor && editor.value === 'A note worth keeping';
  }), 'Rapid note input lost its editor or focus');
  await tab.locator('[aria-label="Close Notes"]').click();
  await snapshot(tab, { interactive: true });
  await tab.reload();
  await snapshot(tab, { interactive: true });
  ensure(await tab.evaluate(async () => {
    for (let i = 0; i < 100 && !document.querySelector('.note-t'); i++) await new Promise((r) => setTimeout(r, 30));
    return document.querySelector('.note-t')?.value === 'A note worth keeping';
  }), 'Note did not survive reload');
  const other = await openTab(base + 'newtab.html');
  try {
    await snapshot(other, { interactive: true });
    await tab.locator('button[aria-label="New note"]:not(.fig)').click();
    await snapshot(tab, { interactive: true });
    await tab.locator('.note-t').first().fill('Shared across new tabs');
    ensure(await other.evaluate(async () => {
      for (let i = 0; i < 100; i++) {
        if (document.querySelector('.note-t')?.value === 'Shared across new tabs') return true;
        await new Promise((r) => setTimeout(r, 20));
      }
      return false;
    }), 'Other open new tab did not update its notes');
  } finally { await closeTab(other); }
  await tab.locator('[aria-label="Close Notes"]').click();
  await snapshot(tab, { interactive: true });
  await tab.locator('.todo-input').fill('Finish the first product pass');
  await snapshot(tab, { interactive: true });
  await tab.locator('.todo-input').press('Enter');
  await snapshot(tab, { interactive: true });
  await tab.locator('.todo-check').click();
  console.log((await snapshot(tab, { interactive: true, selector: '.gw[data-w="todo"]' })).tree);
  ensure(await tab.evaluate(async () => (await chrome.storage.local.get('ntTodos')).ntTodos[0].done), 'Task completion was not saved');
  await tab.locator('[aria-label="Close To-do"]').click();
  await snapshot(tab, { interactive: true });
  ensure(await tab.evaluate(() => !document.querySelector('.gw.is-open')), 'Close reopens the widget');
  await tab.goto(base + 'options.html#appearance');
  await snapshot(tab, { interactive: true });
  await tab.locator('[aria-label="Search settings"]').fill('MCP');
  await snapshot(tab, { interactive: true });
  ensure(await tab.evaluate(() => !document.querySelector('#ai').hidden && document.querySelector('#appearance').hidden), 'Settings search cannot find MCP controls');
  await tab.locator('[aria-label="Search settings"]').fill('');
  await tab.locator('nav a[data-id="rail"]').click();
  await snapshot(tab, { interactive: true });
  ensure(await tab.evaluate(() => [...document.querySelectorAll('.opt-sec')].filter((s) => !s.hidden).map((s) => s.id).join() === 'rail'), 'Settings navigation shows the wrong section');
  await tab.goto(base + 'qa-offline.html');
  await snapshot(tab, { interactive: true });
  ensure(await tab.evaluate(() => !!document.querySelector('.nt-grid') && typeof window.releaseOffline === 'function' && document.querySelector('.cc-pick')?.textContent.includes('Loading')), 'Model discovery blocks the new tab');
  await tab.evaluate(() => window.releaseOffline());
  await tab.goto(base + 'panel.html');
  await snapshot(tab, { interactive: true });
  await tab.locator('button[aria-label="Assistant"]').click();
  await snapshot(tab, { interactive: true });
  ensure(await tab.evaluate(() => !!document.querySelector('.cv-panel')), 'Sidebar assistant cannot be reached');
  await tab.goto(base + 'newtab.html');
  await snapshot(tab, { interactive: true });
  await tab.locator('[role="tab"]').filter({ hasText: 'Search' }).click();
  await snapshot(tab, { interactive: true });
  await tab.locator('.nt-input').fill(base + 'qa-destination.html');
  await snapshot(tab, { interactive: true });
  await tab.locator('.nt-input').press('Enter');
  console.log((await snapshot(tab, { interactive: true })).tree);
  ensure(tab.url().includes('qa-destination.html'), 'An explicit URL became a web search');
  console.log('PRODUCT SMOKE PASS: setup, notes, reload, multiple tabs, tasks, settings, offline startup, assistant, URL navigation');
} finally { await closeTab(tab); }
