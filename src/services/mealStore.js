import { foodNotesSummary } from './foodNotes';
import { PRODUCTS_DB } from '../data/products';
import { buildPlanCatalog, planFingerprint } from './planCatalog';
import { doc, getDocFromServer, runTransaction, FieldPath } from 'firebase/firestore';
import { db } from '../firebase';
import { writerStamp } from './writerFence';
import { applyDayCommand, hasMeals, isDateKey, selectDay, stableJson } from './mealCommands';

export const commandHash = async command => {
  const { updatedAt, ...payload } = command;
  const bytes = new TextEncoder().encode(stableJson(payload));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
};
const refs = (uid,date) => {
  if (!uid || !isDateKey(date)) throw new Error('invalid_target');
  return { owner: doc(db,'users',uid), day: doc(db,'users',uid,'mealHistory',date) };
};
async function readNotes(tx, uid, day) {
  const notes=[];
  for(const noteId of Object.keys(day?.foodNotes||{})) {
    if(!/^[-a-zA-Z0-9_]{17,161}$/.test(noteId)) throw Error('invalid_food_note');
    const snap=await tx.get(doc(db,'users',uid,'foodNotes',noteId));
    if(!snap.exists()||snap.data().state!=='active') throw Error('note_conflict');
    notes.push({...snap.data(),noteId});
  }
  return foodNotesSummary(notes);
}
export async function loadConfirmedDay(uid,date) {
  return runTransaction(db,async tx=>{
    const day=(await tx.get(refs(uid,date).day)).data();
    if(!day)return null;
    const summary=await readNotes(tx,uid,day);
    return {...day,notes:summary.notes,incomplete:summary.incomplete};
  });
}
export async function loadMealDay(uid, profileId, date) {
  const ref=refs(uid,date);
  return runTransaction(db,async tx=>{
    const owner=await tx.get(ref.owner),day=await tx.get(ref.day),cap=await tx.get(doc(db,'releaseCapabilities',uid));
    const root=owner.data()||{},profile=root.users?.[profileId]||{},summary=await readNotes(tx,uid,day.data());
    return {...selectDay(profile,day.data(),date),notes:summary.notes,incomplete:summary.incomplete,notesEnabled:cap.data()?.notesEnabled===true&&cap.data()?.minimumWriterVersion===3,planContext:{profile:{portions:profile.portions||{},customProducts:profile.customProducts||{},hiddenProducts:profile.hiddenProducts||[]},globalCustomProducts:root.globalCustomProducts||{},productOverrides:root.productOverrides||{}}};
  });
}
export async function readSubmission(uid,date,submissionId,hash) {
  const snap=await getDocFromServer(refs(uid,date).day);
  const marker=snap.data()?.submissionMarkers?.[submissionId];
  if (marker && hash && marker !== hash) throw new Error('submission_conflict');
  return marker ? snap.data() : null;
}

// У callback немає мережі провайдерів, генерації ID або змін React: Firestore може повторити його.
export async function commitMealDay(uid, profileId, date, command) {
  const ref=refs(uid,date), hash=await commandHash(command), stamp=writerStamp();
  const trainerCommand=['saveTrainerDraft','resolveFoodNote'].includes(command.type);
  if(trainerCommand&&command.targetDate!==date) throw Error('invalid_target');
  try {
    const outcome=await runTransaction(db, async tx => {
      const ownerSnap=await tx.get(ref.owner);
      const daySnap=await tx.get(ref.day);
      const root=ownerSnap.data();
      if (!root?.users?.[profileId]) throw new Error('profile_missing');
      const user=root.users[profileId];
      const legacy=user.legacyMeals || (!user.mealsDateKey && hasMeals(user.meals) ? user.meals : null);
      const previous=daySnap.data()?.submissionMarkers?.[command.submissionId];
      if(previous) {if(previous!==hash) throw Error('submission_conflict');return daySnap.data();}
      const rejected=daySnap.data()?.rejectedSubmissions?.[command.submissionId];
      if(rejected){if(rejected!==hash)throw Error('submission_conflict');return {rejected:true};}
      // A trainer preview is computed against one confirmed day revision.
      // Persist a terminal rejection in the same transaction, so a lost ACK or
      // reconnect cannot keep retrying this stale command as an unknown write.
      if(trainerCommand && command.expectedRevision !== undefined) {
        if(!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0) throw Error('invalid_command');
        if(command.expectedRevision !== (daySnap.data()?.revision || 0)) {
          tx.set(ref.day,{rejectedSubmissions:{[command.submissionId]:hash},...stamp},{mergeFields:[new FieldPath('rejectedSubmissions',command.submissionId),'writerVersion','writerNonce']});
          return {rejected:true};
        }
      }
      if(command.type==='appendAllocated'||(trainerCommand&&(command.items||[]).length)) {
        const catalog=buildPlanCatalog({profile:user,globalCustomProducts:root.globalCustomProducts,productOverrides:root.productOverrides});
        if(command.planFingerprint!==await planFingerprint(catalog)) {
          if(!trainerCommand)throw Error('plan_conflict');
          tx.set(ref.day,{rejectedSubmissions:{[command.submissionId]:hash},...stamp},{mergeFields:[new FieldPath('rejectedSubmissions',command.submissionId),'writerVersion','writerNonce']});
          return {rejected:true};
        }
        for(const item of command.items||[]) {
          const a=item.planAllocation;
          if(a?.status==='allocated'&&a.letter==='в'&&(a.basis?.value!==PRODUCTS_DB.в.calorieLimit||a.normSource!=='catalog'||a.referenceName!=='Вільний вибір')) throw Error('invalid_allocation');
          if(a?.status==='allocated'&&a.letter!=='в') {
            const ref=catalog.references.find(r=>r.referenceKey===a.referenceKey&&r.letter===a.letter);
            if(!ref||a.basis?.value!==ref.norm||a.basis?.state!==ref.basisState||a.normSource!==ref.normSource||a.referenceName!==ref.name) throw Error('invalid_allocation');
          }
        }
      }
      let resolvedNote,cap;
      const noteRefs=[];
      if(trainerCommand) {
        cap=(await tx.get(doc(db,'releaseCapabilities',uid))).data();
        if((command.notes?.length||command.type==='resolveFoodNote')&&(cap?.notesEnabled!==true||cap?.minimumWriterVersion!==3))throw Error('notes_disabled');
        if(command.type==='resolveFoodNote') {
          if(typeof command.noteId!=='string'||!command.noteId||command.noteId.includes('/'))throw Error('invalid_food_note');
          resolvedNote=(await tx.get(doc(db,'users',uid,'foodNotes',command.noteId))).data();
          if(resolvedNote?.targetDate!==date)throw Error('note_conflict');
        }
        for(const note of command.notes||[]) {
          if(typeof note?.itemId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(note.itemId))throw Error('invalid_food_note');
          const noteRef=doc(db,'users',uid,'foodNotes',`${command.submissionId}_${note.itemId}`);
          if((await tx.get(noteRef)).exists())throw Error('note_conflict');
          noteRefs.push(noteRef);
        }
      }
      if (legacy && !command.confirmLegacy) throw new Error('legacy_date_required');
      if (command.confirmLegacy && (!legacy || command.type!=='replace' || stableJson(command.meals)!==stableJson(legacy) || (hasMeals(daySnap.data()?.meals) && stableJson(daySnap.data().meals)!==stableJson(legacy) && !command.mergeLegacy))) throw new Error('legacy_conflict');
      let effective=command;
      if(command.confirmLegacy && command.mergeLegacy && hasMeals(daySnap.data()?.meals)) {
        const combined=JSON.parse(JSON.stringify(daySnap.data().meals));
        for(const [meal,groups] of Object.entries(legacy)) for(const [group,items] of Object.entries(groups)) {
          combined[meal] ||= {};combined[meal][group]=[...(combined[meal][group] || []),...items];
        }
        effective={...command,meals:combined};
      }
      const result=applyDayCommand(daySnap.data(),effective,hash,{resolvedNote});
      if (result.duplicate) return result.day;
      const projection={ ...user, meals: result.day.meals, mealsDateKey:date, mealRevision:result.day.revision };
      if (legacy) { projection.legacyMeals=legacy; projection.legacyMealsDateKey=date; }
      if (command.confirmLegacy) projection.legacyMeals=null;
      for (const key of ['activity','otherActivity','currentWeight','programDay']) if (command.metadata?.[key] !== undefined) projection[key]=command.metadata[key];
      (result.noteWrites||[]).forEach((note,index)=>tx.set(noteRefs[index],{...note,...stamp}));
      if(result.resolvedNote)tx.set(doc(db,'users',uid,'foodNotes',command.noteId),{...result.resolvedNote,...stamp});
      // Update only this command's marker. Replacing the whole map makes a
      // concurrent sibling marker look deleted to rules before Firestore's
      // transaction precondition can trigger its normal ABORTED retry.
      const dayValue={...result.day,...stamp,...(command.confirmLegacy ? {legacyImportProfileId:profileId} : {})};
      const dayFields=Object.keys(dayValue).filter(k=>!['submissionMarkers','rejectedSubmissions'].includes(k));
      tx.set(ref.day,dayValue,{mergeFields:[...dayFields,new FieldPath('submissionMarkers',command.submissionId)]});
      tx.set(ref.owner,{ users:{ ...root.users,[profileId]:projection },...stamp,updatedAt:command.updatedAt },{mergeFields:['users','writerVersion','writerNonce','updatedAt']});
      return result.day;
    });
    if(outcome?.rejected)throw Error("plan_conflict");
    return await loadMealDay(uid,profileId,date);
  } catch (error) {
    // Читання з сервера може довести commit після невизначеного транспортного збою.
    if (['unavailable','deadline-exceeded','unknown','permission-denied','aborted'].includes(error.code)) {
      try { const day=await readSubmission(uid,date,command.submissionId,hash); if(day) return await loadMealDay(uid,profileId,date); } catch (_) { /* чернетка залишається */ }
      if (['unavailable','deadline-exceeded','unknown'].includes(error.code)) throw new Error('save_unknown');
    }
    throw error;
  }
}

// Налаштування ніколи не відправляють застарілий users.*.meals поверх транзакції дня.
export async function saveProfileSettings(uid, profileId, patch, globalPatch={}) {
  const ref=doc(db,'users',uid), stamp=writerStamp();
  const safe={};
  for (const key of ['name','startDate','portions','trainerTelegram','customProducts','hiddenProducts']) if(patch?.[key]!==undefined) safe[key]=patch[key];
  return runTransaction(db,async tx=>{
    const snap=await tx.get(ref),root=snap.data();
    if(!root?.users?.[profileId]) throw new Error('profile_missing');
    tx.set(ref,{...globalPatch,users:{...root.users,[profileId]:{...root.users[profileId],...safe}},...stamp},{mergeFields:[...new Set(['users',...Object.keys(globalPatch),'writerVersion','writerNonce'])]});
  });
}
