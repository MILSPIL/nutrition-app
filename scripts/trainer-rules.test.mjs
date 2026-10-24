import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {writerStamp} from '../src/services/writerFence.js';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, serverTimestamp, Timestamp, writeBatch, onSnapshot, deleteField, FieldPath } from 'firebase/firestore';
import { createTrainerAccess, connectionVersion, validConnection } from '../src/services/trainerAccess.js';
let env;
const actor=(uid,email=`${uid}@example.test`,verified=true)=>env.authenticatedContext(uid,{email,email_verified:verified}).firestore();
const pending=(client='client',generation=1,revision=1)=>({clientId:client,clientEmail:`${client}@example.test`,clientName:'Синтетичний клієнт',trainerEmail:'trainer@example.test',status:'pending',generation,revision,createdAt:Timestamp.fromMillis(1000)});
const accepted=(client='client')=>({...pending(client),status:'accepted',revision:2,trainerId:'trainer',trainerName:'Тренер',acceptedAt:Timestamp.fromMillis(2000)});
const admin=fn=>env.withSecurityRulesDisabled(ctx=>fn(ctx.firestore()));
before(async()=>{
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8088')throw Error('Isolated emulator required');
 env=await initializeTestEnvironment({projectId:'demo-scisense',firestore:{host:'127.0.0.1',port:8088,rules:await readFile(process.env.SCISENSE_TEST_RULES||'firestore.rules','utf8')}});
});
after(async()=>env?.cleanup());
beforeEach(async()=>{
 await env.clearFirestore();
 await admin(async db=>{
  for(const uid of ['client','client2']){
   await setDoc(doc(db,'users',uid),{users:{[uid]:{name:'Синтетичний клієнт'}},trainerId:null,trainerEmail:null});
   await setDoc(doc(db,'users',uid,'mealHistory','2026-10-21'),{meals:{},synthetic:true});
   await setDoc(doc(db,'users',uid,'measurements','one'),{date:'2026-10-21',weight:70});
  }
  await setDoc(doc(db,'trainers','trainer'),{profile:{name:'Тренер'},clients:{other:{name:'Інший клієнт'}}});
 });
});
test('A01 owner cannot self-assign a trainer pointer',async()=>{
 const db=actor('client');await assertFails(updateDoc(doc(db,'users','client'),{trainerId:'trainer',trainerEmail:'trainer@example.test'}));
 await assertFails(setDoc(doc(actor('new'),'users','new'),{trainerId:'trainer'}));
});
test('A01 root profile and trainer directory are private even with legacy pointers',async()=>{
 await admin(db=>updateDoc(doc(db,'users','client'),{trainerId:'trainer',trainerEmail:'trainer@example.test'}));
 await assertSucceeds(getDoc(doc(actor('client'),'users','client')));
 await assertFails(getDoc(doc(actor('trainer'),'users','client')));
 await assertFails(getDoc(doc(actor('client'),'trainers','trainer')));
 await assertFails(getDoc(doc(actor('trainer'),'users','client','mealHistory','2026-10-21')));
});
test('A01 stranger and guest cannot read a meal; owner can',async()=>{
 const path=['users','client','mealHistory','2026-10-21'];
 await assertFails(getDoc(doc(actor('stranger'),...path)));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),...path)));
 await assertSucceeds(getDoc(doc(actor('client'),...path)));
});
test('A01 pending requires verified owner, existing profile and closed canonical schema',async()=>{
 const data={...pending(),createdAt:serverTimestamp()};
 await assertSucceeds(setDoc(doc(actor('client'),'trainerRequests','client'),data));
 await assertFails(setDoc(doc(actor('client2','client2@example.test',false),'trainerRequests','client2'),{...pending('client2'),createdAt:serverTimestamp()}));
 await assertFails(setDoc(doc(actor('missing'),'trainerRequests','missing'),{...pending('missing'),createdAt:serverTimestamp()}));
 await assertFails(setDoc(doc(actor('client2'),'trainerRequests','client2'),{...pending('client2'),trainerId:'trainer',createdAt:serverTimestamp()}));
});
test('A02 real pending queries normalize verified auth email and deny unrelated lists',async()=>{
 await admin(db=>setDoc(doc(db,'trainerRequests','client'),pending()));
 const q=db=>query(collection(db,'trainerRequests'),where('trainerEmail','==','trainer@example.test'),where('status','==','pending'));
 assert.equal((await assertSucceeds(getDocs(q(actor('trainer','TrAiNeR@example.test'))))).size,1);
 await assertFails(getDocs(q(actor('stranger'))));
 await assertFails(getDocs(q(actor('trainer','trainer@example.test',false))));
 await assertFails(getDocs(collection(actor('trainer'),'trainerRequests')));
 assert.equal((await getDocs(query(collection(actor('client'),'trainerRequests'),where('clientId','==','client')))).size,1);
});
test('A03 display roster alone grants no access',async()=>{
 await assertSucceeds(updateDoc(doc(actor('trainer'),'trainers','trainer'),{'clients.client':{name:'Fake'}}));
 await assertFails(getDoc(doc(actor('trainer'),'users','client','mealHistory','2026-10-21')));
});
test('A03 partial acceptance and deletion of proof denied',async()=>{
 await admin(db=>setDoc(doc(db,'trainerRequests','client'),pending()));
 await assertFails(updateDoc(doc(actor('trainer'),'trainerRequests','client'),{status:'accepted',trainerId:'trainer',trainerName:'Тренер',acceptedAt:serverTimestamp(),revision:2}));
 await assertFails(deleteDoc(doc(actor('client'),'trainerRequests','client')));
});
test('A03 accepted proof plus pointer permits only meal and measurements reads',async()=>{
 await admin(async db=>{await setDoc(doc(db,'trainerRequests','client'),accepted());await updateDoc(doc(db,'users','client'),{trainerId:'trainer',trainerEmail:'trainer@example.test'});});
 for(const path of [['mealHistory','2026-10-21'],['measurements','one']]){
  await assertSucceeds(getDoc(doc(actor('trainer','changed@example.test'),'users','client',...path)));
  await assertFails(getDoc(doc(actor('other'),'users','client',...path)));
 }
 await assertFails(getDoc(doc(actor('trainer'),'users','client')));
 await assertFails(updateDoc(doc(actor('trainer'),'users','client','measurements','one'),{weight:1}));
 await assertFails(updateDoc(doc(actor('client'),'users','client'),{trainerId:null,trainerEmail:null}));
});
test('A05 owner settings remain writable but unknown protocol fields are closed',async()=>{
 const ref=doc(actor('client'),'users','client');
 await assertSucceeds(updateDoc(ref,{users:{client:{name:'Нове ім’я'}},...writerStamp()}));
 await assertFails(updateDoc(ref,{unexpectedProtocol:true}));
});
test('A07 legacy pointer can be cleared without reading missing trainer directory',async()=>{
 await admin(db=>updateDoc(doc(db,'users','client'),{trainerId:'missing',trainerEmail:'gone@example.test'}));
 await assertSucceeds(updateDoc(doc(actor('client'),'users','client'),{trainerId:null,trainerEmail:null}));
 assert.equal((await getDoc(doc(actor('client'),'users','client'))).data().users.client.name,'Синтетичний клієнт');
});
const user=uid=>({uid,email:`${uid}@example.test`,emailVerified:true});
const service=uid=>createTrainerAccess(actor(uid));
const state=()=>service('client').readState(user('client'));
async function start(client='client',expected={generation:0,revision:0}) {
 await service(client).request(user(client),' TrAiNeR@example.test ','Синтетичний клієнт',expected);
 return (await service(client).readState(user(client))).request;
}
async function connect(client='client') {
 const p=await start(client);await service('trainer').accept(user('trainer'),client,connectionVersion(p));
 return (await service(client).readState(user(client))).request;
}
async function inspect(fn) { return admin(async db=>fn(db)); }
function watch(db,path) {
 const events=[];let resolve;
 const wait=()=>new Promise((yes,no)=>{const timer=setTimeout(()=>no(Error('Listener timeout')),5000);resolve=()=>{clearTimeout(timer);yes();};});
 const off=onSnapshot(doc(db,...path),s=>{events.push({data:s.data()});resolve?.();},e=>{events.push({error:e.code});resolve?.();});
 return {events,wait,off};
}
test('A03 real service full cycle is atomic, idempotent and preserves neighbouring roster and food',async()=>{
 const a=await connect();assert.ok(validConnection(a,'client'));
 await assertSucceeds(getDoc(doc(actor('trainer'),'users','client','mealHistory','2026-10-21')));
 assert.deepEqual(await service('trainer').accept(user('trainer'),'client',{generation:1,revision:1}),{alreadyApplied:true});
 await service('client').disconnect(user('client'),connectionVersion(a));
 assert.deepEqual(await service('client').disconnect(user('client'),connectionVersion(a)),{alreadyApplied:true});
 const s=await state();assert.equal(s.request.status,'disconnected');assert.equal(s.profile.trainerId,null);
 const roster=(await getDoc(doc(actor('trainer'),'trainers','trainer'))).data().clients;
 assert.ok(roster.other);assert.equal(roster.client,undefined);
 await assertFails(getDoc(doc(actor('trainer'),'users','client','mealHistory','2026-10-21')));
 assert.ok((await getDoc(doc(actor('client'),'users','client','measurements','one'))).exists());
});
test('A03 reject, cancel and reconnect preserve monotonic generations and revisions',async()=>{
 let p=await start();await service('trainer').finishPending(user('trainer'),'client',connectionVersion(p),'rejected');
 let s=await state();assert.equal(s.request.status,'rejected');
 p=await start('client',connectionVersion(s.request));assert.equal(p.generation,2);assert.equal(p.revision,3);
 await service('client').finishPending(user('client'),'client',connectionVersion(p),'cancelled');
 s=await state();assert.equal(s.request.status,'cancelled');
 p=await start('client',connectionVersion(s.request));assert.equal(p.revision,5);
 await service('trainer').accept(user('trainer'),'client',connectionVersion(p));
 await assertFails(setDoc(doc(actor('client'),'trainerRequests','client'),{...pending(),createdAt:serverTimestamp()}));
});
test('A03 missing roster entry allows revocation; missing trainer document uses narrow fallback',async()=>{
 for(const missingDoc of [false,true]){
  let s=await state();const p=await start('client',connectionVersion(s.request));
  await service('trainer').accept(user('trainer'),'client',connectionVersion(p));
  const a=(await state()).request;
  await admin(db=>missingDoc?deleteDoc(doc(db,'trainers','trainer')):updateDoc(doc(db,'trainers','trainer'),{'clients.client':deleteField()}));
  await service('client').disconnect(user('client'),connectionVersion(a));
  assert.equal((await state()).request.status,'disconnected');
 }
});
test('A03 incomplete accept/disconnect batches are denied without partial writes',async()=>{
 const p=await start();const db=actor('trainer');let batch=writeBatch(db);
 batch.update(doc(db,'trainerRequests','client'),{status:'accepted',trainerId:'trainer',trainerName:'Тренер',acceptedAt:serverTimestamp(),revision:2});
 batch.update(doc(db,'users','client'),{trainerId:'trainer',trainerEmail:p.trainerEmail});
 await assertFails(batch.commit());assert.equal((await state()).request.status,'pending');assert.equal((await state()).profile.trainerId,null);
 await service('trainer').accept(user('trainer'),'client',connectionVersion(p));
 const cdb=actor('client');batch=writeBatch(cdb);
 batch.update(doc(cdb,'trainerRequests','client'),{status:'disconnected',revision:3,endedAt:serverTimestamp()});
 batch.update(doc(cdb,'users','client'),{trainerId:null,trainerEmail:null});
 await assertFails(batch.commit());assert.equal((await state()).request.status,'accepted');
 // An old accepted proof cannot authorize a later repeat of link writes.
 await assertFails(updateDoc(doc(db,'users','client'),{trainerEmail:'different@example.test'}));
});
test('A04 simultaneous accepts and two clients retain a complete roster',async()=>{
 const p=await start(),p2=await start('client2');
 const results=await Promise.all([
  service('trainer').accept(user('trainer'),'client',connectionVersion(p)),
  service('trainer').accept(user('trainer'),'client',connectionVersion(p)),
  service('trainer').accept(user('trainer'),'client2',connectionVersion(p2)),
  updateDoc(doc(actor('client'),'users','client'),{users:{client:{name:'Збережено паралельно'}},...writerStamp()})
 ]);
 assert.equal(results.filter(r=>r?.alreadyApplied===true).length,1);
 const roster=(await getDoc(doc(actor('trainer'),'trainers','trainer'))).data().clients;
 assert.deepEqual(Object.keys(roster).sort(),['client','client2','other']);
 assert.equal((await state()).profile.users.client.name,'Збережено паралельно');
});
test('A04 accept versus cancel has one consistent outcome',async()=>{
 const p=await start();const results=await Promise.allSettled([
  service('trainer').accept(user('trainer'),'client',connectionVersion(p)),
  service('client').finishPending(user('client'),'client',connectionVersion(p),'cancelled')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const s=await state();assert.ok(['accepted','cancelled'].includes(s.request.status));
 assert.equal(s.profile.trainerId,s.request.status==='accepted'?'trainer':null);
});
test('A04 stale operations after reconnect cannot mutate the new cycle',async()=>{
 const oldPending=await start();await service('trainer').accept(user('trainer'),'client',connectionVersion(oldPending));
 const oldAccepted=(await state()).request;
 await Promise.all([service('client').disconnect(user('client'),connectionVersion(oldAccepted)),
  updateDoc(doc(actor('client'),'users','client'),{productOverrides:{saved:true},...writerStamp()})]);
 const p=await start('client',connectionVersion((await state()).request));
 for(const op of [()=>service('trainer').accept(user('trainer'),'client',connectionVersion(oldPending)),
  ()=>service('trainer').finishPending(user('trainer'),'client',connectionVersion(oldPending),'rejected'),
  ()=>service('client').finishPending(user('client'),'client',connectionVersion(oldPending),'cancelled'),
  ()=>service('client').disconnect(user('client'),connectionVersion(oldAccepted))]){
  await assert.rejects(op,error=>error.code==='connection/stale');
 }
 assert.equal((await state()).request.generation,p.generation);assert.equal((await state()).profile.productOverrides.saved,true);
 await assertFails(updateDoc(doc(actor('client'),'trainerRequests','client'),{status:'cancelled',endedAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(actor('client'),'trainerRequests','client'),{status:'cancelled',endedAt:serverTimestamp(),revision:p.revision}));
});
test('A05 forbidden owner payload in atomic accept rejects every write',async()=>{
 const p=await start();const db=actor('trainer'),batch=writeBatch(db);
 batch.update(doc(db,'trainerRequests','client'),{status:'accepted',trainerId:'trainer',trainerName:'Тренер',acceptedAt:serverTimestamp(),revision:2});
 batch.update(doc(db,'users','client'),{trainerId:'trainer',trainerEmail:p.trainerEmail,users:{hacked:true}});
 batch.update(doc(db,'trainers','trainer'),new FieldPath('clients','client'),{name:p.clientName,email:p.clientEmail,addedAt:serverTimestamp(),status:'active',generation:1});
 await assertFails(batch.commit());assert.equal((await state()).request.status,'pending');
 assert.equal((await getDoc(doc(db,'trainers','trainer'))).data().clients.client,undefined);
});
test('A07 valid accepted proof with lost pointer must disconnect before reconnect',async()=>{
 const a=await connect();await admin(db=>updateDoc(doc(db,'users','client'),{trainerId:null,trainerEmail:null}));
 await assert.rejects(()=>service('client').clearLegacy(user('client')),e=>e.code==='connection/stale');
 await assert.rejects(()=>start('client',connectionVersion(a)),e=>e.code==='connection/stale');
 await service('client').disconnect(user('client'),connectionVersion(a));
 assert.equal((await state()).request.status,'disconnected');
});
test('A07 malformed canonical is preserved; only own legacy pointer may be cleared',async()=>{
 await admin(async db=>{await setDoc(doc(db,'trainerRequests','client'),{...accepted(),clientId:'someone-else'});await updateDoc(doc(db,'users','client'),{trainerId:'trainer'});});
 assert.equal((await state()).repair,true);
 await service('client').clearLegacy(user('client'));assert.equal((await state()).profile.trainerId,null);
 await assert.rejects(()=>start('client'),e=>e.code==='connection/repair-required');
 assert.equal((await state()).request.clientId,'someone-else');
 await assertFails(getDoc(doc(actor('trainer'),'users','client','mealHistory','2026-10-21')));
});
test('A07 legacy pending is removable only by parties and cannot be accepted',async()=>{
 await admin(db=>setDoc(doc(db,'trainerRequests','random'),pending()));
 await assertFails(deleteDoc(doc(actor('stranger'),'trainerRequests','random')));
 await assertFails(updateDoc(doc(actor('trainer'),'trainerRequests','random'),{status:'accepted',trainerId:'trainer',trainerName:'X',acceptedAt:serverTimestamp(),revision:2}));
 await service('trainer').deleteLegacyPending('random','client');
 await admin(db=>setDoc(doc(db,'trainerRequests','random2'),pending()));
 await service('client').deleteLegacyPending('random2','client');
});
test('A02 real pending listener gets requests and removes accepted items',async()=>{
 const db=actor('trainer','TRAINER@example.test');const events=[];let waitResolve;
 const wait=()=>new Promise((yes,no)=>{const timer=setTimeout(()=>no(Error('query listener timeout')),5000);waitResolve=()=>{clearTimeout(timer);yes();};});
 const off=onSnapshot(query(collection(db,'trainerRequests'),where('trainerEmail','==','trainer@example.test'),where('status','==','pending')),s=>{events.push(s.docs.map(d=>d.id));waitResolve?.();});
 try{await wait();let next=wait();const p=await start();await next;assert.deepEqual(events.at(-1),['client']);
  next=wait();await service('trainer').accept(user('trainer'),'client',connectionVersion(p));await next;assert.deepEqual(events.at(-1),[]);
 }finally{off();}
});
test('A06 live meal listener is denied after revocation and receives no later food',async()=>{
 const a=await connect(),w=watch(actor('trainer'),['users','client','mealHistory','2026-10-21']);
 try{await w.wait();assert.ok(w.events[0].data);const next=w.wait();
  await service('client').disconnect(user('client'),connectionVersion(a));
  await assertFails(getDoc(doc(actor('trainer'),'users','client','mealHistory','2026-10-21')));
  // The emulator reevaluates the listener on a target update; the UI separately observes the roster.
  await updateDoc(doc(actor('client'),'users','client','mealHistory','2026-10-21'),{afterRevoke:true,...writerStamp()});
  await next;assert.equal(w.events.at(-1).error,'permission-denied');
  const length=w.events.length;
  await new Promise(r=>setTimeout(r,100));assert.equal(w.events.length,length);
 }finally{w.off();}
});
test('A07 incomplete accepted proof cannot block legacy cleanup or authorize reads',async()=>{
 for(const field of ['revision','trainerId','acceptedAt','endedAt']){
  const data={...accepted()};delete data[field];
  if(field==='endedAt')data.status='disconnected';
  await admin(async db=>{await setDoc(doc(db,'trainerRequests','client'),data);await updateDoc(doc(db,'users','client'),{trainerId:'trainer'});});
  await assertFails(getDoc(doc(actor('trainer'),'users','client','mealHistory','2026-10-21')));
  await service('client').clearLegacy(user('client'));assert.equal((await state()).profile.trainerId,null);
 }
});
test('A02 missing email and wrong query constraints cannot enumerate requests',async()=>{
 await start();const db=env.authenticatedContext('trainer',{email_verified:true}).firestore();
 await assertFails(getDocs(query(collection(db,'trainerRequests'),where('trainerEmail','==','trainer@example.test'),where('status','==','pending'))));
 await assertFails(getDocs(query(collection(actor('trainer'),'trainerRequests'),where('trainerEmail','==','trainer@example.test'))));
});
test('A09 the owner-assignment assertion detects deliberately weakened isolated rules',async()=>{
 const original=await readFile('firestore.rules','utf8');
 const marker='allow update: if rootUpdateRoute(uid,resource.data,request.resource.data);';assert.equal(original.split(marker).length-1,1);
 const mutated=original.replace(marker,'allow update: if owner(uid) || rootUpdateRoute(uid,resource.data,request.resource.data);');
 const mutationEnv=await initializeTestEnvironment({projectId:'demo-scisense-mutation',firestore:{host:'127.0.0.1',port:8088,rules:mutated}});
 try {
  await mutationEnv.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'users','client'),{users:{}}));
  const db=mutationEnv.authenticatedContext('client').firestore();
  await assert.rejects(()=>assertFails(updateDoc(doc(db,'users','client'),{trainerId:'trainer',trainerEmail:'trainer@example.test'})),/Expected request to fail/);
 } finally {await mutationEnv.cleanup();}
});
test('A03 trainer cannot use a malformed display roster to lock the client into consent',async()=>{
 const a=await connect(),tdb=actor('trainer');
 for(const clients of [null,['client'],'client']){
  await assertFails(updateDoc(doc(tdb,'trainers','trainer'),{clients}));
 }
 // Administrative/legacy damage also must not prevent revocation.
 await admin(db=>updateDoc(doc(db,'trainers','trainer'),{clients:null}));
 await service('client').disconnect(user('client'),connectionVersion(a));
 assert.equal((await state()).request.status,'disconnected');
 await assertFails(getDoc(doc(tdb,'users','client','mealHistory','2026-10-21')));
});
test('A04 accepted cycles reserve a revision for revocation; exhausted imported proof is inert',async()=>{
 const max=2147483647;await admin(db=>setDoc(doc(db,'trainerRequests','client'),pending('client',1,max-1)));
 await assert.rejects(()=>service('trainer').accept(user('trainer'),'client',{generation:1,revision:max-1}),e=>e.code==='connection/repair-required');
 await service('client').finishPending(user('client'),'client',{generation:1,revision:max-1},'cancelled');
 await assert.rejects(()=>start('client',{generation:1,revision:max}),e=>e.code==='connection/repair-required');
 await admin(async db=>{await setDoc(doc(db,'trainerRequests','client'),{...accepted(),revision:max});await updateDoc(doc(db,'users','client'),{trainerId:'trainer'});});
 assert.equal((await state()).repair,true);
 await assertFails(getDoc(doc(actor('trainer'),'users','client','mealHistory','2026-10-21')));
 await service('client').clearLegacy(user('client'));assert.equal((await state()).profile.trainerId,null);
});
test('A07 a malformed canonical pending at an existing profile UID cannot be deleted as legacy',async()=>{
 await admin(db=>setDoc(doc(db,'trainerRequests','client'),{...pending(),clientId:'client2'}));
 for(const uid of ['client','client2','trainer'])await assertFails(deleteDoc(doc(actor(uid),'trainerRequests','client')));
 assert.equal((await state()).repair,true);
});
