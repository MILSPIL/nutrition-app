import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,copyFileSync,readFileSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {localBudget} from '../scripts/phone-lab/sqlite.mjs';
import {prepareTransfer,stageTransfer,assertLocalMarker} from './transfer.mjs';
import {acquirePilotLock} from '../scripts/phone-lab/pilot-lock.mjs';
import {openServerLedger,PILOT_CAP} from './ledger.mjs';
const proposal=JSON.parse(readFileSync(new URL('../workers/meal-parser/pilot-proposal.json',import.meta.url)));
const reserve=(budget,cost=100000)=>budget.binding.get().fetch(new Request('https://budget',{method:'POST',body:JSON.stringify({action:'reserve',id:randomUUID(),uid:'a'.repeat(64),cost})}));
async function fixture(fn){const root=mkdtempSync(path.join(tmpdir(),'scisense-budget-'));try{
 const sourceFile=path.join(root,'local.sqlite');let marker=JSON.stringify({proposal:'synthetic-proposal',cap:PILOT_CAP,file:sourceFile});
 const local=localBudget(sourceFile,PILOT_CAP,{initialize:true});assert.equal((await reserve(local)).status,200);local.close();
 const markerStore={read:async()=>marker,write:async value=>{marker=value;}};const bundle=path.join(root,'bundle'),directory=path.join(root,'state');
 const receipt=await prepareTransfer({sourceFile,proposalId:'synthetic-proposal',destination:bundle,lockFile:path.join(root,'pilot.lock'),markerStore,stopLocal:async()=>true});stageTransfer({bundle,directory});
 const open=()=>process.env.SCISENSE_BASELINE==='1'?localBudget(path.join(directory,'pilot-budget.sqlite'),PILOT_CAP):openServerLedger({directory,receipt});
 await fn({root,sourceFile,bundle,directory,receipt,open,marker:()=>marker});
}finally{rmSync(root,{recursive:true,force:true});}}
test('A second process cannot open the same transferred budget',()=>fixture(async({open})=>{const a=open();try{assert.throws(open);}finally{a.close();}}));
test('Restoring an older SQLite file cannot restore spent budget',()=>fixture(async({root,directory,open})=>{const file=path.join(directory,'pilot-budget.sqlite'),snapshot=path.join(root,'old.sqlite');copyFileSync(file,snapshot);let a=open();await reserve(a);a.close();copyFileSync(snapshot,file);assert.throws(open);}));
test('Transfer preserves reservations and permanently fences every Mac checkout',()=>fixture(async({sourceFile,receipt,marker,open})=>{
 assert.equal(receipt.consumedMicros,100000);assert.equal(receipt.reservedCalls,1);assert.throws(()=>assertLocalMarker(JSON.stringify({proposal:'synthetic-proposal',cap:PILOT_CAP,file:sourceFile}),marker()));assert.throws(()=>assertLocalMarker('',marker(),{initialize:true}));
 let a=open();assert.equal(a.spent(),100000);await reserve(a);a.close();a=open();assert.equal(a.spent(),200000);a.close();
}));
test('Missing/corrupt DB, stale receipt and concurrent reimport fail closed',()=>fixture(async({directory,receipt,bundle,open})=>{
 assert.throws(()=>stageTransfer({bundle,directory}));assert.throws(()=>openServerLedger({directory,receipt:{...receipt,receiptId:'stale'}}));
 const file=path.join(directory,'pilot-budget.sqlite');rmSync(file);assert.throws(open);assert.equal(existsSync(file),false);writeFileSync(file,'broken',{mode:0o600});assert.throws(open);
}));
test('A process crash leaves a persistent lock requiring reconciliation',()=>fixture(async({directory,open})=>{writeFileSync(path.join(directory,'budget.lock'),'crashed-process',{mode:0o600});assert.throws(open);assert.equal(readFileSync(path.join(directory,'budget.lock'),'utf8'),'crashed-process');}));
test('Missing anchor, zero-cost reservation rollback, and replaced ledger stop inference',()=>fixture(async({root,directory,receipt,open})=>{
 const file=path.join(directory,'pilot-budget.sqlite'),snapshot=path.join(root,'old.sqlite');copyFileSync(file,snapshot);let a=open();await reserve(a,0);a.close();copyFileSync(snapshot,file);assert.throws(open);
 rmSync(path.join(directory,'budget-anchor.json'));assert.throws(open);
}));
test('Interrupted transfer locks source but creates no active server',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'scisense-transfer-'));let marker=null;try{
 const sourceFile=path.join(root,'new.sqlite'),destination=path.join(root,'missing','bundle');
 await assert.rejects(prepareTransfer({sourceFile,proposalId:'synthetic',destination,lockFile:path.join(root,'pilot.lock'),markerStore:{read:async()=>marker,write:async value=>{marker=value;}},stopLocal:async()=>true}));
 assert.ok(marker.includes('permanently_transferred'));assert.throws(()=>assertLocalMarker('',marker,{initialize:true}));assert.equal(existsSync(path.join(destination,'transfer.json')),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('Permission or anchor failure after a reservation never permits upstream',()=>fixture(async({directory,open})=>{const a=open();try{chmodSync(path.join(directory,'budget-anchor.json'),0o644);assert.equal((await reserve(a)).status,503);chmodSync(path.join(directory,'budget-anchor.json'),0o600);assert.equal((await reserve(a)).status,503);}finally{a.close();}}));

test('Concurrent transfers and fresh initialization across checkouts share a single lock',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'scisense-transfer-race-'));let marker=null;try{
  const lockFile=path.join(root,'pilot.lock'),markerStore={read:async()=>marker,write:async value=>{marker=value;}};
  const options={proposalId:'synthetic',lockFile,markerStore,stopLocal:async()=>true};
  const outputs=await Promise.allSettled([1,2].map(n=>prepareTransfer({...options,sourceFile:path.join(root,`checkout-${n}.sqlite`),destination:path.join(root,`bundle-${n}`)})));
  assert.equal(outputs.filter(x=>x.status==='fulfilled').length,1);assert.equal(outputs.filter(x=>x.status==='rejected').length,1);
  assert.throws(()=>assertLocalMarker('',marker,{initialize:true}));
  const release=acquirePilotLock(lockFile);try{await assert.rejects(prepareTransfer({...options,sourceFile:path.join(root,'next.sqlite'),destination:path.join(root,'next')}));assert.throws(()=>acquirePilotLock(lockFile));}finally{release();}
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('v2 transfer binds the new config while preserving every paid and free reservation',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'groq-transfer-'));const clock=Date.now;let budget;
 try{
 const sourceFile=path.join(root,'local.sqlite'),bundle=path.join(root,'bundle'),directory=path.join(root,'state');let marker=JSON.stringify({proposal:proposal.proposalId,cap:PILOT_CAP,file:sourceFile});const now=Date.now();
 Date.now=()=>now-86400000;budget=localBudget(sourceFile,PILOT_CAP,{initialize:true});await reserve(budget,123456);budget.close();budget=null;Date.now=()=>now;
 budget=localBudget(sourceFile,PILOT_CAP,{groqFree:true});for(let i=0;i<6;i++){const id=randomUUID();const object=budget.binding.get();assert.equal((await object.fetch(new Request('https://budget',{method:'POST',body:JSON.stringify({action:'reserve',id,uid:i.toString(16).repeat(64),cost:0})}))).status,200);await object.fetch(new Request('https://budget',{method:'POST',body:JSON.stringify({action:'finish',id})}));}budget.close();budget=null;
 const receipt=await prepareTransfer({sourceFile,proposalId:proposal.proposalId,proposal,destination:bundle,lockFile:path.join(root,'pilot.lock'),markerStore:{read:async()=>marker,write:async value=>{marker=value;}},stopLocal:async()=>true});assert.equal(receipt.version,2);assert.equal(receipt.configHash,proposal.configHash);assert.equal(receipt.consumedMicros,123456);assert.equal(receipt.reservedCalls,7);stageTransfer({bundle,directory});
 for(let i=0;i<2;i++){budget=openServerLedger({directory,receipt,groqFree:true});assert.equal((await reserve(budget,0)).status,429);assert.equal(budget.spent(),123456);budget.close();budget=null;}
 assert.throws(()=>openServerLedger({directory,receipt:{...receipt,configHash:'f'.repeat(64)},groqFree:true}));
 }finally{Date.now=clock;budget?.close();rmSync(root,{recursive:true,force:true});}
});

// Actual transferred synthetic ledger: a failed trainer shutdown must not strand its lock.
test('Runtime shutdown releases the ledger even when API or startup trainer cleanup fails',()=>fixture(async({open,directory})=>{
 const {closeServerResources}=await import('./runtime.mjs');
 for(const stage of ['api','trainer']){
  const budget=open();let closes=0;
  const broken={close:async()=>{closes++;throw Error('synthetic_shutdown_failure');}};
  await assert.rejects(closeServerResources({[stage]:broken,budget}),/synthetic_shutdown_failure/);
  assert.equal(closes,1);assert.equal(existsSync(path.join(directory,'budget.lock')),false);
  const reopened=open();reopened.close();
 }
 const budget=open();let apiCloses=0;
 await closeServerResources({api:{close:async()=>{apiCloses++;}},trainer:{close:()=>{throw Error('double_owner');}},budget});
 assert.equal(apiCloses,1);const reopened=open();reopened.close();
}));
