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
    ? (calorieLimit > 0 ? Math.round((usedCalories / calorieLimit) * 100) : 0)
    : Math.round(totalPortion);

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
  productCalories = 0,
  calorieLimit = 575
}) => {
  if (!isCalorieBased) {
    return {
      allowed: true,
      remainingCalories: null
    };
  }

  const nextCalories = usedCalories + productCalories;

  return {
    allowed: nextCalories <= calorieLimit,
    remainingCalories: calorieLimit - usedCalories
  };
};

export const calculateMealsMacros = (meals) => {
  if (!meals) {
    return { p: 0, f: 0, c: 0, cal: 0 };
  }

  let totalP = 0;
  let totalF = 0;
  let totalC = 0;
  let totalCal = 0;

  Object.values(meals).forEach((meal) => {
    Object.values(meal || {}).forEach((products) => {
      if (!Array.isArray(products)) {
        return;
      }

      products.forEach((item) => {
        const weight = item.weight || 0;
        const multiplier = weight / 100;

        totalP += (item.p || 0) * multiplier;
        totalF += (item.f || 0) * multiplier;
        totalC += (item.c || 0) * multiplier;
        totalCal += item.cal
          ? item.cal * multiplier
          : ((item.p || 0) * 4 + (item.c || 0) * 4 + (item.f || 0) * 9) * multiplier;
      });
    });
  });

  return {
    p: roundToOneDecimal(totalP),
    f: roundToOneDecimal(totalF),
    c: roundToOneDecimal(totalC),
    cal: Math.round(totalCal)
  };
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
