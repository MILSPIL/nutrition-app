import { dismissIndependentMeasurementReminder } from './tracker-browser-fixture.mjs';
// Actual built UI; isolated Firebase emulators and synthetic trainer transport only.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {browserRuntime} from './browser-runtime.mjs';
import {buildPlanCatalog} from '../src/services/planCatalog.js';
import {assignPlanItems} from '../src/services/planAllocation.js';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8088');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9099');
const {chromium}=await browserRuntime();
const textAudit=readFileSync(new URL('./qa/check-text.browser.js',import.meta.url),'utf8');
const build=resolve('tmp/coach-ui-build'),out=resolve('tmp/coach-ui-qa');mkdirSync(out,{recursive:true});
const evidence={syntheticOnly:true,realBuiltUI:true,mockedTrainerAPI:true,widths:[],checks:[],consoleErrors:[],iconRequests:[],textAudits:[]};
const check=(name,ok)=>{assert.ok(ok,name);evidence.checks.push(name);};
let state={conversationId:'synthetic-coach',revision:0,composer:{text:'',revision:0},messages:[],drafts:[],contextProposals:[],currentTurn:null};
let calls=0,sttCalls=0,lastInput=null,iconBodies=0,photoDeleted=false,photoReads=0,photoDeletes=0;
const photoFixture={type:'image/webp',data:readFileSync(join(build,'static/media',readdirSync(join(build,'static/media')).find(name=>name.startsWith('category-')&&name.endsWith('.webp')))).toString('base64')};
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
  if(path.startsWith('/photos/')){
   if(req.method==='POST'){assert.deepEqual(body,{action:'delete'});photoDeleted=true;photoDeletes++;result={deleted:true};}
   else if(photoDeleted){res.statusCode=404;result={error:'media_missing'};}
   else {photoReads++;result=photoFixture;}
  }
  else if(path==='/state')result=state;
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
 context=await browser.newContext({viewport:{width:390,height:844},locale:'uk-UA',timezoneId:'America/New_York'});await dismissIndependentMeasurementReminder(context);page=await context.newPage();page.setDefaultTimeout(20000);
 page.on('pageerror',e=>evidence.consoleErrors.push(e.message));
 await context.route('**/*',r=>['127.0.0.1','localhost','fonts.googleapis.com','fonts.gstatic.com'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 await page.clock.setFixedTime('2026-10-24T21:10:00Z');
 await page.goto('http://127.0.0.1:4189/');await page.getByRole('button',{name:'Увійти через Google'}).click();
 await page.getByRole('button',{name:'Почати!',exact:true}).click();await page.getByRole('button',{name:'Почати!',exact:true}).waitFor({state:'hidden'});
 await page.locator('.fixed.z-50').filter({has:page.getByRole('heading',{name:'Налаштування',exact:true})}).locator('button:has(svg.lucide-x)').first().click();
 await page.locator('[data-modal-surface]').waitFor({state:'hidden'});
 await page.locator('.diary-header-date > summary').click();
 check('login opens Kyiv today across browser timezone',await page.getByLabel('Дата записів',{exact:true}).inputValue()==='2026-10-25'&&await page.getByRole('button',{name:'Сьогодні',exact:true}).getAttribute('aria-pressed')==='true');
 check('history calendar is in navigation header',await page.locator('.sticky .diary-header-date').count()===1 && await page.locator('.diary-date-control').count()===0);
 await page.locator('.diary-header-date > summary').click();
 const launcher=page.getByRole('button',{name:'Відкрити тренера',exact:true});await launcher.waitFor();
 await page.getByTitle('Налаштування',{exact:true}).click();await page.getByRole('button',{name:/Профіль і програма/}).click();
 check('new owner targets are unset',await page.getByLabel('Калорії, ккал').inputValue()==='');
 for(const [label,value] of [['Калорії, ккал','2305'],['Білки, г','140'],['Жири, г','70'],['Вуглеводи, г','235']])await page.getByLabel(label,{exact:true}).fill(value);
 await page.getByRole('button',{name:'Зберегти норми',exact:true}).click();await page.getByText('Особисті норми збережено.',{exact:true}).waitFor();
 await page.locator('.fixed.z-50').filter({has:page.getByRole('heading',{name:'Налаштування',exact:true})}).locator('button:has(svg.lucide-x)').first().click();await page.locator('[data-modal-surface]').waitFor({state:'hidden'});
 const second=await browser.newContext({viewport:{width:390,height:844},locale:'uk-UA'});await dismissIndependentMeasurementReminder(second);const secondPage=await second.newPage();
 secondPage.on('pageerror',e=>evidence.consoleErrors.push(e.message));
 await second.route('**/*',r=>['127.0.0.1','localhost','fonts.googleapis.com','fonts.gstatic.com'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 await secondPage.goto('http://127.0.0.1:4189/');await secondPage.getByRole('button',{name:'Увійти через Google'}).click();await secondPage.getByRole('button',{name:'Почати!',exact:true}).click();await secondPage.getByRole('button',{name:'Почати!',exact:true}).waitFor({state:'hidden'});
 await secondPage.getByRole('button',{name:/Профіль і програма/}).click();
 check('second verified account never receives owner targets',await secondPage.getByLabel('Калорії, ккал').inputValue()===''&&await secondPage.getByLabel('Білки, г').inputValue()==='');
 for(const [label,value] of [['Калорії, ккал','1800'],['Білки, г','95'],['Жири, г','55'],['Вуглеводи, г','200']])await secondPage.getByLabel(label,{exact:true}).fill(value);
 await secondPage.getByRole('button',{name:'Зберегти норми',exact:true}).click();await secondPage.getByText('Особисті норми збережено.',{exact:true}).waitFor();
 await secondPage.reload();await secondPage.getByTitle('Налаштування',{exact:true}).click();await secondPage.getByRole('button',{name:/Профіль і програма/}).click();
 check('second targets survive own reload',await secondPage.getByLabel('Калорії, ккал').inputValue()==='1800'&&await secondPage.getByLabel('Білки, г').inputValue()==='95');await second.close();
 await page.reload();await page.getByTitle('Налаштування',{exact:true}).click();await page.getByRole('button',{name:/Профіль і програма/}).click();
 check('owner targets unchanged after second account save and reload',await page.getByLabel('Калорії, ккал').inputValue()==='2305'&&await page.getByLabel('Білки, г').inputValue()==='140');
 await page.locator('.fixed.z-50').filter({has:page.getByRole('heading',{name:'Налаштування',exact:true})}).locator('button:has(svg.lucide-x)').first().click();await page.locator('[data-modal-surface]').waitFor({state:'hidden'});
 for(const width of [375,390,1366]){
  await page.setViewportSize({width,height:width===1366?900:844});await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));
  await launcher.waitFor();
  const home=await page.evaluate(()=>{const r=document.querySelector('.trainer-launcher').getBoundingClientRect();const report=[...document.querySelectorAll('button')].find(x=>x.textContent==='Переглянути звіт').getBoundingClientRect();const columnWidth=Math.min(innerWidth,512);return {width:innerWidth,height:r.height,right:innerWidth-r.right-(innerWidth-columnWidth)/2,bottom:innerHeight-r.bottom,reportGap:r.top-report.bottom,overflow:document.documentElement.scrollWidth-innerWidth};});
  check('launcher '+width,home.height===56&&home.right===16&&home.bottom===16&&home.reportGap>=16&&home.overflow===0);
  await page.screenshot({path:join(out,`launcher-${width}.png`)});
  await launcher.click();await page.locator('#trainer-message:not(:disabled)').waitFor();await page.getByRole('button',{name:'Що краще поїсти?',exact:true}).waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('.trainer-shortcuts button')].some(b=>b.textContent==='Що краще поїсти?'&&!b.disabled));
  check('no automatic input '+width,calls===0&&sttCalls===0&&await page.getByRole('button',{name:'Закрити чат'}).evaluate(n=>document.activeElement===n));
  const chat=await page.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect(),c=r('.trainer-chat'),h=r('#trainer-title'),i=r('.trainer-intro'),t=r('.trainer-input-row');return{left:h.left-c.left,right:c.right-t.right,edges:Math.abs(h.left-t.left)+Math.abs(i.left-t.left),overflow:document.documentElement.scrollWidth-innerWidth,width:c.width,heights:[...document.querySelectorAll('.trainer-chat button,.trainer-chat summary,.trainer-chat input')].filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect().height)};});
  check('chat edges '+width,chat.left===16&&chat.right===16&&chat.edges===0&&chat.overflow===0&&chat.width<=512&&chat.heights.every(h=>h>=44));
  await page.evaluate(()=>document.fonts.ready);
  const textResult=await page.evaluate('('+textAudit+')()');
  check('text audit source '+width,textResult.hostname==='127.0.0.1'&&textResult.innerWidth===width&&textResult.summary['перевірено']['кнопок']>0);
  evidence.textAudits.push(textResult);
  evidence.widths.push({home,chat});await page.screenshot({path:join(out,`chat-${width}.png`)});
  if(width===390){
   await page.locator('#trainer-message').focus();
   await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:480});visualViewport.dispatchEvent(new Event('resize'));});
   await page.waitForFunction(()=>document.querySelector('.trainer-overlay').style.getPropertyValue('--trainer-visible-height')==='480px');
   const keyboard=await page.evaluate(()=>{const c=document.querySelector('.trainer-chat').getBoundingClientRect(),f=document.querySelector('.trainer-composer').getBoundingClientRect();return {height:visualViewport.height,dialogTop:c.top,dialogBottom:c.bottom,composerBottom:f.bottom,scrollHeight:document.querySelector('.trainer-scroll').clientHeight};});
   check('composer above visual keyboard',keyboard.dialogTop===0&&keyboard.dialogBottom<=480&&keyboard.composerBottom<=480&&keyboard.scrollHeight>100);
   evidence.keyboard=keyboard;await page.screenshot({path:join(out,'keyboard-390.png')});
   await page.evaluate(()=>{delete visualViewport.height;visualViewport.dispatchEvent(new Event('resize'));});
  }

  await page.getByRole('button',{name:'Записати їжу',exact:true}).click();check('food shortcut no call '+width,calls===0&&await page.locator('#trainer-message').evaluate(n=>document.activeElement===n));
  await page.getByRole('button',{name:'Закрити чат',exact:true}).click();await launcher.waitFor();await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Відкрити тренера');
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));
 await page.getByRole('button',{name:'Додати їжу',exact:true}).click();await page.locator('#trainer-message:not(:disabled)').waitFor();
 check('food primary has clear purpose',await page.getByRole('heading',{name:'Додати їжу',exact:true}).count()===1&&calls===0&&sttCalls===0);
 await page.getByRole('button',{name:'Прикріпити фото',exact:true}).click();
 let chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Сфотографувати',exact:true}).click();
 let chosen=await chooser;check('explicit camera input',await chosen.element().getAttribute('capture')==='environment');await chosen.setFiles([]);
 await page.getByRole('button',{name:'Прикріпити фото',exact:true}).click();chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'З галереї',exact:true}).click();
 chosen=await chooser;check('separate gallery input',await chosen.element().getAttribute('capture')===null);await chosen.setFiles([]);
 check('attachment choice has no model or STT call',calls===0&&sttCalls===0);
 await page.getByRole('button',{name:'Закрити чат',exact:true}).click();
 await page.setViewportSize({width:390,height:844});await launcher.click();await page.locator('#trainer-message:not(:disabled)').waitFor();await page.getByRole('button',{name:'Що краще поїсти?',exact:true}).waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('.trainer-shortcuts button')].some(b=>b.textContent==='Що краще поїсти?'&&!b.disabled));
 await page.getByRole('button',{name:'Що краще поїсти?',exact:true}).click();await page.getByText('Синтетична порада. До щоденника нічого не додав.',{exact:true}).waitFor();
 check('one advice no draft',calls===1&&state.drafts.length===0&&lastInput.dateContext.mode==='default'&&!('targetDate'in lastInput));
 await page.locator('#trainer-message').fill('Вчора я з’їв плід'.toLowerCase());await page.getByRole('button',{name:'Надіслати повідомлення'}).click();
 await page.locator('[data-testid="trainer-draft"]').waitFor();await page.getByRole('button',{name:'Додати',exact:true}).waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('.trainer-draft button')].some(b=>b.textContent==='Додати'&&!b.disabled));
 check('historical preview reads actual day',await page.locator('.trainer-draft').textContent().then(t=>t.includes('02.01.2026')&&t.includes('За день: 50% → 100%')&&t.includes('приблизно 200 г')));
 await page.screenshot({path:join(out,'historical-preview-390.png')});
 await page.getByRole('button',{name:'Закрити чат'}).click();
 day.freshness={...day.freshness,targetsFingerprint:'synthetic-revised-targets'};
 await launcher.click();await page.getByRole('button',{name:'Оновити прев’ю',exact:true}).waitFor();
 const countBeforeRefresh=calls;await page.getByRole('button',{name:'Оновити прев’ю',exact:true}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('.trainer-draft button')].some(b=>b.textContent==='Додати'&&!b.disabled));
 check('norm revision refresh has zero inference',calls===countBeforeRefresh);

 await page.getByRole('button',{name:'Закрити чат'}).click();
 state.latestTurn={turnId:'synthetic-failed',state:'failed',error:'context_too_large',text:'Synthetic failed input'};
 await launcher.click();await page.locator('#trainer-message:not(:disabled)').waitFor();
 await page.getByText('Не вдалося вмістити повідомлення й контекст у запит. Текст збережений. Спробуйте коротше повідомлення.',{exact:true}).waitFor();
 check('one concrete error',await page.getByRole('alert').count()===1&&(await page.getByRole('alert').textContent()).includes('контекст')&&!(await page.getByRole('alert').textContent()).includes('незавершених чернеток'));
 await page.getByRole('button',{name:'Закрити чат',exact:true}).click();delete state.latestTurn;
 const icons=await page.locator('img[src*="category-"]').evaluateAll(nodes=>nodes.map(n=>({src:n.src,naturalWidth:n.naturalWidth,box:n.getBoundingClientRect().width})));
 check('versioned icons exact visual box',icons.length>=3&&icons.every(x=>x.src.includes('/static/media/')&&x.src.endsWith('.webp')&&x.naturalWidth===192&&x.box<=44));
 evidence.icons=icons;
 await page.locator('.diary-header-date > summary').click();
 await page.getByRole('button',{name:'Вчора',exact:true}).click();
 await launcher.click();await page.locator('#trainer-message:not(:disabled)').waitFor();
 await page.locator('#trainer-message').fill('Порадь їжу для обраного дня');
 await Promise.all([
  page.waitForResponse(r=>r.url().endsWith('/trainer/turns')&&r.request().method()==='POST'),
  page.getByRole('button',{name:'Надіслати повідомлення',exact:true}).click(),
 ]);
 await page.waitForFunction(()=>document.querySelector('#trainer-message')?.disabled===false);
 check('history browsing never pins a new message',lastInput.dateContext.mode==='default'&&!('targetDate' in lastInput));
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
 state.messages=[{id:'synthetic-native-photo',role:'user',content:'Синтетичне фото етикетки',photos:[{ref:'synthetic-own-photo'}]}];state.drafts=[];state.canonicalHistory=true;
 const callsBeforePhotos=calls;evidence.photoWidths=[];
 for(const width of [375,390,1366]){
  photoDeleted=false;await page.setViewportSize({width,height:844});await launcher.click();
  const openPhoto=page.getByRole('button',{name:'Відкрити фото 1',exact:true});await openPhoto.waitFor();await openPhoto.click();
  const photoDialog=page.getByRole('dialog',{name:'Фото 1',exact:true});await photoDialog.locator('img').waitFor();
  const bounds=await photoDialog.evaluate(node=>{const b=node.getBoundingClientRect(),h=node.querySelector('.trainer-photo-dialog-header').getBoundingClientRect(),close=node.querySelector('button').getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,innerLeft:h.left-b.left,innerRight:b.right-close.right,overflow:document.documentElement.scrollWidth-innerWidth,minTap:Math.min(...[...node.querySelectorAll('button')].map(button=>button.getBoundingClientRect().height))};});
  check('photo viewer edges '+width,bounds.innerLeft===16&&bounds.innerRight===16&&(width<=592?bounds.left===16&&bounds.right===width-16:bounds.left>=16&&bounds.right<=width-16)&&bounds.top>=16&&bounds.bottom<=828&&bounds.overflow===0&&bounds.minTap>=44);
  evidence.photoWidths.push({width,...bounds});await page.screenshot({path:join(out,`photo-${width}.png`)});
  if(width===390){
   await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:480});visualViewport.dispatchEvent(new Event('resize'));});
   await page.waitForFunction(()=>document.querySelector('.trainer-overlay').style.getPropertyValue('--trainer-visible-height')==='480px');
   const keyboardPhoto=await photoDialog.evaluate(node=>{const r=node.getBoundingClientRect();return{top:r.top,bottom:r.bottom};});
   check('photo fits visual keyboard',keyboardPhoto.top>=16&&keyboardPhoto.bottom<=464);evidence.keyboardPhoto=keyboardPhoto;
   await page.evaluate(()=>{delete visualViewport.height;visualViewport.dispatchEvent(new Event('resize'));});
  }
  await page.keyboard.press('Escape');await photoDialog.waitFor({state:'hidden'});check('photo Escape keeps chat '+width,await page.getByRole('button',{name:'Закрити чат',exact:true}).count()===1&&await openPhoto.evaluate(node=>node===document.activeElement));
  await openPhoto.click();await photoDialog.locator('img').waitFor();
  await page.getByRole('button',{name:'Видалити фото',exact:true}).click();const beforeDelete=photoDeletes;
  check('photo delete waits for confirmation '+width,await page.getByText('Видалити це фото з історії? Записи про їжу залишаться.',{exact:true}).count()===1&&photoDeletes===beforeDelete);
  await page.getByRole('button',{name:'Так, видалити фото',exact:true}).click();await page.getByText('Фото видалено або вже недоступне.',{exact:true}).waitFor();
  check('photo delete has no model or food write '+width,photoDeletes===beforeDelete+1&&calls===callsBeforePhotos&&state.messages.length===1);
  check('photo delete keeps focus in chat '+width,await page.locator('.trainer-history-photo').evaluate(node=>node===document.activeElement));
  await page.keyboard.press('Tab');check('photo delete Tab remains in chat '+width,await page.evaluate(()=>!!document.activeElement?.closest('.trainer-chat')));
  await page.getByRole('button',{name:'Закрити чат',exact:true}).click();await launcher.waitFor();
  await launcher.click();await page.getByText('Фото видалено або вже недоступне.',{exact:true}).waitFor();check('missing photo reload has no broken image '+width,await page.locator('.trainer-history-photo img').count()===0);
  await page.getByRole('button',{name:'Закрити чат',exact:true}).click();await launcher.waitFor();
 }
 evidence.protectedPhotoRequests={reads:photoReads,deletes:photoDeletes};
 check('no page errors',evidence.consoleErrors.length===0);
 evidence.status='passed';
}finally{
 writeFileSync(join(out,'evidence.json'),JSON.stringify(evidence,null,2));
 await context?.close();await browser?.close();await new Promise(ok=>server.close(ok));
}
console.log(JSON.stringify({status:evidence.status,checks:evidence.checks.length,widths:evidence.widths,iconBodies}));
