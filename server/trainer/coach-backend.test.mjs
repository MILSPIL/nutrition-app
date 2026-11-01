import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, realpathSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { openTurnStore } from './turn-store.mjs';
import { LIMITS } from './limits.mjs';
import { createTrainerGateway } from './gateway.mjs';
import { createTrainerTools, trainerToolSchemas } from './tools.mjs';

function fixture(t, options={}) {
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'coach-backend-')));chmodSync(dir,0o700);
 let clock=Date.parse('2026-03-29T20:59:59Z'), revision=0, starts=0;
 const store=openTurnStore(join(dir,'state.sqlite'),{hmacKey:randomBytes(32),now:()=>clock});
 const snapshots=[], days=[];
 const day=date=>({targetDate:date,revision,meals:{},notes:[]});
 const plan={planContext:{}};
 const g=createTrainerGateway({ownerUid:'owner',store,now:()=>clock,
  media:{describe:()=>[],stage(){},load:()=>[],remove(){},sweep:()=>({faults:0})},
  proxy:{cancel(){},close(){}},
  backend:{async start(args){starts++;snapshots.push(args.snapshot);return options.start?options.start(args):{text:'Порада'};},cleanup:async()=>({cleaned:true}),stop:async()=>({stopped:true})},
  readContext:async()=>{if(options.slowRead)clock+=2000;return {text:'Synthetic context',revision:1};},
  readDay:async(_uid,date)=>{days.push(date);return day(date);},readPlan:async()=>plan,
  ...options.gateway,
 });
 t.after(async()=>{await g.close();store.close();rmSync(dir,{recursive:true,force:true});});
 return {g,store,snapshots,days,get starts(){return starts;},tick(ms){clock+=ms;},change(){revision++;},async settle(id){for(let i=0;i<100;i++){const turn=store.get('owner',id);if(!['running','queued','cleanup_pending'].includes(turn.state))return turn;await sleep(2);}throw Error('timeout');}};
}
const input=(extra={})=>({turnId:randomUUID(),baseRevision:0,text:'Що краще поїсти?',dateContext:{mode:'default'},...extra});

test('C02 default date uses first server admission before midnight I/O and replay preserves anchor',async t=>{
 const f=fixture(t,{slowRead:true}), body=input();
 await f.g.handle('owner','/turns','POST',body); await f.settle(body.turnId);
 assert.equal(f.snapshots[0].sentAt,'2026-03-29T20:59:59.000Z');
 assert.equal(f.snapshots[0].targetDate,'2026-03-29');
 f.tick(86400000);await f.g.handle('owner','/turns','POST',body);
 assert.equal(f.starts,1);assert.equal(JSON.parse(f.store.internal(body.turnId).snapshot).targetDate,'2026-03-29');
});
test('C02 yesterday overrides a visible pin and follows Kyiv calendar on DST boundary',async t=>{
 const f=fixture(t); f.tick(1801000);
 const body=input({text:'Вчора з’їв яблуко',dateContext:{mode:'pinned',targetDate:'2026-01-01'}});
 await f.g.handle('owner','/turns','POST',body);await f.settle(body.turnId);
 assert.equal(f.snapshots[0].targetDate,'2026-03-29');
 assert.equal(f.snapshots[0].dateContext.mode,'pinned');
});
test('C02 stale source during answer never publishes advice or drafts',async t=>{
 const f=fixture(t,{start:async()=>{f.change();return {text:'Stale advice must not appear'};}}),body=input();
 await f.g.handle('owner','/turns','POST',body);const result=await f.settle(body.turnId);
 assert.equal(result.state,'failed');assert.equal(result.error,'stale_snapshot');
 assert.equal(f.store.history('owner',f.store.conversation('owner').conversationId).length,0);
});
test('C02 explicit day endpoint returns a fresh historical snapshot, not empty current meals',async t=>{
 const f=fixture(t),value=await(await f.g.handle('owner','/days/2026-01-02','GET')).json();
 assert.equal(value.targetDate,'2026-01-02');assert.deepEqual(value.totals,{p:0,f:0,c:0,cal:0});
 assert.equal(value.freshness.dayRevision,0);assert.ok(value.planFingerprint);
});
test('C06 context writes are read-only by default before cutover',async t=>{
 const f=fixture(t);
 await assert.rejects(f.g.handle('owner','/context/'+randomUUID()+'/confirm','POST',{}),/memory_read_only/);
});
test('C02 model tools require server-resolved dayRef rather than arbitrary mandatory date',()=>{
 assert.ok(trainerToolSchemas.propose_food_draft.parameters.required.includes('dayRef'));
 assert.equal(trainerToolSchemas.propose_food_draft.parameters.required.includes('targetDate'),false);
});

test('C02 server calendar rejects spoofed dates and ambiguous/multiple days',async()=>{
 const {turnDateContext,resolveToolDate,foodIntentAllowed}=await import('./date-context.mjs');
 const sentAt='2026-03-29T21:30:00Z',base={input:{text:'Вчора з’їв плід'},snapshot:{sentAt,dateContext:{mode:'pinned',targetDate:'2026-01-02'}}};
 assert.equal(resolveToolDate({dayRef:'yesterday'},base),'2026-03-29');
 assert.throws(()=>resolveToolDate({dayRef:'explicit',targetDate:'2026-01-03'},base),/invalid_date/);
 assert.throws(()=>resolveToolDate({dayRef:'explicit',targetDate:'2026-03-29'},base),/invalid_date/);
 assert.equal(resolveToolDate({dayRef:'explicit',targetDate:'2026-01-03'},{...base,input:{text:'2026-01-03 з’їв плід'}}),'2026-01-03');
 assert.throws(()=>resolveToolDate({dayRef:'draft'},base),/date_clarification/);
 assert.throws(()=>resolveToolDate({dayRef:'today'},base,{draft:{targetDate:'2026-03-01'}}),/date_change_requires_confirmation/);
 for(const text of ['Учора? Вчора й сьогодні їв','23.10 з’їв','2026-01-02 та 2026-01-03 їв'])assert.equal(turnDateContext({text,dateContext:{mode:'default'},sentAt}).dateResolution,'ambiguous');
 for(const text of ['Що краще поїсти?','Що я їв учора?','Нагадай, що я з’їв','Не буду їсти','Я хочу з’їсти завтра яблуко','Планую з’їсти яблуко','Добре','Запиши це','Запиши це на сьогодні','Не з’їв яблуко','Скільки калорій у плоді?'])assert.equal(foodIntentAllowed(text),false,text);
 for(const text of ['З’їв яблуко','Я з’їв яблуко, що порадиш далі?','З’їв те, що ти щойно порадив','Съел яблоко, что лучше дальше?','Картопля 200 г','200 г','середній'])assert.equal(foodIntentAllowed(text),true,text);
 assert.equal(turnDateContext({text:'1.5 порції',dateContext:{mode:'default'},sentAt}).dateResolution,'today');
 assert.equal(turnDateContext({text:'середній',dateContext:{mode:'default'},sentAt,drafts:[{targetDate:'2026-01-02',state:'ready'}]}).targetDate,'2026-01-02');
});
test('C02 day read failure does not start a model or fabricate an empty day',async t=>{
 const f=fixture(t,{gateway:{readDay:async()=>{throw Error('Private transport problem');}}});
 await assert.rejects(f.g.handle('owner','/turns','POST',input()),/day_unavailable/);assert.equal(f.starts,0);
});
test('C02 stale draft is blocked, explicit refresh has zero inference and reads its historical day',async t=>{
 const f=fixture(t),draft=await(await f.g.handle('owner','/notes','POST',{text:'Невідома синтетична страва',targetDate:'2026-01-02',meal:1})).json();
 const edited=await(await f.g.handle('owner','/drafts/'+draft.draftId,'PUT',{baseRevision:draft.revision,targetDate:draft.targetDate,meal:1,items:[{itemId:draft.items[0].itemId,noteSelected:true}]})).json();
 f.change();await assert.rejects(f.g.handle('owner','/drafts/'+draft.draftId+'/save','POST',{baseRevision:edited.revision}),/stale_preview/);
 const refreshed=await(await f.g.handle('owner','/drafts/'+draft.draftId+'/refresh','PUT',{baseRevision:edited.revision})).json();
 assert.equal(refreshed.stale,false);assert.equal(refreshed.freshness.dayRevision,1);assert.equal(refreshed.freshness.targetDate,'2026-01-02');assert.equal(f.starts,0);
});
test('C02 deterministic totals exclude draft and count all four meals, preserving unknown notes',async()=>{
 const {confirmedSnapshot}=await import('./day-snapshot.mjs');
 const item={itemId:'synthetic-item-0001',name:'Synthetic',quantity:{value:180,unit:'g'},nutritionBasis:{value:100,unit:'g'},nutrients:{cal:60,p:1,f:2,c:3},source:{kind:'database'}};
 const day=await confirmedSnapshot({revision:4,meals:{1:{voice:[item]},2:{voice:[item]},3:{voice:[item]},4:{voice:[item]}},notes:[{noteId:'note-001',state:'active',knownNutrients:{cal:null}}],activity:{steps:6000},otherActivity:'Gym 50 minutes; pool previous day'}, {planContext:{profile:{nutritionTargets:{version:1,cal:2305,p:140,f:70,c:235}}}},'2026-01-02');
 assert.equal(day.totals.cal,432);assert.equal(day.totals.p,7.2);assert.equal(day.remaining.cal,1873);assert.equal(day.incomplete,true);assert.equal(day.notes[0].knownNutrients.cal,null);
 assert.equal(day.planProgress.unallocatedCount,4);assert.deepEqual(day.activity,{steps:6000});assert.equal(day.otherActivity,'Gym 50 minutes; pool previous day');
});
test('C05 required 8000-byte context, 24 foods, four notes,26 refs fit with the newest complete history pair',async()=>{
 const {buildSnapshot}=await import('./snapshot.mjs'),{confirmedSnapshot}=await import('./day-snapshot.mjs');
 const item=i=>({itemId:'synthetic-item-'+String(i).padStart(4,'0'),name:'Synthetic food '+i,quantity:{value:180,unit:'g'},nutritionBasis:{value:100,unit:'g'},nutrients:{p:1,f:2,c:3,cal:60},source:{kind:'database',recordId:'record-'+i,portionOrigin:{kind:'estimate',assumption:'Synthetic 180g'}},estimated:true});
 const meals=Object.fromEntries([1,2,3,4].map(m=>[m,{voice:Array.from({length:6},(_,i)=>item(m*10+i))}]));
 const notes=Array.from({length:4},(_,i)=>({noteId:'synthetic-note-'+i,state:'active',name:'Unknown '+i,knownNutrients:{cal:null,p:null,f:null,c:null}}));
 const plan={catalog:{references:Array.from({length:26},(_,i)=>({refId:'synthetic-ref-'+i,name:'Synthetic reference '+i,letter:'а',norm:100,basisState:'raw'})),projection:{free:200}}};
 const day=await confirmedSnapshot({revision:1,meals,notes},plan,'2026-03-30');
 const history=Array.from({length:12},(_,i)=>[{id:'u-'+i,role:'user',content:String(i).padStart(2,'0')+'u'.repeat(248)},{id:'a-'+i,role:'assistant',content:String(i).padStart(2,'0')+'a'.repeat(248)}]).flat();
 const s=buildSnapshot({conversationId:randomUUID(),historyRevision:12,context:'x'.repeat(8000),contextRevision:1,draft:[],receipts:[],day,plan,message:'Порада',history,sentAt:'2026-03-29T21:30:00Z',targetDate:'2026-03-30',dateContext:{mode:'default'}});
 assert.equal(s.context.length,8000);assert.equal(s.day.foods.length,24);assert.equal(s.day.notes.length,4);assert.equal(s.plan.catalog.rows.length,26);
 assert.ok(s.history.length>=2&&s.history.length<=12);assert.deepEqual(s.history.slice(-2).map(x=>x.id),['u-11','a-11']);assert.ok(Buffer.byteLength(JSON.stringify(s))<=LIMITS.payloadBytes);
 const {boundedPayload}=await import('./model-proxy.mjs'),{MODEL}=await import('./limits.mjs'),{decodeModelMeals,projectDayForModel}=await import('./day-snapshot.mjs');
 assert.deepEqual(decodeModelMeals(s.day),projectDayForModel({meals}).meals);
 const {history:kept,...mandatory}=s;
 const result=boundedPayload({model:MODEL,max_tokens:4096,system:JSON.stringify(mandatory),messages:[...kept.map(({role,content})=>({role,content})),{role:'user',content:'Порада'}],tools:Object.values(trainerToolSchemas).map(({name,description,parameters})=>({name,description,input_schema:parameters}))},{history:kept});
 assert.ok(result.textBytes<=LIMITS.payloadBytes);assert.ok(result.historyIds.includes('u-11')&&result.historyIds.includes('a-11'));
});
test('C05 actual default plan with 82 references and 24 complete foods fits the real bounded model payload',async t=>{
 const {buildSnapshot}=await import('./snapshot.mjs'),{confirmedSnapshot}=await import('./day-snapshot.mjs');
 const {coachCapacityFixture}=await import('./fixtures/coach-capacity.mjs');
 const {plan,day:rawDay,meals,history}=coachCapacityFixture();
 const day=await confirmedSnapshot(rawDay,plan,'2026-03-30');
 const s=buildSnapshot({conversationId:randomUUID(),historyRevision:12,context:'x'.repeat(8000),contextRevision:1,draft:[],receipts:[],day,plan,message:'Порада',history,sentAt:'2026-03-29T21:30:00Z',targetDate:'2026-03-30',dateContext:{mode:'default'}});
 assert.equal(s.context.length,8000);assert.equal(s.day.foods.length,24);assert.equal(s.day.notes.length,4);assert.equal(s.plan.catalog.rows.length,82);
 assert.ok(s.history.length>=2&&s.history.length<=12);assert.deepEqual(s.history.slice(-2).map(x=>x.id),['u-11','a-11']);assert.ok(Buffer.byteLength(JSON.stringify(s))<=LIMITS.payloadBytes);
 const {boundedPayload}=await import('./model-proxy.mjs'),{MODEL}=await import('./limits.mjs'),{decodeModelMeals,projectDayForModel}=await import('./day-snapshot.mjs');
 assert.deepEqual(decodeModelMeals(s.day),projectDayForModel({meals}).meals);
 const {history:kept,...mandatory}=s;
 t.diagnostic(JSON.stringify({snapshot:Buffer.byteLength(JSON.stringify(s)),mandatory:Buffer.byteLength(JSON.stringify(mandatory)),plan:Buffer.byteLength(JSON.stringify(s.plan)),day:Buffer.byteLength(JSON.stringify(s.day)),policy:Buffer.byteLength(s.policy),schemas:Buffer.byteLength(JSON.stringify(trainerToolSchemas))}));
 const result=boundedPayload({model:MODEL,max_tokens:4096,system:JSON.stringify(mandatory),messages:[...kept.map(({role,content})=>({role,content})),{role:'user',content:'Порада'}],tools:Object.values(trainerToolSchemas).map(({name,description,parameters})=>({name,description,input_schema:parameters}))},{history:kept});
 assert.ok(result.textBytes<=LIMITS.payloadBytes);assert.ok(result.historyIds.includes('u-11')&&result.historyIds.includes('a-11'));
 const candidates=Array.from({length:5},(_,i)=>({id:'record-'+i,name:'Synthetic household food '+i,preparation:'as_sold',nutritionBasis:{value:100,unit:'g'},nutrients:{p:1,f:2,c:3,cal:60},portions:[{grams:180,amount:1,description:'medium synthetic fruit'}],source:{kind:'database',dataset:'USDA',version:1,recordId:'record-'+i,url:'https://example.test/record/'+i}}));
 const {modelLookup,modelDraftAck}=await import('./tools.mjs');
 const rawProposal={itemId:'synthetic-new-item',name:'Синтетичний плід',preparation:'as_sold',quantity:{value:1,unit:'portion'},source:{kind:'database',recordId:'record-0',measureIndex:0}};
 const {createFoodResolver}=await import('./food-resolver.mjs');const resolver=createFoodResolver({index:{lookup:()=>candidates}});await resolver.lookup({query:'synthetic',preparation:'as_sold'});
 const canonicalItem={...resolver.resolve(rawProposal),originalTextRef:'synthetic-origin-1'};
 const canonicalDraft={draftId:'synthetic-draft-001',revision:1,targetDate:'2026-03-30',meal:1,state:'ready',items:[canonicalItem],updatedAt:1774864800000,originTurnIds:['synthetic-turn-001'],origins:{'synthetic-origin-1':'З’їв синтетичний плід'}};
 const toolTurns=[{role:'assistant',content:[{type:'tool_use',id:'lookup',name:'food_lookup',input:{query:'synthetic',preparation:'as_sold'}}]},{role:'user',content:[{type:'tool_result',tool_use_id:'lookup',content:JSON.stringify(modelLookup({candidates}))}]},{role:'assistant',content:[{type:'tool_use',id:'draft',name:'propose_food_draft',input:{baseRevision:0,dayRef:'today',meal:1,items:[rawProposal]}}]},{role:'user',content:[{type:'tool_result',tool_use_id:'draft',content:JSON.stringify(modelDraftAck(canonicalDraft))}]}];
 t.diagnostic(JSON.stringify({firstPayloadBytes:result.textBytes,minimumThirdBytes:Buffer.byteLength(JSON.stringify({...result.payload,messages:[...result.payload.messages.filter(m=>!kept.some(h=>h.content===m.content)),...toolTurns]}))}));
 const third=boundedPayload({...result.payload,messages:[...result.payload.messages,...toolTurns]},{history:kept});
 assert.ok(third.textBytes<=LIMITS.payloadBytes);assert.ok(third.historyIds.includes('u-11')&&third.historyIds.includes('a-11'));
 t.diagnostic(JSON.stringify({firstPayloadBytes:result.textBytes,thirdPayloadBytes:third.textBytes,retainedMessages:third.historyIds.length}));

});
test('C02 pre-I/O admission survives restart and rejects a changed request under the same turn ID',t=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'coach-anchor-')));chmodSync(dir,0o700);
 const file=join(dir,'state.sqlite'),key=randomBytes(32);let clock=Date.parse('2026-03-29T20:59:59Z'),store=openTurnStore(file,{hmacKey:key,now:()=>clock});
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 const cid=store.conversation('owner').conversationId,request={turnId:randomUUID(),text:'Вчора з’їв плід',dateContext:{mode:'default'},baseRevision:0,media:[]};
 const anchor=store.captureAdmission('owner',cid,request);store.close();clock+=3600000;store=openTurnStore(file,{hmacKey:key,now:()=>clock});
 assert.equal(store.captureAdmission('owner',cid,request),anchor);
 assert.throws(()=>store.captureAdmission('owner',cid,{...request,text:'інший текст'}),/turn_conflict/);
 assert.throws(()=>store.captureAdmission('owner',cid,{...request,dateContext:{mode:'pinned',targetDate:'2026-01-03'}}),/turn_conflict/);
});
test('C02 model cannot propose food for an advice acknowledgment or change an existing draft date',async t=>{
 const f=fixture(t),cid=f.store.conversation('owner').conversationId;
 const input={turnId:randomUUID(),baseRevision:0,text:'Добре',targetDate:'2026-03-29',media:[]},snapshot={sentAt:'2026-03-29T20:59:59Z',targetDate:input.targetDate,dateContext:{mode:'default'},draft:[],plan:{},context:'Synthetic',contextRevision:1};
 f.store.admit('owner',cid,input,snapshot);const turn=f.store.begin('owner',input.turnId),ctx={turn,input,snapshot};
 const kit=createTrainerTools({store:f.store,index:{lookup:()=>[]},readDay:async()=>({meals:{},revision:0}),readPlan:async()=>({})});
 await assert.rejects(kit.tools.propose_food_draft({dayRef:'today',baseRevision:0,meal:1,items:[]},ctx),/consumption_unconfirmed/);
 await assert.rejects(kit.tools.propose_context_update({baseRevision:1,text:'remember'},ctx),/memory_read_only/);
 assert.equal(f.store.drafts('owner',cid).length,0);f.store.fail(turn.id,'synthetic_stop');f.store.cleaned(turn.id);kit.release(turn.id);
});
test('C02 Firestore day, notes and plan share one read-only transaction and private profile extras stay outside it',async()=>{
 const {createFirestoreReader,withOwnerToken}=await import('./firestore-reader.mjs');
 const calls=[],date='2026-03-29',uid='synthetic-owner';
 const docs={
  [`users/${uid}/mealHistory/${date}`]:{revision:3,meals:{},foodNotes:{'synthetic-note-0001':true},otherActivity:'Pool 50 minutes'},
  [`releaseCapabilities/${uid}`]:{notesEnabled:true,minimumWriterVersion:3},
  [`users/${uid}/foodNotes/synthetic-note-0001`]:{state:'active',targetDate:date,name:'unknown',knownNutrients:{p:null,f:null,c:null,cal:null}},
  [`users/${uid}`]:{users:{[uid]:{portions:{},privateExtra:'DO_NOT_INCLUDE'}},globalCustomProducts:{},productOverrides:{}},
 };
 const encode=v=>v===null?{nullValue:null}:Array.isArray(v)?{arrayValue:{values:v.map(encode)}}:typeof v==='object'?{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}}:typeof v==='string'?{stringValue:v}:typeof v==='boolean'?{booleanValue:v}:{integerValue:String(v)};
 const reader=createFirestoreReader({project:'demo-scisense',ownerUid:uid,profileId:uid,fetcher:async(url,init)=>{
  const method=url.split(':').at(-1),body=JSON.parse(init.body);calls.push({method,body});
  if(method==='beginTransaction')return Response.json({transaction:'synthetic-read-transaction'});
  if(method==='rollback')return Response.json({});
  return Response.json(body.documents.map(name=>{const value=docs[name.split('/documents/')[1]];return value?{found:{name,fields:encode(value).mapValue.fields}}:{missing:name};}));
 }});
 const value=await withOwnerToken(uid,'synthetic-token',()=>reader.readSnapshot(uid,date));
 assert.equal(calls.filter(c=>c.method==='beginTransaction').length,1);assert.equal(calls.filter(c=>c.method==='rollback').length,1);
 const batches=calls.filter(c=>c.method==='batchGet');assert.equal(batches.length,3);assert.ok(batches.every(c=>c.body.transaction==='synthetic-read-transaction'));
 assert.equal(value.day.notes[0].knownNutrients.cal,null);assert.equal(value.day.otherActivity,'Pool 50 minutes');assert.ok(value.plan.catalog.references.length>50);
 assert.equal(JSON.stringify(value).includes('DO_NOT_INCLUDE'),false);
});

test('C05 model projection omits only the documented service fields; raw facts and unknowns are unchanged',async()=>{
 const {coachCapacityFixture}=await import('./fixtures/coach-capacity.mjs');
 const {modelDay,projectDayForModel,decodeModelMeals,decodeModelNotes,MODEL_DAY_OMITTED_FIELDS}=await import('./day-snapshot.mjs');
 const {day}=coachCapacityFixture();
 const allowed={
  day:['submissionMarkers','rejectedSubmissions','writerVersion','writerNonce','foodNotes','totalMacros','legacyImportProfileId','freshness','planFingerprint','notesRevision'],
  food:['itemId','originalTextRef'],allocation:['version','referenceKey','referenceName','conversion','normSource'],
  note:['commandHash','submissionId','originDraft','writerVersion','writerNonce','createdAt','updatedAt','resolvedAt'],
 };
 assert.deepEqual(MODEL_DAY_OMITTED_FIELDS,allowed);
 Object.assign(day,{writerNonce:'synthetic-writer',submissionMarkers:{synthetic:'hash'},foodNotes:{'synthetic-note-0':true},legacyImportProfileId:'synthetic-profile',futureUnknownField:{value:null}});
 for(const meal of Object.values(day.meals))for(const items of Object.values(meal))for(const item of items)item.originalTextRef='synthetic-origin';
 const original=structuredClone(day),expected=structuredClone(day);
 for(const key of allowed.day)delete expected[key];
 for(const meal of Object.values(expected.meals))for(const items of Object.values(meal))for(const item of items){for(const key of allowed.food)delete item[key];for(const key of allowed.allocation)delete item.planAllocation[key];}
 for(const note of expected.notes)for(const key of allowed.note)delete note[key];
 assert.deepEqual(projectDayForModel(day),expected);
 const transport=modelDay(day);
 assert.deepEqual(decodeModelMeals(transport),expected.meals);
 assert.deepEqual(decodeModelNotes(transport),expected.notes);
 assert.deepEqual(day,original);
 assert.deepEqual(transport.futureUnknownField,{value:null});
 assert.equal(decodeModelNotes(transport)[0].knownNutrients.p,null);
});

test('C05 table roundtrip distinguishes missing, null, empty objects and arrays without mutating shared defaults',async()=>{
 const {modelDay,decodeModelMeals,decodeModelNotes}=await import('./day-snapshot.mjs');
 const meals={1:{empty:[],voice:[{name:'First',value:null,nested:{empty:{},list:[1,null,'value']},common:{value:1}},{name:'Second',nested:{empty:null,list:[]},common:{value:1}}]},2:{}};
 const notes=[{noteId:'one',known:{p:null,c:0},optional:[]},{noteId:'two',known:{p:null,c:1}}];
 const original=structuredClone({meals,notes}),encoded=modelDay({meals,notes});
 const decoded=decodeModelMeals(encoded);
 assert.deepEqual(decoded,meals);assert.deepEqual(decodeModelNotes(encoded),notes);
 assert.equal(Object.hasOwn(decoded[1].voice[1],'value'),false);
 decoded[1].voice[0].common.value=2;assert.equal(decoded[1].voice[1].common.value,1);
 assert.deepEqual({meals,notes},original);
});

test('C05 lookup transport and draft acknowledgment preserve canonical storage and report uncertainty',async()=>{
 const {modelLookup,modelDraftAck}=await import('./tools.mjs');
 const candidate={id:'fixture-001',name:'Synthetic fruit',preparation:'raw',nutritionBasis:{value:100,unit:'g'},nutrients:{p:1,f:2,c:3,cal:60},portions:[{amount:1,grams:180,description:'medium'}],source:{kind:'database',recordId:'fixture-001',dataset:'synthetic',url:'https://example.test/fixture'}};
 const original=structuredClone(candidate),lookup=modelLookup({candidates:[candidate]});
 const mapped=Object.fromEntries(lookup.columns.map((key,i)=>[key,i<lookup.candidates[0].length?lookup.candidates[0][i]:lookup.defaults[key]]));
 assert.equal(mapped.id,candidate.id);assert.deepEqual(mapped.portions,candidate.portions);assert.equal(mapped.cal,60);assert.equal(mapped.basisValue,100);assert.equal(mapped.sourceKind,'database');
 const draft={draftId:'synthetic-draft',revision:2,targetDate:'2026-01-01',meal:1,state:'ready',items:[{itemId:'synthetic-fruit',name:'Synthetic fruit',quantity:{value:180,unit:'g'},nutritionBasis:candidate.nutritionBasis,nutrients:candidate.nutrients,nutritionStatus:'complete',estimated:true,source:{...candidate.source,portionOrigin:{kind:'estimate',assumption:'Synthetic medium size'}}},{itemId:'synthetic-note',name:'Unknown',nutritionStatus:'unknown',nutrients:{p:null,f:null,c:null,cal:null}}]};
 const before=structuredClone(draft),ack=modelDraftAck(draft);
 assert.equal(ack.saved,false);assert.equal(ack.itemCount,2);assert.equal(ack.totals.cal,108);assert.equal(ack.incomplete,true);assert.equal(ack.assumptions[0].portionOrigin.assumption,'Synthetic medium size');
 assert.deepEqual(draft,before);assert.deepEqual(candidate,original);
});
