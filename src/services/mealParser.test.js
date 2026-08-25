import { buildCatalogForMeal, toMealItems, parseMealText } from './mealParser';

const entry = (overrides) => ({
  dictated: 'продукт',
  name: 'продукт',
  matchedName: null,
  letter: 'а',
  gramsDictated: 100,
  weightState: 'raw',
  p: 0, f: 0, c: 0, cal: 0,
  estimated: false,
  note: null,
  ...overrides
});

describe('mealParser', () => {
  test('каталог прийому 1 - тільки літери а, б, в', () => {
    const catalog = buildCatalogForMeal(1);
    expect(catalog.map((c) => c.letter)).toEqual(['а', 'б', 'в']);
    expect(catalog[0].products[1].name).toBe('картопля');
  });

  test('готова вага ділиться на coef (рис 3.4: 170 г готового = 50 г сирого)', () => {
    const result = toMealItems({
      items: [entry({ matchedName: 'рис нешліфований', gramsDictated: 170, weightState: 'cooked' })],
      unparsed: []
    }, 1);
    expect(result.items[0].grams).toBe(50);
    expect(result.items[0].letter).toBe('а');
    expect(result.items[0].product.cal).toBe(346);
    expect(result.items[0].estimated).toBe(false);
  });

  test('готова вага при coef < 1 (куряче філе 0.611: 116 г готового = 190 г сирого)', () => {
    const result = toMealItems({
      items: [entry({ matchedName: 'куряче філе', letter: 'д', gramsDictated: 116, weightState: 'cooked' })],
      unparsed: []
    }, 2);
    expect(result.items[0].grams).toBe(190);
  });

  test('сира вага і coef 1 не перераховуються', () => {
    const result = toMealItems({
      items: [
        entry({ matchedName: 'рис нешліфований', gramsDictated: 50, weightState: 'raw' }),
        entry({ matchedName: 'картопля', gramsDictated: 200, weightState: 'cooked' })
      ],
      unparsed: []
    }, 1);
    expect(result.items[0].grams).toBe(50);
    expect(result.items[1].grams).toBe(200);
  });

  test('канонічні БЖВ беруться з каталогу, не з відповіді моделі', () => {
    const result = toMealItems({
      items: [entry({ matchedName: 'картопля', gramsDictated: 100, p: 99, f: 99, c: 99, cal: 999 })],
      unparsed: []
    }, 1);
    expect(result.items[0].product.p).toBe(2);
    expect(result.items[0].product.cal).toBe(76);
  });

  test('невідомий продукт: оцінка моделі, вага без перерахунку, estimated', () => {
    const result = toMealItems({
      items: [entry({ name: 'борщ', matchedName: null, letter: 'в', gramsDictated: 300, weightState: 'cooked', p: 2, f: 3, c: 5, cal: 55, estimated: true })],
      unparsed: []
    }, 1);
    expect(result.items[0].estimated).toBe(true);
    expect(result.items[0].grams).toBe(300);
    expect(result.items[0].product.cal).toBe(55);
    expect(result.items[0].product.name).toBe('борщ');
  });

  test('недозволена літера мапиться на двійника прийому (б -> ж у прийомі 3)', () => {
    const result = toMealItems({
      items: [entry({ name: 'йогурт грецький', matchedName: null, letter: 'б', gramsDictated: 150, estimated: true })],
      unparsed: []
    }, 3);
    expect(result.items[0].letter).toBe('ж');
  });

  test('нульові грами відкидаються, unparsed прокидається', () => {
    const result = toMealItems({
      items: [entry({ gramsDictated: 0 })],
      unparsed: ['і ще той самий']
    }, 1);
    expect(result.items).toHaveLength(0);
    expect(result.unparsed).toEqual(['і ще той самий']);
  });

  describe('parseMealText', () => {
    const originalEnv = process.env.REACT_APP_MEAL_PARSER_URL;

    beforeEach(() => {
      delete process.env.REACT_APP_MEAL_PARSER_URL;
    });

    afterEach(() => {
      if (originalEnv) {
        process.env.REACT_APP_MEAL_PARSER_URL = originalEnv;
      }
    });

    test('без REACT_APP_MEAL_PARSER_URL кидає Error', async () => {
      await expect(
        parseMealText({ text: 'риба 100г', mealNum: 1, idToken: 'token123' })
      ).rejects.toThrow('REACT_APP_MEAL_PARSER_URL не задано');
    });

    test('при response.ok=false (статус 401) кидає Error з номером статусу', async () => {
      process.env.REACT_APP_MEAL_PARSER_URL = 'http://localhost:3001/parse';

      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: jest.fn()
      });

      await expect(
        parseMealText({ text: 'риба 100г', mealNum: 1, idToken: 'token123' })
      ).rejects.toThrow('Worker відповів 401');

      mockFetch.mockRestore();
    });

    test('happy path: fetch викликаний з правильним url, method, Authorization, body', async () => {
      process.env.REACT_APP_MEAL_PARSER_URL = 'http://localhost:3001/parse';

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          items: [{ name: 'риба', gramsDictated: 100 }],
          unparsed: []
        })
      };

      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse);

      const result = await parseMealText({
        text: 'риба 100г',
        mealNum: 1,
        idToken: 'token123'
      });

      // Перевіряємо результат
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('риба');

      // Перевіряємо що fetch був викликаний правильно
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];

      expect(callArgs[0]).toBe('http://localhost:3001/parse');
      expect(callArgs[1].method).toBe('POST');
      expect(callArgs[1].headers.Authorization).toBe('Bearer token123');
      expect(callArgs[1].headers['Content-Type']).toBe('application/json');

      // Перевіряємо body
      const bodyParsed = JSON.parse(callArgs[1].body);
      expect(bodyParsed.text).toBe('риба 100г');
      expect(bodyParsed.catalog).toBeDefined();
      expect(Array.isArray(bodyParsed.catalog)).toBe(true);

      mockFetch.mockRestore();
    });
  });
});
