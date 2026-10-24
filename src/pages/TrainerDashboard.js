import React, { useState, useEffect, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { auth, googleProvider, db } from '../firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { LogOut, Users, ChevronLeft, RefreshCw, Calendar } from 'lucide-react';
import { LoadingScreen, ToastProvider, toast } from '../components';
import ClientList from '../components/trainer/ClientList';
import ClientDetailsModal from '../components/trainer/ClientDetailsModal';
import PendingRequests from '../components/trainer/PendingRequests';
import { formatLocalDateKey, parseDateInput } from '../utils/date';

export default function TrainerDashboard() {
  const navigate = useNavigate();

  const [firebaseUser, setFirebaseUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [clientMeals, setClientMeals] = useState({});
  const [selectedClient, setSelectedClient] = useState(null);
  const [showClientDetails, setShowClientDetails] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  const [trainerReady,setTrainerReady]=useState(false);
  const [accessError,setAccessError]=useState('');
  const [reload,setReload]=useState(0);
  const session=useRef(0), allowed=useRef(new Map()), denied=useRef(new Map());
  const clearPrivate=useCallback(()=>{
    allowed.current.clear();denied.current.clear();
    setClients([]);setClientMeals({});setSelectedClient(null);setShowClientDetails(false);setTrainerReady(false);
  },[]);
  useEffect(()=>onAuthStateChanged(auth,user=>{
    session.current = session.current + 1;
    flushSync(()=>{clearPrivate();setFirebaseUser(user);setLoading(false);setAccessError('');});
  }),[clearPrivate]);
  useEffect(()=>{
    if(!firebaseUser)return undefined;
    const version=++session.current;let off=()=>{},active=true;
    clearPrivate();setAccessError('');
    const initialize=async()=>{
      try {
        const ref=doc(db,'trainers',firebaseUser.uid);
        await runTransaction(db,async tx=>{
          const current=await tx.get(ref);
          if(!current.exists())tx.set(ref,{profile:{name:firebaseUser.displayName||'Тренер',email:firebaseUser.email,createdAt:serverTimestamp()},clients:{}});
        });
        if(!active||session.current!==version)return;
        off=onSnapshot(ref,{includeMetadataChanges:true},snapshot=>{
          if(!active||session.current!==version||snapshot.metadata.fromCache)return;
          const data=snapshot.data()?.clients;
          const list=data&&typeof data==='object'&&!Array.isArray(data)?Object.entries(data).filter(([id,value])=>value&&typeof value==='object'&&(!denied.current.has(id)||denied.current.get(id)!==value.generation)).map(([id,value])=>({...value,id})):[];
          const next=new Map(list.map(client=>[client.id,client.generation]));
          // Invalidate old deliveries before updating React, including reconnect to the same UID.
          const removed=[...allowed.current.keys()].filter(id=>!next.has(id)||next.get(id)!==allowed.current.get(id));
          allowed.current=next;
          flushSync(()=>{
            setClients(list);setTrainerReady(snapshot.exists());
            setClientMeals(previous=>Object.fromEntries(Object.entries(previous).filter(([id])=>next.has(id)&&!removed.includes(id))));
            setSelectedClient(previous=>{
              if(previous&&(!next.has(previous.id)||removed.includes(previous.id))){setShowClientDetails(false);return null;}
              return previous;
            });
          });
        },()=>{
          if(active&&session.current===version){session.current = session.current + 1;flushSync(()=>{clearPrivate();setAccessError('Доступ до каталогу втрачено. Перевірте з’єднання.');});}
        });
      }catch{if(active&&session.current===version){clearPrivate();setAccessError('Не вдалося завантажити профіль тренера.');}}
    };
    void initialize();
    return ()=>{active=false;session.current = session.current + 1;off();allowed.current.clear();};
  },[firebaseUser,reload,clearPrivate]);
  const revokeClient=useCallback(id=>{
    denied.current.set(id,allowed.current.get(id));allowed.current.delete(id);
    flushSync(()=>{
      setClients(previous=>previous.filter(client=>client.id!==id));
      setClientMeals(previous=>{const next={...previous};delete next[id];return next;});
      setSelectedClient(previous=>{if(previous?.id===id){setShowClientDetails(false);return null;}return previous;});
      setAccessError('Дані клієнта прибрано: доступ відкликано або його не вдалося підтвердити.');
    });
  },[]);
  const formatDate=date=>formatLocalDateKey(date);
  useEffect(()=>{
    if(!firebaseUser||!trainerReady)return undefined;
    const version=session.current;let active=true;
    setClientMeals({});
    const offs=clients.map(client=>{
      const valid=()=>active&&session.current===version&&allowed.current.has(client.id)&&allowed.current.get(client.id)===client.generation;
      return onSnapshot(doc(db,'users',client.id,'mealHistory',formatLocalDateKey(selectedDate)),{includeMetadataChanges:true},snapshot=>{
        if(valid()&&!snapshot.metadata.fromCache)setClientMeals(previous=>({...previous,[client.id]:snapshot.exists()?snapshot.data():null}));
      },()=>{if(valid())revokeClient(client.id);});
    });
    return ()=>{active=false;offs.forEach(off=>off());};
  },[firebaseUser,trainerReady,clients,selectedDate,revokeClient]);

  // Обробка вибору дати з input[type=date]
  const handleDateChange = (e) => {
    // Якщо очищено - повертаємо на сьогодні
    if (!e.target.value) {
      setSelectedDate(new Date());
      return;
    }
    const newDate = parseDateInput(e.target.value);
    if (!newDate) {
      return;
    }
    setSelectedDate(newDate);
  };

  // Google Sign In
  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Error signing in:', error);
      toast.error('Помилка входу');
    }
  };

  // Sign Out
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Відкрити деталі клієнта
  const handleClientClick = (client) => {
    setSelectedClient(client);
    setShowClientDetails(true);
  };

  const handleRefresh=()=>setReload(value=>value+1);

  // Loading
  if (loading) {
    return <LoadingScreen />;
  }

  // Login screen for trainer
  if (!firebaseUser) {
    return (
      <ToastProvider>
        <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#F2F2F7' }}>
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
            <div className="w-20 h-20 bg-[#007AFF]/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Users size={40} className="text-[#007AFF]" />
            </div>
            <h1 className="text-[22px] font-bold text-black mb-2">Тренерський дашборд</h1>
            <p className="text-[15px] text-[#8E8E93] mb-8">
              Увійдіть через Google, щоб переглядати харчування ваших клієнтів у реальному часі
            </p>
            <button
              onClick={handleGoogleSignIn}
              className="w-full py-4 bg-[#007AFF] text-white rounded-xl text-[17px] font-semibold active:opacity-80 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Увійти через Google
            </button>
            <button
              onClick={() => navigate('/')}
              className="mt-4 text-[#007AFF] active:opacity-60 text-[15px]"
            >
              ← Назад до додатку
            </button>
          </div>
        </div>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <div className="min-h-screen pb-8 bg-[#F2F2F7]">
        {/* Header - iOS style */}
        <div className="bg-white/80 backdrop-blur-xl border-b border-black/5">
          <div className="max-w-lg mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate('/')}
                  className="text-[#007AFF] active:opacity-60"
                >
                  <ChevronLeft size={24} />
                </button>
                <div>
                  <h1 className="text-[17px] font-semibold text-black">Тренерський дашборд</h1>
                  <p className="text-[13px] text-[#8E8E93]">{firebaseUser.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleRefresh}
                  className="p-2.5 text-[#8E8E93] active:bg-[#F2F2F7] rounded-full"
                  title="Оновити"
                >
                  <RefreshCw size={20} />
                </button>
                <button
                  onClick={handleSignOut}
                  className="p-2.5 text-[#FF3B30] active:bg-[#F2F2F7] rounded-full"
                  title="Вийти"
                >
                  <LogOut size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-lg mx-auto px-4 pt-4">
          {/* Stats - iOS Cards */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white rounded-2xl p-3 text-center">
              <div className="text-[22px] font-bold text-[#007AFF]">{clients.length}</div>
              <div className="text-[13px] text-[#8E8E93]">Клієнтів</div>
            </div>
            <div className="bg-white rounded-2xl p-3 text-center">
              <div className="text-[22px] font-bold text-[#34C759]">
                {Object.values(clientMeals).filter(m => m?.totalMacros?.p >= 100 && !Object.keys(m?.foodNotes || {}).length).length}
              </div>
              <div className="text-[13px] text-[#8E8E93]">Норма ✓</div>
            </div>
            <div className="bg-white rounded-2xl p-3 text-center">
              <div className="text-[22px] font-bold text-[#FF9500]">
                {Object.values(clientMeals).filter(m => m && (m?.totalMacros?.p < 100 || Object.keys(m?.foodNotes || {}).length > 0)).length}
              </div>
              <div className="text-[13px] text-[#8E8E93]">В процесі</div>
            </div>
          </div>

          {/* Date Picker - iOS style */}
          <div className="bg-white rounded-2xl p-4 mb-4">
            <label className="flex items-center justify-center gap-2 cursor-pointer active:opacity-60">
              <Calendar size={20} className="text-[#007AFF]" />
              <span className="text-[17px] font-semibold text-black">
                {selectedDate.toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
              <input
                type="date"
                value={formatDate(selectedDate)}
                onChange={handleDateChange}
                max={formatDate(new Date())}
                className="sr-only"
              />
            </label>
            <div className="text-center mt-2">
              {formatDate(selectedDate) !== formatDate(new Date()) ? (
                <button
                  onClick={() => setSelectedDate(new Date())}
                  className="text-[13px] text-[#007AFF] font-medium px-3 py-1 bg-[#007AFF]/10 rounded-full active:opacity-60"
                >
                  ← Повернутись на сьогодні
                </button>
              ) : (
                <span className="text-[13px] text-[#8E8E93]">Сьогодні</span>
              )}
            </div>
          </div>

          {/* Pending Requests */}
          {accessError&&<p role="alert" className="mb-4 text-[14px]">{accessError}</p>}
          <PendingRequests firebaseUser={firebaseUser} ready={trainerReady}/>

          {/* Client List */}
          {clients.length > 0 ? (
            <ClientList
              clients={clients}
              clientMeals={clientMeals}
              onClientClick={handleClientClick}
            />
          ) : (
            <div className="bg-white rounded-2xl p-8 text-center">
              <div className="w-16 h-16 bg-[#8E8E93]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users size={32} className="text-[#8E8E93]" />
              </div>
              <h3 className="text-[17px] font-semibold text-black mb-2">Ще немає клієнтів</h3>
              <p className="text-[15px] text-[#8E8E93] mb-4">
                Клієнти можуть додати вас як тренера, вказавши вашу email адресу:
              </p>
              <div className="bg-[#F2F2F7] rounded-xl px-4 py-3 inline-block">
                <code className="text-[15px] text-[#007AFF]">{firebaseUser.email}</code>
              </div>
            </div>
          )}
        </div>

        {/* Client Details Modal */}
        {selectedClient && (
          <ClientDetailsModal
            key={`${firebaseUser.uid}:${selectedClient.id}:${selectedClient.generation}`}
            isOpen={showClientDetails}
            onClose={() => {
              setShowClientDetails(false);
              setSelectedClient(null);
            }}
            onAccessLost={()=>revokeClient(selectedClient.id)}
            client={selectedClient}
          />
        )}
      </div>
    </ToastProvider>
  );
}
