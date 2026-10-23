import { doc, getDocFromServer, runTransaction, serverTimestamp, deleteField, FieldPath, deleteDoc } from 'firebase/firestore';

export const TRAINER_CONSENT = 'Надсилаючи запит, ви погоджуєтеся надати тренеру своє ім’я та email, історію їжі, активність і БЖВ за всі дні та заміри тіла. Ви можете відкликати доступ у будь-який момент.';
export const MAX_CONNECTION_REVISION = 2147483647;
const pendingFields = ['clientId','clientEmail','clientName','trainerEmail','status','generation','revision','createdAt'];
const acceptedFields = [...pendingFields,'trainerId','trainerName','acceptedAt'];
const terminal = new Set(['rejected','cancelled','disconnected']);
const timestamp = value => value && typeof value.toMillis === 'function' && Number.isFinite(value.toMillis());
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
const emailValid = value => text(value, 254) && value === value.toLowerCase() && /^[^\s@]+@[^\s@]+$/.test(value);
export const normalizeTrainerEmail = value => String(value || '').trim().toLowerCase();
export const connectionVersion = data => ({ generation: data?.generation || 0, revision: data?.revision || 0 });
export function validConnection(data, uid) {
  if (!data || data.clientId !== uid || !text(uid,128) || !emailValid(data.clientEmail) || !emailValid(data.trainerEmail)
    || data.clientEmail === data.trainerEmail || !text(data.clientName,120) || !timestamp(data.createdAt)
    || ![data.generation,data.revision].every(value=>Number.isInteger(value)&&value>0&&value<=MAX_CONNECTION_REVISION)
    || data.revision < data.generation) return false;
  const accepted = data.status === 'accepted' || data.status === 'disconnected';
  const ended = terminal.has(data.status);
  if (data.status==='accepted' && data.revision>=MAX_CONNECTION_REVISION) return false;
  if (!accepted && !ended && data.status !== 'pending') return false;
  const fields = [...(accepted ? acceptedFields : pendingFields), ...(ended ? ['endedAt'] : [])];
  if (Object.keys(data).length !== fields.length || !fields.every(key=>Object.hasOwn(data,key))) return false;
  if (accepted && (!text(data.trainerId,128) || data.trainerId===uid || !text(data.trainerName,120)
    || !timestamp(data.acceptedAt) || data.acceptedAt.toMillis()<data.createdAt.toMillis() || data.revision<2)) return false;
  return !ended || (timestamp(data.endedAt) && data.revision>1
    && data.endedAt.toMillis()>=(accepted?data.acceptedAt:data.createdAt).toMillis());
}
function fail(code) { const error = new Error(code); error.code=code; throw error; }
function validOrFail(data, uid) { if (!validConnection(data,uid)) fail('connection/repair-required'); }
function expectedOrFail(data, expected) {
  if (!expected || connectionVersion(data).generation!==expected.generation || connectionVersion(data).revision!==expected.revision)
    fail('connection/stale');
}
function advance(data) { if (data.revision>=MAX_CONNECTION_REVISION) fail('connection/repair-required'); return data.revision+1; }
function verifiedUser(user) {
  if (!user?.uid || !user.emailVerified || !emailValid(normalizeTrainerEmail(user.email))) fail('connection/verify-email');
}
function replay(data, expected, status, trainerId) {
  return data.status===status && data.generation===expected?.generation && data.revision===expected?.revision+1
    && (!trainerId || data.trainerId===trainerId);
}
export function connectionError(error) {
  const code=error?.code || '';
  if (code==='connection/verify-email') return 'Підтвердьте email перед підключенням тренера.';
  if (code==='connection/profile-missing') return 'Дочекайтеся завантаження профілю та повторіть дію.';
  if (code==='connection/repair-required') return 'Потрібна перевірка зв’язку. Повторне підключення поки недоступне.';
  if (code==='connection/stale') return 'Стан зв’язку вже змінився. Перевірте актуальний стан.';
  if (code==='connection/invalid-email') return 'Вкажіть правильний email іншого користувача.';
  if (code==='connection/trainer-missing') return 'Профіль тренера ще не завантажено. Оновіть сторінку.';
  if (code==='permission-denied') return 'Немає дозволу на цю дію. Перевірте стан зв’язку.';
  return 'Результат ще не підтверджено. Перевірте стан після відновлення зв’язку.';
}
export function connectionDate(value) {
  const date=typeof value?.toDate==='function'?value.toDate():new Date(value);
  return Number.isNaN(date.getTime())?'Дата недоступна':date.toLocaleDateString('uk-UA');
}
export function createTrainerAccess(db) {
  const proof=uid=>doc(db,'trainerRequests',uid);
  const profile=uid=>doc(db,'users',uid);
  const trainer=uid=>doc(db,'trainers',uid);
  return {
    async readState(user) {
      const [p,r]=await Promise.all([getDocFromServer(profile(user.uid)),getDocFromServer(proof(user.uid))]);
      const data=r.exists()?r.data():null;
      return { profile:p.exists()?p.data():null, request:data, repair:!!data&&!validConnection(data,user.uid),
        legacy:!!p.data()?.trainerId&&(!validConnection(data,user.uid)||data.status!=='accepted') };
    },
    async request(user, trainerEmail, clientName, expected={generation:0,revision:0}) {
      verifiedUser(user);
      const target=normalizeTrainerEmail(trainerEmail), source=normalizeTrainerEmail(user.email);
      if (!emailValid(target)||target===source) fail('connection/invalid-email');
      const name=String(clientName||user.displayName||source).trim().slice(0,120);
      return runTransaction(db,async tx=>{
        const [p,r]=await Promise.all([tx.get(profile(user.uid)),tx.get(proof(user.uid))]);
        if(!p.exists())fail('connection/profile-missing');
        const old=r.exists()?r.data():null;
        if(old)validOrFail(old,user.uid);
        expectedOrFail(old,expected);
        if(p.data().trainerId || (old&&!terminal.has(old.status)))fail('connection/stale');
        if(old?.generation>=MAX_CONNECTION_REVISION || old?.revision>MAX_CONNECTION_REVISION-3)fail('connection/repair-required');
        const data={clientId:user.uid,clientEmail:source,clientName:name,trainerEmail:target,status:'pending',
          generation:(old?.generation||0)+1,revision:old?advance(old):1,createdAt:serverTimestamp()};
        tx.set(proof(user.uid),data);
        return connectionVersion(data);
      });
    },
    async accept(user, clientId, expected) {
      verifiedUser(user);
      try { return await runTransaction(db,async tx=>{
        const [r,t]=await Promise.all([tx.get(proof(clientId)),tx.get(trainer(user.uid))]);
        const data=r.data();validOrFail(data,clientId);
        if(replay(data,expected,'accepted',user.uid))return {alreadyApplied:true};
        expectedOrFail(data,expected);
        if(data.status!=='pending'||data.trainerEmail!==normalizeTrainerEmail(user.email)||clientId===user.uid)fail('connection/stale');
        if(data.revision>=MAX_CONNECTION_REVISION-1)fail('connection/repair-required');
        if(!t.exists())fail('connection/trainer-missing');
        const name=String(t.data().profile?.name||user.displayName||user.email).trim().slice(0,120);
        tx.update(proof(clientId),{status:'accepted',trainerId:user.uid,trainerName:name,acceptedAt:serverTimestamp(),revision:advance(data)});
        tx.update(profile(clientId),{trainerId:user.uid,trainerEmail:data.trainerEmail});
        tx.update(trainer(user.uid),new FieldPath('clients',clientId),{name:data.clientName,email:data.clientEmail,
          addedAt:serverTimestamp(),status:'active',generation:data.generation});
        return {alreadyApplied:false};
      }); } catch (error) {
        // An optimistic transaction can lose after rules already see the winning accept.
        // Reconcile only this exact operation; never retry it against a newer cycle.
        if (error.code==='permission-denied') {
          try {
            const current=(await getDocFromServer(proof(clientId))).data();
            if(validConnection(current,clientId)&&replay(current,expected,'accepted',user.uid))return {alreadyApplied:true};
          } catch { /* Keep the original denial if the new state is no longer readable. */ }
        }
        throw error;
      }
    },
    async finishPending(user, clientId, expected, status) {
      if(!['rejected','cancelled'].includes(status))fail('connection/stale');
      if(status==='rejected')verifiedUser(user);
      return runTransaction(db,async tx=>{
        const r=await tx.get(proof(clientId)), data=r.data();validOrFail(data,clientId);
        if(replay(data,expected,status))return {alreadyApplied:true};
        expectedOrFail(data,expected);
        if(data.status!=='pending'||(status==='cancelled'?user.uid!==clientId:data.trainerEmail!==normalizeTrainerEmail(user.email)))fail('connection/stale');
        tx.update(proof(clientId),{status,endedAt:serverTimestamp(),revision:advance(data)});
        return {alreadyApplied:false};
      });
    },
    async disconnect(user, expected) {
      const attempt=skipRoster=>runTransaction(db,async tx=>{
        const [r,p]=await Promise.all([tx.get(proof(user.uid)),tx.get(profile(user.uid))]);
        const data=r.data();validOrFail(data,user.uid);
        if(replay(data,expected,'disconnected'))return {alreadyApplied:true};
        expectedOrFail(data,expected);
        if(data.status!=='accepted'||!p.exists())fail('connection/stale');
        tx.update(proof(user.uid),{status:'disconnected',endedAt:serverTimestamp(),revision:advance(data)});
        tx.update(profile(user.uid),{trainerId:null,trainerEmail:null});
        if(!skipRoster)tx.update(trainer(data.trainerId),new FieldPath('clients',user.uid),deleteField());
        return {alreadyApplied:false};
      });
      try { return await attempt(false); }
      // Missing documents can be reported as permission-denied before the update precondition.
      // The fallback still requires rules to prove the roster is absent or already removed.
      catch(error) { if(!['not-found','permission-denied'].includes(error.code))throw error; return attempt(true); }
    },
    async clearLegacy(user) {
      return runTransaction(db,async tx=>{
        const [r,p]=await Promise.all([tx.get(proof(user.uid)),tx.get(profile(user.uid))]);
        if(!p.exists())fail('connection/profile-missing');
        if(validConnection(r.data(),user.uid)&&r.data().status==='accepted')fail('connection/stale');
        tx.update(profile(user.uid),{trainerId:null,trainerEmail:null});
      });
    },
    async deleteLegacyPending(requestId, clientId) {
      if(requestId===clientId)fail('connection/stale');
      // Rules limit this to the owner or verified addressee and legacy pending only.
      return deleteDoc(proof(requestId));
    },
  };
}
