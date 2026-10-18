// Run after npm run preview, with dist/ served on 127.0.0.1:8765.
// aside repl "$(cat scripts/refinement-smoke.js)"
// Uses synthetic fixture data. No installed extension or external model requests.
const base = 'http://127.0.0.1:8765/preview/';
const ensure = (v, why) => { if (!v) throw Error(why); };
await fs.mkdir('./refine-flows', {recursive:true});
const t = await openTab(base+'qa-wallpaper.html');
try {
 await snapshot(t,{interactive:true});
 console.log('CHECK widget expansion');
 for (const id of ['clock','calendar','pomodoro','todo','notes','bookmarks']) {
  await t.locator('.gw[data-w="'+id+'"]').press('Enter');
  await snapshot(t,{interactive:true});
  ensure(await t.evaluate(id=>{const e=document.querySelector('.gw.is-open');const r=e?.getBoundingClientRect();return e?.dataset.w===id&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight},id),'Widget did not open within screen: '+id);
  await t.locator('[aria-label="Close '+({clock:'Clock',calendar:'Calendar',pomodoro:'Pomodoro',todo:'To-do',notes:'Notes',bookmarks:'Bookmarks'}[id])+'"]').click();
  await snapshot(t,{interactive:true});
  ensure(await t.evaluate(()=>!document.querySelector('.gw.is-open')),'Close reopened the widget');
 }
 await t.locator('.gw[data-w="clock"] .nt-date').click();await snapshot(t,{interactive:true});
 ensure(await t.evaluate(()=>document.querySelector('.gw.is-open')?.dataset.w==='clock'),'Surface click did not expand');
 await t.locator('.gw.is-open').press('Escape');await snapshot(t,{interactive:true});
 console.log('CHECK bookmarks');
 await t.locator('[title="Add a site or a folder here"]').click();await snapshot(t,{interactive:true});
 ensure(await t.evaluate(()=>{const e=document.querySelector('.shelf-add');const r=e.getBoundingClientRect();return !e.hidden&&r.top>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.x+10,r.y+10)?.closest('.shelf-add')===e}),'Bookmark form is clipped or covered');
 await t.screenshot({path:'./refine-flows/bookmark-form.png',fullPage:true});
 await t.locator('.shelf-add [aria-label="Name"]').fill('A useful reference');await t.locator('.shelf-add [aria-label="Address"]').fill('javascript:alert(1)');await t.locator('.shelf-add [type="submit"]').click();await snapshot(t,{interactive:true});
 ensure(await t.evaluate(()=>!!document.querySelector('.shelf-error').textContent&&!document.querySelector('.shelf-add').hidden),'Invalid bookmark was not retained with an error');
 await t.locator('.shelf-add [aria-label="Address"]').fill('example.com/reference');await t.locator('.shelf-add [type="submit"]').click();await snapshot(t,{interactive:true});
 ensure(await t.evaluate(async()=>JSON.stringify(await chrome.bookmarks.getTree()).includes('A useful reference')),'Bookmark save failed');
 await t.locator('[aria-label="Close Bookmarks"]').click();await snapshot(t,{interactive:true});
 console.log('CHECK For you');
 await t.locator('.nt-pages [data-v="edition"]').click();await snapshot(t,{interactive:true});
 ensure(await t.evaluate(()=>document.querySelector('.nt-dash').hidden&&!document.querySelector('.nt-feed').hidden&&document.querySelector('.ed-head').getBoundingClientRect().top<200),'For you still sits below the desk');
 await t.locator('.ed-kind-nav button').filter({hasText:'Watch'}).click();await snapshot(t,{interactive:true});
 ensure(await t.evaluate(()=>document.querySelectorAll('.ed-front .ed-card').length===1&&document.querySelector('.ed-front .ed-card').dataset.kind==='watch'),'For you category filter failed');
 await t.locator('.ed-front [aria-label="Save for later"]').click();await snapshot(t,{interactive:true});
 ensure(await t.evaluate(async()=>(await chrome.storage.local.get('edSaved')).edSaved.length===2),'Save for later did not persist');
 ensure(await t.evaluate(async()=>{for(let i=0;i<100;i++){if([...document.querySelectorAll('.ed-tools button')].some(e=>e.textContent==='Saved 2'))return true;await new Promise(r=>setTimeout(r,20))}return false}),'Saved count did not refresh');
 await t.locator('.ed-tools button').filter({hasText:'Saved'}).click();await snapshot(t,{interactive:true});
 ensure(await t.evaluate(()=>document.querySelectorAll('.ed-row').length===2),'Saved view did not show both items');
 await t.locator('.ed-tools button').filter({hasText:'Interests'}).click();await snapshot(t,{interactive:true});
 ensure(await t.evaluate(()=>document.querySelector('.ed-name')?.textContent==='Interests'&&!!document.querySelector('.ed-iterm')),'Interests view is unreachable');
 console.log('CHECK new tools');
 await t.goto(base+'qa-tools.html');await snapshot(t,{interactive:true});
 await t.locator('[aria-label="Open Calculator"]').click();await snapshot(t,{interactive:true});
 await t.locator('[aria-label="Calculation"]').fill('(24 + 18) / 3');await t.locator('[aria-label="Calculation"]').press('Enter');await snapshot(t,{interactive:true});
 ensure(await t.evaluate(()=>document.querySelector('.calc-result').textContent==='14'),'Calculator arithmetic failed');
 await t.locator('[aria-label="Close Calculator"]').click();await snapshot(t,{interactive:true});
 await t.locator('[aria-label="Expand Open tabs"]').click();await snapshot(t,{interactive:true});
 await t.locator('.gw[data-w="tabs"] [aria-label="Close Reading list"]').click();await snapshot(t,{interactive:true});
 ensure(await t.evaluate(()=>document.querySelectorAll('.extra-tab').length===1),'Close tab did not update Open tabs');
 await t.locator('[aria-label="Close Open tabs"]').click();await snapshot(t,{interactive:true});
 await t.locator('[aria-label="Open Reading list"]').click();await snapshot(t,{interactive:true});
 await t.locator('.gw[data-w="reading"] button').filter({hasText:'Open reading list'}).click();await snapshot(t,{interactive:true});
 ensure(await t.evaluate(()=>document.querySelector('.nt-dash').hidden&&!!document.querySelector('.ed-saved')&&!document.querySelector('.gw.is-open')),'Reading list did not close its widget and open Saved');
 console.log('CHECK rail');
 let railPage, railTab;
 try {
 for(const size of ['comfortable','compact'])for(const scale of [80,100,140]){
  if(railTab)await closeTab(railTab);
  railTab=await openTab(base+'qa-viewport.html?w=900&h=800&page='+encodeURIComponent('qa-rail.html?size='+size+'&scale='+scale));await snapshot(railTab,{interactive:true});
  railPage=railTab.frames().find(f=>f.url().includes('/qa-rail.html'));
  const r=await railPage.evaluate(async()=>{for(let i=0;i<100&&!document.querySelector('sidegig-rail')?.shadowRoot?.querySelector('.item.app');i++)await new Promise(r=>setTimeout(r,20));const host=document.querySelector('sidegig-rail');const root=host.shadowRoot;for(let i=0;i<100&&!root.querySelector('.badge:not([hidden])');i++)await new Promise(r=>setTimeout(r,20));await document.fonts.ready;return [...root.querySelectorAll('.badge:not([hidden])')].map(e=>{const r=e.getBoundingClientRect(),clip=e.closest('.scroll').getBoundingClientRect();return{text:e.textContent,w:r.width,sw:e.scrollWidth,h:r.height,sh:e.scrollHeight,fits:r.left>=clip.left&&r.right<=clip.right&&r.top>=clip.top&&r.bottom<=clip.bottom}})});
  console.log('BADGES',size,scale,JSON.stringify(r));ensure(r.some(x=>x.text==='99+')&&r.every(x=>x.fits&&x.sw<=x.w+1&&x.sh<=x.h+1),'Badge clipping at '+size+'/'+scale);
 }
 await railTab.evaluate(()=>document.querySelector('#subject').contentWindow.chrome.storage.local.set({panelOpen:{'1':{side:'right',ts:Date.now()}}}));await snapshot(railTab,{interactive:true});
 ensure(await railPage.evaluate(async()=>{for(let i=0;i<100;i++){if(document.querySelector('sidegig-rail').style.display==='none')return true;await new Promise(r=>setTimeout(r,20))}return false}),'Opposite-side native panel leaves a duplicate page rail');
 await railTab.evaluate(()=>document.querySelector('#subject').contentWindow.chrome.storage.local.set({panelOpen:{}}));await snapshot(railTab,{interactive:true});
 ensure(await railPage.evaluate(async()=>{for(let i=0;i<100;i++){if(document.querySelector('sidegig-rail').style.display!=='none')return true;await new Promise(r=>setTimeout(r,20))}return false}),'Page rail did not return after panel closed');
 await railTab.screenshot({path:'./refine-flows/rail-badges.png',fullPage:true});
 } finally { if(railTab)await closeTab(railTab); }
 console.log('REFINEMENT SMOKE PASS: expand, controls, bookmark validation/save, For you navigation/filter/save, calculator, tabs, reading list, badge bounds, single rail');
 console.log('ARTIFACTS',pwd);
} finally { await closeTab(t); }
