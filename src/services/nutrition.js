import { itemMacros, roundMacros } from './mealItems.js';
const roundToOneDecimal = (value) => Math.round((value + 1e-9) * 10) / 10;

export const createEmptyMeals = () => ({
  1: {},
  2: {},
  3: {},
  4: {}
});

export const createDefaultClientUser = (displayName, defaultPortions) => ({
  name: displayName,
  gender: 'чоловік',
  portions: defaultPortions,
  programDay: 1,
  currentWeight: null,
  meals: createEmptyMeals(),
  activity: '',
  otherActivity: '',
  trainerTelegram: 'chykalina',
  createdAt: new Date().toISOString()
});

export const calculateProductMacros = (product, weight) => {
  if (!product) {
    return { p: 0, f: 0, c: 0, cal: 0 };
  }

  const multiplier = weight / 100;
  const protein = (product.p || 0) * multiplier;
  const fat = (product.f || 0) * multiplier;
  const carbs = (product.c || 0) * multiplier;
  const calories = product.cal
    ? product.cal * multiplier
    : (protein * 4 + carbs * 4 + fat * 9);

  return {
    p: roundToOneDecimal(protein),
    f: roundToOneDecimal(fat),
    c: roundToOneDecimal(carbs),
    cal: Math.round(calories)
  };
};

export const calculatePortionPercent = (weight, basePortion) => {
  if (!basePortion) {
    return 0;
  }

  return Math.round((weight / basePortion) * 100);
};

export const getCategoryProgress = ({
  isCalorieBased,
  usedCalories = 0,
  calorieLimit = 575,
  totalPortion = 0
}) => {
  const percent = isCalorieBased
    ? (calorieLimit > 0 ? (usedCalories / calorieLimit) * 100 : 0)
    : totalPortion;

  return {
    percent,
    fillPercent: Math.min(percent, 100),
    isComplete: percent === 100,
    isOverTarget: percent > 100
  };
};

export const canAddCategoryProduct = ({
  isCalorieBased,
  usedCalories = 0,
  calorieLimit = 575
}) => {
  if (!isCalorieBased) {
    return {
      allowed: true,
      remainingCalories: null
    };
  }

  return {
    allowed: true,
    remainingCalories: calorieLimit - usedCalories
  };
};

export const calculateMealsMacros = (meals) => {
  const total = { p: 0, f: 0, c: 0, cal: 0 };
  Object.values(meals || {}).forEach(meal => Object.values(meal || {}).forEach(items => {
    if (!Array.isArray(items)) return;
    items.forEach(item => { const macros = itemMacros(item); for (const key of Object.keys(total)) total[key] += macros[key]; });
  }));
  return roundMacros(total);
};

export const buildUserRecord = ({
  users,
  currentUser,
  userPortions,
  programDay,
  currentWeight,
  meals,
  activity,
  otherActivity,
  trainerTelegram
}) => ({
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
});

// Пороги "шкали здоров'я" у відсотках від денної норми калорій
export const SCALE_THRESHOLDS = { warn: 85, over: 100, danger: 120 };

// Стан шкали: відсоток НЕ обрізається на 100 - переїдання має бути видно
export const getCalorieScaleState = (value, target) => {
  if (!target || target <= 0) {
    return { percent: 0, level: 'ok', overAmount: 0 };
  }

  const percent = Math.round((value / target) * 100);
  const overAmount = Math.max(0, Math.round(value - target));

  let level = 'ok';
  if (percent >= SCALE_THRESHOLDS.danger) {
    level = 'danger';
  } else if (percent >= SCALE_THRESHOLDS.over) {
    level = 'over';
  } else if (percent >= SCALE_THRESHOLDS.warn) {
    level = 'warn';
  }

  return { percent, level, overAmount };
};
