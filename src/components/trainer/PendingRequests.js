import React, { useState, useEffect, useRef } from 'react';
import { UserPlus } from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { createTrainerAccess, connectionVersion, connectionDate, connectionError, validConnection, normalizeTrainerEmail } from '../../services/trainerAccess';
const access=createTrainerAccess(db),inFlight=new Map();
export default function PendingRequests({firebaseUser,ready}) {
  const [requests,setRequests]=useState([]),[processing,setProcessing]=useState({}),[message,setMessage]=useState(''),[retry,setRetry]=useState(0);
  const epoch=useRef(0);
  const operationKey=id=>`${firebaseUser?.uid}/${id}`;
  useEffect(()=>{
    const version=++epoch.current;setRequests([]);setMessage('');
    const prefix=`${firebaseUser?.uid}/`;
    const reconcile=()=>{if(epoch.current===version)setProcessing(Object.fromEntries([...inFlight.keys()].filter(key=>key.startsWith(prefix)).map(key=>[key.slice(prefix.length),true])));};
    reconcile();
    for(const [key,promise] of inFlight)if(key.startsWith(prefix))promise.finally(reconcile).catch(()=>{});
    if(!ready||!firebaseUser?.emailVerified)return undefined;
    const q=query(collection(db,'trainerRequests'),where('trainerEmail','==',normalizeTrainerEmail(firebaseUser.email)),where('status','==','pending'));
    const off=onSnapshot(q,{includeMetadataChanges:true},snapshot=>{
      if(epoch.current===version&&!snapshot.metadata.fromCache)setRequests(snapshot.docs.map(d=>({payload:d.data(),id:d.id})));
    },()=>{if(epoch.current===version){setRequests([]);setMessage('Не вдалося завантажити запити. Перевірте з’єднання та повторіть.');}});
    return ()=>{epoch.current = epoch.current + 1;off();};
  },[firebaseUser,ready,retry]);
  const perform=async(item,action)=>{
    const key=operationKey(item.id);
    if(!ready||inFlight.has(key))return;
    const version=epoch.current;setProcessing(p=>({...p,[item.id]:true}));setMessage('');
    const timer=setTimeout(()=>{if(epoch.current===version)setMessage('Результат ще не підтверджено. Очікуємо завершення операції.');},10000);
    const promise=Promise.resolve().then(()=>action==='legacy'?access.deleteLegacyPending(item.id,item.clientId):action==='accept'?access.accept(firebaseUser,item.clientId,connectionVersion(item)):access.finishPending(firebaseUser,item.clientId,connectionVersion(item),'rejected'));
    inFlight.set(key,promise);
    try {
      await promise;
      if(epoch.current===version)setMessage(action==='accept'?'Запит прийнято.':action==='legacy'?'Старий запит прибрано.':'Запит відхилено.');
    }catch(error){if(epoch.current===version)setMessage(connectionError(error));}
    finally{clearTimeout(timer);if(inFlight.get(key)===promise)inFlight.delete(key);if(epoch.current===version){setProcessing(p=>({...p,[item.id]:false}));}}
  };
  if(!firebaseUser?.emailVerified)return <p role="status" className="mb-4">Підтвердьте email, щоб приймати запити клієнтів.</p>;
  if(!requests.length&&!message)return null;
  return <section className="bg-[#FF9500]/10 rounded-2xl p-4 mb-4">
    <h3 className="flex items-center gap-2 text-[17px] font-semibold mb-3"><UserPlus size={20}/>Нові запити ({requests.length})</h3>
    {message&&<p role="status" className="text-[14px] mb-3">{message}</p>}
    <button className="min-h-[44px] text-[#007AFF] mb-2" onClick={()=>setRetry(v=>v+1)}>Перевірити запити</button>
    <div className="space-y-3">{requests.map(({id,payload})=>{
      const item={...payload,id};
      const legacy=id!==item.clientId,valid=!legacy&&validConnection(payload,item.clientId);
      return <div key={item.id} className="bg-white rounded-xl p-3 space-y-2">
        <p className="font-medium">{item.clientName}</p><p className="text-[13px] text-[#636366]">{item.clientEmail}</p><p className="text-[12px]">{connectionDate(item.createdAt)}</p>
        {!valid&&<p className="text-[13px]">Потрібен новий запит зі згодою клієнта.</p>}
        <div className="flex gap-3">
          {legacy?<button className="min-h-[44px] text-[#007AFF]" disabled={processing[item.id]} onClick={()=>perform(item,'legacy')}>Прибрати старий запит</button>:<>
            <button className="min-h-[44px] text-[#FF3B30]" disabled={processing[item.id]||!valid} onClick={()=>perform(item,'reject')}>Відхилити</button>
            <button className="min-h-[44px] text-[#007AFF]" disabled={processing[item.id]||!valid} onClick={()=>perform(item,'accept')}>Прийняти</button>
          </>}
        </div>
      </div>;
    })}</div>
  </section>;
}
