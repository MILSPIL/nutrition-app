import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';
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
 await assertSucceeds(updateDoc(ref,{users:{client:{name:'Нове ім’я'}},writerVersion:2}));
 await assertFails(updateDoc(ref,{unexpectedProtocol:true}));
});
test('A07 legacy pointer can be cleared without reading missing trainer directory',async()=>{
 await admin(db=>updateDoc(doc(db,'users','client'),{trainerId:'missing',trainerEmail:'gone@example.test'}));
 await assertSucceeds(updateDoc(doc(actor('client'),'users','client'),{trainerId:null,trainerEmail:null}));
 assert.equal((await getDoc(doc(actor('client'),'users','client'))).data().users.client.name,'Синтетичний клієнт');
});
