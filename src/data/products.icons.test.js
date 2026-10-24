import fs from 'fs';
import path from 'path';
import { MEAL_LETTERS } from './products';
import { CATEGORY_ICONS } from './categoryIcons';

test('усі категорії використовують оптимізовані build imports з наявних WebP', () => {
  const source=fs.readFileSync(path.join(process.cwd(),'src/data/categoryIcons.js'),'utf8');
  const assets=path.join(process.cwd(),'src/assets/categories');
  let total=0;
  for(const name of ['carbs','dairy','treats','protein','vegetables','fats','fruits','nuts']) {
    expect(source).toContain(`../assets/categories/category-${name}.webp`);
    const bytes=fs.readFileSync(path.join(assets,`category-${name}.webp`));
    expect(bytes.subarray(0,4).toString()).toBe('RIFF');
    expect(bytes.subarray(8,12).toString()).toBe('WEBP');
    total+=bytes.length;
  }
  expect(total).toBeLessThanOrEqual(300*1024);
  expect(['carbs','dairy','treats'].reduce((n,name)=>n+fs.statSync(path.join(assets,`category-${name}.webp`)).size,0)).toBeLessThanOrEqual(100*1024);
  for (const letter of Object.values(MEAL_LETTERS).flat()) expect(CATEGORY_ICONS[letter]).toBeTruthy();
});
