import { createEmptyMeals, calculateMealsMacros } from './nutrition';
import { validAllocation, allocationPercent } from './planAllocation';
import { itemProblems, withQuantity } from './mealItems';
export const hasMeals = meals => Object.values(meals || {}).some(m => Object.values(m || {}).some(v => Array.isArray(v) && v.length));
export const isDateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10) === value;
export const stableJson = value => JSON.stringify(value, function(k,v) { return v && !Array.isArray(v) && typeof v === 'object' ? Object.keys(v).sort().reduce((a,key) => { a[key]=v[key]; return a; },{}) : v; });
const fail = code => { throw new Error(code); };

export function applyDayCommand(day = {}, command, hash) {
  if (!command.submissionId || !hash) fail('invalid_command');
  const previous = day.submissionMarkers?.[command.submissionId];
  if (previous) {
    if (previous !== hash) fail('submission_conflict');
    return { day, duplicate: true };
  }
  const revision = day.revision || 0;
  if (command.expectedRevision != null && command.expectedRevision !== revision) fail('revision_conflict');
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
