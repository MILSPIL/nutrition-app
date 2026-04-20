import {
  buildUserRecord,
  calculateMealsMacros,
  calculateProductMacros,
  createDefaultClientUser,
  createEmptyMeals
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
