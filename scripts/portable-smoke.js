// Run with `npm run e2e` (e2e/preview.spec.ts) after `npm run preview`.
// It also runs unchanged in the Aside REPL, with dist/ served on 127.0.0.1:8765.
const base='http://127.0.0.1:8765/preview/';
const ok=(v,m)=>{if(!v)throw Error(m)};
const t=await openTab(base+'qa-setups.html#backup');
try {
 console.log((await snapshot(t,{interactive:true})).tree);
 await fs.mkdir('./refine-portable',{recursive:true});
 await t.locator('[aria-label="Setup name"]').fill('Portable fixture');
 await t.locator('.setup-check').filter({hasText:'Include chat history'}).locator('input').check();
 await t.locator('.setup-save button').click();await snapshot(t,{interactive:true});
 await t.screenshot({path:'./refine-portable/setup-backup.png'});
 const bundle=await t.evaluate(async()=>{const a=(await chrome.storage.local.get('setups')).setups;return a[0].bundle});
 ok(bundle.parts.includes('notes')&&bundle.parts.includes('chats')&&bundle.local.ntNotes.length===1&&bundle.local.aiChats.length===1&&!JSON.stringify(bundle).includes('fixture-secret-never-export'),'Portable setup omitted data or included credentials');
 await t.evaluate(()=>chrome.storage.local.set({ntNotes:[],aiChats:[]}));
 await t.locator('.setup-row button').filter({hasText:'Apply'}).first().click();await snapshot(t,{interactive:true});
 await t.evaluate(()=>localStorage.setItem('sidegig.ntOff','1'));
 await t.locator('.setup-apply .btn.primary').click();await snapshot(t,{interactive:true});
 ok(await t.evaluate(async()=>{const x=await chrome.storage.local.get(['ntNotes','aiChats']);return x.ntNotes.length===1&&x.aiChats.length===1&&localStorage.getItem('sidegig.ntOff')===null}),'Restore lost notes/chats or kept the disabled-new-tab cache');
 console.log('PORTABLE UI PASS: optional chat export, credential exclusion, notes/chats restore, new-tab cache');
 await t.goto(base+'qa-ai-setup.html');await snapshot(t,{interactive:true});
 await t.locator('.nt-ask [role="tab"]').filter({hasText:'Ask'}).click();await snapshot(t,{interactive:true});
 await t.locator('.ai-input').fill('Keep my draft while I connect a model');await t.locator('.ai-input').press('Enter');await snapshot(t,{interactive:true});
 ok(await t.evaluate(()=>document.querySelector('.cc-in')?.value==='Keep my draft while I connect a model'&&!document.querySelector('.cv-setup').hidden),'Missing model erased the question');
 console.log('DRAFT UI PASS: question survives missing-model setup');
}finally{await closeTab(t)}
