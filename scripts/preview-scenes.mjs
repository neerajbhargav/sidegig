import {readFile,writeFile} from 'node:fs/promises';
export async function configureScenes(dir) {
const html=await readFile(dir+'/newtab.html','utf8');
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#a3c7be"/><stop offset="1" stop-color="#203e4d"/></linearGradient></defs><path fill="url(#g)" d="M0 0h1920v1080H0z"/><path fill="#44756c" d="M0 780 380 330l430 380 280-470 830 600v240H0z"/><path fill="#1d4244" d="M0 940 600 610l480 320 420-470 420 420v200H0z"/></svg>';
const items=[['read','Designing calmer software','A practical look at small decisions that make an interface easier to use.'],['watch','How mechanical clocks keep time','A short explanation of gears, balance wheels and escapements.'],['book','The architecture of everyday things','Notes on the objects that shape how we work.'],['paper','A new approach to useful agents','Research into tools, feedback and reliable interaction.'],['read','Building a better reading habit','A small collection of ideas worth keeping.'],['podcast','A conversation about good tools','Why some tools stay useful for decades.']].map(([kind,title,summary],i)=>({id:'fixture-'+i,kind,title,summary,source:'Fixture journal',url:'https://example.com/story-'+i,topic:'Design and useful tools',published:Date.now()-i*3600000,by:'Field notes',why:'Matches your interest in useful tools.'}));
const base={persist:false,sync:{settings:{version:10,theme:{mode:'light'},newtab:{widgets:{feed:true,weather:false},look:'auto'},edition:{enabled:true,onDeviceAi:false}}},local:{ntChoiceMade:true,browserAi:{aside:true,at:Date.now()},ntNotes:[{id:'note1',text:'Keep the useful things close.',color:0}],ntTodos:[{id:'t1',text:'Read a saved article',done:false,pinned:false,created:1}],edProfile:{interests:[{term:'Design and useful tools',weight:3,from:'you',updated:Date.now()}],avoid:[],about:''},edSaved:[{...items[0],savedAt:Date.now()}],edition:{id:'fixture-edition',built:Date.now(),no:4,counted:true,refined:true,items,reserve:[],terms:['design'],errors:[]}},tabs:[{id:11,windowId:1,title:'Project notes',url:'https://example.com/project',active:true,lastAccessed:Date.now()},{id:12,windowId:1,title:'Reading list',url:'https://example.com/reading'}],bookmarks:[{id:'0',title:'',children:[{id:'1',title:'Bookmarks bar',children:[{id:'2',title:'GitHub',url:'https://github.com/'},{id:'3',title:'Docs',url:'https://docs.google.com/'},{id:'4',title:'Design',children:[{id:'5',title:'Reference',url:'https://example.com/reference'}]}]}]}]};
for(const name of ['wallpaper','edition','tools','desk','full']){
 const fx=structuredClone(base);
 // desk: every widget over a wallpaper, for design-system review. full: the same on a grid saved full
 // before three widgets were added (the re-pack case), so to-do and notes sit at medium size.
 if(name==='wallpaper'||name==='desk'||name==='full'){fx.sync.settings.newtab.background={kind:'upload',ref:'fixture-wall',treatment:'photo',dim:0,blur:0};fx.local.ntUploads=[{id:'fixture-wall',url:'data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64'),name:'Fixture landscape',created:1}];}
 if(name==='tools'||name==='desk'||name==='full')Object.assign(fx.sync.settings.newtab.widgets,{reading:true,tabs:true,calculator:true});
 if(name==='desk'||name==='full')Object.assign(fx.sync.settings.newtab.widgets,{feed:false,weather:true});
 if(name==='full'){Object.assign(fx.sync.settings.newtab.widgets,{reading:true,tabs:true,calculator:true});fx.sync.settings.newtab.layout={bookmarks:{x:4,y:2,w:8,h:2},calendar:{x:0,y:4,w:4,h:4},clock:{x:0,y:0,w:4,h:2},notes:{x:4,y:6,w:4,h:2},pomodoro:{x:4,y:4,w:4,h:2},search:{x:4,y:0,w:8,h:2},todo:{x:8,y:4,w:4,h:4},weather:{x:0,y:2,w:4,h:2}};}
 const script=`<script>window.__SIDEGIG_FIXTURES__=${JSON.stringify(fx)};window.__SIDEGIG_FIXTURES__.sync.settings.theme.scale=Number(new URLSearchParams(location.search).get('scale'))||100;window.__SIDEGIG_FIXTURES__.sync.settings.newtab.look=new URLSearchParams(location.search).get('look')||'auto';localStorage.setItem('sidegig.ntMode','home');sessionStorage.setItem('sidegig.page','${name==='edition'?'edition':'desk'}');sessionStorage.removeItem('sidegig.edTab');</script>`;
 await writeFile(dir+'/qa-'+name+'.html',html.replace('<script src="shim.js',script+'<script src="shim.js'));
}
  const panel = structuredClone(base);
  panel.sidePanelSide = 'right';
  panel.sync.settings.rail = { side: 'left' };
  panel.sync.settings.apps = [{ id: 'fixture-app', name: 'Reference', url: 'http://127.0.0.1:8765/preview/qa-destination.html', openIn: 'panel', mobile: false, badge: true }];
  panel.local.badges = { 'fixture-app': 123 };
  const panelHtml = await readFile(dir+'/panel.html', 'utf8');
  await writeFile(dir+'/qa-panel.html', panelHtml.replace('<script src="shim.js', `<script>window.__SIDEGIG_FIXTURES__=${JSON.stringify(panel)};</script><script src="shim.js`));
  const portable = structuredClone(base);
  portable.local.aiChats = [{ id: 'c1', title: 'A useful conversation', model: 'local:fixture', created: 1, updated: 2, messages: [{ role: 'user', content: 'Keep this question' }, { role: 'assistant', content: 'Keep this answer' }] }];
  portable.local.aiKeys = { openai: 'fixture-secret-never-export' };
  portable.sync.settings.newtab.enabled = true;
  const options = await readFile(dir+'/options.html', 'utf8');
  await writeFile(dir+'/qa-setups.html', options.replace('<script src="shim.js', `<script>window.__SIDEGIG_FIXTURES__=${JSON.stringify(portable)};</script><script src="shim.js`));
  const ai = structuredClone(base);
  ai.local.aiKeys = {};
  await writeFile(dir+'/qa-ai-setup.html', html.replace('<script src="shim.js', `<script>window.__SIDEGIG_FIXTURES__=${JSON.stringify(ai)};window.LanguageModel=undefined;sessionStorage.setItem('sidegig.page','desk');</script><script src="shim.js`));
  // Mail layer: a fresh sign-in code and a thread to summarize. ?model= points the local provider at a test server.
  const mail = structuredClone(panel);
  mail.sync.settings.status = { github: false, vercel: false, gmail: true, intervalMin: 5 };
  const now = Date.now();
  mail.local.status = [{ id: 'gmail', title: 'Gmail', value: '2', detail: 'unread emails', url: 'https://mail.google.com/mail/u/0/', signature: 'm1,m2', updatedAt: now, items: [
    { title: 'Your verification code', meta: 'Acme', url: 'https://mail.google.com/mail/u/0/#inbox', state: 'ok', code: '482913', at: now - 60000, mid: '1a15fd7317beb608', email: 'no-reply@acme.example' },
    { title: 'Plans for the launch', meta: 'Ada Lovelace', url: 'https://mail.google.com/mail/u/0/#inbox', state: 'ok', at: now - 3600000, mid: '1a15fd7317beb609', email: 'ada@example.com' },
  ] }];
  mail.mailThread = { subject: 'Plans for the launch', messages: [{ from: 'Ada Lovelace', email: 'ada@example.com', date: 'Tue, Oct 20, 2026 at 9:14 AM', text: 'Can we ship on Thursday? The build is ready.' }] };
  await writeFile(dir+'/qa-mail.html', panelHtml.replace('<script src="shim.js', `<script>window.__SIDEGIG_FIXTURES__=${JSON.stringify(mail)};const mq=new URLSearchParams(location.search).get('model');if(mq)window.__SIDEGIG_FIXTURES__.local.aiKeys={local:mq};</script><script src="shim.js`));
  const rail = { persist: false, sync: { settings: { version: 10, rail: { side: 'left' } } }, local: { badges: { gmail: 123, discord: 9, whatsapp: -1 }, browserAi: { aside: true, at: Date.now() } } };
  await writeFile(dir+'/qa-rail.html', `<!doctype html><meta charset="utf-8"><title>Rail fixtures</title><style>body{font:18px system-ui;background:#f3f4f6;padding:3rem}h1{font-size:24px}</style><h1>A page beside sidegig</h1><p>Fixture page. Badges and sidebar visibility use the real content script.</p><script>window.__SIDEGIG_FIXTURES__=${JSON.stringify(rail)};const q=new URLSearchParams(location.search);Object.assign(window.__SIDEGIG_FIXTURES__.sync.settings,{theme:{scale:Number(q.get('scale'))||100}});window.__SIDEGIG_FIXTURES__.sync.settings.rail.size=q.get('size')||'comfortable';</script><script src="shim.js"></script><script src="rail.js"></script>`);
}
