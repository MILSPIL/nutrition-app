/**
 * Сервіс для роботи з Open Food Facts API
 * Отримує інформацію про продукти за штрих-кодом
 */

const API_BASE_URL = 'https://world.openfoodfacts.org/api/v2/product';

/**
 * Безпечно отримати числове значення з об'єкта nutriments
 */
export const getNumericValue = (nutriments, ...keys) => {
  for (const key of keys) {
    const value = nutriments[key];
    if (value !== undefined && value !== null && value !== '') {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        return num;
      }
    }
  }
  return 0;
};

export const normalizeOpenFoodFactsProduct = (data, barcode) => {
  if (data.status_verbose === 'product not found' || data.status === 0) {
    return {
      success: false,
      error: 'Продукт не знайдено в базі даних'
    };
  }

  const product = data.product;

  if (!product) {
    return {
      success: false,
      error: 'Продукт не знайдено'
    };
  }

  const nutriments = product.nutriments || {};

  const name = product.product_name_uk ||
               product.product_name_ru ||
               product.product_name ||
               product.generic_name ||
               product.brands ||
               'Невідомий продукт';

  const protein = getNumericValue(nutriments,
    'proteins_100g',
    'proteins',
    'proteins_value',
    'protein_100g',
    'protein'
  );

  const fat = getNumericValue(nutriments,
    'fat_100g',
    'fat',
    'fat_value',
    'fats_100g',
    'fats'
  );

  const carbs = getNumericValue(nutriments,
    'carbohydrates_100g',
    'carbohydrates',
    'carbohydrates_value',
    'carbs_100g',
    'carbs'
  );

  let calories = getNumericValue(nutriments,
    'energy-kcal_100g',
    'energy-kcal',
    'energy-kcal_value',
    'calories_100g',
    'calories'
  );

  if (calories === 0) {
    const energyKj = getNumericValue(nutriments,
      'energy_100g',
      'energy',
      'energy-kj_100g',
      'energy-kj'
    );
    if (energyKj > 0) {
      calories = Math.round(energyKj / 4.184);
    }
  }

  if (calories === 0 && (protein > 0 || fat > 0 || carbs > 0)) {
    calories = Math.round(protein * 4 + carbs * 4 + fat * 9);
  }

  const hasNutritionData = protein > 0 || fat > 0 || carbs > 0 || calories > 0;

  return {
    success: true,
    product: {
      name: name.toLowerCase().trim(),
      barcode,
      p: Math.round(protein * 10) / 10,
      f: Math.round(fat * 10) / 10,
      c: Math.round(carbs * 10) / 10,
      cal: Math.round(calories),
      raw: 100,
      cooked: 100,
      coef: 1,
      imageUrl: product.image_url || product.image_front_url || product.image_small_url || null,
      brand: product.brands || null,
      servingSize: product.serving_size || null,
      hasNutritionData
    }
  };
};

/**
 * Отримати інформацію про продукт за штрих-кодом
 * @param {string} barcode - EAN-13/EAN-8 штрих-код
 * @returns {Promise<{success: boolean, product?: object, error?: string}>}
 */
export const getProductByBarcode = async (barcode) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/${barcode}.json`,
      {
        headers: {
          'User-Agent': 'NutritionApp/1.0 (https://nutrition-tracker-ua.web.app)'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data = await response.json();
    return normalizeOpenFoodFactsProduct(data, barcode);
  } catch (error) {
    console.error('Open Food Facts API error:', error);
    return {
      success: false,
      error: error.message === 'Failed to fetch'
        ? 'Немає з\'єднання з інтернетом'
        : 'Помилка при отриманні даних'
    };
  }
};

/**
 * Перевірити чи є валідним EAN штрих-код
 * @param {string} barcode
 * @returns {boolean}
 */
export const isValidBarcode = (barcode) => {
  // EAN-8 або EAN-13
  if (!/^\d{8}$|^\d{13}$/.test(barcode)) {
    return false;
  }

  // Перевірка контрольної суми для EAN-13
  if (barcode.length === 13) {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(barcode[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === parseInt(barcode[12]);
  }

  // Перевірка контрольної суми для EAN-8
  if (barcode.length === 8) {
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      sum += parseInt(barcode[i]) * (i % 2 === 0 ? 3 : 1);
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === parseInt(barcode[7]);
  }

  return false;
};
