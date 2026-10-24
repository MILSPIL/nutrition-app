import { validFoodNote, foodNoteId } from './foodNotes.js';
import { createEmptyMeals, calculateMealsMacros } from './nutrition.js';
import { validAllocation, allocationPercent } from './planAllocation.js';
import { itemProblems, withQuantity } from './mealItems.js';
export const hasMeals = meals => Object.values(meals || {}).some(m => Object.values(m || {}).some(v => Array.isArray(v) && v.length));
export const isDateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10) === value;
export const stableJson = value => JSON.stringify(value, function(k,v) { return v && !Array.isArray(v) && typeof v === 'object' ? Object.keys(v).sort().reduce((a,key) => { a[key]=v[key]; return a; },{}) : v; });
const fail = code => { throw new Error(code); };

export function applyDayCommand(day = {}, command, hash, {resolvedNote} = {}) {
  if (!command.submissionId || !hash) fail('invalid_command');
  const previous = day.submissionMarkers?.[command.submissionId];
  if (previous) {
    if (previous !== hash) fail('submission_conflict');
    return { day, duplicate: true };
  }
  const revision = day.revision || 0;
  if (command.expectedRevision != null && command.expectedRevision !== revision) fail('revision_conflict');
  if (['saveTrainerDraft','resolveFoodNote'].includes(command.type)) {
    if (!isDateKey(command.targetDate) || !/^[a-zA-Z0-9-]{8,80}$/.test(command.submissionId) || ![1,2,3,4].includes(Number(command.meal))) fail('invalid_command');
    const items=command.items||[], notes=command.notes||[];
    if (!Array.isArray(items)||!Array.isArray(notes)||items.length+notes.length<1||items.length+notes.length>20||notes.some(n=>!validFoodNote(n))) fail('invalid_command');
    const refs={...(day.foodNotes||{})};
    const ids=new Set(Object.values(day.meals||{}).flatMap(m=>Object.values(m).flat()).map(i=>i.itemId).filter(Boolean));
    for(const value of Object.values(refs)) ids.add(value.itemId);
    if(command.type==='resolveFoodNote') {
      if(notes.length||items.length!==1||!resolvedNote||resolvedNote.state!=='active'||resolvedNote.noteId!==command.noteId||!refs[command.noteId]||resolvedNote.itemId!==items[0].itemId) fail('note_conflict');
      delete refs[command.noteId];ids.delete(resolvedNote.itemId);
    }
    for(const item of [...items,...notes]) {if(ids.has(item.itemId))fail('duplicate_item');ids.add(item.itemId);}
    const result=items.length?applyDayCommand(day,{...command,type:'appendAllocated'},hash):finish({...day,meals:day.meals||createEmptyMeals()},command,hash,revision);
    const writes=notes.map(note=>{const id=foodNoteId(command.submissionId,note.itemId);refs[id]={itemId:note.itemId,submissionId:command.submissionId};return {...note,noteId:id,state:'active',targetDate:command.targetDate,meal:Number(command.meal),submissionId:command.submissionId,commandHash:hash,createdAt:command.updatedAt};});
    return {...result,day:{...result.day,foodNotes:refs,writerVersion:3},noteWrites:writes,
      ...(command.type==='resolveFoodNote'?{resolvedNote:{noteId:command.noteId,itemId:resolvedNote.itemId,targetDate:resolvedNote.targetDate,state:'resolved',mealKey:String(command.meal),group:items[0].planAllocation.letter||'voice',itemIndex:result.day.meals[command.meal][items[0].planAllocation.letter||'voice'].length-1,submissionId:command.submissionId,commandHash:hash,resolvedAt:command.updatedAt}}:{})};
  }
  const meals = JSON.parse(JSON.stringify(day.meals || createEmptyMeals()));
  if (command.type === 'append' || command.type === 'appendAllocated') {
    if (![1,2,3,4].includes(Number(command.meal)) || !Array.isArray(command.items) || !command.items.length || command.items.length > 20) fail('invalid_command');
    const items = command.items;
    if (items.some(i => !i.itemId || itemProblems(i).length)) fail('invalid_item');
    const ids = new Set(Object.values(meals).flatMap(m => Object.values(m).flat()).map(i => i.itemId).filter(Boolean));
    for (const item of items) { if (ids.has(item.itemId)) fail('duplicate_item'); ids.add(item.itemId); }
    if(command.type==='appendAllocated') {
      if(items.some(i=>!validAllocation(i.planAllocation)||(i.planAllocation.status==='allocated'?allocationPercent(i)==null:i.portion!=null))) fail('invalid_allocation');
      for(const item of items) {
        const group=item.planAllocation.letter || 'voice';
        meals[command.meal] ||= {};meals[command.meal][group]=[...(meals[command.meal][group]||[]),item];
      }
    } else {
      const group = command.letter || 'voice';
      meals[command.meal] = { ...meals[command.meal], [group]: [...(meals[command.meal]?.[group] || []), ...items] };
    }
  } else if (command.type === 'remove' || command.type === 'quantity') {
    const list = meals[command.meal]?.[command.letter];
    if (!list?.[command.index]) fail('item_missing');
    if (command.type === 'remove') list.splice(command.index,1);
    else { list[command.index] = withQuantity(list[command.index], command.value); if (list[command.index].quantity && itemProblems(list[command.index]).length) fail('invalid_item'); }
  } else if (command.type === 'replace') {
    if (command.expectedRevision == null) fail('revision_required');
    return finish({ ...day, meals: command.meals }, command, hash, revision);
  } else if (command.type !== 'metadata') fail('invalid_command');
  return finish({ ...day, meals }, command, hash, revision);
}
function finish(day, command, hash, revision) {
  const metadata = {};
  for (const key of ['activity','otherActivity','currentWeight','programDay']) if (command.metadata?.[key] !== undefined) metadata[key]=command.metadata[key];
  return { day: { ...day, ...metadata, totalMacros: calculateMealsMacros(day.meals), revision: revision+1,
    submissionMarkers: { ...day.submissionMarkers, [command.submissionId]: hash }, writerVersion: 2, updatedAt: command.updatedAt }, duplicate: false };
}
export function selectDay(rootUser, day, date) {
  return { ...(day || {}), meals: day?.meals || createEmptyMeals(), revision: day?.revision || 0, mealsDateKey: date,
    legacy: rootUser?.legacyMeals || (!rootUser?.mealsDateKey && hasMeals(rootUser?.meals) ? rootUser.meals : null) };
}
