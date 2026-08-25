import {
  getNumericValue,
  isValidBarcode,
  normalizeBarcode,
  normalizeOpenFoodFactsProduct
} from './openFoodFacts';

describe('open food facts service', () => {
  test('reads the first numeric value from nutriments', () => {
    expect(getNumericValue({ a: '', b: '12.4' }, 'a', 'b')).toBe(12.4);
    expect(getNumericValue({}, 'missing')).toBe(0);
  });

  test('validates EAN-13 and EAN-8 barcodes', () => {
    expect(isValidBarcode('5901234123457')).toBe(true);
    expect(isValidBarcode('96385074')).toBe(true);
    expect(isValidBarcode('036000291452')).toBe(true);
    expect(isValidBarcode('5901234123458')).toBe(false);
    expect(isValidBarcode('123')).toBe(false);
  });

  test('normalizes UPC-A and strips non-digit characters', () => {
    expect(normalizeBarcode('036000291452')).toBe('0036000291452');
    expect(normalizeBarcode(' 5901-2341 23457 ')).toBe('5901234123457');
  });

  test('normalizes a product and calculates calories from kJ', () => {
    const result = normalizeOpenFoodFactsProduct({
      status: 1,
      product: {
        product_name: 'Test Product',
        nutriments: {
          proteins_100g: '10',
          fat_100g: '5',
          carbohydrates_100g: '20',
          energy_100g: '420'
        }
      }
    }, '5901234123457');

    expect(result.success).toBe(true);
    expect(result.product.name).toBe('test product');
    expect(result.product.cal).toBe(100);
  });

  test('returns not-found response when product is missing', () => {
    expect(normalizeOpenFoodFactsProduct({
      status: 'success',
      status_verbose: 'product not found'
    }, '5901234123457')).toEqual({
      success: false,
      error: 'Продукт не знайдено в базі даних'
    });
  });
});
