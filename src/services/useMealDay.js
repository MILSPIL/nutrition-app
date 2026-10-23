import { useEffect,useRef,useState,useCallback } from 'react';
import { createEmptyMeals } from './nutrition';
import { loadMealDay,commitMealDay,commandHash } from './mealStore';
import { newId } from './mealItems';
export const saveError = error => ({not_ready:'День ще не готовий до запису. Перечитайте план і прев’ю.',plan_conflict:'План змінився. Перечитайте план і перевірте прев’ю перед додаванням.',revision_conflict:'Дані змінилися в іншому сеансі. Перечитайте день перед редагуванням.',legacy_date_required:'Спочатку вкажіть дату попередніх записів.',legacy_conflict:'Для перенесення оберіть порожній день і перечитайте дані.',pending_save:'Спочатку завершіть попереднє збереження.',save_unknown:'Зв’язок перервався. Результат збереження ще не підтверджено. Повтор перевірить той самий запис.',submission_conflict:'Ця спроба вже має інші дані. Перечитайте день.',unavailable:'Немає зв’язку. Запис лишився незбереженим.'}[error.message || error.code] || 'Не вдалося зберегти. Чернетка залишилась; перевірте з’єднання та повторіть.');
export function useMealDay(uid,profileId,date) {
 const [day,setDay]=useState({meals:createEmptyMeals(),revision:0});
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [reload,setReload]=useState(0);
 const context=useRef(''),needsRead=useRef(false),readyRef=useRef(false);
 const generation=useRef(0),dayRef=useRef(day),pending=useRef(null),lock=useRef(null);
 const read=useCallback(async g=>{
   try {
    const value=await loadMealDay(uid,profileId,date);
    const command=pending.current,hash=command?await commandHash(command):null;
    if(g!==generation.current) throw Error('context_changed');
    const marker=command&&value.submissionMarkers?.[command.submissionId];
    if(marker) {pending.current=null;if(marker!==hash)setError(saveError(Error('submission_conflict')));}
    else if(command) setError(saveError(Error('save_unknown')));
    needsRead.current=false;dayRef.current=value;setDay(value);readyRef.current=true;setReady(true);return value;
   }catch(e){if(g===generation.current)setError('Не вдалося завантажити день. Перевірте з’єднання.');throw e;}
 },[uid,profileId,date]);
 const invalidateRead=useCallback(()=>{generation.current++;readyRef.current=false;},[]);
 useEffect(()=>{
  const g=++generation.current,key=JSON.stringify([uid,profileId,date]),changed=context.current!==key;
  context.current=key;readyRef.current=false;setReady(false);setError('');
  if(changed) {const empty={meals:createEmptyMeals(),revision:0};dayRef.current=empty;setDay(empty);pending.current=null;lock.current=null;setBusy(false);needsRead.current=false;}
  if(!uid||!profileId) return;
  void read(g).catch(()=>{});
  return invalidateRead;
 },[uid,profileId,date,reload,read,invalidateRead]);
 const refresh=useCallback(async()=>{
  if(lock.current)throw Error('pending_save');
  if(!uid||!profileId)throw Error('not_ready');
  const g=++generation.current;readyRef.current=false;setReady(false);setError('');
  return read(g);
 },[uid,profileId,read]);
 const execute=useCallback(async command=>{
  if(lock.current) { if(command.submissionId===pending.current?.submissionId) return lock.current; throw Error('pending_save'); }
  if(!readyRef.current||needsRead.current) throw Error('not_ready');
  const g=generation.current;
  pending.current=command;setBusy(true);setError('');
  const promise=commitMealDay(uid,profileId,date,command).then(result=>{
   if(g===generation.current){const next={...result,planContext:dayRef.current.planContext,mealsDateKey:date,legacy:null};dayRef.current=next;setDay(next);pending.current=null;}
   return result;
  }).catch(e=>{if(g===generation.current){if(['revision_conflict','plan_conflict','submission_conflict'].includes(e.message))needsRead.current=true;if((['revision_conflict','plan_conflict','submission_conflict','invalid_allocation','invalid_command','duplicate_item','legacy_conflict','legacy_date_required','invalid_item','invalid_quantity'].includes(e.message)||['permission-denied','invalid-argument','failed-precondition','unauthenticated','aborted'].includes(e.code))) pending.current=null;setError(saveError(e));}throw e;}).finally(()=>{if(g===generation.current){lock.current=null;setBusy(false);}});
  lock.current=promise;return promise;
 },[uid,profileId,date]);
 const commit=useCallback((action)=>{
  if(pending.current) { if(action.submissionId===pending.current.submissionId) return execute(pending.current); return Promise.reject(Error('pending_save')); }
  return execute({...action,submissionId:action.submissionId || newId(),updatedAt:action.updatedAt || new Date().toISOString(),
   ...(['remove','quantity','replace'].includes(action.type)?{expectedRevision:dayRef.current.revision}:{} )});
 },[execute]);
 return {day,ready,busy,error,commit,hasPending:!!pending.current,retry:()=>pending.current?execute(pending.current):Promise.resolve(),requiresReload:needsRead.current,refresh,reload:()=>{if(!lock.current){readyRef.current=false;setReady(false);setReload(x=>x+1);}}};
}
