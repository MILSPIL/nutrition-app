import React, { useState, useEffect } from 'react';
import { auth, googleProvider, db } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import {
  PRODUCTS_DB,
  MEAL_LETTERS,
  DEFAULT_PORTIONS
} from './data/products';
import {
  LoginScreen,
  Header,
  MealSection,
  ProductModal,
  ReportModal,
  AddCustomProductModal,
  PortionSettingsModal,
  DaySelectorModal,
  StartDateSetupModal,
  AccountSwitchModal,
  ActivitySection,
  RulesSection,
  LoadingScreen,
  ToastProvider,
  toast,
  WelcomeModal
} from './components';

export default function NutritionApp() {
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
  const [showStartDateSetup, setShowStartDateSetup] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showAddCustomProduct, setShowAddCustomProduct] = useState(false);

  const [userPortions, setUserPortions] = useState(DEFAULT_PORTIONS);
  const [programDay, setProgramDay] = useState(1);
  const [currentWeight, setCurrentWeight] = useState(null);
  const [selectedMeal, setSelectedMeal] = useState(1);
  const [meals, setMeals] = useState({ 1: {}, 2: {}, 3: {}, 4: {} });
  const [activity, setActivity] = useState("");
  const [otherActivity, setOtherActivity] = useState("");
  const [trainerTelegram, setTrainerTelegram] = useState("chykalina");
  const [currentLetter, setCurrentLetter] = useState(null);

  // Load fonts
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, []);

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
    const newUser = {
      name: displayName,
      gender: "чоловік",
      portions: DEFAULT_PORTIONS,
      programDay: 1,
      currentWeight: null,
      meals: { 1: {}, 2: {}, 3: {}, 4: {} },
      activity: "",
      otherActivity: "",
      trainerTelegram: "chykalina",
      createdAt: new Date().toISOString()
    };
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
        setShowStartDateSetup(true);
      }
    }

    setCurrentWeight(user.currentWeight || null);
    setMeals(user.meals || { 1: {}, 2: {}, 3: {}, 4: {} });
    setActivity(user.activity || "");
    setOtherActivity(user.otherActivity || "");
    setTrainerTelegram(user.trainerTelegram || "chykalina");
  };

  const calculateCurrentDay = (startDate) => {
    if (!startDate) return 1;
    const start = new Date(startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today - start) / (1000 * 60 * 60 * 24));
    return diffDays + 1;
  };

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
      setMeals({ 1: {}, 2: {}, 3: {}, 4: {} });
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

  // Auto-save changes
  useEffect(() => {
    if (!currentUser) return;

    const newUsers = {
      ...users,
      [currentUser]: {
        ...users[currentUser],
        portions: userPortions,
        programDay,
        currentWeight,
        meals,
        activity,
        otherActivity,
        trainerTelegram,
        customProducts: users[currentUser]?.customProducts || {},
        hiddenProducts: users[currentUser]?.hiddenProducts || []
      }
    };

    setUsers(newUsers);

    localStorage.setItem('nutrition-v2', JSON.stringify({
      currentUser,
      users: newUsers,
      globalCustomProducts: globalCustomProducts,
      lastSession: { userId: currentUser, timestamp: new Date().toISOString() }
    }));

    saveToFirestore(newUsers, globalCustomProducts);
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

  // Calculate macros
  const calculateProductMacros = (product, weight) => {
    if (!product) {
      return { p: 0, f: 0, c: 0, cal: 0 };
    }
    const multiplier = weight / 100;
    const p = (product.p || 0) * multiplier;
    const f = (product.f || 0) * multiplier;
    const c = (product.c || 0) * multiplier;
    const cal = product.cal
      ? product.cal * multiplier
      : (p * 4 + c * 4 + f * 9);
    return {
      p: Math.round(p * 10) / 10,
      f: Math.round(f * 10) / 10,
      c: Math.round(c * 10) / 10,
      cal: Math.round(cal)
    };
  };

  const calculateTotalMacros = () => {
    if (!currentUser || !meals) return { p: 0, f: 0, c: 0, cal: 0 };

    let totalP = 0, totalF = 0, totalC = 0, totalCal = 0;

    Object.keys(meals).forEach(mealNumber => {
      const meal = meals[mealNumber];
      Object.keys(meal).forEach(letter => {
        const products = meal[letter];
        if (Array.isArray(products)) {
          products.forEach(item => {
            const macros = calculateProductMacros(item, item.weight);
            totalP += macros.p;
            totalF += macros.f;
            totalC += macros.c;
            totalCal += macros.cal;
          });
        }
      });
    });

    return {
      p: Math.round(totalP * 10) / 10,
      f: Math.round(totalF * 10) / 10,
      c: Math.round(totalC * 10) / 10,
      cal: Math.round(totalCal)
    };
  };

  // Product management
  const addProduct = (letter, product, portion = 100) => {
    const userPortion = getProductPortion(product.name);
    const weight = Math.round((userPortion * portion) / 100);

    const newMeals = { ...meals };
    if (!newMeals[selectedMeal][letter]) {
      newMeals[selectedMeal][letter] = [];
    }

    const currentTotal = newMeals[selectedMeal][letter].reduce((sum, p) => sum + p.portion, 0);
    if (currentTotal + portion > 100) {
      toast.warning(`Перевищено норму! Вже обрано: ${currentTotal}%. Можна додати максимум: ${100 - currentTotal}%`);
      return;
    }

    const cookedCalc = product.cooked && product.coef !== 1
      ? Math.round((product.cooked * portion * userPortion / product.raw) / 100)
      : null;

    newMeals[selectedMeal][letter].push({
      name: product.name,
      weight: weight,
      portion: portion,
      cookedWeight: cookedCalc,
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

    const portion = Math.round((inputGrams / userPortion) * 100);

    const newMeals = { ...meals };
    if (!newMeals[selectedMeal][letter]) {
      newMeals[selectedMeal][letter] = [];
    }

    const currentTotal = newMeals[selectedMeal][letter].reduce((sum, p) => sum + p.portion, 0);
    if (currentTotal + portion > 100) {
      toast.warning(`Перевищено норму! Вже обрано: ${currentTotal}%. Можна додати максимум: ${100 - currentTotal}% (${Math.round(userPortion * (100 - currentTotal) / 100)}г)`);
      return;
    }

    const cookedCalc = product.cooked && product.coef !== 1
      ? Math.round((product.cooked * portion * userPortion / product.raw) / 100)
      : null;

    newMeals[selectedMeal][letter].push({
      name: product.name,
      weight: inputGrams,
      portion: portion,
      cookedWeight: cookedCalc,
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
    setShowStartDateSetup(false);
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
    <div className="min-h-screen p-4" style={{ fontFamily: 'Montserrat', backgroundColor: '#f2f0eb' }}>
      <Header
        user={users[currentUser]}
        currentUser={currentUser}
        programDay={programDay}
        currentWeight={currentWeight}
        macros={macros}
        selectedMeal={selectedMeal}
        onSignOut={handleSignOut}
        onWeightChange={setCurrentWeight}
        onNameChange={handleNameChange}
        onMealSelect={setSelectedMeal}
        onShowAccountSwitch={() => setShowAccountSwitch(true)}
        onShowStartDateSetup={() => setShowStartDateSetup(true)}
        onShowPortionSettings={() => setShowPortionSettings(true)}
        onShowDaySelector={() => setShowDaySelector(true)}
      />

      <MealSection
        selectedMeal={selectedMeal}
        meals={meals}
        onRemoveProduct={removeProduct}
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

      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => setShowReport(true)}
          className="w-full py-3 text-white rounded-lg font-semibold hover:opacity-90"
          style={{ backgroundColor: '#90bd92' }}
        >
          ✅ ГОТОВО - Звіт
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

      <StartDateSetupModal
        isOpen={showStartDateSetup}
        onClose={() => setShowStartDateSetup(false)}
        currentStartDate={users[currentUser]?.startDate}
        onSave={handleStartDateSave}
        calculateCurrentDay={calculateCurrentDay}
      />

      <AccountSwitchModal
        isOpen={showAccountSwitch}
        onClose={() => setShowAccountSwitch(false)}
        users={users}
        currentUser={currentUser}
        onSelectUser={(userId) => {
          loadUserFromData(userId, users);
          setShowAccountSwitch(false);
        }}
        onAddAccount={() => {
          setShowAccountSwitch(false);
          // Account setup logic can be added here
        }}
      />

      <WelcomeModal userName={users[currentUser]?.name} />
    </div>
    </ToastProvider>
  );
}
