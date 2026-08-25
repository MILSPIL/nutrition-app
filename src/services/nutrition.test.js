import {
  appendProductToMeals,
  buildUserRecord,
  calculatePortionPercent,
  calculateMealsMacros,
  calculateProductMacros,
  canAddCategoryProduct,
  createDefaultClientUser,
  createEmptyMeals,
  getCategoryProgress,
  getCalorieScaleState
} from './nutrition';

describe('nutrition service', () => {
  test('creates independent empty meal objects', () => {
    const left = createEmptyMeals();
    const right = createEmptyMeals();

    left[1].a = [{ name: 'test' }];

    expect(right[1].a).toBeUndefined();
  });

  test('creates a default client user profile', () => {
    const user = createDefaultClientUser('Імʼя', { rice: 50 });

    expect(user.name).toBe('Імʼя');
    expect(user.portions).toEqual({ rice: 50 });
    expect(user.meals).toEqual(createEmptyMeals());
    expect(user.trainerTelegram).toBe('chykalina');
  });

  test('calculates product macros with fallback calories', () => {
    const macros = calculateProductMacros({ p: 10, f: 5, c: 20 }, 50);

    expect(macros).toEqual({ p: 5, f: 2.5, c: 10, cal: 83 });
  });

  test('calculates portion percent from weight and user portion', () => {
    expect(calculatePortionPercent(75, 50)).toBe(150);
    expect(calculatePortionPercent(50, 0)).toBe(0);
  });

  test('keeps over-target progress visible for regular categories', () => {
    expect(getCategoryProgress({
      isCalorieBased: false,
      totalPortion: 135
    })).toEqual({
      percent: 135,
      fillPercent: 100,
      isComplete: false,
      isOverTarget: true
    });
  });

  test('allows adding more than 100 percent in regular categories', () => {
    expect(canAddCategoryProduct({
      isCalorieBased: false,
      usedCalories: 0,
      productCalories: 0
    })).toEqual({
      allowed: true,
      remainingCalories: null
    });
  });

  test('still blocks calorie-based categories over the limit', () => {
    expect(canAddCategoryProduct({
      isCalorieBased: true,
      usedCalories: 520,
      productCalories: 80,
      calorieLimit: 575
    })).toEqual({
      allowed: false,
      remainingCalories: 55
    });
  });

  test('sums macros across meals', () => {
    const meals = {
      1: {
        а: [
          { name: 'рис', weight: 100, p: 7, f: 1, c: 71, cal: 336 }
        ]
      },
      2: {
        д: [
          { name: 'курка', weight: 150, p: 23.6, f: 1.9, c: 0.4, cal: 113 }
        ]
      },
      3: {},
      4: {}
    };

    expect(calculateMealsMacros(meals)).toEqual({
      p: 42.4,
      f: 3.9,
      c: 71.6,
      cal: 506
    });
  });

  test('builds persisted user record and keeps hidden data', () => {
    const users = {
      user1: {
        name: 'Старе імʼя',
        customProducts: { а: [{ name: 'свій продукт' }] },
        hiddenProducts: ['майонез']
      }
    };

    const result = buildUserRecord({
      users,
      currentUser: 'user1',
      userPortions: { rice: 50 },
      programDay: 10,
      currentWeight: 80,
      meals: createEmptyMeals(),
      activity: 'Ходьба',
      otherActivity: '',
      trainerTelegram: 'coach'
    });

    expect(result.user1.portions).toEqual({ rice: 50 });
    expect(result.user1.programDay).toBe(10);
    expect(result.user1.customProducts).toEqual({ а: [{ name: 'свій продукт' }] });
    expect(result.user1.hiddenProducts).toEqual(['майонез']);
  });
});

describe('getCalorieScaleState', () => {
  test('до 85% - рівень ok', () => {
    expect(getCalorieScaleState(1900, 2305).level).toBe('ok');
  });

  test('від 85% - рівень warn', () => {
    expect(getCalorieScaleState(1960, 2305).level).toBe('warn');
  });

  test('від 100% - рівень over, рахує перевищення', () => {
    const state = getCalorieScaleState(2500, 2305);
    expect(state.level).toBe('over');
    expect(state.percent).toBe(108);
    expect(state.overAmount).toBe(195);
  });

  test('від 120% - рівень danger', () => {
    expect(getCalorieScaleState(2766, 2305).level).toBe('danger');
  });

  test('нульова або відсутня ціль безпечна', () => {
    expect(getCalorieScaleState(500, 0)).toEqual({ percent: 0, level: 'ok', overAmount: 0 });
  });
});

describe('appendProductToMeals', () => {
  const potato = { name: 'картопля', raw: 100, coef: 1, p: 2, f: 0.4, c: 16, cal: 76 };

  test('додає продукт у нові meals, не мутуючи вхідні', () => {
    const meals = createEmptyMeals();
    const result = appendProductToMeals({
      meals, mealNum: 1, letter: 'а', product: potato,
      grams: 200, userPortion: 100, categoryData: {}
    });
    expect(result.meals[1]['а']).toHaveLength(1);
    expect(result.meals[1]['а'][0]).toMatchObject({
      name: 'картопля', weight: 200, portion: 200, calories: 152, estimated: false
    });
    expect(meals[1]['а']).toBeUndefined();
    expect(result.warning).toBeNull();
  });

  test('калорійна категорія: переліміт дає попередження, але продукт додається', () => {
    const sweet = { name: 'зефір', raw: 100, coef: 1, p: 1, f: 0, c: 80, cal: 326 };
    const categoryData = { isCalorieBased: true, calorieLimit: 575 };
    const first = appendProductToMeals({
      meals: createEmptyMeals(), mealNum: 1, letter: 'в', product: sweet,
      grams: 100, userPortion: 100, categoryData
    });
    const second = appendProductToMeals({
      meals: first.meals, mealNum: 1, letter: 'в', product: sweet,
      grams: 100, userPortion: 100, categoryData
    });
    expect(first.warning).toBeNull();
    expect(second.warning).toContain('Перевищення');
    expect(second.meals[1]['в']).toHaveLength(2);
  });

  test('зберігає прапорець estimated і рахує cookedWeight через coef', () => {
    const rice = { name: 'рис нешліфований', raw: 50, coef: 3.4, p: 7.5, f: 2, c: 62, cal: 346, estimated: true };
    const result = appendProductToMeals({
      meals: createEmptyMeals(), mealNum: 1, letter: 'а', product: rice,
      grams: 50, userPortion: 50, categoryData: {}
    });
    expect(result.meals[1]['а'][0].estimated).toBe(true);
    expect(result.meals[1]['а'][0].cookedWeight).toBe(170);
  });
});
