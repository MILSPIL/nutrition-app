import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Header from '../components/Header';
import ProductModal from '../components/ProductModal';
import { calculateMealsMacros } from './nutrition';

const label = { p: 2.9, f: 2.5, c: 4, cal: 53 };

test('V03/V08: збережена етикетка має 106 ккал, а не формулу 4/9/4', () => {
  const result = calculateMealsMacros({ 1: { а: [{ name: 'Тестовий кефір', weight: 200,
    calories: 106, p: 2.9, f: 2.5, c: 4 }] } });
  expect(result).toEqual({ p: 5.8, f: 5, c: 8, cal: 106 });
});

test('V03: самодостатній продукт із основою 100 мл рахується без вигаданих грамів', () => {
  const result = calculateMealsMacros({ 1: { voice: [{ itemId: 'synthetic-1', name: 'Тестовий кефір',
    quantity: { value: 200, unit: 'ml' }, nutritionBasis: { value: 100, unit: 'ml' },
    nutrients: label, source: { kind: 'label', label: 'Етикетка' }, estimated: false }] } });
  expect(result).toEqual({ p: 5.8, f: 5, c: 8, cal: 106 });
});

test('V01: головний екран має доступну кнопку голосового введення', () => {
  const html = renderToStaticMarkup(<Header user={{name:'Тест'}} programDay={1}
    macros={{p:0,f:0,c:0,cal:0}} selectedMeal={1} onShowVoiceInput={() => {}} />);
  expect(html.includes('aria-label="Додати їжу голосом"')).toBe(true);
});

test('голосова група не відкриває неіснуючий каталог і не ламає UI',()=>{
 expect(renderToStaticMarkup(<ProductModal currentLetter="voice" isOpen />)).toBe('');
});
