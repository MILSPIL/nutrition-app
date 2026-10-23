import React, { useState } from 'react';
import { TRAINER_CONSENT } from '../../services/trainerAccess';
const actionClass='min-h-[44px] px-4 py-2 rounded-xl text-[#007AFF] bg-[#007AFF]/10 disabled:opacity-50';
export default function TrainerConnectionPanel({model,userName}) {
  const [email,setEmail]=useState('');
  const {state,status,message,busy,currentTrainer,pendingRequest}=model;
  return <div className="space-y-4" data-testid="trainer-connection">
    <p className="text-[13px] text-[#636366]" data-testid="trainer-consent">{TRAINER_CONSENT}</p>
    {message&&<p role="status" className="text-[14px] text-[#636366]">{message}</p>}
    {status==='loading'&&<p role="status">Перевіряємо стан…</p>}
    {status==='working'&&<p role="status">Очікуємо підтвердження сервера…</p>}
    {status==='uncertain'&&<p>Результат ще не підтверджено.</p>}
    <button type="button" className={actionClass} onClick={model.refresh} disabled={status==='loading'}>Перевірити стан</button>
    {state?.repair&&<p role="alert">Потрібна перевірка зв’язку. Повторне підключення поки недоступне.</p>}
    {state?.legacy&&<div className="rounded-xl bg-[#FF9500]/10 p-4 space-y-3">
      <p>Старий зв’язок не підтверджує згоду. Для доступу тренера потрібне повторне підключення.</p>
      <button className={actionClass} disabled={busy} onClick={model.clearLegacy}>Прибрати старий зв’язок</button>
    </div>}
    {currentTrainer&&<div className="rounded-xl bg-[#34C759]/10 p-4 space-y-3">
      <p className="font-semibold">{currentTrainer.name}</p><p>{currentTrainer.email}</p>
      <p className="text-[13px]">{currentTrainer.active?'Тренер має доступ до погоджених даних.':'Зв’язок потребує оновлення. Спершу відкличте попередню згоду.'}</p>
      <button className={actionClass} disabled={busy} onClick={model.disconnect}>Відкликати доступ</button>
    </div>}
    {pendingRequest&&<div className="rounded-xl bg-[#FF9500]/10 p-4 space-y-3">
      <p>Очікує підтвердження</p><p>{pendingRequest.trainerEmail}</p>
      <button className={actionClass} disabled={busy} onClick={model.cancel}>Скасувати запит</button>
    </div>}
    {state?.legacyPending?.map(item=><div key={item.id} className="rounded-xl bg-[#F2F2F7] p-4 space-y-3">
      <p>Старий запит: {item.trainerEmail}. Створіть новий запит зі згодою.</p>
      <button className={actionClass} disabled={busy} onClick={()=>model.removeLegacy(item)}>Прибрати старий запит</button>
    </div>)}
    {state&&!state.repair&&!state.legacy&&!currentTrainer&&!pendingRequest&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();void model.send(email,userName);}}>
      <label className="block text-[13px]">Email тренера
        <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} aria-label="Email тренера" className="mt-2 w-full min-h-[44px] px-4 py-3 bg-[#F2F2F7] rounded-xl" />
      </label>
      <button type="submit" disabled={busy||!email.trim()} className="w-full min-h-[44px] px-4 py-3 bg-[#007AFF] text-white rounded-xl disabled:opacity-50">Надіслати запит</button>
    </form>}
  </div>;
}
