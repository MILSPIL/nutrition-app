import { useEffect,useRef,useState,useCallback } from 'react';
import { createEmptyMeals } from './nutrition';
import { loadMealDay,commitMealDay,commandHash } from './mealStore';
import { newId } from './mealItems';
export const saveError = error => ({plan_conflict:'План змінився. Перечитайте план і перевірте прев’ю перед додаванням.',revision_conflict:'Дані змінилися в іншому сеансі. Перечитайте день перед редагуванням.',legacy_date_required:'Спочатку вкажіть дату попередніх записів.',legacy_conflict:'Для перенесення оберіть порожній день і перечитайте дані.',pending_save:'Спочатку завершіть попереднє збереження.',save_unknown:'Зв’язок перервався. Результат збереження ще не підтверджено. Повтор перевірить той самий запис.',submission_conflict:'Ця спроба вже має інші дані. Перечитайте день.',unavailable:'Немає зв’язку. Запис лишився незбереженим.'}[error.message || error.code] || 'Не вдалося зберегти. Чернетка залишилась; перевірте з’єднання та повторіть.');
export function useMealDay(uid,profileId,date) {
 const [day,setDay]=useState({meals:createEmptyMeals(),revision:0});
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [reload,setReload]=useState(0);
 const context=useRef(''),needsRead=useRef(false);
 const generation=useRef(0),dayRef=useRef(day),pending=useRef(null),lock=useRef(null);
 useEffect(()=>{
  const g=++generation.current,key=JSON.stringify([uid,profileId,date]),changed=context.current!==key;
  context.current=key;setReady(false);setError('');
  if(changed) {setDay({meals:createEmptyMeals(),revision:0});pending.current=null;lock.current=null;setBusy(false);needsRead.current=false;}
  if(!uid||!profileId) return;
  (async()=>{
   try {
    const value=await loadMealDay(uid,profileId,date);
    const command=pending.current,hash=command?await commandHash(command):null;
    if(g!==generation.current) return;
    const marker=command&&value.submissionMarkers?.[command.submissionId];
    if(marker) {pending.current=null;if(marker!==hash)setError(saveError(Error('submission_conflict')));}
    needsRead.current=false;dayRef.current=value;setDay(value);setReady(true);
   }catch(_){if(g===generation.current)setError('Не вдалося завантажити день. Перевірте з’єднання.');}
  })();
  return()=>{generation.current=g+1;};
 },[uid,profileId,date,reload]);
 const execute=useCallback(async command=>{
  if(lock.current) { if(command.submissionId===pending.current?.submissionId) return lock.current; throw Error('pending_save'); }
  if(!ready||needsRead.current) throw Error('not_ready');
  const g=generation.current;
  pending.current=command;setBusy(true);setError('');
  const promise=commitMealDay(uid,profileId,date,command).then(result=>{
   if(g===generation.current){const next={...result,planContext:dayRef.current.planContext,mealsDateKey:date,legacy:null};dayRef.current=next;setDay(next);pending.current=null;}
   return result;
  }).catch(e=>{if(g===generation.current){if(['revision_conflict','plan_conflict','submission_conflict'].includes(e.message))needsRead.current=true;if((['revision_conflict','plan_conflict','submission_conflict','invalid_allocation','invalid_command','duplicate_item','legacy_conflict','legacy_date_required','invalid_item','invalid_quantity'].includes(e.message)||['permission-denied','invalid-argument','failed-precondition','unauthenticated','aborted'].includes(e.code))) pending.current=null;setError(saveError(e));}throw e;}).finally(()=>{if(g===generation.current){lock.current=null;setBusy(false);}});
  lock.current=promise;return promise;
 },[uid,profileId,date,ready]);
 const commit=useCallback((action)=>{
  if(pending.current) { if(action.submissionId===pending.current.submissionId) return execute(pending.current); return Promise.reject(Error('pending_save')); }
  return execute({...action,submissionId:action.submissionId || newId(),updatedAt:action.updatedAt || new Date().toISOString(),
   ...(['remove','quantity','replace'].includes(action.type)?{expectedRevision:dayRef.current.revision}:{} )});
 },[execute]);
 return {day,ready,busy,error,commit,hasPending:!!pending.current,retry:()=>pending.current?execute(pending.current):Promise.resolve(),requiresReload:needsRead.current,reload:()=>{if(!lock.current)setReload(x=>x+1);}};
}
