import { doc, getDocFromServer, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
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
export async function loadMealDay(uid, profileId, date) {
  const ref=refs(uid,date);
  const [owner,day]=await Promise.all([getDocFromServer(ref.owner),getDocFromServer(ref.day)]);
  return selectDay(owner.data()?.users?.[profileId],day.data(),date);
}
export async function readSubmission(uid,date,submissionId,hash) {
  const snap=await getDocFromServer(refs(uid,date).day);
  const marker=snap.data()?.submissionMarkers?.[submissionId];
  if (marker && marker !== hash) throw new Error('submission_conflict');
  return marker ? snap.data() : null;
}

// У callback немає мережі провайдерів, генерації ID або змін React: Firestore може повторити його.
export async function commitMealDay(uid, profileId, date, command) {
  const ref=refs(uid,date), hash=await commandHash(command);
  try {
    return await runTransaction(db, async tx => {
      const ownerSnap=await tx.get(ref.owner);
      const daySnap=await tx.get(ref.day);
      const root=ownerSnap.data();
      if (!root?.users?.[profileId]) throw new Error('profile_missing');
      const user=root.users[profileId];
      const legacy=user.legacyMeals || (!user.mealsDateKey && hasMeals(user.meals) ? user.meals : null);
      if (daySnap.data()?.submissionMarkers?.[command.submissionId] === hash) return daySnap.data();
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
      const result=applyDayCommand(daySnap.data(),effective,hash);
      if (result.duplicate) return result.day;
      const projection={ ...user, meals: result.day.meals, mealsDateKey:date, mealRevision:result.day.revision };
      if (legacy) { projection.legacyMeals=legacy; projection.legacyMealsDateKey=date; }
      if (command.confirmLegacy) projection.legacyMeals=null;
      for (const key of ['activity','otherActivity','currentWeight','programDay']) if (command.metadata?.[key] !== undefined) projection[key]=command.metadata[key];
      tx.set(ref.day,result.day);
      tx.set(ref.owner,{ users:{ ...root.users,[profileId]:projection },writerVersion:2,updatedAt:command.updatedAt },{mergeFields:['users','writerVersion','updatedAt']});
      return result.day;
    });
  } catch (error) {
    // Читання з сервера може довести commit після невизначеного транспортного збою.
    if (['unavailable','deadline-exceeded','unknown'].includes(error.code)) {
      try { const day=await readSubmission(uid,date,command.submissionId,hash); if(day) return day; } catch (_) { /* чернетка залишається */ }
      throw new Error('save_unknown');
    }
    throw error;
  }
}

// Налаштування ніколи не відправляють застарілий users.*.meals поверх транзакції дня.
export async function saveProfileSettings(uid, profileId, patch, globalPatch={}) {
  const ref=doc(db,'users',uid);
  const safe={};
  for (const key of ['name','startDate','portions','trainerTelegram','customProducts','hiddenProducts']) if(patch?.[key]!==undefined) safe[key]=patch[key];
  return runTransaction(db,async tx=>{
    const snap=await tx.get(ref),root=snap.data();
    if(!root?.users?.[profileId]) throw new Error('profile_missing');
    tx.set(ref,{...globalPatch,users:{...root.users,[profileId]:{...root.users[profileId],...safe}}},{mergeFields:['users',...Object.keys(globalPatch)]});
  });
}
