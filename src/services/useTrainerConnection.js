import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, doc, getDocsFromServer, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { createTrainerAccess, connectionError, connectionVersion, validConnection } from './trainerAccess';
const access=createTrainerAccess(db);
// Closing either dialog does not cancel a Firebase transaction or unlock another mutation.
const inFlight=new Map();
export function useTrainerConnection(user, enabled) {
  const [state,setState]=useState(null),[status,setStatus]=useState('loading'),[message,setMessage]=useState('');
  const live=useRef(false),readVersion=useRef(0),identity=useRef(null);
  const uid=user?.uid;
  const refresh=useCallback(async()=>{
    if(!uid||!live.current)return false;
    const version=++readVersion.current;
    try {
      const [current,legacy]=await Promise.all([access.readState(user),getDocsFromServer(query(collection(db,'trainerRequests'),where('clientId','==',uid)))]);
      if(!live.current||identity.current!==uid||readVersion.current!==version)return false;
      setState({...current,legacyPending:legacy.docs.filter(d=>d.id!==uid&&d.data().status==='pending').map(d=>({...d.data(),id:d.id}))});
      setStatus(inFlight.has(uid)?'working':'ready');return true;
    } catch(error) {
      if(live.current&&identity.current===uid&&readVersion.current===version){setState(null);setStatus('uncertain');setMessage(connectionError(error));}
      return false;
    }
  },[uid,user]);
  useEffect(()=>{
    live.current=!!(enabled&&uid);identity.current=uid;readVersion.current = readVersion.current + 1;
    setState(null);setMessage('');setStatus('loading');
    if(!live.current)return undefined;
    let active=true;
    const current=()=>{if(active&&live.current&&identity.current===uid)void refresh();};
    current();
    const pending=inFlight.get(uid);if(pending)pending.finally(current).catch(()=>{});
    const fail=()=>{if(active&&live.current&&identity.current===uid){readVersion.current = readVersion.current + 1;setState(null);setStatus('uncertain');setMessage('Не вдалося перевірити зв’язок із тренером.');}};
    const subscriptions=[doc(db,'users',uid),doc(db,'trainerRequests',uid)].map(ref=>onSnapshot(ref,{includeMetadataChanges:true},snapshot=>{
      if(!snapshot.metadata.fromCache)current();
    },fail));
    return ()=>{active=false;live.current=false;readVersion.current = readVersion.current + 1;subscriptions.forEach(off=>off());};
  },[uid,enabled,refresh]);
  const act=async(operation,success)=>{
    if(!uid||!live.current||inFlight.has(uid)||status!=='ready')return;
    setStatus('working');setMessage('');
    const promise=Promise.resolve().then(operation);inFlight.set(uid,promise);
    const visible=()=>live.current&&identity.current===uid;
    const timer=setTimeout(()=>{if(visible()){setStatus('uncertain');setMessage('Результат ще не підтверджено. Дія може завершитися після відновлення зв’язку.');}},10000);
    try {
      await promise;
      if(inFlight.get(uid)===promise)inFlight.delete(uid);
      if(visible()&&await refresh())setMessage(success);
    } catch(error) {
      if(inFlight.get(uid)===promise)inFlight.delete(uid);
      if(visible()){setStatus('uncertain');setMessage(connectionError(error));}
    } finally {clearTimeout(timer);}
  };
  const request=state?.request, valid=validConnection(request,uid);
  return {state,status,message,busy:status!=='ready',
    currentTrainer:valid&&request.status==='accepted'?{id:request.trainerId,name:request.trainerName,email:request.trainerEmail,active:state.profile?.trainerId===request.trainerId}:null,
    pendingRequest:valid&&request.status==='pending'?request:null,
    refresh:async()=>{setMessage('');setStatus('loading');await refresh();},
    send:(email,name)=>act(()=>access.request(user,email,name,connectionVersion(request)),'Запит надіслано. Очікуйте підтвердження тренера.'),
    cancel:()=>act(()=>access.finishPending(user,uid,connectionVersion(request),'cancelled'),'Запит скасовано.'),
    disconnect:()=>act(()=>access.disconnect(user,connectionVersion(request)),'Доступ тренера відкликано.'),
    clearLegacy:()=>act(()=>access.clearLegacy(user),'Старий зв’язок прибрано. Особисті записи збережені.'),
    removeLegacy:item=>act(()=>access.deleteLegacyPending(item.id,uid),'Старий запит прибрано.'),
  };
}
