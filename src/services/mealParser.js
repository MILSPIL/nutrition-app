import { PRODUCTS_DB, MEAL_LETTERS } from '../data/products';

// Пари категорій-двійників між прийомами (та сама суть, різні літери)
const LETTER_TWINS = {
  'а': 'г', 'г': 'а',
  'б': 'ж', 'ж': 'б',
  'д': 'і', 'і': 'д',
  'е': 'ї', 'ї': 'е',
  'є': 'й', 'й': 'є'
};

// Каталог продуктів ТІЛЬКИ поточного прийому: модель не може обрати
// літеру, якої нема на екрані (інакше продукт став би невидимим)
export const buildCatalogForMeal = (mealNum) =>
  MEAL_LETTERS[mealNum].map((letter) => ({
    letter,
    category: PRODUCTS_DB[letter].name,
    calorieBased: PRODUCTS_DB[letter].isCalorieBased || false,
    products: PRODUCTS_DB[letter].products.map(({ name, raw, coef, p, f, c, cal }) => ({
      name, raw, coef, p, f, c, cal
    }))
  }));

const findInMeal = (name, mealNum) => {
  for (const letter of MEAL_LETTERS[mealNum]) {
    const product = PRODUCTS_DB[letter].products.find((item) => item.name === name);
    if (product) {
      return { letter, product };
    }
  }
  return null;
};

const resolveLetter = (letter, mealNum) => {
  const allowed = MEAL_LETTERS[mealNum];
  if (allowed.includes(letter)) {
    return letter;
  }
  const twin = LETTER_TWINS[letter];
  if (twin && allowed.includes(twin)) {
    return twin;
  }
  return allowed[0]; // запасний варіант: категорія умовна, головне що видно і рахується
};

export const toMealItems = (parseResult, mealNum) => {
  const items = [];

  (parseResult.items || []).forEach((entry) => {
    const grams = Math.round(entry.gramsDictated);
    if (!grams || grams <= 0) {
      return;
    }

    const match = entry.matchedName ? findInMeal(entry.matchedName, mealNum) : null;

    if (match) {
      const coef = match.product.coef || 1;
      const gramsRaw = entry.weightState === 'cooked' && coef !== 1
        ? Math.round(grams / coef)
        : grams;

      items.push({
        letter: match.letter,
        product: { ...match.product, estimated: false },
        grams: gramsRaw,
        estimated: false,
        dictated: entry.dictated,
        note: entry.note || (entry.weightState === 'unknown' ? 'вага: сира чи готова?' : null)
      });
    } else {
      items.push({
        letter: resolveLetter(entry.letter, mealNum),
        product: {
          name: entry.name,
          raw: 100,
          coef: 1,
          p: entry.p, f: entry.f, c: entry.c, cal: entry.cal,
          estimated: true
        },
        grams,
        estimated: true,
        dictated: entry.dictated,
        note: entry.note
      });
    }
  });

  return { items, unparsed: parseResult.unparsed || [] };
};

export const parseMealText = async ({ text, mealNum, idToken }) => {
  const url = process.env.REACT_APP_MEAL_PARSER_URL;
  if (!url) {
    throw new Error('REACT_APP_MEAL_PARSER_URL не задано');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify({ text, catalog: buildCatalogForMeal(mealNum) })
  });

  if (!response.ok) {
    throw new Error(`Worker відповів ${response.status}`);
  }

  return response.json();
};
