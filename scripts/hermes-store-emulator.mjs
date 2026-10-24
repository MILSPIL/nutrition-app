import assert from "node:assert/strict";
import { createFoodResolver } from "../server/trainer/food-resolver.mjs";
import { patchDraft, commandFromDraft } from "../server/trainer/drafts.mjs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { signInAnonymously, signOut } from "firebase/auth";
import { doc, setDoc, getDocFromServer, terminate } from "firebase/firestore";
import { auth, db } from "../src/firebase.js";
import { writerStamp } from "../src/services/writerFence.js";
import {
  commitMealDay,
  loadMealDay,
  commandHash,
  readSubmission,
} from "../src/services/mealStore.js";
import { commitMealDay as oldCommit } from "../tmp/hermes-old-writer/mealStore.js";
import {
  buildPlanCatalog,
  planFingerprint,
} from "../src/services/planCatalog.js";
if (
  process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8088" ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099"
)
  throw Error("isolated_emulator_required");
const env = await initializeTestEnvironment({
    projectId: "demo-scisense",
    firestore: { host: "127.0.0.1", port: 8088 },
  }),
  uid = (await signInAnonymously(auth)).user.uid,
  date = "2026-01-03";
const item = (id) => ({
  itemId: id,
  name: "Синтетичний кефір",
  quantity: { value: 200, unit: "g" },
  nutritionBasis: { value: 100, unit: "g" },
  nutrients: { p: 3, f: 2.5, c: 4, cal: 51 },
  source: { kind: "label" },
  estimated: false,
  planAllocation: { version: 1, status: "unallocated", assignment: "auto" },
});
const note = (id) => ({
  itemId: id,
  name: "Синтетична страва",
  quantity: { value: null, unit: "portion" },
  knownNutrients: { p: null, f: 2, c: null, cal: 50 },
  nutritionBasis: { value: 100, unit: "g" },
  provenance: { kind: "unknown" },
  originalText: "Невідома страва",
  originDraft: "draft-synthetic",
});
const cap = async (value, owner = uid) =>
  env.withSecurityRulesDisabled((c) =>
    setDoc(doc(c.firestore(), "releaseCapabilities", owner), value),
  );
try {
  await setDoc(doc(db, "users", uid), {
    ...writerStamp(),
    users: {
      [uid]: { name: "Синтетичний", meals: { 1: {}, 2: {}, 3: {}, 4: {} } },
    },
  });
  const append = {
    type: "append",
    submissionId: "old-synthetic-001",
    meal: 1,
    items: [item("old-food-001")],
    updatedAt: "x",
  };
  console.log("phase: old-writer");
  await oldCommit(uid, uid, date, append); // Actual frozen v2 path during phase 1.
  assert.equal(
    (await getDocFromServer(doc(db, "users", uid, "mealHistory", date))).data()
      .writerVersion,
    2,
  );
  const fingerprint = await planFingerprint(buildPlanCatalog());
  const mixed = {
    type: "saveTrainerDraft",
    targetDate: date,
    meal: 2,
    submissionId: "mixed-synthetic-001",
    items: [item("new-food-001")],
    notes: [note("note-food-001")],
    planFingerprint: fingerprint,
    updatedAt: "2026-01-03T10:00:00Z",
  };
  await assert.rejects(commitMealDay(uid, uid, date, mixed), /notes_disabled/);
  assert.equal((await loadMealDay(uid, uid, date)).revision, 1);
  console.log("phase: capability");
  await cap({ notesEnabled: true, minimumWriterVersion: 3 });
  console.log("phase: mixed");
  await Promise.all([
    commitMealDay(uid, uid, date, mixed),
    commitMealDay(uid, uid, date, mixed),
  ]);
  let day = await loadMealDay(uid, uid, date);
  assert.equal(day.notes.length, 1);
  assert.equal(day.incomplete, true);
  assert.equal(day.totalMacros.cal, 204);
  assert.equal(day.revision, 2);
  const before = day;
  await assert.rejects(
    oldCommit(uid, uid, date, {
      ...append,
      submissionId: "old-blocked-001",
      items: [item("old-blocked-item")],
    }),
    (e) => e.code === "permission-denied",
  );
  assert.equal((await loadMealDay(uid, uid, date)).revision, before.revision);
  const marker = await readSubmission(
    uid,
    date,
    mixed.submissionId,
    await commandHash(mixed),
  );
  assert.equal(marker.revision, 2);
  await assert.rejects(
    commitMealDay(uid, uid, date, {
      ...mixed,
      notes: [note("different-item")],
    }),
    /submission_conflict/,
  );
  const bad = {
    ...mixed,
    submissionId: "invalid-note-001",
    items: [item("invalid-item-001")],
    notes: [
      {
        ...note("invalid-note-item"),
        knownNutrients: { p: -1, f: null, c: null, cal: null },
      },
    ],
  };
  await assert.rejects(commitMealDay(uid, uid, date, bad));
  assert.equal((await loadMealDay(uid, uid, date)).revision, 2);
  const notesOnly = {
    ...mixed,
    submissionId: "notes-only-001",
    items: [],
    notes: Array.from({ length: 20 }, (_, i) => note("many-notes-" + i)),
  };
  console.log("phase: twenty-notes");
  await commitMealDay(uid, uid, date, notesOnly);
  day = await loadMealDay(uid, uid, date);
  assert.equal(day.notes.length, 21);
  assert.equal(day.totalMacros.cal, 204);
  assert.equal(day.revision, 3);
  const first = day.notes.find((n) => n.itemId === "note-food-001");
  const convert = {
    type: "resolveFoodNote",
    targetDate: date,
    meal: 3,
    submissionId: "resolve-note-001",
    noteId: first.noteId,
    items: [item(first.itemId)],
    planFingerprint: fingerprint,
    updatedAt: "2026-01-03T11:00:00Z",
  };
  console.log("phase: convert");
  await Promise.all([
    commitMealDay(uid, uid, date, convert),
    commitMealDay(uid, uid, date, convert),
  ]);
  day = await loadMealDay(uid, uid, date);
  assert.equal(day.notes.length, 20);
  assert.equal(day.totalMacros.cal, 306);
  assert.equal(day.revision, 4);
  const tombstone = (
    await getDocFromServer(doc(db, "users", uid, "foodNotes", first.noteId))
  ).data();
  assert.equal(tombstone.state, "resolved");
  assert.equal(tombstone.name, undefined);
  await assert.rejects(
    commitMealDay(uid, uid, date, {
      ...convert,
      submissionId: "duplicate-convert",
    }),
    /note_conflict/,
  );
  await assert.rejects(
    commitMealDay(uid, uid, "2026-01-04", mixed),
    /invalid_target/,
  );
  console.log("phase: terminal-rejection");
  const rejected = {
    ...mixed,
    submissionId: "rejected-plan-001",
    notes: [],
    items: [item("rejected-item-001")],
    planFingerprint: "stale-plan",
  };
  await Promise.all(
    [1, 2].map(() =>
      assert.rejects(commitMealDay(uid, uid, date, rejected), /plan_conflict/),
    ),
  );
  const rejectedHash = await commandHash(rejected),
    rejectedDay = await loadMealDay(uid, uid, date);
  assert.equal(
    rejectedDay.rejectedSubmissions[rejected.submissionId],
    rejectedHash,
  );
  assert.equal(rejectedDay.submissionMarkers[rejected.submissionId], undefined);
  assert.equal(rejectedDay.revision, 4);
  await assert.rejects(
    commitMealDay(uid, uid, date, rejected),
    /plan_conflict/,
  );
  await assert.rejects(
    commitMealDay(uid, uid, date, {
      ...rejected,
      planFingerprint: fingerprint,
    }),
    /submission_conflict/,
  );
  await commitMealDay(uid, uid, date, {
    ...rejected,
    submissionId: "reprepared-plan-001",
    planFingerprint: fingerprint,
  });
  assert.equal((await loadMealDay(uid, uid, date)).totalMacros.cal, 408);
  console.log("phase: coach-provenance-roundtrip");
  const r = createFoodResolver({index:{lookup:()=>[]},photos:[{ref:"synthetic-label",itemId:"coach-partial-label"}]});
  const rawPortion = {
    itemId:"coach-portion-estimate",name:"Синтетична домашня страва",preparation:"cooked",
    quantity:{value:180,unit:"g"},source:{kind:"estimate",estimateReason:"recipe_estimate",
      portionOrigin:{kind:"estimate",assumption:"Приблизно180г за синтетичним рецептом"},
      assumptions:["Синтетичний рецепт"],nutritionBasis:{value:100,unit:"g"},nutrients:{p:1,f:2,c:3,cal:60}}
  };
  const partial = {...rawPortion,itemId:"coach-partial-label",source:{kind:"label",photoRef:"synthetic-label",
    portionOrigin:{kind:"estimate",assumption:"Порцію не зважували"},
    nutritionBasis:{value:100,unit:"g"},nutrients:{p:null,f:2,c:3,cal:60}}};
  let draft = patchDraft(null,{baseRevision:0,targetDate:date,meal:4,items:[rawPortion,partial],originalText:"Синтетичний тест"},{resolve:r.resolve});
  draft = patchDraft(draft,{draftId:draft.draftId,baseRevision:draft.revision,targetDate:date,meal:4,
    items:[{itemId:"coach-partial-label",noteSelected:true}]},{manual:true});
  const canonical = await commandFromDraft(draft);
  await commitMealDay(uid,uid,date,canonical.command);
  const reloaded = await loadMealDay(uid,uid,date);
  const saved = reloaded.meals[4].voice.find(x=>x.itemId===rawPortion.itemId);
  assert.deepEqual(saved.source,canonical.command.items[0].source);
  assert.equal(saved.estimated,true);assert.equal(saved.quantity.value,180);
  assert.equal(saved.nutrients.cal,60);
  const savedNote=reloaded.notes.find(x=>x.itemId===partial.itemId);
  assert.equal(savedNote.knownNutrients.p,null);assert.equal(savedNote.provenance.kind,"label");
  assert.deepEqual(savedNote.provenance.portionOrigin,partial.source.portionOrigin);
  await commitMealDay(uid,uid,date,canonical.command);
  const duplicateRead=await loadMealDay(uid,uid,date);
  assert.equal(duplicateRead.revision,reloaded.revision);
  assert.equal(duplicateRead.meals[4].voice.filter(x=>x.itemId===rawPortion.itemId).length,1);
  assert.equal(duplicateRead.notes.filter(x=>x.itemId===partial.itemId).length,1);
  console.log("phase: coach-stale-day-terminal-fence");
  const stale = {...canonical.command,submissionId:"coach-stale-day-001",notes:[],
    items:[{...canonical.command.items[0],itemId:"coach-stale-food-001"}],
    expectedRevision:duplicateRead.revision-1};
  await assert.rejects(commitMealDay(uid,uid,date,stale),/plan_conflict/);
  const denied = await loadMealDay(uid,uid,date);
  assert.equal(denied.revision,duplicateRead.revision);
  assert.equal(denied.totalMacros.cal,duplicateRead.totalMacros.cal);
  assert.equal(denied.rejectedSubmissions[stale.submissionId],await commandHash(stale));
  assert.equal(denied.submissionMarkers[stale.submissionId],undefined);
  await assert.rejects(commitMealDay(uid,uid,date,stale),/plan_conflict/);
  await assert.rejects(commitMealDay(uid,uid,date,{...stale,expectedRevision:denied.revision}),/submission_conflict/);
  await commitMealDay(uid,uid,date,{...stale,submissionId:"coach-refreshed-day-001",expectedRevision:denied.revision});
  const fresh = await loadMealDay(uid,uid,date);
  assert.equal(fresh.revision,denied.revision+1);
  assert.equal(fresh.totalMacros.cal,denied.totalMacros.cal+108);
  console.log("phase: coach-legacy-v3-25-items");
  const legacyRows=Array.from({length:25},(_,i)=>({name:`Синтетичний попередній ${i}`,weight:50,p:1,f:2,c:3,calories:30}));
  const legacyMeals={1:{voice:legacyRows},2:{},3:{},4:{}};
  const legacyDate="2026-01-10",legacyProfile="older-profile-id";
  await env.withSecurityRulesDisabled(async c=>{
    const ref=doc(c.firestore(),"users",uid),snapshot=await getDocFromServer(ref);
    await setDoc(ref,{...snapshot.data(),users:{...snapshot.data().users,[legacyProfile]:{name:"Синтетичний попередній профіль",legacyMeals,meals:{}}}});
  });
  await commitMealDay(uid,legacyProfile,legacyDate,{type:"replace",submissionId:"legacy-v3-migrate-001",expectedRevision:0,confirmLegacy:true,meals:legacyMeals,updatedAt:"2026-01-10T10:00:00Z"});
  const migrated=await loadMealDay(uid,legacyProfile,legacyDate);
  assert.equal(migrated.meals[1].voice.length,25);assert.equal(migrated.legacyImportProfileId,legacyProfile);
  assert.equal((await getDocFromServer(doc(db,"users",uid))).data().users[legacyProfile].legacyMeals,null);
  assert.equal((await loadMealDay(uid,uid,date)).totalMacros.cal,fresh.totalMacros.cal);
  console.log("phase: coach-v3-maximum-complete-writer-batch");
  const batchDate="2026-01-11";
  const twentyDraft=patchDraft(null,{baseRevision:0,targetDate:batchDate,meal:1,
    originalText:"Синтетична перевірка максимальної чернетки",
    items:Array.from({length:20},(_,i)=>({...rawPortion,itemId:`coach-max-batch-${i}`}))},{resolve:r.resolve});
  const twentyCommand=await commandFromDraft(twentyDraft,{dayRevision:0});
  await commitMealDay(uid,uid,batchDate,twentyCommand.command);
  const twentySaved=await loadMealDay(uid,uid,batchDate);
  assert.equal(twentySaved.meals[1].voice.length,20);
  assert.equal(twentySaved.totalMacros.cal,2160);
  assert.deepEqual(twentySaved.meals[1].voice[19].source,twentyCommand.command.items[19].source);
  await commitMealDay(uid,uid,batchDate,twentyCommand.command);
  assert.equal((await loadMealDay(uid,uid,batchDate)).revision,twentySaved.revision);
  // Compatible rollback keeps v3 and visible notes; disabling new inference is independent.
  await cap({ notesEnabled: false, minimumWriterVersion: 3 });
  assert.equal((await loadMealDay(uid, uid, date)).notes.length, 21);
  await commitMealDay(uid, uid, date, {
    type: "metadata",
    submissionId: "rollback-metadata",
    metadata: { activity: "Ходьба" },
    updatedAt: "x",
  });
  assert.equal((await loadMealDay(uid, uid, date)).incomplete, true);
  console.log(
    JSON.stringify({
      hermesStore: true,
      mixedAndNotesOnly: true,
      maxBatch: 20,
      conversion: true,
      exactV2Path: true,
      unknownAckRead: true,
      rollbackVisible: true,
      coachProvenanceRoundtrip:true,
      coachDayRevisionFence:true,
      legacyV3Migration25:true,
      completeV3WriterBatch20:true,
      realAPI: 0,
    }),
  );
} catch (error) {
  const r = await fetch(
    "http://127.0.0.1:8088/emulator/v1/projects/demo-scisense:ruleCoverage",
  );
  await (
    await import("node:fs/promises")
  ).writeFile("tmp/hermes-rule-coverage.json", await r.text());
  throw error;
} finally {
  await env.cleanup();
  await signOut(auth);
  await terminate(db);
}
