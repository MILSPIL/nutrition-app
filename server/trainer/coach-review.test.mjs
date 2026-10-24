import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, realpathSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as sleep } from 'node:timers/promises';
import { dateHints, foodIntentAllowed } from './date-context.mjs';
import { modelPlan, decodeModelPlan } from './snapshot.mjs';
import { createTrainerTools } from './tools.mjs';
import { createTrainerGateway } from './gateway.mjs';
import { openTurnStore } from './turn-store.mjs';
import { buildPlanCatalog } from '../../src/services/planCatalog.js';

test('review C02 dotted time and decimal amounts do not become partial dates', () => {
  const at = '2026-10-24T10:00:00Z';
  for (const text of ['О 12.30 з’їв бутерброд', 'о 10.05 з’їв яблуко', 'Купив за 12.50 грн', 'З’їв 12.50 г яблука']) {
    assert.equal(dateHints(text, at).ambiguous, false, text);
    assert.deepEqual(dateHints(text, at).dates, [], text);
  }
  assert.equal(dateHints('23.10 з’їв яблуко', at).ambiguous, true);
  assert.equal(dateHints('31.02.2026 з’їв яблуко', at).ambiguous, true);
  assert.deepEqual(dateHints('23.10.2026 з’їв яблуко', at).dates, ['2026-10-23']);
});

test('review C02 conditional eating questions do not create food drafts', () => {
  for (const text of ['Якщо я з’їм ще котлету, чи перевищу норму?', 'Якщо я з’їв котлету, чи перевищу норму?', 'Если я съем котлету?', 'If I ate another apple?']) {
    assert.equal(foodIntentAllowed(text), false, text);
  }
  assert.equal(foodIntentAllowed('Я з’їв яблуко, що порадиш далі?'), true);
});

test('review C04 compact plan retains ambiguity and tools reject its automatic match', async () => {
  const original = buildPlanCatalog().references[0];
  const catalog = buildPlanCatalog({globalCustomProducts:{[original.letter]:[{name:original.name,raw:original.norm}]}});
  const plan = modelPlan({catalog});
  const ambiguous = catalog.references.filter(r => r.ambiguous);
  assert.deepEqual(plan.catalog.ambiguousRefIds, [...new Set(ambiguous.map(r => r.refId))]);
  assert.equal(plan.catalog.rows.length, catalog.references.length);
  assert.equal(decodeModelPlan(plan).find(r => r.refId === original.refId).ambiguous, true);
  assert.equal(modelPlan({catalog:buildPlanCatalog()}).catalog.ambiguousRefIds, undefined);
  const store = {
    assertActive() {}, recordDayProof() {},
    propose(_id, _generation, patch, resolve) {
      return {draftId:'synthetic-draft-001',revision:1,targetDate:patch.targetDate,meal:1,state:'ready',items:patch.items.map(resolve)};
    },
  };
  const adapter = createTrainerTools({store,index:{lookup:()=>[]},readSnapshot:async()=>({day:{revision:0,meals:{},notes:[]},plan:{catalog}})});
  const ctx = {turn:{id:'synthetic-turn-001',generation:1,owner:'owner'},input:{text:'З’їв 100 г синтетичної їжі',media:[]},snapshot:{plan,sentAt:'2026-10-24T10:00:00Z',targetDate:'2026-10-24',dateContext:{mode:'default'}}};
  const raw = {itemId:'synthetic-food-001',name:'Синтетична їжа',preparation:'as_sold',quantity:{value:100,unit:'g'},
    source:{kind:'estimate',estimateReason:'recipe_estimate',assumptions:['Синтетична оцінка'],nutritionBasis:{value:100,unit:'g'},nutrients:{p:1,f:2,c:3,cal:60}},
    planMatch:{referenceId:original.refId,consumedState:'raw',certainty:'matched'}};
  await assert.rejects(adapter.tools.propose_food_draft({dayRef:'today',baseRevision:0,meal:1,items:[raw]},ctx),/invalid_plan_match/);
  delete raw.planMatch;
  assert.equal((await adapter.tools.propose_food_draft({dayRef:'today',baseRevision:0,meal:1,items:[raw]},ctx)).incomplete,false);
});

function fixture(t, {verificationFailure} = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(),'coach-review-')));
  chmodSync(dir,0o700);
  const file = join(dir,'state.sqlite');
  const store = openTurnStore(file,{hmacKey:randomBytes(32)});
  let reads = 0, contexts = 0, starts = 0, failVerification = !!verificationFailure, unavailable = false;
  const read = async (_uid,date) => {
    reads++;
    if(unavailable)throw Error('synthetic_day_unavailable');
    if (verificationFailure === 'day' && failVerification && reads === 2) return new Promise(()=>{});
    return {targetDate:date,revision:0,meals:{},notes:[],notesEnabled:true};
  };
  const g = createTrainerGateway({
    ownerUid:'owner',store,runDeadlineMs:100,
    media:{describe:()=>[],stage(){},load:()=>[],remove(){},sweep:()=>({faults:0})},
    proxy:{cancel(){},close(){}},
    backend:{async start(){starts++;return {text:'Синтетична готова порада'};},cleanup:async()=>({cleaned:true}),stop:async()=>({stopped:true})},
    readContext:async()=>{
      contexts++;
      if (verificationFailure === 'context' && failVerification && contexts === 2) return new Promise(()=>{});
      return {text:'Synthetic context',revision:1};
    },
    readDay:read,readPlan:async()=>({planContext:{}}),
  });
  t.after(async()=>{await g.close();store.close();rmSync(dir,{recursive:true,force:true});});
  return {g,store,get starts(){return starts;},resumeReads(){failVerification=false;},unavailable(value){unavailable=value;},
    removePreview(draftId){const db=new DatabaseSync(file);try{db.prepare('DELETE FROM draft_previews WHERE draft_id=?').run(draftId);}finally{db.close();}},
    async readyNote(){
      const d=await(await g.handle('owner','/notes','POST',{text:'Невідома синтетична страва',targetDate:'2026-10-24',meal:1})).json();
      return (await g.handle('owner','/drafts/'+d.draftId,'PUT',{baseRevision:d.revision,targetDate:d.targetDate,meal:d.meal,items:[{itemId:d.items[0].itemId,noteSelected:true}]})).json();
    },
    async settle(id){for(let i=0;i<200;i++){const turn=store.get('owner',id);if(!['running','queued','cleanup_pending'].includes(turn.state))return turn;await sleep(5);}throw Error('test_timeout');},
  };
}

test('review C02 legacy draft without preview must refresh before save', async t => {
  const f=fixture(t), draft=await f.readyNote();
  f.removePreview(draft.draftId);
  const state=await(await f.g.handle('owner','/state','GET')).json();
  f.unavailable(true);
  let error;
  try {await f.g.handle('owner','/drafts/'+draft.draftId+'/save','POST',{baseRevision:draft.revision});} catch(e) {error=e.message;}
  assert.deepEqual({stale:state.drafts[0].stale,error},{stale:true,error:'stale_preview'});
  f.unavailable(false);
  const refreshed=await(await f.g.handle('owner','/drafts/'+draft.draftId+'/refresh','PUT',{baseRevision:draft.revision})).json();
  assert.equal(refreshed.stale,false);
  const saved=await(await f.g.handle('owner','/drafts/'+draft.draftId+'/save','POST',{baseRevision:draft.revision})).json();
  assert.equal(saved.state,'saving');
});

test('review C06 absent preview does not change a frozen command or its receipt', async t => {
  const f=fixture(t), draft=await f.readyNote();
  const prepared=await(await f.g.handle('owner','/drafts/'+draft.draftId+'/save','POST',{baseRevision:draft.revision})).json();
  f.removePreview(draft.draftId);
  const cid=f.store.conversation('owner').conversationId;
  for(const state of ['saving','unknown','saved']) {
    if(state==='unknown')f.store.saveUnknown('owner',cid,draft.draftId);
    if(state==='saved')f.store.confirmSaved('owner',cid,draft.draftId,{revision:1,submissionMarkers:{[prepared.save.submissionId]:prepared.save.hash}});
    const current=f.store.draft('owner',cid,draft.draftId);
    assert.equal(current.state,state);
    assert.equal(current.stale,undefined);
    assert.deepEqual(current.save,prepared.save);
    assert.equal((await(await f.g.handle('owner','/drafts/'+draft.draftId+'/save','POST',{baseRevision:draft.revision})).json()).state,state);
  }
});

for (const verificationFailure of ['day','context']) test('review C02 completed model plus '+verificationFailure+' verification timeout is terminal and retryable', async t => {
  const f=fixture(t,{verificationFailure});
  const body={turnId:randomUUID(),baseRevision:0,text:'Що краще поїсти?',dateContext:{mode:'default'}};
  await f.g.handle('owner','/turns','POST',body);
  const turn=await f.settle(body.turnId);
  assert.equal(f.starts,1);
  assert.deepEqual({state:turn.state,error:turn.error},{state:'failed',error:'day_unavailable'});
  assert.equal(f.store.history('owner',f.store.conversation('owner').conversationId).length,0);
  f.resumeReads();
  const next={...body,turnId:randomUUID(),baseRevision:f.store.conversation('owner').revision};
  assert.equal((await f.g.handle('owner','/turns','POST',next)).status,202);
  assert.equal((await f.settle(next.turnId)).state,'completed');
  assert.equal(f.starts,2);
});
