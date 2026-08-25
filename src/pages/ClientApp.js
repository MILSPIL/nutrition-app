import React, { useState, useEffect } from 'react';
import { auth, googleProvider, db } from '../firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
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
  buildUserRecord,
  calculatePortionPercent,
  calculateMealsMacros,
  canAddCategoryProduct,
  createDefaultClientUser,
  createEmptyMeals
} from '../services/nutrition';
import { calculateProgramDay, getTodayDateKey } from '../utils/date';

export default function ClientApp() {
  // Firebase Auth
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState({});
  const [globalCustomProducts, setGlobalCustomProducts] = useState({});
  const [productOverrides, setProductOverrides] = useState({});

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
  const [meals, setMeals] = useState(createEmptyMeals());
  const [activity, setActivity] = useState("");
  const [otherActivity, setOtherActivity] = useState("");
  const [trainerTelegram, setTrainerTelegram] = useState("chykalina");
  const [currentLetter, setCurrentLetter] = useState(null);

  // Check for Monday measurement reminder
  useEffect(() => {
    const today = new Date();
    const isMonday = today.getDay() === 1;
    const todayStr = getTodayDateKey();
    const dismissed = localStorage.getItem('measurementReminderDismissed');

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
        users: newUsers,
        globalCustomProducts: {},
        createdAt: new Date().toISOString()
      });
      setGlobalCustomProducts({});
    } else {
      await setDoc(userDocRef, {
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
    setMeals(user.meals || createEmptyMeals());
    setActivity(user.activity || "");
    setOtherActivity(user.otherActivity || "");
    setTrainerTelegram(user.trainerTelegram || "chykalina");
  };

  const calculateCurrentDay = (startDate) => calculateProgramDay(startDate);

  // Google Sign In
  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Error signing in:', error);
      toast.error('Помилка входу: ' + error.message);
    }
  };

  // Sign Out
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setCurrentUser(null);
      setUsers({});
      setGlobalCustomProducts({});
      setMeals(createEmptyMeals());
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Save to Firestore
  const saveToFirestore = async (newUsers, newGlobalCustomProducts, newProductOverrides) => {
    if (!firebaseUser) return;

    try {
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      await setDoc(userDocRef, {
        users: newUsers || users,
        globalCustomProducts: newGlobalCustomProducts || globalCustomProducts,
        productOverrides: newProductOverrides || productOverrides,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      console.error('Error saving to Firestore:', error);
    }
  };

  // Зберегти історію харчування за день (для тренерського дашборду)
  const saveMealHistory = async (mealsData, currentMacros) => {
    if (!firebaseUser) return;

    try {
      const today = getTodayDateKey();
      const historyRef = doc(db, 'users', firebaseUser.uid, 'mealHistory', today);
      await setDoc(historyRef, {
        meals: mealsData,
        activity,
        otherActivity,
        currentWeight,
        programDay,
        totalMacros: currentMacros,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error saving meal history:', error);
    }
  };

  // Auto-save changes
  useEffect(() => {
    if (!currentUser) return;

    const newUsers = buildUserRecord({
      users,
      currentUser,
      userPortions,
      programDay,
      currentWeight,
      meals,
      activity,
      otherActivity,
      trainerTelegram
    });

    setUsers(newUsers);

    localStorage.setItem('nutrition-v2', JSON.stringify({
      currentUser,
      users: newUsers,
      globalCustomProducts: globalCustomProducts,
      lastSession: { userId: currentUser, timestamp: new Date().toISOString() }
    }));

    saveToFirestore(newUsers, globalCustomProducts);

    const macros = calculateMealsMacros(meals);
    saveMealHistory(meals, macros);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, userPortions, programDay, currentWeight, meals, activity, otherActivity, trainerTelegram]);

  // Auto-calculate day from startDate
  useEffect(() => {
    if (!currentUser || !users[currentUser]) return;

    const user = users[currentUser];

    if (!user.startDate) {
      return;
    }

    const currentDay = calculateCurrentDay(user.startDate);

    if (currentDay !== programDay) {
      setProgramDay(currentDay);

      const updatedUsers = {
        ...users,
        [currentUser]: {
          ...users[currentUser],
          programDay: currentDay
        }
      };
      setUsers(updatedUsers);
      localStorage.setItem('nutrition-v2', JSON.stringify({
        currentUser,
        users: updatedUsers,
        globalCustomProducts,
        lastSession: { userId: currentUser, timestamp: new Date().toISOString() }
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // Save globalCustomProducts
  useEffect(() => {
    if (Object.keys(globalCustomProducts).length > 0) {
      const saved = localStorage.getItem('nutrition-v2');
      if (saved) {
        const data = JSON.parse(saved);
        data.globalCustomProducts = globalCustomProducts;
        localStorage.setItem('nutrition-v2', JSON.stringify(data));
      }
    }
  }, [globalCustomProducts]);

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
    saveToFirestore(users, globalCustomProducts, newOverrides);
  };

  // Скинути override для продукту
  const resetProductOverride = (productName) => {
    const newOverrides = { ...productOverrides };
    delete newOverrides[productName];
    setProductOverrides(newOverrides);
    saveToFirestore(users, globalCustomProducts, newOverrides);
  };

  const calculateTotalMacros = () => {
    if (!currentUser || !meals) return { p: 0, f: 0, c: 0, cal: 0 };
    return calculateMealsMacros(meals);
  };

  // Product management
  const addProduct = (letter, product, portion = 100) => {
    // Для щойно створеного кастомного продукту state ще може не встигнути оновитися,
    // тому беремо його власну raw-порцію як fallback замість дефолтних 100г.
    const userPortion = userPortions[product.name] || product.raw || getProductPortion(product.name);
    const weight = Math.round((userPortion * portion) / 100);

    // Перевірка чи категорія калорійна (наприклад, "в" - Вільний вибір)
    const categoryData = PRODUCTS_DB[letter];
    const isCalorieBased = categoryData?.isCalorieBased || false;
    const calorieLimit = categoryData?.calorieLimit || 575;

    const newMeals = { ...meals };
    if (!newMeals[selectedMeal][letter]) {
      newMeals[selectedMeal][letter] = [];
    }

    // Калорії продукту
    const productCalories = Math.round((product.cal || 0) * weight / 100);

    if (isCalorieBased) {
      // Для калорійних категорій рахуємо калорії
      const usedCalories = newMeals[selectedMeal][letter].reduce((sum, p) => sum + (p.calories || 0), 0);
      const validation = canAddCategoryProduct({
        isCalorieBased,
        usedCalories,
        productCalories,
        calorieLimit
      });

      if (!validation.allowed) {
        toast.warning(`Перевищено ліміт калорій! Спожито: ${usedCalories} ккал. Залишок: ${validation.remainingCalories} ккал`);
        return;
      }
    }

    // Розрахунок готової ваги: сира вага * коефіцієнт збільшення
    // Наприклад: 50г крупи * 3.2 = 160г готової
    const cookedCalc = product.coef && product.coef !== 1
      ? Math.round(weight * product.coef)
      : null;

    newMeals[selectedMeal][letter].push({
      name: product.name,
      weight: weight,
      portion: isCalorieBased ? 0 : portion, // Для калорійних категорій portion не використовується
      cookedWeight: cookedCalc,
      calories: productCalories, // Зберігаємо калорії для калорійних категорій
      p: product.p || 0,
      f: product.f || 0,
      c: product.c || 0
    });

    setMeals(newMeals);
    setShowProductModal(false);
  };

  const addProductWithCustomGrams = (letter, product, inputGrams, userPortion) => {
    if (inputGrams <= 0) {
      toast.warning("Введіть вагу більше 0!");
      return;
    }

    // Перевірка чи категорія калорійна
    const categoryData = PRODUCTS_DB[letter];
    const isCalorieBased = categoryData?.isCalorieBased || false;
    const calorieLimit = categoryData?.calorieLimit || 575;

    const portion = Math.round((inputGrams / userPortion) * 100);

    const newMeals = { ...meals };
    if (!newMeals[selectedMeal][letter]) {
      newMeals[selectedMeal][letter] = [];
    }

    // Калорії продукту
    const productCalories = Math.round((product.cal || 0) * inputGrams / 100);

    if (isCalorieBased) {
      // Для калорійних категорій рахуємо калорії
      const usedCalories = newMeals[selectedMeal][letter].reduce((sum, p) => sum + (p.calories || 0), 0);
      const validation = canAddCategoryProduct({
        isCalorieBased,
        usedCalories,
        productCalories,
        calorieLimit
      });

      if (!validation.allowed) {
        toast.warning(`Перевищено ліміт калорій! Спожито: ${usedCalories} ккал. Залишок: ${validation.remainingCalories} ккал`);
        return;
      }
    }

    // Розрахунок готової ваги: сира вага * коефіцієнт збільшення
    const cookedCalc = product.coef && product.coef !== 1
      ? Math.round(inputGrams * product.coef)
      : null;

    newMeals[selectedMeal][letter].push({
      name: product.name,
      weight: inputGrams,
      portion: isCalorieBased ? 0 : portion,
      cookedWeight: cookedCalc,
      calories: productCalories,
      p: product.p || 0,
      f: product.f || 0,
      c: product.c || 0
    });

    setMeals(newMeals);
  };

  const removeProduct = (mealNum, letter, index) => {
    const newMeals = { ...meals };
    newMeals[mealNum][letter].splice(index, 1);
    if (newMeals[mealNum][letter].length === 0) {
      delete newMeals[mealNum][letter];
    }
    setMeals(newMeals);
  };

  // Оновлення ваги продукту
  const updateProductWeight = (mealNum, letter, index, newWeight) => {
    if (newWeight <= 0) return;

    const newMeals = { ...meals };
    const product = newMeals[mealNum][letter][index];
    if (!product) return;

    const categoryData = PRODUCTS_DB[letter];
    const isCalorieBased = categoryData?.isCalorieBased || false;

    // Знаходимо оригінальний продукт для коефіцієнта
    const originalProduct = getAllProducts(letter).find(p => p.name === product.name);
    const coef = originalProduct?.coef || 1;
    const cal = originalProduct?.cal || 0;

    // Оновлюємо вагу та пов'язані дані
    product.weight = newWeight;

    // Оновлюємо готову вагу якщо є коефіцієнт
    if (coef && coef !== 1) {
      product.cookedWeight = Math.round(newWeight * coef);
    }

    // Оновлюємо калорії
    product.calories = Math.round(cal * newWeight / 100);

    // Оновлюємо порцію для звичайних категорій
    if (!isCalorieBased) {
      const userPortion = getProductPortion(product.name);
      product.portion = calculatePortionPercent(newWeight, userPortion);
    }

    setMeals(newMeals);
  };

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
  };

  // Report generation
  const generateReport = () => {
    const totalMacros = calculateTotalMacros();
    let report = `День ${programDay}\n🥕ХАРЧУВАННЯ\n`;

    [1, 2, 3, 4].forEach(mealNum => {
      const mealEmoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'][mealNum - 1];
      report += `${mealEmoji} прийом їжі:\n`;

      const mealData = meals[mealNum];
      const letters = MEAL_LETTERS[mealNum];

      letters.forEach(letter => {
        if (mealData[letter] && mealData[letter].length > 0) {
          const products = mealData[letter].map(p => `${p.name} (${p.weight} г)`).join(', ');
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
    report += `\nБілки: ${totalMacros.p}г / 140г (${Math.round(totalMacros.p / 140 * 100)}%)`;
    report += `\nЖири: ${totalMacros.f}г / 70г (${Math.round(totalMacros.f / 70 * 100)}%)`;
    report += `\nВуглеводи: ${totalMacros.c}г / 235г (${Math.round(totalMacros.c / 235 * 100)}%)`;

    const totalCalories = Math.round(totalMacros.p * 4 + totalMacros.f * 9 + totalMacros.c * 4);
    report += `\nКалорії: ${totalCalories} ккал / 2305 ккал (${Math.round(totalCalories / 2305 * 100)}%)`;

    return report;
  };

  // Handlers
  const handleNameChange = (newName) => {
    const updatedUsers = {
      ...users,
      [currentUser]: { ...users[currentUser], name: newName }
    };
    setUsers(updatedUsers);
    saveToFirestore(updatedUsers, globalCustomProducts);
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
    saveToFirestore(updatedUsers, globalCustomProducts);
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

  return (
    <ToastProvider>
    <div className="min-h-screen pb-8 bg-[#F2F2F7]">
      <Header
        user={users[currentUser]}
        programDay={programDay}
        currentWeight={currentWeight}
        macros={macros}
        selectedMeal={selectedMeal}
        onWeightChange={setCurrentWeight}
        onNameChange={handleNameChange}
        onMealSelect={setSelectedMeal}
        onShowDaySelector={() => setShowDaySelector(true)}
        onShowMeasurements={() => setShowMeasurements(true)}
        onShowSettings={() => setShowSettings(true)}
      />

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
        onActivityChange={setActivity}
        onOtherActivityChange={setOtherActivity}
      />

      <RulesSection />

      <div className="max-w-lg mx-auto px-4 mt-4">
        <button
          onClick={() => setShowReport(true)}
          className="w-full py-4 bg-[#34C759] text-white rounded-2xl text-[17px] font-semibold active:opacity-80"
        >
          Надіслати звіт
        </button>
      </div>

      {/* Modals */}
      <ProductModal
        isOpen={showProductModal}
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
        trainerTelegram={trainerTelegram}
        onTrainerChange={setTrainerTelegram}
        activity={activity}
        otherActivity={otherActivity}
      />

      <PortionSettingsModal
        isOpen={showPortionSettings}
        onClose={() => setShowPortionSettings(false)}
        userPortions={userPortions}
        onPortionsChange={setUserPortions}
        getUserCustomProducts={getUserCustomProducts}
      />

      <DaySelectorModal
        isOpen={showDaySelector}
        onClose={() => setShowDaySelector(false)}
        programDay={programDay}
        onDayChange={setProgramDay}
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
