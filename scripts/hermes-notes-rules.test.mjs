import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDocFromServer,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
let env;
const owner = "owner-notes",
  date = "2026-01-03",
  id = "submission-synthetic_item-synthetic",
  hash = "a".repeat(64),
  stamp = (v = 3) => ({ writerVersion: v, writerNonce: randomUUID() });
const note = () => ({
  noteId: id,
  itemId: "item-synthetic",
  name: "Синтетична страва",
  quantity: { value: null, unit: "unknown" },
  nutritionBasis: { value: 100, unit: "g" },
  knownNutrients: { p: null, f: 2, c: null, cal: 50 },
  provenance: { kind: "unknown" },
  originalText: "Страва",
  originDraft: "draft-synthetic",
  targetDate: date,
  meal: 1,
  state: "active",
  submissionId: "submission-synthetic",
  commandHash: hash,
  createdAt: "2026-01-03T10:00:00Z",
  ...stamp(),
});
const db = (uid = owner) =>
  env
    .authenticatedContext(uid, {
      email: uid + "@example.test",
      email_verified: true,
    })
    .firestore();
async function seed(path, data) {
  return env.withSecurityRulesDisabled((c) =>
    setDoc(doc(c.firestore(), ...path), data),
  );
}
before(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8088")
    throw Error("isolated_emulator_required");
  env = await initializeTestEnvironment({
    projectId: "demo-hermes-notes",
    firestore: {
      host: "127.0.0.1",
      port: 8088,
      rules: await readFile("firestore.rules", "utf8"),
    },
  });
});
after(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(["users", owner], { users: {}, trainerId: null, ...stamp() });
  await seed(["releaseCapabilities", owner], {
    notesEnabled: true,
    minimumWriterVersion: 3,
  });
});
function batch(database, n = note(), withDay = true) {
  const b = writeBatch(database);
  b.set(doc(database, "users", owner, "foodNotes", id), n);
  if (withDay)
    b.set(doc(database, "users", owner, "mealHistory", date), {
      meals: {},
      revision: 1,
      foodNotes: { [id]: { itemId: n.itemId, submissionId: n.submissionId } },
      submissionMarkers: { [n.submissionId]: hash },
      writerVersion: 3,
      writerNonce: n.writerNonce,
    });
  return b;
}
test("owner note and day marker together pass; note alone or invalid shape fails atomically", async () => {
  await assertFails(batch(db(), note(), false).commit());
  for (const patch of [
    { knownNutrients: { p: -1, f: null, c: null, cal: null } },
    { quantity: { value: null, unit: "kg" } },
    { owner: "other" },
    { name: "" },
    { state: "resolved" },
    { writerVersion: 2 },
  ]) {
    await assertFails(batch(db(), { ...note(), ...patch }).commit());
    assert.equal(
      (
        await getDocFromServer(doc(db(), "users", owner, "mealHistory", date))
      ).exists(),
      false,
    );
  }
  await assertSucceeds(batch(db()).commit());
});
test("capability cannot be self-enabled, notes off and old writer deny, other owners keep v2", async () => {
  await assertFails(
    setDoc(doc(db(), "releaseCapabilities", owner), {
      notesEnabled: true,
      minimumWriterVersion: 2,
    }),
  );
  await seed(["releaseCapabilities", owner], {
    notesEnabled: false,
    minimumWriterVersion: 2,
  });
  await assertFails(batch(db()).commit());
  await assertSucceeds(
    setDoc(doc(db(), "users", owner, "mealHistory", date), {
      meals: {},
      ...stamp(2),
    }),
  );
  await seed(["releaseCapabilities", owner], {
    notesEnabled: true,
    minimumWriterVersion: 3,
  });
  await assertFails(
    setDoc(doc(db(), "users", owner, "mealHistory", date), {
      meals: {},
      ...stamp(2),
    }),
  );
  await assertSucceeds(
    setDoc(doc(db("other"), "users", "other"), { users: {}, ...stamp(2) }),
  );
});
test("cross-owner denied; only consented trainer reads notes and cannot write", async () => {
  await batch(db()).commit();
  const path = ["users", owner, "foodNotes", id];
  await assertFails(getDocFromServer(doc(db("stranger"), ...path)));
  await assertFails(batch(db("stranger")).commit());
  const created = Timestamp.fromMillis(1000),
    accepted = Timestamp.fromMillis(2000);
  await seed(["trainerRequests", owner], {
    clientId: owner,
    clientEmail: owner + "@example.test",
    clientName: "Синтетичний",
    trainerId: "trainer",
    trainerEmail: "trainer@example.test",
    trainerName: "Тренер",
    status: "accepted",
    generation: 1,
    revision: 2,
    createdAt: created,
    acceptedAt: accepted,
  });
  await seed(["users", owner], {
    users: {},
    trainerId: "trainer",
    trainerEmail: "trainer@example.test",
    ...stamp(),
  });
  await assertSucceeds(getDocFromServer(doc(db("trainer"), ...path)));
  await assertFails(batch(db("trainer")).commit());
  await seed(["users", owner], { users: {}, trainerId: null, ...stamp() });
  await assertFails(getDocFromServer(doc(db("trainer"), ...path)));
});

test("new note cannot reuse a previous marker; a legacy unstamped day can be upgraded atomically", async () => {
  const n = note();
  await seed(["users", owner, "mealHistory", date], { meals: {}, revision: 1 });
  await assertSucceeds(batch(db(), n).commit());
  // A standalone note cannot exploit an earlier day nonce+marker even when the
  // owner intentionally copied both from that day.
  const later = {
    ...n,
    itemId: "another-synthetic",
    noteId: "submission-synthetic_another-synthetic",
  };
  await seed(["users", owner, "mealHistory", date], {
    meals: {},
    foodNotes: { [later.noteId]: { itemId: later.itemId } },
    submissionMarkers: { [n.submissionId]: hash },
    writerVersion: 3,
    writerNonce: n.writerNonce,
  });
  await assertFails(
    setDoc(doc(db(), "users", owner, "foodNotes", later.noteId), later),
  );
});
test("conversion without a complete new food item is denied atomically", async () => {
  await batch(db()).commit();
  const nonce = randomUUID(),
    submissionId = "resolve-synthetic";
  const tombstone = {
    noteId: id,
    itemId: "item-synthetic",
    targetDate: date,
    state: "resolved",
    submissionId,
    commandHash: hash,
    resolvedAt: "2026-01-03T11:00:00Z",
    mealKey: "1",
    group: "voice",
    itemIndex: 0,
    writerVersion: 3,
    writerNonce: nonce,
  };
  const database = db(),
    b = writeBatch(database);
  b.set(doc(database, "users", owner, "foodNotes", id), tombstone);
  b.set(doc(database, "users", owner, "mealHistory", date), {
    meals: { 1: { voice: [] } },
    foodNotes: {},
    submissionMarkers: { [submissionId]: hash },
    writerVersion: 3,
    writerNonce: nonce,
  });
  await assertFails(b.commit());
  assert.equal(
    (await getDocFromServer(doc(db(), "users", owner, "foodNotes", id))).data()
      .state,
    "active",
  );
});

test("terminal rejection is immutable and excludes late or stale writer success, across owners", async () => {
  const path = ["users", owner, "mealHistory", date],
    base = {
      meals: {},
      revision: 0,
      rejectedSubmissions: { "rejected-command": hash },
      ...stamp(),
    };
  await assertSucceeds(setDoc(doc(db(), ...path), base));
  for (const patch of [
    { rejectedSubmissions: {} },
    { rejectedSubmissions: { "rejected-command": "b".repeat(64) } },
    { submissionMarkers: { "rejected-command": hash } },
  ])
    await assertFails(
      setDoc(doc(db(), ...path), { ...base, ...patch, ...stamp() }),
    );
  await assertFails(
    setDoc(doc(db("stranger"), ...path), { ...base, ...stamp() }),
  );
  await assertSucceeds(
    setDoc(doc(db(), ...path), {
      ...base,
      submissionMarkers: { "different-command": hash },
      ...stamp(),
    }),
  );
  await assertFails(
    setDoc(doc(db(), ...path), { ...base, submissionMarkers: {}, ...stamp() }),
  );
});
test("concurrent terminal rejection and success cannot both survive", async () => {
  const path = ["users", owner, "mealHistory", date],
    database = db();
  const results = await Promise.allSettled([
    setDoc(doc(database, ...path), {
      meals: {},
      rejectedSubmissions: { "race-command": hash },
      ...stamp(),
    }),
    setDoc(doc(database, ...path), {
      meals: {},
      submissionMarkers: { "race-command": hash },
      ...stamp(),
    }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const saved = (await getDocFromServer(doc(database, ...path))).data();
  assert.notEqual(
    !!saved.rejectedSubmissions?.["race-command"],
    !!saved.submissionMarkers?.["race-command"],
  );
});


test("coach portion provenance and estimate reason persist; extra keys and counterfeit measure metadata deny",async()=>{
 const database=db();
 for (const provenance of [
   {kind:"estimate",estimateReason:"recipe_estimate",portionOrigin:{kind:"estimate",assumption:"Типова порція"}},
   {kind:"database",portionOrigin:{kind:"catalog_measure",assumption:"Міра джерела"}},
   {kind:"label",portionOrigin:{kind:"user",assumption:"Кількість користувача"}},
 ]) {
   await env.clearFirestore();
   await seed(["users",owner],{users:{},trainerId:null,...stamp()});
   await seed(["releaseCapabilities",owner],{notesEnabled:true,minimumWriterVersion:3});
   const n={...note(),provenance};
   await assertSucceeds(batch(database,n).commit());
   assert.deepEqual((await getDocFromServer(doc(database,"users",owner,"foodNotes",id))).data().provenance,provenance);
 }
 await env.clearFirestore();
 await seed(["users",owner],{users:{},trainerId:null,...stamp()});
 await seed(["releaseCapabilities",owner],{notesEnabled:true,minimumWriterVersion:3});
 for (const provenance of [
   {kind:"label",estimateReason:"recipe_estimate"},
   {kind:"estimate",estimateReason:"unapproved"},
   {kind:"estimate",portionOrigin:{kind:"invented",assumption:"x"}},
   {kind:"estimate",portionOrigin:{kind:"estimate",assumption:""}},
   {kind:"estimate",portionOrigin:{kind:"estimate",assumption:"x".repeat(401)}},
   {kind:"estimate",portionOrigin:{kind:"estimate",assumption:"x",extra:true}},
   {kind:"label",measureIndex:1},
   {kind:"estimate",secret:"forged"},
 ]) await assertFails(batch(database,{...note(),provenance}).commit());
 assert.equal((await getDocFromServer(doc(database,"users",owner,"mealHistory",date))).exists(),false);
});

test("review P2 mealHistory validates every changed source, including legacy-shaped rows, but preserves unchanged legacy data",async()=>{
 const database=db(), target=doc(database,"users",owner,"mealHistory",date);
 const complete={itemId:"source-valid-item",name:"Синтетична їжа",quantity:{value:180,unit:"g"},nutritionBasis:{value:100,unit:"g"},nutrients:{p:1,f:2,c:3,cal:60},estimated:true,
  source:{kind:"estimate",label:"Синтетична оцінка",recordId:"synthetic",dataset:"fixture",version:1,url:"https://example.test",assumptions:["Синтетичне припущення"],estimateReason:"recipe_estimate",portionOrigin:{kind:"estimate",assumption:"Приблизна маса"}}};
 const create=rows=>setDoc(target,{meals:{1:{voice:rows}},...stamp()});
 await assertFails(create([{...complete,source:{...complete.source,unexpected:true}}]));
 for(const source of [
  {...complete.source,kind:"invented"},
  {...complete.source,portionOrigin:{kind:"invented",assumption:"Оцінка"}},
  {...complete.source,portionOrigin:{kind:"estimate",assumption:"Оцінка",unexpected:true}},
 ]) await assertFails(create([{...complete,source}]));
 const noQuantity={...complete,source:{...complete.source,unexpected:true}};delete noQuantity.quantity;
 await assertFails(create([noQuantity]));
 await assertFails(setDoc(target,{meals:{1:{unknownGroup:[{...complete,source:{...complete.source,unexpected:true}}]}},...stamp()}));
 const legacy={name:"Старий запис",weight:50,p:1,f:2,c:3,calories:30};
 await assertSucceeds(create([legacy]));
 const before={...complete,source:{...complete.source,oldUnknownKey:"legacy"}};
 await seed(["users",owner,"mealHistory",date],{meals:{1:{voice:[before,legacy]}},revision:1,...stamp()});
 await assertSucceeds(setDoc(target,{meals:{1:{voice:[before,legacy,complete]}},revision:2,...stamp()}));
 await assertSucceeds(setDoc(target,{meals:{1:{voice:[before]}},revision:3,...stamp()}));
 await assertFails(setDoc(target,{meals:{1:{voice:[{...before,name:"Змінений старий запис"}]}},revision:4,...stamp()}));
});

test("review P2 maximum 20-item batch in one meal across four letters stays within rules expression budget",async(t)=>{
 const database=db(), target=doc(database,"users",owner,"mealHistory",date);
 const meals={1:{voice:[],а:[],з:[],б:[]},2:{},3:{},4:{}};
 const groups=['voice','а','з','б'];
 for(let index=0;index<20;index++) {
  const meal=1;
  meals[meal][groups[index%4]].push({itemId:`synthetic-batch-${index}`,name:"Синтетична їжа",quantity:{value:180,unit:"g"},nutritionBasis:{value:100,unit:"g"},nutrients:{p:1,f:2,c:3,cal:60},estimated:true,
   source:{kind:"estimate",label:"Синтетична оцінка",recordId:"synthetic",dataset:"fixture",version:1,url:"https://example.test",assumptions:["Синтетичне припущення"],estimateReason:"recipe_estimate",portionOrigin:{kind:"estimate",assumption:"Приблизна маса"}}});
 }
 await assertSucceeds(atomicDay(database,date,meals));
 t.diagnostic('four-group append20 PASS');
 const changed=structuredClone(meals);
 for(const group of groups)for(const item of changed[1][group])item.quantity.value=150;
 await assertSucceeds(atomicDay(database,date,changed));
 const malformed=structuredClone(changed);malformed[1].б[4].source.extra=true;
 await assertFails(atomicDay(database,date,malformed));
 for(const group of groups)changed[1][group].splice(0,5);
 await assertSucceeds(atomicDay(database,date,changed));
});


test("review P2 legacy v2 replace above twenty stays compatible and v3 appends twenty to a populated day",async()=>{
 const database=db(), target=doc(database,"users",owner,"mealHistory",date);
 await seed(["releaseCapabilities",owner],{notesEnabled:false,minimumWriterVersion:2});
 const old=Array.from({length:25},(_,i)=>({name:`Старий ${i}`,weight:50,p:1,f:2,c:3,calories:30}));
 await assertSucceeds(setDoc(target,{meals:{1:{voice:old}},...stamp(2)}));
 await seed(["releaseCapabilities",owner],{notesEnabled:true,minimumWriterVersion:3});
 const add=Array.from({length:20},(_,i)=>({itemId:`new-v3-item-${i}`,name:`Новий ${i}`,quantity:{value:180,unit:"g"},nutritionBasis:{value:100,unit:"g"},nutrients:{p:1,f:2,c:3,cal:60},source:{kind:"estimate",estimateReason:"recipe_estimate",portionOrigin:{kind:"estimate",assumption:"Орієнтовна порція"}}}));
 await assertSucceeds(atomicDay(database,date,{1:{voice:[...old,...add]}}));
 assert.equal((await getDocFromServer(target)).data().meals[1].voice.length,45);
 await assertFails(atomicDay(database,date,{1:{voice:[...old,...add,{...add[0],itemId:"forged-source",source:{kind:"label",unknownKey:"deny"}}]}}));
 await assertSucceeds(atomicDay(database,date,{1:{voice:old}}));
});

test("review P2 legacy exemption binds exact prior rows, own profile, atomic clear and cannot be replayed",async()=>{
 const database=db(), target=doc(database,"users",owner,"mealHistory",date), root=doc(database,"users",owner);
 const profileId="synthetic-old-profile", rows=Array.from({length:25},(_,i)=>({name:`Попередній ${i}`,weight:50,p:1,f:2,c:3,calories:30}));
 const meals={1:{voice:rows},2:{},3:{},4:{}};
 const initial={users:{[profileId]:{name:"Синтетичний",legacyMeals:meals,meals:{}}},trainerId:null,...stamp()};
 await seed(["users",owner],initial);
 await seed(["users","foreign-owner"],{users:{"foreign-owner":{legacyMeals:meals}},...stamp()});
 const migrate=(nextMeals=meals,marker=profileId,clear=true)=>{
  const nonce=stamp(), b=writeBatch(database);
  b.set(target,{meals:nextMeals,revision:1,legacyImportProfileId:marker,...nonce});
  b.set(root,{...initial,users:{[profileId]:{name:"Синтетичний",legacyMeals:clear?null:meals,legacyMealsDateKey:date,mealsDateKey:date,mealRevision:1,meals:nextMeals}},...nonce});
  return b;
 };
 await assertFails(migrate(meals,"foreign-owner").commit());
 await assertFails(migrate(meals,profileId,false).commit());
 const altered=structuredClone(meals);altered[1].voice[0].source={kind:"manual",unexpected:true};
 await assertFails(migrate(altered).commit());
 const extra=structuredClone(meals);extra[1].voice.push(structuredClone(rows[0]));
 await assertFails(migrate(extra).commit());
 await assertSucceeds(migrate().commit());
 assert.equal((await getDocFromServer(target)).data().meals[1].voice.length,25);
 await assertFails(setDoc(target,{meals:altered,legacyImportProfileId:profileId,...stamp()}));
 const later="2026-01-04", nonce=stamp(), b=writeBatch(database);
 b.set(doc(database,"users",owner,"mealHistory",later),{meals,revision:1,legacyImportProfileId:profileId,...nonce});
 b.set(root,{...initial,users:{[profileId]:{name:"Синтетичний",legacyMeals:null,legacyMealsDateKey:later,mealsDateKey:later,mealRevision:1,meals}},...nonce});
 await assertFails(b.commit());
});


test("review P2 twenty changed sources spread across all groups of a populated day fit the rule budget",async()=>{
 const database=db(),target=doc(database,"users",owner,"mealHistory",date);
 const groups=['voice','а','б','в','г','д','е','є','ж','з','и','і','ї','й'];
 const meals=Object.fromEntries([1,2,3,4].map(meal=>[meal,Object.fromEntries(groups.map(group=>[group,[{name:`Історичний ${meal}${group}`,weight:50,p:1,f:2,c:3,calories:30}]]))]));
 await seed(["users",owner,"mealHistory",date],{meals,...stamp()});
 const changed=structuredClone(meals);
 for(let i=0;i<20;i++)changed[1][groups[i%14]].push({itemId:`spread-new-${i}`,name:"Синтетична їжа",quantity:{value:180,unit:"g"},nutritionBasis:{value:100,unit:"g"},nutrients:{p:1,f:2,c:3,cal:60},source:{kind:"estimate",estimateReason:"recipe_estimate",portionOrigin:{kind:"estimate",assumption:"Орієнтовна порція"}}});
 await assertSucceeds(atomicDay(database,date,changed));
 const malformed=structuredClone(changed);malformed[1][groups[19%14]][1].source.portionOrigin.extra=true;
 await assertFails(atomicDay(database,date,malformed));
 await assertSucceeds(atomicDay(database,date,meals));
});


test("review P2 a new exact copy of a malformed historical source is not an unchanged record",async()=>{
 const database=db(),target=doc(database,"users",owner,"mealHistory",date);
 const old={itemId:"historical-invalid-source",name:"Попередній запис",quantity:{value:180,unit:"g"},nutritionBasis:{value:100,unit:"g"},nutrients:{p:1,f:2,c:3,cal:60},source:{kind:"label",unexpected:true}};
 const meals={1:{voice:[old]}};
 await seed(["users",owner,"mealHistory",date],{meals,...stamp()});
 await assertSucceeds(setDoc(target,{meals,...stamp()}));
 await assertFails(setDoc(target,{meals:{1:{voice:[old,structuredClone(old)]}},...stamp()}));
 assert.equal((await getDocFromServer(target)).data().meals[1].voice.length,1);
});

async function atomicDay(database,targetDate,meals,options={}) {
 const rootRef=doc(database,'users',owner),dayRef=doc(database,'users',owner,'mealHistory',targetDate);
 const root=(await getDocFromServer(rootRef)).data()||{},old=(await getDocFromServer(dayRef)).data()||{};
 const writer=stamp(),profileId=options.profileId||owner,revision=(old.revision||0)+1;
 const next={...old,meals,revision,...writer,...options.dayPatch};
 const projection={...(root.users?.[profileId]||{}),meals,mealsDateKey:targetDate,mealRevision:revision,...options.profilePatch};
 const nextRoot={...root,users:{...root.users,[profileId]:projection},...writer,...options.rootPatch};
 const b=writeBatch(database);
 if(!options.rootOnly)b.set(dayRef,next);
 if(!options.dayOnly)b.set(rootRef,nextRoot);
 return b.commit();
}
function completeBatchItem(index,kind='estimate') {
 return {itemId:`mirror-item-${index}`,name:`Синтетична їжа ${index}`,quantity:{value:180,unit:'g'},nutritionBasis:{value:100,unit:'g'},nutrients:{p:1,f:2,c:3,cal:60},estimated:true,
  source:{kind,label:`Синтетична оцінка ${index}`,recordId:`synthetic-${index}`,dataset:'fixture',version:1,url:'https://example.test',assumptions:[`Синтетичне припущення ${index}`],...(kind==='estimate'?{estimateReason:'recipe_estimate'}:{}),portionOrigin:{kind:'estimate',assumption:`Приблизна маса ${index}`}}};
}
test('mirror capacity: actual single-meal twenty across fourteen letters, with fifty-six historical rows',async(t)=>{
 const database=db(),groups=['voice','а','б','в','г','д','е','є','ж','з','и','і','ї','й'];
 const meals=Object.fromEntries([1,2,3,4].map(meal=>[meal,Object.fromEntries(groups.map(group=>[group,[{name:`Старий ${meal}${group}`,weight:50,p:1,f:2,c:3,calories:30}]]))]));
 await seed(['users',owner,'mealHistory',date],{meals,revision:1,...stamp()});
 const changed=structuredClone(meals);
 for(let i=0;i<20;i++)changed[1][groups[i%14]].push(completeBatchItem(i,i%2?'database':'estimate'));
 await assertSucceeds(atomicDay(database,date,changed));
 t.diagnostic('append20 PASS');
 assert.equal((await getDocFromServer(doc(database,'users',owner,'mealHistory',date))).data().revision,2);
 const update=structuredClone(changed);for(const g of groups)for(const item of update[1][g])if(item.itemId)item.quantity.value=150;
 await assertSucceeds(atomicDay(database,date,update));
 t.diagnostic('update20 PASS');
 const malformed=structuredClone(update);malformed[1][groups[19%14]][2].source.portionOrigin.extra=true;
 await assertFails(atomicDay(database,date,malformed));
 await assertSucceeds(atomicDay(database,date,meals));
});

test('mirror source validation covers every half, optional origins and mismatched atomic proofs',async()=>{
 const database=db(),rows=Array.from({length:20},(_,i)=>completeBatchItem(i,i%2?'database':'estimate')),meals={1:{voice:rows},2:{},3:{},4:{}};
 for(const options of [
  {dayOnly:true},{rootOnly:true},
  {rootPatch:{writerNonce:randomUUID()}},
  {profilePatch:{meals:{}}},{profilePatch:{mealsDateKey:'2026-01-04'}},
  {profilePatch:{mealRevision:99}},{dayPatch:{revision:99}},
  {rootPatch:{users:{unrelated:{name:'Інший'}}}},
 ]) await assertFails(atomicDay(database,date,meals,options));
 for(const index of [0,9,10,19]){
  const bad=structuredClone(meals);bad[1].voice[index].source.extra=true;
  await assertFails(atomicDay(database,date,bad));
 }
 await seed(['releaseCapabilities',owner],{notesEnabled:true,minimumWriterVersion:2});
 await assertFails(atomicDay(database,date,meals,{rootPatch:{writerVersion:2}}));
 await seed(['releaseCapabilities',owner],{notesEnabled:true,minimumWriterVersion:3});
 const noOrigin=structuredClone(meals);for(const item of noOrigin[1].voice)delete item.source.portionOrigin;
 await assertSucceeds(atomicDay(database,date,noOrigin));
 const mixed=structuredClone(noOrigin);mixed[1].voice[19].quantity.value=150;mixed[1].voice[0].source.portionOrigin={kind:'user',assumption:'Відома маса'};
 await assertSucceeds(atomicDay(database,date,mixed));
 const rootRef=doc(database,'users',owner),root=(await getDocFromServer(rootRef)).data();
 await assertSucceeds(setDoc(rootRef,{...root,users:{...root.users,[owner]:{...root.users[owner],name:'Новий підпис'}},...stamp()}));
 await assertFails(setDoc(rootRef,{...root,users:{...root.users,[owner]:{...root.users[owner],legacyMeals:{1:{voice:[{source:{kind:'forged'}}]}}}},...stamp()}));
});

test('mirror rejects prestaged projection with nonce-only or preference-only root and uses canonical day delta',async()=>{
 const database=db(),rows=Array.from({length:20},(_,i)=>completeBatchItem(i)),meals={1:{voice:rows},2:{},3:{},4:{}};
 const bad=structuredClone(meals);bad[1].voice[0].source.kind='forged';
 const root={users:{[owner]:{meals:bad,mealsDateKey:date,mealRevision:1,name:'Старий підпис'}},trainerId:null,...stamp()};
 await seed(['users',owner],root);
 for(const patch of [{},{name:'Новий підпис'}]){
  const nonce=stamp(),b=writeBatch(database);
  b.set(doc(database,'users',owner),{...root,users:{[owner]:{...root.users[owner],...patch}},...nonce});
  b.set(doc(database,'users',owner,'mealHistory',date),{meals:bad,revision:1,...nonce});
  await assertFails(b.commit());
 }
 await seed(['users',owner],{...root,users:{[owner]:{...root.users[owner],mealsDateKey:'2026-01-02'}}});
 await assertFails(atomicDay(database,date,bad));
});

test('legacy duplicate copies can be removed or edited once, but a new malformed copy is validated',async()=>{
 const database=db(),target=doc(database,'users',owner,'mealHistory',date);
 const x=completeBatchItem(1),y=completeBatchItem(2),old={1:{voice:[x,structuredClone(x),y]}};
 await seed(['users',owner,'mealHistory',date],{meals:old,revision:1,...stamp()});
 await assertSucceeds(atomicDay(database,date,{1:{voice:[x,y]}}));
 await seed(['users',owner,'mealHistory',date],{meals:old,revision:3,...stamp()});
 await assertSucceeds(atomicDay(database,date,{1:{voice:[x,{...x,quantity:{value:150,unit:'g'}},y]}}));
 const invalid={...x,source:{kind:'label',unexpected:true}};
 await seed(['users',owner,'mealHistory',date],{meals:{1:{voice:[invalid,y]}},revision:5,...stamp()});
 await assertFails(atomicDay(database,date,{1:{voice:[invalid,structuredClone(invalid),y]}}));
});

test('legacy merge preserves multiplicity exactly and blocks an extra identical imported row',async()=>{
 const database=db(),profileId='legacy-merge-profile';
 const x={name:'X',weight:50,p:1,f:2,c:3,calories:30,source:{kind:'label',unexpected:true}},y={name:'Y',weight:60,p:2,f:1,c:4,calories:35};
 const legacy={1:{voice:[x,y]},2:{},3:{},4:{}},old={1:{voice:[x]},2:{},3:{},4:{}};
 await seed(['users',owner],{users:{[profileId]:{legacyMeals:legacy,meals:{}}},trainerId:null,...stamp()});
 await seed(['users',owner,'mealHistory',date],{meals:old,revision:1,...stamp()});
 const options={profileId,profilePatch:{legacyMeals:null,legacyMealsDateKey:date},dayPatch:{legacyImportProfileId:profileId}};
 await assertFails(atomicDay(database,date,{...old,1:{voice:[x,x,x,y]}},options));
 await assertFails(atomicDay(database,date,legacy,options));
 await assertSucceeds(atomicDay(database,date,{...old,1:{voice:[x,x,y]}},options));
 await assertSucceeds(atomicDay(database,date,{...old,1:{voice:[x,y]}},{profileId}));
 await assertFails(atomicDay(database,date,{...old,1:{voice:[x,x,y]}},{profileId}));
});

test('mixed duplicate redistribution cannot hide a newly copied malformed source',async()=>{
 const database=db(),a={name:'A',weight:1,p:1,f:1,c:1,calories:10},b={...completeBatchItem(2),source:{kind:'label',unexpected:true}},c={name:'C',weight:3,p:1,f:1,c:1,calories:10};
 await seed(['users',owner,'mealHistory',date],{meals:{1:{voice:[a,a,b,c]}},revision:1,...stamp()});
 await assertFails(atomicDay(database,date,{1:{voice:[a,b,b]}}));
});

test('v3 changed source reason values and oversized historical group cannot escape validation',async()=>{
 const database=db(),target=doc(database,'users',owner,'mealHistory',date),item=completeBatchItem(0);
 for(const source of [
  {...item.source,kind:'label',estimateReason:'recipe_estimate'},
  {...item.source,estimateReason:'none'},{...item.source,estimateReason:'_missing_'},
  {...item.source,estimateReason:''},{...item.source,estimateReason:null},{...item.source,estimateReason:7},
 ])await assertFails(setDoc(target,{meals:{1:{voice:[{...item,source}]}},...stamp()}));
 const groups=['voice','а','б','в','г','д','е','є','ж','з','и','і','ї','й'];
 const old={1:Object.fromEntries([...groups,'0-legacy'].map(group=>[group,[]]))};
 await seed(['users',owner,'mealHistory',date],{meals:old,...stamp()});
 await assertSucceeds(setDoc(target,{meals:old,...stamp()}));
 const changed=structuredClone(old);changed[1].й.push({...item,source:{kind:'forged'}});
 await assertFails(setDoc(target,{meals:changed,...stamp()}));
});

test('large mirror inherits root minimum writer, nonce format and both nonce freshness checks',async()=>{
 const database=db(),rows=Array.from({length:20},(_,i)=>completeBatchItem(i)),meals={1:{voice:rows},2:{},3:{},4:{}};
 const rootNonce=randomUUID(),dayNonce=randomUUID();
 await seed(['users',owner],{users:{[owner]:{meals:{},mealsDateKey:date,mealRevision:1}},writerVersion:3,writerNonce:rootNonce});
 await seed(['users',owner,'mealHistory',date],{meals:{},revision:1,writerVersion:3,writerNonce:dayNonce});
 for(const nonce of ['bad-nonce',rootNonce,dayNonce])await assertFails(atomicDay(database,date,meals,{dayPatch:{writerNonce:nonce},rootPatch:{writerNonce:nonce}}));
 await assertFails(atomicDay(database,date,meals,{dayPatch:{writerVersion:3.5}}));
 await seed(['releaseCapabilities',owner],{notesEnabled:true,minimumWriterVersion:4});
 await assertFails(atomicDay(database,date,meals));
 await seed(['releaseCapabilities',owner],{notesEnabled:true,minimumWriterVersion:3});
 await assertSucceeds(atomicDay(database,date,meals));
});

test('small day-only writes still validate all ten rows and enforce nonce freshness',async()=>{
 const database=db(),target=doc(database,'users',owner,'mealHistory',date),rows=Array.from({length:10},(_,i)=>completeBatchItem(i));
 const first=stamp();await assertSucceeds(setDoc(target,{meals:{1:{voice:rows}},...first}));
 await assertFails(setDoc(target,{meals:{1:{voice:[]}},...first}));
 for(const index of [0,8,9]){const next=structuredClone(rows);next[index].source.extra=true;await assertFails(setDoc(target,{meals:{1:{voice:next}},...stamp()}));}
});

test('twenty-item sparse capacity matrix covers one to fourteen groups and all four meals',async(t)=>{
 const database=db(),groups=['voice','а','б','в','г','д','е','є','ж','з','и','і','ї','й'];let serial=0;
 for(const count of [1,2,3,4,5,7,13,14])for(const selected of [1,2,3,4]){
  const targetDate=new Date(Date.UTC(2026,1,++serial)).toISOString().slice(0,10),subset=groups.filter((_,i)=>i<count).reverse();
  const meals=Object.fromEntries([1,2,3,4].map(meal=>[meal,Object.fromEntries((meal===selected?subset:groups).map(g=>[g,[]]))]));
  for(let meal=1;meal<=4;meal++)for(let i=0;i<14;i++)meals[meal][(meal===selected?subset:groups)[i%(meal===selected?count:14)]].push({name:`Історичний ${meal}-${i}`,weight:50,p:1,f:2,c:3,calories:30});
  await seed(['users',owner,'mealHistory',targetDate],{meals,revision:1,...stamp()});
  const next=structuredClone(meals);for(let i=0;i<20;i++)next[selected][subset[i%count]].push(completeBatchItem(i,i%2?'database':'estimate'));
  await assertSucceeds(atomicDay(database,targetDate,next));
  const edited=structuredClone(next);for(const g of subset)for(const row of edited[selected][g])if(row.itemId)row.quantity.value=140;
  await assertSucceeds(atomicDay(database,targetDate,edited));
  await assertSucceeds(atomicDay(database,targetDate,meals));
  t.diagnostic(`sparse ${count}, meal ${selected}: append20/update20/delete20 PASS`);
 }
});

test('all twenty source positions remain guarded, including optional and source-less tail controls',async()=>{
 const database=db(),rows=Array.from({length:20},(_,i)=>completeBatchItem(i)),meals={1:{voice:rows},2:{},3:{},4:{}};
 for(let index=0;index<20;index++){
  const bad=structuredClone(meals);bad[1].voice[index].source.portionOrigin.extra=true;
  await assertFails(atomicDay(database,date,bad));
 }
 const mixed=structuredClone(meals);delete mixed[1].voice[18].source.portionOrigin;
 mixed[1].voice[19]={name:'Старий формат',weight:100,p:1,f:2,c:3,calories:40};
 await assertSucceeds(atomicDay(database,date,mixed));
});

test('twenty-five legacy duplicates support late deletion and single quantity edit without clone exemption',async()=>{
 const database=db(),target=doc(database,'users',owner,'mealHistory',date),rows=Array.from({length:25},(_,i)=>({name:`Старий ${i}`,weight:50,p:1,f:2,c:3,calories:30}));
 rows[24]=structuredClone(rows[23]);const meals={1:{voice:rows}};
 await seed(['users',owner,'mealHistory',date],{meals,revision:1,...stamp()});
 const removed=structuredClone(meals);removed[1].voice.pop();await assertSucceeds(atomicDay(database,date,removed));
 await seed(['users',owner,'mealHistory',date],{meals,revision:3,...stamp()});
 const edited=structuredClone(meals);edited[1].voice[24].weight=60;await assertSucceeds(atomicDay(database,date,edited));
 assert.equal((await getDocFromServer(target)).data().meals[1].voice[24].weight,60);
});

test('an ordinary one-row cross-meal move keeps both meals and sources valid',async()=>{
 const database=db(),item=completeBatchItem(1),meals={1:{а:[item]},2:{},3:{},4:{}};
 await seed(['users',owner,'mealHistory',date],{meals,revision:1,...stamp()});
 const moved={1:{а:[]},2:{},3:{},4:{а:[item]}};
 await assertSucceeds(atomicDay(database,date,moved));
 const wrong=structuredClone(moved);wrong[4].а[0].source.extra=true;await assertFails(atomicDay(database,date,wrong));
});
