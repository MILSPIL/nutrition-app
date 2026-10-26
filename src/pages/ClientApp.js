import DiaryDatePicker from '../components/DiaryDatePicker';
import { targetsReport } from '../services/profileTargets';
import FoodNotesPanel from '../components/FoodNotesPanel';
import { foodNotesReport } from '../services/foodNotes';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { auth, googleProvider, db, IS_LOCAL_LAB, IS_PHONE_LAB } from '../firebase';
import { signInWithPopup, signInWithCustomToken, signInAnonymously, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { writerStamp } from '../services/writerFence';
import {
  PRODUCTS_DB,
  MEAL_LETTERS,
  DEFAULT_PORTIONS
} from '../data/products';
import {
  LoginScreen,
  Header,
  MealSection,
  ProductModal,
  ReportModal,
  AddCustomProductModal,
  PortionSettingsModal,
  DaySelectorModal,
  AccountSwitchModal,
  SettingsModal,
  ActivitySection,
  RulesSection,
  LoadingScreen,
  ToastProvider,
  toast,
  WelcomeModal,
  AddTrainerModal,
  MeasurementsModal,
  MeasurementReminderModal
} from '../components';
import {
  calculateMealsMacros,
  createDefaultClientUser
} from '../services/nutrition';
import VoiceInputModal from '../components/VoiceInputModal';
import TrainerChat from '../components/TrainerChat';
import TrainerLauncher from '../components/TrainerLauncher';
import { kyivDateKey } from '../services/trainerDates';
import PilotPanel from '../components/PilotPanel';
import { createPilotLedger } from '../services/pilotLedger';
import { catalogItem, quantityText, itemMacros, sourceText } from '../services/mealItems';
import { saveProfileSettings,commitMealDay } from '../services/mealStore';
import { hasMeals } from '../services/mealCommands';
import { useMealDay, saveError } from '../services/useMealDay';
import { calculateProgramDay, getTodayDateKey, parseDateInput } from '../utils/date';

const trainerChatEnabled=process.env.REACT_APP_TRAINER_CHAT==='1';

export default function ClientApp() {
  // Firebase Auth
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [currentUser, setCurrentUser] = useState(null);
  const profileIdentity = useRef({});
  useEffect(() => {profileIdentity.current = {uid:firebaseUser?.uid, profileId:currentUser};}, [firebaseUser?.uid,currentUser]);
  const [users, setUsers] = useState({});
  const [globalCustomProducts, setGlobalCustomProducts] = useState({});
  const [productOverrides, setProductOverrides] = useState({});

  const [showVoiceInput,setShowVoiceInput]=useState(false);
  const [trainerNote,setTrainerNote]=useState(null);
  const trainerTriggerRef=useRef(null);
  const [trainerDateContext,setTrainerDateContext]=useState({mode:"default"});
  const [trainerMode,setTrainerMode]=useState("coach");
  const [pilotVersion,setPilotVersion]=useState(0);
  const pilotLedger=useMemo(()=>createPilotLedger(),[]);
  useEffect(()=>()=>{void pilotLedger.close().catch(()=>{});},[pilotLedger]);

  // Modals
  const [showAccountSwitch, setShowAccountSwitch] = useState(false);
  const [showPortionSettings, setShowPortionSettings] = useState(false);
  const [showDaySelector, setShowDaySelector] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showAddCustomProduct, setShowAddCustomProduct] = useState(false);
  const [showAddTrainer, setShowAddTrainer] = useState(false);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [showMeasurementReminder, setShowMeasurementReminder] = useState(false);

  const [userPortions, setUserPortions] = useState(DEFAULT_PORTIONS);
  const [programDay, setProgramDay] = useState(1);
  const [currentWeight, setCurrentWeight] = useState(null);
  const [selectedMeal, setSelectedMeal] = useState(1);
  const [mealsDateKey, setMealsDateKey] = useState(kyivDateKey());
  const mealDay = useMealDay(firebaseUser?.uid, currentUser, mealsDateKey);
  const meals = mealDay.day.meals;
  useEffect(()=>{
    const fresh=mealDay.day.planContext;
    if(!fresh||!currentUser)return;
    setUsers(previous=>({...previous,[currentUser]:{...previous[currentUser],...fresh.profile}}));
    setUserPortions(fresh.profile?.portions||DEFAULT_PORTIONS);
    setGlobalCustomProducts(fresh.globalCustomProducts||{});
    setProductOverrides(fresh.productOverrides||{});
    // Snapshot змінюється лише після читання відповідного профілю; сам перехід профілю не застосовує попередній snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[mealDay.day.planContext]);
  const retryPending=async()=>{await mealDay.retry();setPilotVersion(x=>x+1);};
  const metadataDirty = useRef(null);
  const [metadataVersion,setMetadataVersion] = useState(0);
  const changeMetadata = (key,setter,value) => { if(mealDay.busy||mealDay.hasPending)return; metadataDirty.current={...(metadataDirty.current || {}),[key]:value}; setter(value);setMetadataVersion(x=>x+1); };
  const mutateMeals = async command => {
    try { return await mealDay.commit(command); }
    catch(error) { toast.error(saveError(error)); return null; }
  };
  const [activity, setActivity] = useState("");
  const [otherActivity, setOtherActivity] = useState("");
  const [currentLetter, setCurrentLetter] = useState(null);

  // Check for Monday measurement reminder
  useEffect(() => {
    const today = new Date();
    const isMonday = today.getDay() === 1;
    const todayStr = getTodayDateKey();
    let dismissed = null;
    try {
      dismissed = localStorage.getItem('measurementReminderDismissed');
    } catch {
      // Необов’язкова перевага нагадування не повинна блокувати вхід.
    }

    if (isMonday && dismissed !== todayStr && firebaseUser) {
      // Show reminder after a short delay
      const timer = setTimeout(() => {
        setShowMeasurementReminder(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [firebaseUser]);

  // Firebase Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const data = userDoc.data();
          setUsers(data.users || {});
          setGlobalCustomProducts(data.globalCustomProducts || {});
          setProductOverrides(data.productOverrides || {});

          if (Object.keys(data.users || {}).length > 0) {
            const firstUserId = Object.keys(data.users)[0];
            loadUserFromData(firstUserId, data.users);
          } else {
            await createNewUserProfile(user, userDocRef);
          }
        } else {
          await createNewUserProfile(user, userDocRef, true);
        }
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync with Firestore
  useEffect(() => {
    if (!firebaseUser) return;

    const userDocRef = doc(db, 'users', firebaseUser.uid);
    const unsubscribe = onSnapshot(userDocRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        if (data.globalCustomProducts) {
          setGlobalCustomProducts(data.globalCustomProducts);
        }
      }
    });

    return () => unsubscribe();
  }, [firebaseUser]);

  const createNewUserProfile = async (user, userDocRef, isNew = false) => {
    const newUserId = user.uid;
    const displayName = user.displayName || user.email?.split('@')[0] || 'Користувач';
    const newUser = createDefaultClientUser(displayName, DEFAULT_PORTIONS);
    const newUsers = { [newUserId]: newUser };
    setUsers(newUsers);

    if (isNew) {
      await setDoc(userDocRef, {
        ...writerStamp(),
        users: newUsers,
        globalCustomProducts: {},
        createdAt: new Date().toISOString()
      });
      setGlobalCustomProducts({});
    } else {
      await setDoc(userDocRef, {
        ...writerStamp(),
        users: newUsers,
        globalCustomProducts: {},
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }

    loadUserFromData(newUserId, newUsers, true);
  };

  const loadUserFromData = (userId, usersData, isNewUser = false) => {
    const user = usersData[userId];
    if (!user) return;

    setCurrentUser(userId);
    setUserPortions(user.portions || DEFAULT_PORTIONS);

    if (user.startDate) {
      const currentDay = calculateCurrentDay(user.startDate);
      setProgramDay(currentDay);
    } else {
      setProgramDay(user.programDay || 1);
      if (isNewUser) {
        // Показуємо налаштування для встановлення дати
        setShowSettings(true);
      }
    }

    setCurrentWeight(user.currentWeight || null);
    setMealsDateKey(kyivDateKey());
    setActivity(user.activity || "");
    setOtherActivity(user.otherActivity || "");
  };

  const calculateCurrentDay = (startDate) => calculateProgramDay(startDate, parseDateInput(kyivDateKey()));

  // Google Sign In
  const handleGoogleSignIn = async () => {
    try {
      if(IS_PHONE_LAB) {
        const response = await fetch('/lab/token',{method:'POST'});
        if(!response.ok) throw Error('Сеанс лабораторії завершився. Підключіть телефон знову.');
        await signInWithCustomToken(auth,(await response.json()).token);
      } else if(IS_LOCAL_LAB) await signInAnonymously(auth);
      else await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Error signing in:', error);
      toast.error('Помилка входу: ' + error.message);
    }
  };

  // Sign Out
  const handleSignOut = async () => {
    try {
      setShowVoiceInput(false);
      await signOut(auth);
      setCurrentUser(null);
      setUsers({});
      setGlobalCustomProducts({});
      setMealsDateKey(kyivDateKey());
      } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Профіль не містить записів дня в цьому запиті. Adapter перечитує актуальний root.
  const saveToFirestore = async (profilePatch = {}, newGlobalCustomProducts, newProductOverrides) => {
    if (!firebaseUser || !currentUser || mealDay.busy || mealDay.hasPending) return;
    try {
      await saveProfileSettings(firebaseUser.uid,currentUser,profilePatch,{
        ...(newGlobalCustomProducts ? {globalCustomProducts:newGlobalCustomProducts}:{}),
        ...(newProductOverrides ? {productOverrides:newProductOverrides}:{})
      });
      setUsers(previous=>({...previous,[currentUser]:{...previous[currentUser],...profilePatch}}));
      mealDay.reload();
    } catch(error) { toast.error(saveError(error)); }
  };

  useEffect(() => {
    if (!metadataDirty.current || !mealDay.ready || mealDay.busy || mealDay.hasPending || mealDay.day.legacy) return;
    const timer=setTimeout(async()=>{
      const patch=metadataDirty.current;metadataDirty.current=null;
      await mutateMeals({type:'metadata',metadata:patch});
    },500);
    return()=>clearTimeout(timer);
    // Навмисно лише користувацькі зміни; initial load не запускає запис.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[metadataVersion,mealDay.ready,mealDay.busy,mealDay.hasPending,activity,otherActivity,currentWeight,programDay]);

  useEffect(()=>{
    if(!mealDay.ready)return;
    setActivity(mealDay.day.activity || '');setOtherActivity(mealDay.day.otherActivity || '');
    setCurrentWeight(mealDay.day.currentWeight ?? null);setProgramDay(mealDay.day.programDay || calculateProgramDay(users[currentUser]?.startDate,parseDateInput(mealsDateKey)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[mealDay.ready,mealsDateKey]);

  // Helper functions
  const getUserCustomProducts = () => {
    if (!currentUser || !users[currentUser]) return {};
    return users[currentUser].customProducts || {};
  };

  const isProductHidden = (productName) => {
    if (!currentUser || !users[currentUser]) return false;
    const hiddenProducts = users[currentUser].hiddenProducts || [];
    return hiddenProducts.includes(productName);
  };

  const getProductPortion = (productName) => {
    if (userPortions[productName]) return userPortions[productName];
    if (DEFAULT_PORTIONS[productName]) return DEFAULT_PORTIONS[productName];
    const originalProduct = getOriginalProduct(productName);
    if (originalProduct?.raw) return originalProduct.raw;
    return 100;
  };

  const getAllProducts = (letter) => {
    const standardProducts = PRODUCTS_DB[letter]?.products || [];
    const globalProducts = globalCustomProducts[letter] || [];
    const myProducts = getUserCustomProducts()[letter] || [];
    const allCustom = [...globalProducts, ...myProducts];
    const visibleCustom = allCustom.filter(p => !isProductHidden(p.name));

    // Застосовуємо overrides до продуктів
    const allProducts = [...standardProducts, ...visibleCustom];
    return allProducts.map(p => {
      const override = productOverrides[p.name];
      if (override) {
        return { ...p, ...override, isOverridden: true };
      }
      return p;
    });
  };

  // Отримати оригінальний продукт без overrides
  const getOriginalProduct = (productName) => {
    // Шукаємо у всіх категоріях
    for (const letter of Object.keys(PRODUCTS_DB)) {
      const found = PRODUCTS_DB[letter].products.find(p => p.name === productName);
      if (found) return found;
    }
    // Шукаємо в кастомних продуктах
    for (const letter of Object.keys(globalCustomProducts)) {
      const found = globalCustomProducts[letter]?.find(p => p.name === productName);
      if (found) return found;
    }
    return null;
  };

  // Зберегти override для продукту
  const saveProductOverride = (productName, values) => {
    const newOverrides = {
      ...productOverrides,
      [productName]: values
    };
    setProductOverrides(newOverrides);
    saveToFirestore({}, undefined, newOverrides);
  };

  // Скинути override для продукту
  const resetProductOverride = (productName) => {
    const newOverrides = { ...productOverrides };
    delete newOverrides[productName];
    setProductOverrides(newOverrides);
    saveToFirestore({}, undefined, newOverrides);
  };

  const calculateTotalMacros = () => {
    if (!currentUser || !meals) return { p: 0, f: 0, c: 0, cal: 0 };
    return calculateMealsMacros(meals);
  };

  // Усі ручні й голосові записи проходять той самий adapter дня.
  const addProduct = async (letter, product, portion=100) => {
    const base=userPortions[product.name] || product.raw || getProductPortion(product.name);
    const item=catalogItem(product,Math.round(base*portion/100),portion);
    const result=await mutateMeals({type:'append',meal:selectedMeal,letter,items:[item]});
    if(result) setShowProductModal(false);
  };
  const addProductWithCustomGrams = async (letter,product,grams,base) => {
    if(!(grams>0)) {toast.warning('Введіть кількість більше 0');return;}
    await mutateMeals({type:'append',meal:selectedMeal,letter,items:[catalogItem(product,grams,grams/base*100)]});
  };
  const removeProduct = (meal,letter,index) => mutateMeals({type:'remove',meal,letter,index});
  const updateProductWeight = (meal,letter,index,value) => mutateMeals({type:'quantity',meal,letter,index,value});

  const addCustomProduct = (productData) => {
    if (!currentLetter || !currentUser) return;

    const raw = productData.raw;
    const cooked = productData.cooked || raw;
    const coef = cooked / raw;

    const newProduct = {
      name: productData.name,
      raw: raw,
      cooked: cooked,
      coef: coef,
      verified: false,
      p: productData.p,
      f: productData.f,
      c: productData.c,
      cal: productData.cal || Math.round(productData.p * 4 + productData.c * 4 + productData.f * 9),
      addedBy: users[currentUser].name,
      addedById: currentUser,
      addedAt: new Date().toISOString()
    };

    const updatedGlobalCustomProducts = {
      ...globalCustomProducts,
      [currentLetter]: [...(globalCustomProducts[currentLetter] || []), newProduct]
    };
    setGlobalCustomProducts(updatedGlobalCustomProducts);

    const updatedUserPortions = {
      ...userPortions,
      [newProduct.name]: raw
    };
    setUserPortions(updatedUserPortions);
    saveToFirestore({portions:updatedUserPortions},updatedGlobalCustomProducts);

    addProduct(currentLetter, newProduct, 100);
    setShowAddCustomProduct(false);
  };

  const deleteCustomProduct = (letter, productId) => {
    const allProducts = [...(PRODUCTS_DB[letter]?.products || []), ...(globalCustomProducts[letter] || []), ...(getUserCustomProducts()[letter] || [])];
    const product = allProducts[productId];

    if (!product) return;

    const hiddenProducts = users[currentUser]?.hiddenProducts || [];
    const updatedHiddenProducts = [...hiddenProducts, product.name];

    const updatedUsers = {
      ...users,
      [currentUser]: {
        ...users[currentUser],
        hiddenProducts: updatedHiddenProducts
      }
    };
    setUsers(updatedUsers);

    const updatedUserPortions = { ...userPortions };
    delete updatedUserPortions[product.name];
    setUserPortions(updatedUserPortions);
    saveToFirestore({hiddenProducts:updatedHiddenProducts,portions:updatedUserPortions});
  };

  // Report generation
  const generateReport = () => {
    const totalMacros = calculateTotalMacros();
    let report = `${mealsDateKey} · День ${programDay}\n🥕ХАРЧУВАННЯ\n`;

    [1, 2, 3, 4].forEach(mealNum => {
      const mealEmoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'][mealNum - 1];
      report += `${mealEmoji} прийом їжі:\n`;

      const mealData = meals[mealNum];
      const letters = [...new Set([...MEAL_LETTERS[mealNum],...Object.keys(mealData || {})])];

      letters.forEach(letter => {
        if (mealData[letter] && mealData[letter].length > 0) {
          const products = mealData[letter].map(p => `${p.name} (${quantityText(p)}; ${Math.round(itemMacros(p).cal)} ккал; ${sourceText(p)})`).join(', ');
          report += `📌${letter}) ${products}\n`;
        }
      });

      report += '\n';
    });

    const activities = [];
    if (activity) activities.push(activity);
    if (otherActivity) activities.push(otherActivity);

    if (activities.length > 0) {
      report += `Рухова активність ${activities.join(', ')}`;
    }

    report += `\n\n📊 БЖВ за день:`;
    report += `\n${targetsReport(totalMacros, users[currentUser])}`;

    return report + foodNotesReport(mealDay.day.notes);
  };

  // Handlers
  const handleNameChange = (newName) => {
    if(mealDay.busy||mealDay.hasPending)return;
    const updatedUsers = {
      ...users,
      [currentUser]: { ...users[currentUser], name: newName }
    };
    setUsers(updatedUsers);
    saveToFirestore({name:newName});
  };

  const handleTargetsSave = async nutritionTargets => {
    const uid = firebaseUser?.uid, profileId = currentUser;
    const sameOwner = () => auth.currentUser?.uid === uid && profileIdentity.current.uid === uid && profileIdentity.current.profileId === profileId;
    if (!uid || !profileId || !sameOwner() || !mealDay.ready || mealDay.busy || mealDay.hasPending) throw Error('unauthorized');
    await saveProfileSettings(uid, profileId, {nutritionTargets});
    if (!sameOwner()) throw Error('unauthorized');
    setUsers(previous => ({...previous, [profileId]:{...previous[profileId], nutritionTargets}}));
    mealDay.reload();
  };

  const handleStartDateSave = (startDate) => {
    const currentDay = calculateCurrentDay(startDate);

    const updatedUsers = {
      ...users,
      [currentUser]: {
        ...users[currentUser],
        startDate: startDate,
        programDay: currentDay
      }
    };

    setUsers(updatedUsers);
    saveToFirestore({startDate});
    setProgramDay(currentDay);
  };

  // Loading screen
  if (authLoading) {
    return <LoadingScreen />;
  }

  // Login screen
  if (!firebaseUser) {
    return <LoginScreen onGoogleSignIn={handleGoogleSignIn} />;
  }

  if (!currentUser) return null;

  const macros = calculateTotalMacros();
  const todayDate = kyivDateKey();
  const previousDate = new Date(todayDate + 'T12:00:00Z');
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  const yesterdayDate = previousDate.toISOString().slice(0, 10);
  const dateBusy = mealDay.busy || mealDay.hasPending || !!metadataDirty.current;
  const chooseDate = (value) => {
    if (!value || dateBusy) return;
    setMealsDateKey(value);
  };
  const openTrainer = (event, mode = "coach") => {
    trainerTriggerRef.current=event?.currentTarget || document.activeElement;
    setTrainerNote(null);
    setTrainerMode(mode);
    setTrainerDateContext({mode:"default"});
    setShowVoiceInput(true);
  };
  const anyModal = showVoiceInput || showAccountSwitch || showPortionSettings || showDaySelector || showSettings || showProductModal || showReport || showAddCustomProduct || showAddTrainer || showMeasurements || showMeasurementReminder;

  return (
    <ToastProvider>
    <div className={`min-h-screen bg-[#F2F2F7] ${trainerChatEnabled?"coach-page":"pb-8"}`}>
      <Header
        user={users[currentUser]}
        programDay={programDay}
        currentWeight={currentWeight}
        macros={macros}
        selectedMeal={selectedMeal}
        onWeightChange={value=>changeMetadata('currentWeight',setCurrentWeight,value)}
        onNameChange={handleNameChange}
        onMealSelect={setSelectedMeal}
        onShowDaySelector={() => {if(!mealDay.busy&&!mealDay.hasPending)setShowDaySelector(true);}}
        onShowMeasurements={() => {if(!mealDay.busy&&!mealDay.hasPending)setShowMeasurements(true);}}
        onShowSettings={() => {if(!mealDay.busy&&!mealDay.hasPending)setShowSettings(true);}}
        onShowVoiceInput={event=>openTrainer(event,"food")}
        voiceLabel={trainerChatEnabled?'Додати їжу':undefined}
        dateControl={<DiaryDatePicker value={mealsDateKey} today={todayDate} yesterday={yesterdayDate} disabled={dateBusy} onSelect={chooseDate}/>}
        voiceDisabled={!mealDay.ready || mealDay.busy || mealDay.requiresReload || !!mealDay.day.legacy}

      />

      <div className="max-w-lg mx-auto px-4 mb-4">
        {!mealDay.ready && <p role="status">Завантажую день…</p>}
        {mealDay.busy && <p role="status">Зберігаю…</p>}
        {(mealDay.error || mealDay.hasPending) && <div role="alert"><p>{mealDay.error || "Результат збереження ще не підтверджено. Перевірте той самий запис."}</p>
          <button disabled={mealDay.busy} onClick={()=>mealDay.hasPending?retryPending().catch(()=>{}):mealDay.reload()} className="p-3 text-[#007AFF]">Повторити</button>
          {mealDay.hasPending && <button onClick={handleSignOut} className="p-3 text-[#007AFF]">Вийти з облікового запису</button>}
          {mealDay.requiresReload && <button onClick={mealDay.reload} className="p-3 text-[#007AFF]">Перечитати день</button>}
        </div>}
        {mealDay.day.legacy && <div role="alert" className="p-3 bg-white rounded-xl mt-2">
          Попередні записи не мають дати. Оберіть їхню дату вище, потім підтвердьте перенесення. Дані збережені до підтвердження.
          {hasMeals(meals) && <p>У вибраному дні вже є записи. Якщо вони тотожні, підтвердження не створить дубля. Якщо різні, перевірте список нижче перед об’єднанням.</p>}
          <button onClick={()=>mutateMeals({type:'replace',meals:mealDay.day.legacy,confirmLegacy:true})} className="p-3 text-[#007AFF]">Це записи за {mealsDateKey}</button>
          {hasMeals(meals) && <button className="p-3 text-[#007AFF]" onClick={()=>{
            if(window.confirm('Додати ВСІ попередні записи до вибраного дня? Однакові продукти можуть повторитися. Перевірте обидва списки.')) mutateMeals({type:'replace',meals:mealDay.day.legacy,confirmLegacy:true,mergeLegacy:true});
          }}>Об’єднати обидва списки</button>}
          <ul>{Object.values(mealDay.day.legacy).flatMap(m=>Object.values(m).flat()).map((item,i)=><li key={i}>{item.name}: {quantityText(item)}</li>)}</ul>
        </div>}
      </div>
      <div className="max-w-lg mx-auto px-4"><FoodNotesPanel onResolve={trainerChatEnabled?note=>{trainerTriggerRef.current=document.activeElement;setTrainerDateContext({mode:"pinned",targetDate:mealsDateKey});setTrainerMode("food");setTrainerNote({text:note.originalText||note.name,targetDate:mealsDateKey,meal:selectedMeal,noteId:note.noteId,itemId:note.itemId});setShowVoiceInput(true);}:undefined} notes={mealDay.day.notes}/></div>
      <fieldset disabled={!mealDay.ready || mealDay.busy || mealDay.hasPending || !!mealDay.day.legacy}>
      <MealSection
        selectedMeal={selectedMeal}
        meals={meals}
        onRemoveProduct={removeProduct}
        onUpdateProductWeight={updateProductWeight}
        onOpenProductModal={(letter) => {
          setCurrentLetter(letter);
          setShowProductModal(true);
        }}
      />

      <ActivitySection
        activity={activity}
        otherActivity={otherActivity}
        onActivityChange={value=>changeMetadata('activity',setActivity,value)}
        onOtherActivityChange={value=>changeMetadata('otherActivity',setOtherActivity,value)}
      />

      </fieldset>

      <RulesSection />

      <div className="max-w-lg mx-auto px-4 mt-4">
        <button
          onClick={() => setShowReport(true)}
          className="w-full py-4 bg-[#34C759] text-white rounded-2xl text-[17px] font-semibold active:opacity-80"
        >
          Переглянути звіт
        </button>
      </div>

      <PilotPanel ledger={pilotLedger} uid={firebaseUser.uid} version={pilotVersion}/>
      {trainerChatEnabled && <TrainerLauncher hidden={anyModal} disabled={!mealDay.ready || mealDay.busy || mealDay.requiresReload || !!mealDay.day.legacy} onOpen={openTrainer} />}
      {trainerChatEnabled&&showVoiceInput?<TrainerChat mode={trainerMode} key={`${firebaseUser.uid}:${currentUser}`} uid={firebaseUser.uid} ownerKey={`${firebaseUser.uid}:${currentUser}`} date={mealsDateKey} meal={selectedMeal} ledger={pilotLedger}
        returnFocusRef={trainerTriggerRef} initialDateContext={trainerDateContext} initialNote={trainerNote} onClose={()=>{setShowVoiceInput(false);setTrainerNote(null);setPilotVersion(x=>x+1);}}
        planContext={mealDay.day.planContext||{profile:users[currentUser],globalCustomProducts,productOverrides}} dayMeals={meals}
        onOpenDay={value=>chooseDate(value)} onSaved={()=>{mealDay.reload();setPilotVersion(x=>x+1);}}
        onAdd={(command,date)=>commitMealDay(firebaseUser.uid,currentUser,date,command)}/>:<VoiceInputModal isOpen={showVoiceInput} onClose={()=>{setShowVoiceInput(false);setPilotVersion(x=>x+1);}}
        date={mealsDateKey} activeDate={mealsDateKey} meal={selectedMeal} ledger={pilotLedger}
        ownerKey={`${firebaseUser.uid}:${currentUser}`} dayMeals={meals} pendingSave={mealDay.hasPending} onRetryPending={retryPending}
        planContext={mealDay.day.planContext||{profile:users[currentUser],globalCustomProducts,productOverrides}}
        onRefreshPlan={async()=>(await mealDay.refresh()).planContext}
        onReturnToDate={setMealsDateKey} onSaved={()=>setPilotVersion(x=>x+1)}
        onAdd={async (command,date)=>{if(date!==mealsDateKey)throw Error('date_conflict');const result=await mealDay.commit(command);setPilotVersion(x=>x+1);return result;}}/>}
      {/* Modals */}
      <ProductModal
        isOpen={showProductModal}
        busy={mealDay.busy || mealDay.hasPending || !mealDay.ready}
        currentLetter={currentLetter}
        selectedMeal={selectedMeal}
        meals={meals}
        currentUser={currentUser}
        onClose={() => setShowProductModal(false)}
        getAllProducts={getAllProducts}
        getProductPortion={getProductPortion}
        getOriginalProduct={getOriginalProduct}
        addProduct={addProduct}
        addProductWithCustomGrams={addProductWithCustomGrams}
        deleteCustomProduct={deleteCustomProduct}
        onShowAddCustomProduct={() => setShowAddCustomProduct(true)}
        onSaveProductOverride={saveProductOverride}
        onResetProductOverride={resetProductOverride}
      />

      <AddCustomProductModal
        isOpen={showAddCustomProduct}
        onClose={() => setShowAddCustomProduct(false)}
        onAddProduct={addCustomProduct}
      />

      <ReportModal
        isOpen={showReport}
        onClose={() => setShowReport(false)}
        report={generateReport()}
      />

      <PortionSettingsModal
        isOpen={showPortionSettings}
        onClose={() => setShowPortionSettings(false)}
        userPortions={userPortions}
        onPortionsChange={value=>{setUserPortions(value);saveToFirestore({portions:value});}}
        getUserCustomProducts={getUserCustomProducts}
      />

      <DaySelectorModal
        isOpen={showDaySelector}
        onClose={() => setShowDaySelector(false)}
        programDay={programDay}
        onDayChange={value => {
          const startDate = users[currentUser]?.startDate;
          if (!startDate) return changeMetadata('programDay',setProgramDay,value);
          const date = new Date(`${startDate}T12:00:00Z`);
          date.setUTCDate(date.getUTCDate() + value - 1);
          chooseDate(date.toISOString().slice(0, 10));
        }}
        disabled={dateBusy || !mealDay.ready}
        startDate={users[currentUser]?.startDate}
        calculateCurrentDay={calculateCurrentDay}
      />

      <AccountSwitchModal
        isOpen={showAccountSwitch}
        onClose={() => setShowAccountSwitch(false)}
        users={users}
        currentUser={currentUser}
        firebaseUser={firebaseUser}
        onSignOut={handleSignOut}
      />

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        firebaseUser={firebaseUser}
        profile={users[currentUser]}
        profileKey={`${firebaseUser.uid}:${currentUser}`}
        onTargetsSave={handleTargetsSave}
        currentStartDate={users[currentUser]?.startDate}
        onStartDateSave={handleStartDateSave}
        calculateCurrentDay={calculateCurrentDay}
        onShowPortionSettings={() => {
          setShowSettings(false);
          setShowPortionSettings(true);
        }}
        onShowAddTrainer={() => {
          setShowSettings(false);
          setShowAddTrainer(true);
        }}
        onSignOut={handleSignOut}
      />

      <WelcomeModal userName={users[currentUser]?.name} />

      <AddTrainerModal
        isOpen={showAddTrainer}
        onClose={() => setShowAddTrainer(false)}
        firebaseUser={firebaseUser}
        userName={users[currentUser]?.name}
      />

      <MeasurementsModal
        isOpen={showMeasurements}
        onClose={() => setShowMeasurements(false)}
        firebaseUser={firebaseUser}
      />

      <MeasurementReminderModal
        isOpen={showMeasurementReminder}
        onClose={() => setShowMeasurementReminder(false)}
        onOpenMeasurements={() => setShowMeasurements(true)}
      />
    </div>
    </ToastProvider>
  );
}
