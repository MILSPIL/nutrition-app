// Actual built UI; isolated Firebase emulators and synthetic trainer transport only.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {browserRuntime} from './browser-runtime.mjs';
import {buildPlanCatalog} from '../src/services/planCatalog.js';
import {assignPlanItems} from '../src/services/planAllocation.js';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8088');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9099');
const {chromium}=await browserRuntime();
const build=resolve('tmp/coach-ui-build'),out=resolve('tmp/coach-ui-qa');mkdirSync(out,{recursive:true});
const evidence={syntheticOnly:true,realBuiltUI:true,mockedTrainerAPI:true,widths:[],checks:[],consoleErrors:[],iconRequests:[]};
const check=(name,ok)=>{assert.ok(ok,name);evidence.checks.push(name);};
let state={conversationId:'synthetic-coach',revision:0,composer:{text:'',revision:0},messages:[],drafts:[],contextProposals:[],currentTurn:null};
let calls=0,sttCalls=0,lastInput=null,iconBodies=0;
const catalog=buildPlanCatalog({profile:{}}),ref=catalog.references.find(r=>r.name==='фрукти та ягоди');
const item={itemId:'synthetic-fruit',name:'Синтетичний плід',quantity:{value:200,unit:'g'},nutritionBasis:{value:100,unit:'g'},nutrients:{p:1,f:2,c:3,cal:60},source:{kind:'estimate',estimateReason:'no_matching_source',portionOrigin:{kind:'estimate',assumption:'Припускаємо середній розмір, приблизно 200 г.'}},estimated:true,nutritionStatus:'complete',planMatch:{referenceId:ref.refId,consumedState:'as_sold',certainty:'matched'}};
const [oldItem]=assignPlanItems([{...item,itemId:'earlier-fruit'}],catalog,{});
const targetDate='2026-01-02',freshness={targetDate,dayRevision:7,planFingerprint:catalog.fingerprint,notesRevision:'none'};
const day={targetDate,meals:{1:{з:[oldItem]}},notes:[],revision:7,freshness};
const server=createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1');
 if(u.pathname.startsWith('/meal-api/')) {
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  const chunks=[];for await(const c of req)chunks.push(c);
  const body=chunks.length?JSON.parse(Buffer.concat(chunks)):{};
  const path=u.pathname.replace('/meal-api/trainer','');
  let result;
  if(path==='/state')result=state;
  else if(path==='/composer'){state.composer={text:body.text,revision:body.baseRevision+1};result=state.composer;}
  else if(path==='/turns'){
   calls++;lastInput=body;state.revision++;state.composer={text:'',revision:state.composer.revision+1};
   state.messages.push({id:body.turnId+'-u',role:'user',content:body.text},{id:body.turnId+'-a',role:'assistant',content:body.text.includes('вчора')?'Підготував їжу за вказаний попередній день.':'Синтетична порада. До щоденника нічого не додав.'});
   if(body.text.includes('вчора'))state.drafts=[{draftId:'synthetic-draft',revision:1,state:'ready',targetDate,meal:1,items:[item],freshness}];
   result={turnId:body.turnId,state:'completed'};
  }
  else if(path.startsWith('/days/'))result=day;
  else if(path.endsWith('/refresh')){state.drafts[0].revision++;state.drafts[0].freshness=day.freshness;result=state.drafts[0];}
  else throw Error('unexpected_synthetic_route');
  return res.end(JSON.stringify(result));
 }
 let file=join(build,u.pathname==='/'?'index.html':u.pathname);if(!file.startsWith(build+'/'))throw Error('path');
 let bytes;try{bytes=readFileSync(file);}catch{file=join(build,'index.html');bytes=readFileSync(file);}
 const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'}[extname(file)]||'application/octet-stream';res.setHeader('Content-Type',type);
 if(u.pathname.startsWith('/static/'))res.setHeader('Cache-Control','public,max-age=31536000,immutable');else res.setHeader('Cache-Control','no-store');
 if(extname(file)==='.webp'){iconBodies++;evidence.iconRequests.push({url:u.pathname,bytes:bytes.length});}
 res.end(bytes);
 }catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
await new Promise(ok=>server.listen(4189,'127.0.0.1',ok));
let browser,context,page;
try {
 browser=await chromium.launch({executablePath:process.env.AGENT_TEST_CHROME_EXECUTABLE,headless:true});
 context=await browser.newContext({viewport:{width:390,height:844},locale:'uk-UA',timezoneId:'America/New_York'});page=await context.newPage();page.setDefaultTimeout(20000);
 page.on('pageerror',e=>evidence.consoleErrors.push(e.message));
 await context.route('**/*',r=>['127.0.0.1','localhost','fonts.googleapis.com','fonts.gstatic.com'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 await page.clock.setFixedTime('2026-10-24T21:10:00Z');
 await page.goto('http://127.0.0.1:4189/');await page.getByRole('button',{name:'Увійти через Google'}).click();
 await page.getByRole('button',{name:'Почати!',exact:true}).click();await page.getByRole('button',{name:'Почати!',exact:true}).waitFor({state:'hidden'});
 await page.locator('.fixed.z-50').filter({has:page.getByRole('heading',{name:'Налаштування',exact:true})}).locator('button:has(svg.lucide-x)').first().click();
 await page.locator('[data-modal-surface]').waitFor({state:'hidden'});
 check('login opens Kyiv today across browser timezone',await page.getByLabel('Дата записів',{exact:true}).inputValue()==='2026-10-25'&&await page.getByRole('button',{name:'Сьогодні',exact:true}).getAttribute('aria-pressed')==='true');
 const launcher=page.getByRole('button',{name:'Відкрити тренера',exact:true});await launcher.waitFor();
 for(const width of [375,390,1366]){
  await page.setViewportSize({width,height:width===1366?900:844});await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));
  await launcher.waitFor();
  const home=await page.evaluate(()=>{const r=document.querySelector('.trainer-launcher').getBoundingClientRect();const report=[...document.querySelectorAll('button')].find(x=>x.textContent==='Переглянути звіт').getBoundingClientRect();const columnWidth=Math.min(innerWidth,512);return {width:innerWidth,height:r.height,right:innerWidth-r.right-(innerWidth-columnWidth)/2,bottom:innerHeight-r.bottom,reportGap:r.top-report.bottom,overflow:document.documentElement.scrollWidth-innerWidth};});
  check('launcher '+width,home.height===56&&home.right===16&&home.bottom===16&&home.reportGap>=16&&home.overflow===0);
  await page.screenshot({path:join(out,`launcher-${width}.png`)});
  await launcher.click();await page.locator('#trainer-message:not(:disabled)').waitFor();await page.getByRole('button',{name:'Що краще поїсти?',exact:true}).waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('.trainer-shortcuts button')].some(b=>b.textContent==='Що краще поїсти?'&&!b.disabled));
  check('no automatic input '+width,calls===0&&sttCalls===0&&await page.getByRole('button',{name:'Закрити чат'}).evaluate(n=>document.activeElement===n));
  const chat=await page.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect(),c=r('.trainer-chat'),h=r('#trainer-title'),i=r('.trainer-intro'),t=r('#trainer-message');return{left:h.left-c.left,right:c.right-t.right,edges:Math.abs(h.left-t.left)+Math.abs(i.left-t.left),overflow:document.documentElement.scrollWidth-innerWidth,width:c.width,heights:[...document.querySelectorAll('.trainer-chat button,.trainer-chat summary,.trainer-chat input')].filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect().height)};});
  check('chat edges '+width,chat.left===16&&chat.right===16&&chat.edges===0&&chat.overflow===0&&chat.width<=512&&chat.heights.every(h=>h>=44));
  evidence.widths.push({home,chat});await page.screenshot({path:join(out,`chat-${width}.png`)});
  await page.getByRole('button',{name:'Записати їжу',exact:true}).click();check('food shortcut no call '+width,calls===0&&await page.locator('#trainer-message').evaluate(n=>document.activeElement===n));
  await page.getByRole('button',{name:'Закрити чат',exact:true}).click();await launcher.waitFor();await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Відкрити тренера');
 }
 await page.setViewportSize({width:390,height:844});await launcher.click();await page.locator('#trainer-message:not(:disabled)').waitFor();await page.getByRole('button',{name:'Що краще поїсти?',exact:true}).waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('.trainer-shortcuts button')].some(b=>b.textContent==='Що краще поїсти?'&&!b.disabled));
 await page.getByRole('button',{name:'Що краще поїсти?',exact:true}).click();await page.getByText('Синтетична порада. До щоденника нічого не додав.',{exact:true}).waitFor();
 check('one advice no draft',calls===1&&state.drafts.length===0&&lastInput.dateContext.mode==='default'&&!('targetDate'in lastInput));
 await page.locator('#trainer-message').fill('Вчора я з’їв плід'.toLowerCase());await page.getByRole('button',{name:'Надіслати повідомлення'}).click();
 await page.locator('[data-testid="trainer-draft"]').waitFor();await page.getByRole('button',{name:'Додати',exact:true}).waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('.trainer-draft button')].some(b=>b.textContent==='Додати'&&!b.disabled));
 check('historical preview reads actual day',await page.locator('.trainer-draft').textContent().then(t=>t.includes('02.01.2026')&&t.includes('За день: 50% → 100%')&&t.includes('приблизно 200 г')));
 await page.screenshot({path:join(out,'historical-preview-390.png')});
 await page.getByRole('button',{name:'Закрити чат'}).click();
 const icons=await page.locator('img[src*="category-"]').evaluateAll(nodes=>nodes.map(n=>({src:n.src,naturalWidth:n.naturalWidth,box:n.getBoundingClientRect().width})));
 check('versioned icons exact visual box',icons.length>=3&&icons.every(x=>x.src.includes('/static/media/')&&x.src.endsWith('.webp')&&x.naturalWidth===192&&x.box<=44));
 evidence.icons=icons;
 await page.getByRole('button',{name:'Вчора',exact:true}).click();
 await launcher.click();await page.locator('#trainer-message:not(:disabled)').waitFor();
 await page.locator('#trainer-message').fill('Порадь їжу для обраного дня');
 await Promise.all([
  page.waitForResponse(r=>r.url().endsWith('/trainer/turns')&&r.request().method()==='POST'),
  page.getByRole('button',{name:'Надіслати повідомлення',exact:true}).click(),
 ]);
 await page.waitForFunction(()=>document.querySelector('#trainer-message')?.disabled===false);
 check('explicit diary choice pins coach date',lastInput.dateContext.mode==='pinned'&&lastInput.dateContext.targetDate==='2026-10-24');
 await page.getByRole('button',{name:'Закрити чат',exact:true}).click();
 await context.unroute('**/*');
 await page.reload();await page.locator('img[src*="category-"]').first().waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('img[src*="category-"]')].every(n=>n.complete&&n.naturalWidth));
 check('profile reload resets to Kyiv today',await page.getByLabel('Дата записів',{exact:true}).inputValue()==='2026-10-25');
 await launcher.click();await page.locator('#trainer-message:not(:disabled)').waitFor();
 await page.locator('#trainer-message').fill('Порадь їжу на сьогодні');
 await Promise.all([
  page.waitForResponse(r=>r.url().endsWith('/trainer/turns')&&r.request().method()==='POST'),
  page.getByRole('button',{name:'Надіслати повідомлення',exact:true}).click(),
 ]);
 await page.waitForFunction(()=>document.querySelector('#trainer-message')?.disabled===false);
 check('profile reload clears explicit coach date',lastInput.dateContext.mode==='default');
 await page.getByRole('button',{name:'Закрити чат',exact:true}).click();
 const warmBodies=iconBodies;await page.reload();await page.locator('img[src*="category-"]').first().waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('img[src*="category-"]')].every(n=>n.complete&&n.naturalWidth));
 check('repeat icons served from browser cache',iconBodies===warmBodies);
 evidence.iconCache={warmBodies,repeatBodies:iconBodies};
 check('no page errors',evidence.consoleErrors.length===0);
 evidence.status='passed';
}finally{
 writeFileSync(join(out,'evidence.json'),JSON.stringify(evidence,null,2));
 await context?.close();await browser?.close();await new Promise(ok=>server.close(ok));
}
console.log(JSON.stringify({status:evidence.status,checks:evidence.checks.length,widths:evidence.widths,iconBodies}));
