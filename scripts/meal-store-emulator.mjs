import {buildPlanCatalog,planFingerprint} from '../src/services/planCatalog.js';
import {assignPlanItems,persistedPlanItem,allocationPercent} from '../src/services/planAllocation.js';
import assert from 'node:assert/strict';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {signInAnonymously,signOut} from 'firebase/auth';
import {doc,setDoc,getDocFromServer,terminate} from 'firebase/firestore';
import {writerStamp} from '../src/services/writerFence.js';
import {auth,db} from '../src/firebase.js';
import {commitMealDay,loadMealDay,saveProfileSettings,commandHash,readSubmission} from '../src/services/mealStore.js';
import {commitMealDay as previousCommit} from '../tmp/old-writer/mealStore.js';
const user=(await signInAnonymously(auth)).user,uid=user.uid,date='2026-10-20';
const fixtures=await initializeTestEnvironment({projectId:'demo-scisense',firestore:{host:'127.0.0.1',port:8088}});
const legacySeed=(segments,data)=>fixtures.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),...segments),data));
const item=id=>({itemId:id,name:'Тестовий кефір',quantity:{value:200,unit:'g'},nutritionBasis:{value:100,unit:'g'},nutrients:{p:2.9,f:2.5,c:4,cal:53},source:{kind:'label'},estimated:false});
const append=id=>({type:'append',submissionId:id,meal:1,items:[item(id)],updatedAt:new Date().toISOString()});
try {
 console.log('phase: bootstrap');
 await setDoc(doc(db,'users',uid),{...writerStamp(),users:{[uid]:{name:'Синтетичний користувач',meals:{1:{},2:{},3:{},4:{}}}}});
 const empty=await loadMealDay(uid,uid,date);assert.deepEqual(empty.meals[1],{});
 console.log('phase: concurrent-append');
 const first=append('one');await Promise.all([commitMealDay(uid,uid,date,first),commitMealDay(uid,uid,date,first)]);
 let day=await loadMealDay(uid,uid,date);assert.equal(day.meals[1].voice.length,1);assert.equal(day.totalMacros.cal,106);
 console.log('phase: distinct-concurrent-appends');
 await Promise.all([commitMealDay(uid,uid,date,append('two')),commitMealDay(uid,uid,date,append('three'))]);
 day=await loadMealDay(uid,uid,date);assert.equal(day.meals[1].voice.length,3);assert.equal(day.revision,3);assert.deepEqual(Object.keys(day.submissionMarkers).sort(),['one','three','two']);
 await assert.rejects(()=>commitMealDay(uid,uid,date,{type:'replace',submissionId:'stale',expectedRevision:0,meals:empty.meals,updatedAt:'x'}),/revision_conflict/);
 console.log('phase: profile-settings');
 await saveProfileSettings(uid,uid,{name:'Змінене ім’я',meals:empty.meals});
 const root=(await getDocFromServer(doc(db,'users',uid))).data();assert.equal(root.users[uid].meals[1].voice.length,3);assert.equal(root.users[uid].mealsDateKey,date);
 const marker=await readSubmission(uid,date,'one',await commandHash(first));assert.equal(marker.revision,3);
 console.log('phase: nonce-fences');
 const fenceBefore=(await getDocFromServer(doc(db,'users',uid,'mealHistory',date))).data();
 await commitMealDay(uid,uid,date,first);
 assert.deepEqual((await getDocFromServer(doc(db,'users',uid,'mealHistory',date))).data(),fenceBefore);
 await assert.rejects(()=>commitMealDay(uid,uid,date,{...first,items:[item('changed')]}),/submission_conflict/);
 await assert.rejects(()=>setDoc(doc(db,'users',uid),{users:{[uid]:{meals:empty.meals}}},{merge:true}),e=>e.code==='permission-denied');
 await assert.rejects(()=>setDoc(doc(db,'users',uid,'mealHistory',date),{meals:empty.meals}),e=>e.code==='permission-denied');
 assert.deepEqual((await getDocFromServer(doc(db,'users',uid,'mealHistory',date))).data(),fenceBefore);

 console.log('phase: quantity-edit');
 assert.deepEqual((await loadMealDay(uid,uid,'2026-10-21')).meals[1],{});
 await commitMealDay(uid,uid,date,{type:'quantity',meal:1,letter:'voice',index:0,value:250,expectedRevision:3,submissionId:'edit',updatedAt:'x'});
 day=await loadMealDay(uid,uid,date);assert.equal(day.totalMacros.cal,345);assert.equal(Object.keys(day.submissionMarkers).length,4);
 console.log('phase: legacy-source');
 const legacy={1:{a:[{name:'Старий',weight:100,p:1,f:1,c:1,calories:17}]},2:{},3:{},4:{}};
 await legacySeed(['users',uid],{users:{[uid]:{name:'Старий',meals:legacy}}});
 await assert.rejects(()=>commitMealDay(uid,uid,'2026-10-22',append('blocked')),/legacy_date_required/);
 assert.deepEqual((await loadMealDay(uid,uid,'2026-10-22')).legacy,legacy);
 console.log('phase: legacy-import');
 const migration={type:'replace',meals:legacy,confirmLegacy:true,expectedRevision:0,submissionId:'legacy',updatedAt:'x'};
 await commitMealDay(uid,uid,'2026-10-22',migration);await commitMealDay(uid,uid,'2026-10-22',migration);
 assert.equal((await loadMealDay(uid,uid,'2026-10-22')).totalMacros.cal,17);
 console.log('phase: next-day-projection');
 // Projection must replace the old nested map, even when the next day has another group.
 await commitMealDay(uid,uid,'2026-10-23',{...append('day-two'),letter:'б'});
 const nextRoot=(await getDocFromServer(doc(db,'users',uid))).data();
 assert.deepEqual(Object.keys(nextRoot.users[uid].meals[1]),['б']);
 await saveProfileSettings(uid,uid,{portions:{test:250}});await saveProfileSettings(uid,uid,{name:'Ще одне ім’я'});
 assert.deepEqual((await getDocFromServer(doc(db,'users',uid))).data().users[uid].portions,{test:250});
 await legacySeed(['users',uid],{users:{[uid]:{name:'Старий',meals:legacy}}});
 console.log('phase: existing-legacy-metadata');
 await legacySeed(['users',uid,'mealHistory','2026-10-24'],{meals:legacy,currentWeight:65,programDay:3});
 await commitMealDay(uid,uid,'2026-10-24',{...migration,submissionId:'existing-legacy'});
 await commitMealDay(uid,uid,'2026-10-24',{type:'metadata',metadata:{activity:'Ходьба'},submissionId:'activity',updatedAt:'x'});
 const upgraded=(await getDocFromServer(doc(db,'users',uid,'mealHistory','2026-10-24'))).data();assert.equal(upgraded.writerVersion,3);assert.ok(upgraded.writerNonce);
 const history=await loadMealDay(uid,uid,'2026-10-24');assert.equal(history.totalMacros.cal,17);assert.equal(history.currentWeight,65);assert.equal(history.programDay,3);
 console.log('phase: parallel-settings');
 await Promise.all([saveProfileSettings(uid,uid,{name:'Паралельні налаштування'}),commitMealDay(uid,uid,'2026-10-25',append('parallel'))]);
 const finalRoot=(await getDocFromServer(doc(db,'users',uid))).data();
 assert.equal(finalRoot.users[uid].name,'Паралельні налаштування');assert.equal(finalRoot.users[uid].meals[1].voice.length,1);
 assert.equal(finalRoot.writerVersion,3);assert.match(finalRoot.writerNonce,/^[a-f0-9-]{36}$/);
 console.log('phase: previous-writer-compatibility');
 // Старий фактичний writer зберігає additive allocation і масштабує кеш.
 const allocated={...item('compat'),quantity:{value:200,unit:'ml'},nutritionBasis:{value:100,unit:'ml'},portion:206/270*100,
  planAllocation:{version:1,status:'allocated',letter:'б',referenceKey:'standard:dairy:3:б',referenceName:'кефір 1%',basis:{value:270,unit:'g',state:'as_sold'},conversion:{baseQuantity:{value:200,unit:'ml'},baseMassGrams:206,factor:1},normSource:'catalog',assignment:'manual'}};
 await commitMealDay(uid,uid,'2026-10-26',{...append('compat'),letter:'б',items:[allocated]});
 await previousCommit(uid,uid,'2026-10-26',{type:'quantity',meal:1,letter:'б',index:0,value:300,submissionId:'old-edit',updatedAt:'x',expectedRevision:1});
 const edited=(await loadMealDay(uid,uid,'2026-10-26')).meals[1].б[0];
 assert.equal(edited.quantity.value,300);assert.ok(Math.abs(edited.portion-309/270*100)<1e-6);
 assert.deepEqual(edited.planAllocation,allocated.planAllocation);
 await commitMealDay(uid,uid,'2026-10-26',append('new-after-old'));
 assert.deepEqual((await loadMealDay(uid,uid,'2026-10-26')).meals[1].б[0],edited);
 console.log('phase: allocated-parallel-writes');
 // Новий пакет: різні літери, unknown, паралельні metadata й append, свіжий fingerprint.
 const planRoot=(await getDocFromServer(doc(db,'users',uid))).data();
 const catalog=buildPlanCatalog({profile:planRoot.users[uid],globalCustomProducts:planRoot.globalCustomProducts,productOverrides:planRoot.productOverrides});
 const fingerprint=await planFingerprint(catalog);
 const [freeItem]=assignPlanItems([{...item('free-contract'),planChoice:{letter:'в',assignment:'manual'}}],catalog,{});
 for(const change of [{basis:{value:1,unit:'kcal',state:'energy'}},{normSource:'profile'},{referenceName:'Хибна норма'}]) {
  const bad={...freeItem,planAllocation:{...freeItem.planAllocation,...change}};
  if(change.basis)bad.portion=freeItem.portion*575;
  await assert.rejects(commitMealDay(uid,uid,'2026-10-29',{type:'appendAllocated',submissionId:'bad-free',meal:1,items:[bad],planFingerprint:fingerprint,updatedAt:'x'}),/invalid_allocation/);
 }
 assert.equal((await loadMealDay(uid,uid,'2026-10-29')).revision,0);

 const inputs=[{...item('fruit'),name:'Яблуко',planMatch:{referenceId:'fruits:fruit',consumedState:'as_sold',certainty:'matched'}},{...item('dairy'),name:'кефір 1%',planMatch:{referenceId:'dairy:kefir',consumedState:'as_sold',certainty:'matched'}},item('unknown')];
 const packageCommand={type:'appendAllocated',submissionId:'allocated',meal:2,items:assignPlanItems(inputs,catalog,{}).map(persistedPlanItem),planFingerprint:fingerprint,updatedAt:'x'};
 await Promise.all([commitMealDay(uid,uid,'2026-10-27',packageCommand),commitMealDay(uid,uid,'2026-10-27',{type:'metadata',submissionId:'meta',metadata:{activity:'Синтетична активність'},updatedAt:'x'}),commitMealDay(uid,uid,'2026-10-27',append('parallel-new'))]);
 let allocatedDay=await loadMealDay(uid,uid,'2026-10-27');assert.equal(allocatedDay.revision,3);assert.equal(allocatedDay.meals[2].з.length,1);assert.equal(allocatedDay.meals[2].б.length,1);assert.equal(allocatedDay.meals[2].voice.length,1);assert.equal(allocatedDay.activity,'Синтетична активність');
 assert.equal(allocationPercent(allocatedDay.meals[2].з[0]),50);
 await saveProfileSettings(uid,uid,{portions:{'фрукти та ягоди':800}});
 await commitMealDay(uid,uid,'2026-10-27',packageCommand); // Маркер має пріоритет над новим планом.
 await assert.rejects(()=>commitMealDay(uid,uid,'2026-10-27',{...packageCommand,submissionId:'stale-plan'}),/plan_conflict/);
 allocatedDay=await loadMealDay(uid,uid,'2026-10-27');assert.equal(allocatedDay.revision,3);assert.equal(allocationPercent(allocatedDay.meals[2].з[0]),50);
 await previousCommit(uid,uid,'2026-10-27',{type:'quantity',submissionId:'old-fruit-edit',expectedRevision:3,meal:2,letter:'з',index:0,value:300,updatedAt:'x'});
 assert.equal(allocationPercent((await loadMealDay(uid,uid,'2026-10-27')).meals[2].з[0]),75);
 await assert.rejects(()=>commitMealDay(uid,uid,'2026-10-27',{...packageCommand,items:[item('different')]}),/submission_conflict/);
 console.log(JSON.stringify({passed:true,checks:47,oldWriter:previousCommit.name,syntheticOnly:true}));
} finally {await fixtures.cleanup();await signOut(auth);await terminate(db);}
