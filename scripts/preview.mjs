// Developer-only pages. None of these files enter an extension package.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { configureScenes } from './preview-scenes.mjs';

export async function configurePreview(outdir) {
  for (const file of ['newtab.html', 'panel.html', 'drawer.html', 'options.html']) {
    const page = path.join(outdir, file);
    const html = await readFile(page, 'utf8');
    await writeFile(page, html.replace(/<script src="(ui|options)\.js"><\/script>/, '<script src="shim.js"></script>\n$&'));
  }
  await writeFile(path.join(outdir, 'index.html'), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>sidegig development preview</title>
<style>body{font:16px/1.6 system-ui;max-width:48rem;margin:4rem auto;padding:0 1.5rem}nav{display:flex;flex-wrap:wrap;gap:1rem}a{color:#0b57d0}button{font:inherit;padding:.5rem 1rem;margin-top:2rem}</style>
<h1>sidegig development preview</h1>
<p>The extension UI with local fixtures. Changes persist in this preview only. Browser integrations still need an installed extension.</p>
<nav><a href="options.html#welcome">First install</a><a href="newtab.html">New tab</a><a href="panel.html">Sidebar</a><a href="drawer.html">Drawer</a><a href="options.html">Settings</a></nav>
<button id="reset">Reset preview data</button><p role="status" id="status"></p>
<script src="preview-reset.js"></script></html>`);
  await writeFile(path.join(outdir, 'preview-reset.js'), `document.getElementById('reset').onclick=()=>{
  const prefix='sidegig.preview:'+location.pathname.slice(0,location.pathname.lastIndexOf('/'))+':';
  for(const k of Object.keys(localStorage))if(k.startsWith(prefix))localStorage.removeItem(k);
  for(const k of Object.keys(localStorage))if(k.startsWith('sidegig.nt'))localStorage.removeItem(k);
  document.getElementById('status').textContent='Preview reset. Open a preview to start fresh.';
};`);
  const html = await readFile(path.join(outdir, 'newtab.html'), 'utf8');
  const scene = {
    persist: false,
    sync: { settings: { version: 10, newtab: { widgets: { feed: false, weather: false } }, edition: { enabled: false } } },
    local: { ntChoiceMade: true, ntNotes: [{ id: 'fixture-note', text: 'A little room for a good idea.', color: 0 }], ntTodos: [{ id: 'fixture-task', text: 'Review saved articles', done: false, pinned: false, created: 1 }] },
    bookmarks: [{ id: '0', title: '', children: [{ id: '1', title: 'Bookmarks bar', children: [
      { id: '2', title: 'GitHub', url: 'https://github.com/' },
      { id: '3', title: 'Docs', url: 'https://docs.google.com/' },
      { id: '4', title: 'Notion', url: 'https://www.notion.so/' },
      { id: '5', title: 'Calendar', url: 'https://calendar.google.com/' },
    ] }] }],
  };
  await writeFile(path.join(outdir, 'qa-newtab.html'), html.replace('<script src="shim.js">', `<script>window.__SIDEGIG_FIXTURES__=${JSON.stringify(scene)};window.__SIDEGIG_FIXTURES__.sync.settings.newtab.look=new URLSearchParams(location.search).get('look')||'auto';</script><script src="shim.js">`));
  const fixture = { persist: false, sync: { settings: { version: 10, newtab: { widgets: { feed: false, weather: false } }, edition: { enabled: false } } }, local: { ntChoiceMade: true, aiKeys: { local: 'http://fixture.invalid' } } };
  const offline = `<script>
window.__SIDEGIG_FIXTURES__=${JSON.stringify(fixture)};
window.LanguageModel=undefined;
const realFetch=window.fetch;
window.fetch=(url,init)=>String(url).includes('fixture.invalid')?new Promise((resolve,reject)=>{
  window.releaseOffline=()=>reject(new Error('Fixture offline'));
  init?.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
}):realFetch(url,init);
</script>`;
  await writeFile(path.join(outdir, 'qa-offline.html'), html.replace('<script src="shim.js">', offline + '<script src="shim.js">'));
  await writeFile(path.join(outdir, 'qa-viewport.html'), `<!doctype html><meta charset="utf-8"><title>sidegig size check</title>
<style>html,body{margin:0;background:#ddd}iframe{border:0;display:block}</style><iframe id="subject"></iframe>
<script>const q=new URLSearchParams(location.search),f=document.getElementById('subject');f.width=q.get('w')||1280;f.height=q.get('h')||720;f.src=q.get('page')||'newtab.html';</script>`);
  await writeFile(path.join(outdir, 'qa-destination.html'), '<!doctype html><title>Address opened directly</title><h1>Address opened directly</h1>');
  await configureScenes(outdir);
  // Rebuilds can happen within one HTTP Last-Modified second. Keep preview QA
  // on the current bundle instead of a previously cached script or stylesheet.
  const revision = Date.now();
  for (const file of (await readdir(outdir)).filter((file) => file.endsWith('.html'))) {
    const page = path.join(outdir, file);
    await writeFile(page, (await readFile(page, 'utf8')).replace(/(src|href)="((?:ui|options|shim|nt-boot|rail)\.js|ui\.css)"/g, `$1="$2?v=${revision}"`));
  }
}
