// Synthetic authenticated writers, including the exact old payload shapes. Never production.
import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,updateDoc,getDocFromServer,writeBatch,onSnapshot,deleteField} from 'firebase/firestore';
let env;const stamp=()=>({writerVersion:2,writerNonce:randomUUID()});
const paths=[['users','owner'],['users','owner','mealHistory','day'],['users','owner','measurements','day']];
const originals=[{users:{owner:{name:'Синтетичний',meals:{one:1}}},trainerId:null,trainerEmail:null},{meals:{one:1},revision:4,submissionMarkers:{saved:'hash'}},{weight:70,waist:80}];
const oldPayloads=[{users:{owner:{name:'Старий',meals:{old:1}}}},{meals:{old:1}},{weight:66}];
const db=()=>env.authenticatedContext('owner').firestore();
const read=async(database,i)=>(await getDocFromServer(doc(database,...paths[i]))).data();
const oldWrite=(database,i)=>setDoc(doc(database,...paths[i]),oldPayloads[i],i===1?{}:{merge:true});
const seed=async(target,stamped=false)=>target.withSecurityRulesDisabled(async ctx=>{
 for(let i=0;i<paths.length;i++)await setDoc(doc(ctx.firestore(),...paths[i]),{...originals[i],...(stamped?stamp():{})});
});
before(async()=>{
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8088')throw Error('isolated_emulator_required');
 env=await initializeTestEnvironment({projectId:'demo-scisense-writers',firestore:{host:'127.0.0.1',port:8088,rules:await readFile(process.env.SCISENSE_TEST_RULES||'firestore.rules','utf8')}});
});
after(async()=>env?.cleanup());
beforeEach(async()=>{await env.clearFirestore();await seed(env);});
test('W01 old creates and old updates of legacy documents are denied without data loss',async()=>{
 const database=db();
 for(let i=0;i<paths.length;i++){
  const p=[...paths[i]];p[p.length-1]='missing';
  const creator=i===0?env.authenticatedContext('missing').firestore():database;
  await assertFails(setDoc(doc(creator,...p),oldPayloads[i]));
  await assertSucceeds(setDoc(doc(creator,...p),{...oldPayloads[i],...stamp()}));
  await assertFails(oldWrite(database,i));assert.deepEqual(await read(database,i),originals[i]);
 }
});
test('W02 old merge/full-set cannot inherit the new writer stamp or erase markers',async()=>{
 await seed(env,true);const database=db();
 for(let i=0;i<paths.length;i++){
  const before=await read(database,i);await assertFails(oldWrite(database,i));
  await assertFails(setDoc(doc(database,...paths[i]),{...oldPayloads[i],writerVersion:2},{merge:true}));
  await assertFails(setDoc(doc(database,...paths[i]),{...oldPayloads[i],writerVersion:2,writerNonce:before.writerNonce},{merge:true}));
  assert.deepEqual(await read(database,i),before);
 }
});
test('W03 malformed stamps, nonce deletion/reuse and version downgrade fail closed',async()=>{
 const database=db();
 const invalid=[{}, {writerVersion:1,writerNonce:randomUUID()}, {writerVersion:'2',writerNonce:randomUUID()}, {writerVersion:2,writerNonce:''}, {writerVersion:2,writerNonce:123}, {writerVersion:2,writerNonce:'x'.repeat(1000)}];
 for(let i=0;i<paths.length;i++){
  const ref=doc(database,...paths[i]);
  for(const value of invalid)await assertFails(setDoc(ref,{...oldPayloads[i],...value},{merge:true}));
  const s=stamp();await assertSucceeds(updateDoc(ref,s));
  await assertFails(updateDoc(ref,{...oldPayloads[i],...s}));
  await assertFails(updateDoc(ref,{writerNonce:deleteField()}));
  await assertFails(updateDoc(ref,{writerVersion:1,writerNonce:randomUUID()}));
 }
});
test('W04 new writers upgrade legacy documents lazily and preserve partial measurements',async()=>{
 const database=db();
 for(let i=0;i<paths.length;i++){
  const s=stamp();await assertSucceeds(updateDoc(doc(database,...paths[i]),s));
  assert.deepEqual(await read(database,i),{...originals[i],...s});
  const p=[...paths[i]];p[p.length-1]='new';
  if(i===0)p[1]='owner'; // Creation of a user is tested with a fresh authenticated UID below.
  else await assertSucceeds(setDoc(doc(database,...p),{...oldPayloads[i],...stamp()}));
 }
 const fresh=env.authenticatedContext('new-owner').firestore();await assertSucceeds(setDoc(doc(fresh,'users','new-owner'),{users:{},...stamp()}));
 await setDoc(doc(database,...paths[2]),{weight:69,...stamp()},{merge:true});assert.equal((await read(database,2)).waist,80);
});
test('W05 a missing stamp on either side rejects the entire root/day batch',async()=>{
 await seed(env,true);const database=db(),initial=await Promise.all([read(database,0),read(database,1)]);
 for(const missing of [0,1]){
  const batch=writeBatch(database);
  for(let i=0;i<2;i++)batch.set(doc(database,...paths[i]),{...oldPayloads[i],...(i===missing?{}:stamp())},{merge:true});
  await assertFails(batch.commit());assert.deepEqual(await Promise.all([read(database,0),read(database,1)]),initial);
 }
});
test('W06 listeners roll back rejected local writes and another client never sees a server commit',async()=>{
 await seed(env,true);const writer=db(),observer=db(),events=[],own=[];
 const off=onSnapshot(doc(observer,...paths[1]),{includeMetadataChanges:true},s=>events.push({data:s.data(),pending:s.metadata.hasPendingWrites,cache:s.metadata.fromCache}));
 const offOwn=onSnapshot(doc(writer,...paths[1]),{includeMetadataChanges:true},s=>own.push({data:s.data(),pending:s.metadata.hasPendingWrites}));
 const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('listener_timeout');};
 try{
  await wait(()=>events.some(x=>!x.cache)&&own.length);const original=await read(observer,1);
  await assertFails(oldWrite(writer,1));await wait(()=>own.some(x=>x.pending)&&own.at(-1)?.pending===false);
  assert.deepEqual(own.at(-1).data,original);assert.deepEqual(await read(observer,1),original);
  assert.equal(events.filter(x=>!x.pending&&!x.cache).some(x=>x.data?.meals?.old),false);
  await updateDoc(doc(writer,...paths[1]),{revision:5,...stamp()});await wait(()=>events.some(x=>!x.pending&&!x.cache&&x.data?.revision===5));
 }finally{off();offOwn();}
});
test('W07 a new stamp does not bypass owner, trainer consent or root-field restrictions',async()=>{
 for(const uid of ['stranger','trainer'])for(const p of paths)await assertFails(setDoc(doc(env.authenticatedContext(uid).firestore(),...p),{...stamp(),meals:{}},{merge:true}));
 await assertFails(updateDoc(doc(db(),...paths[0]),{trainerId:'trainer',trainerEmail:'trainer@example.test',users:{},...stamp()}));
});
async function withRules(name,rules,fn){
 const testEnv=await initializeTestEnvironment({projectId:'demo-writer-'+name,firestore:{host:'127.0.0.1',port:8088,rules}});
 try{await testEnv.clearFirestore();await seed(testEnv,true);await fn(testEnv.authenticatedContext('owner').firestore());}finally{await testEnv.cleanup();}
}
test('W08 historical rules show why deploy order and a fence-preserving rollback are required',async()=>{
 for(const name of ['pre-g04','pre-fence'])await withRules(name,await readFile(`scripts/fixtures/writer-transition/${name}.rules`,'utf8'),async database=>{
  await assertSucceeds(oldWrite(database,1));assert.equal((await read(database,1)).submissionMarkers,undefined);
  // Both permit legacy day writes. The immediately preceding rules reject the new root field.
  if(name==='pre-fence')await assertFails(updateDoc(doc(database,...paths[0]),{users:{},...stamp()}));
  else await assertSucceeds(updateDoc(doc(database,...paths[0]),{users:{},...stamp()}));
 });
 await seed(env,true);await assertFails(oldWrite(db(),1));assert.deepEqual((await read(db(),1)).submissionMarkers,{saved:'hash'});
});
test('W09 regression assertions detect weakening nonce-change or mealHistory checks',async()=>{
 const rules=await readFile('firestore.rules','utf8');
 const change="&& request.resource.data.diff(resource.data).affectedKeys().hasAny(['writerNonce'])";
 assert.ok(rules.includes(change));
 await withRules('mutation-nonce',rules.replace(change,''),async database=>{
  await assert.rejects(()=>assertFails(oldWrite(database,0)),/Expected request to fail/);
 });
 const marker='allow update: if owner(uid) && writerChanged();';assert.ok(rules.includes(marker));
 await withRules('mutation-day',rules.replace(marker,'allow update: if owner(uid);'),async database=>{
  await assert.rejects(()=>assertFails(oldWrite(database,1)),/Expected request to fail/);
 });
});
