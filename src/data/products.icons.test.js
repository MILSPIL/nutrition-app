import fs from 'fs';
import path from 'path';
import { CATEGORY_ICONS, MEAL_LETTERS } from './products';

test('кожна категорія має наявний локальний PNG, а не HTML fallback', () => {
  for (const letter of Object.values(MEAL_LETTERS).flat()) {
    const icon = CATEGORY_ICONS[letter];
    expect(icon).toMatch(/^\/icons\/category-[a-z]+\.png$/);
    const bytes = fs.readFileSync(path.join(process.cwd(), 'public', icon));
    expect(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
  }
});
