# Чесна шкала + голосовий ввід їжі: план реалізації

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Юра диктує з'їдене, AI вносить це в прийом їжі, а шкала калорій чесно і страшно показує переїдання понад 100% норми (2305 ккал).

**Architecture:** Етап 1 - правки Header/ClientApp/nutrition (шкала без обрізання, зняття блокувань). Етап 2 - React-модалка з текстовим полем (диктування клавіатурою телефона) -> Cloudflare Worker (перевірка Firebase ID token, ключ Anthropic у секреті) -> Claude API structured output -> прев'ю -> пакетне додавання через чисту `appendProductToMeals` (Task 9). Етап 3 (звіт тренеру) вже реалізований у додатку, тільки перевірка.

**Tech Stack:** React 18 (CRA, Tailwind CDN), Firebase Auth/Firestore, Jest (react-scripts), Cloudflare Workers + wrangler, `@anthropic-ai/sdk` + `zod` (structured output), `jose` (перевірка JWT).

## Global Constraints

- Спека: `docs/superpowers/specs/2026-08-24-voice-food-input-design.md`. Розбіжність - плановий дефект.
- Node з `.nvmrc` (24.11.1): перед будь-якими npm-командами `nvm use`.
- Основне робоче дерево БРУДНЕ чужими змінами (гілка codex/stabilize-core-foundation). Уся робота ТІЛЬКИ в окремому worktree (Task 1). Жодних команд, що міняють основне дерево.
- Мова UI-текстів і коментарів: українська. Довге тире (U+2014) у файлах заборонене (хук emdash-check заверне запис) - тільки дефіс/двокрапка.
- `knowledge/` НЕ комітити ніколи.
- Модель AI: `claude-opus-5` (рішення зафіксоване, не міняти без Юри).
- Норма калорій: 2305 (офіційна цифра тренера). НЕ рахувати з БЖВ.
- Перед кожним PR: `npm run test:ci` і `npm run build` зелені.
- Прод-деплой (firebase hosting, wrangler deploy) - тільки після явного «так» Юри. Кроки, що потребують Юри, позначені **[потрібен Юра]**.
- Push у гілку - одразу після комміту (правило Юри). Force-push заборонений. У main напряму не пушити.

---

## Етап 1: чесна «шкала здоров'я»

### Task 1: Worktree, гілка, комміт спеки

**Files:**
- Create: worktree `../nutrition-app-scale` з гілкою `feat/honest-scale`
- Create (copy): `docs/superpowers/specs/2026-08-24-voice-food-input-design.md`, `docs/superpowers/plans/2026-08-25-voice-food-input.md`

**Interfaces:**
- Produces: усі наступні таски працюють у `/Users/user/Documents/Мої-розробки/nutrition-app-scale` (далі `$WT`).

- [ ] **Step 1: Створити worktree від main**

```bash
git -C "/Users/user/Documents/Мої-розробки/nutrition-app" fetch origin
git -C "/Users/user/Documents/Мої-розробки/nutrition-app" worktree add ../nutrition-app-scale -b feat/honest-scale origin/main
```

- [ ] **Step 2: Встановити залежності**

```bash
cd "/Users/user/Documents/Мої-розробки/nutrition-app-scale" && nvm use && npm install
```

Expected: `npm install` завершується без помилок (warnings можливі).

- [ ] **Step 3: Скопіювати спеку і план з основного дерева**

```bash
mkdir -p "$WT/docs/superpowers/specs" "$WT/docs/superpowers/plans"
cp "/Users/user/Documents/Мої-розробки/nutrition-app/docs/superpowers/specs/2026-08-24-voice-food-input-design.md" "$WT/docs/superpowers/specs/"
cp "/Users/user/Documents/Мої-розробки/nutrition-app/docs/superpowers/plans/2026-08-25-voice-food-input.md" "$WT/docs/superpowers/plans/"
```

- [ ] **Step 4: Санітарна перевірка тестів до змін**

```bash
cd "$WT" && npm run test:ci
```

Expected: PASS (baseline).

- [ ] **Step 5: Комміт і push**

```bash
cd "$WT" && git add docs/ && git commit -m "docs: spec and plan for honest scale + voice food input" && git push -u origin feat/honest-scale
```

---

### Task 2: `getCalorieScaleState` у nutrition.js (TDD)

**Files:**
- Modify: `src/services/nutrition.js` (додати в кінець)
- Test: `src/services/nutrition.test.js` (додати describe в кінець)

**Interfaces:**
- Produces: `getCalorieScaleState(value, target)` -> `{ percent: number, level: 'ok'|'warn'|'over'|'danger', overAmount: number }`; `SCALE_THRESHOLDS = { warn: 85, over: 100, danger: 120 }`. Використовує Task 3.

- [ ] **Step 1: Написати падаючий тест** (в кінець `src/services/nutrition.test.js`, до import додати `getCalorieScaleState`)

```js
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
```

- [ ] **Step 2: Переконатися, що тест падає**

```bash
cd "$WT" && npm run test:ci -- --testPathPattern=nutrition
```

Expected: FAIL, `getCalorieScaleState is not a function`.

- [ ] **Step 3: Мінімальна реалізація** (в кінець `src/services/nutrition.js`)

```js
// Пороги "шкали здоров'я" у відсотках від денної норми калорій
export const SCALE_THRESHOLDS = { warn: 85, over: 100, danger: 120 };

// Стан шкали: відсоток НЕ обрізається на 100 - переїдання має бути видно
export const getCalorieScaleState = (value, target) => {
  if (!target || target <= 0) {
    return { percent: 0, level: 'ok', overAmount: 0 };
  }

  const percent = Math.round((value / target) * 100);
  const overAmount = Math.max(0, Math.round(value - target));

  let level = 'ok';
  if (percent >= SCALE_THRESHOLDS.danger) {
    level = 'danger';
  } else if (percent >= SCALE_THRESHOLDS.over) {
    level = 'over';
  } else if (percent >= SCALE_THRESHOLDS.warn) {
    level = 'warn';
  }

  return { percent, level, overAmount };
};
```

- [ ] **Step 4: Тести зелені**

```bash
cd "$WT" && npm run test:ci -- --testPathPattern=nutrition
```

Expected: PASS усі.

- [ ] **Step 5: Комміт**

```bash
cd "$WT" && git add src/services/nutrition.js src/services/nutrition.test.js && git commit -m "feat: calorie scale state with honest over-100 levels" && git push
```

---

### Task 3: Чесна шкала в Header.js

**Files:**
- Modify: `src/components/Header.js` (рядки 12-18 константи, 26-58 ProgressRing, 60-94 MacroProgressRow, 227-260 картка калорій)

**Interfaces:**
- Consumes: `getCalorieScaleState` з Task 2.
- Produces: тільки UI, нових експортів нема.

- [ ] **Step 1: Правки Header.js**

1. До імпортів додати:

```js
import { getCalorieScaleState } from '../services/nutrition';
```

2. Рядок 18 (`const CALORIES_TARGET = ...`) замінити на:

```js
// Офіційна денна норма тренера. НЕ сума з макросів (та дає 2130).
const CALORIES_TARGET = 2305;

// Кольори рівнів "шкали здоров'я" (як в іграх: зелений -> червоний)
const SCALE_COLORS = {
  ok: '#34C759',
  warn: '#FF9500',
  over: '#FF3B30',
  danger: '#8B0000'
};
```

3. `ProgressRing` (26-58): замінити props і розрахунок percent. Було `({ value, target, color })` і `Math.min(value / target, 1)`. Стає:

```js
function ProgressRing({ percent, color }) {
  const size = 88;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fill = Math.min(percent, 100) / 100; // кільце заповнюється раз, далі говорить колір і цифра
  const dashOffset = circumference * (1 - fill);
  // ... svg без змін, stroke={color} як був
}
```

4. `MacroProgressRow` (60-94): чесний надлишок. Замінити рядки 61-63 на:

```js
  const rawPercent = target > 0 ? (value / target) * 100 : 0;
  const percent = Math.min(rawPercent, 100);
  const over = value > target;
  const remaining = Math.max(target - value, 0);
  const done = value >= target;
  const barColor = over ? '#FF3B30' : color;
```

   У правому підписі (рядки 74-76) замінити вміст span на:

```jsx
        <span
          className="text-[11px] whitespace-nowrap"
          style={{ color: over ? '#FF3B30' : '#A0A0A7' }}
        >
          {over
            ? `+${Math.round(value - target)}г понад`
            : (done ? 'Ціль закрито' : `${Math.ceil(remaining)}г лишилось`)}
        </span>
```

   У заливці бара (рядок 87) `backgroundColor: color` -> `backgroundColor: barColor`.

5. Картка калорій (227-260). Перед `return` компонента Header (після рядка 114 `const caloriesValue = ...`) додати:

```js
  const scale = getCalorieScaleState(caloriesValue, CALORIES_TARGET);
  const scaleColor = SCALE_COLORS[scale.level];
```

   Замінити блок кільця (231-244) на:

```jsx
            <div className="relative shrink-0">
              <div
                className="absolute inset-1 rounded-full blur-md"
                style={{ backgroundColor: `${scaleColor}1A` }}
              />
              <div className={`relative w-[88px] h-[88px] flex items-center justify-center ${scale.level === 'danger' ? 'animate-pulse' : ''}`}>
                <ProgressRing percent={scale.percent} color={scaleColor} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[24px] leading-none font-bold" style={{ color: scaleColor }}>
                    {caloriesValue}
                  </span>
                  <span
                    className="text-[10px] tracking-[0.06em] uppercase mt-1"
                    style={{ color: scale.percent >= 100 ? scaleColor : '#8E8E93' }}
                  >
                    {scale.percent >= 100 ? `${scale.percent}%` : 'ккал'}
                  </span>
                </div>
              </div>
            </div>
```

   Після div з MacroProgressRow-ами (закривається рядок 257), усередині картки, додати банер перевищення:

```jsx
          {scale.overAmount > 0 && (
            <div
              className={`mt-3 rounded-xl px-3 py-2 text-center text-[13px] font-semibold text-white ${scale.level === 'danger' ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: scaleColor }}
            >
              Перевищення: +{scale.overAmount} ккал понад норму
            </div>
          )}
```

- [ ] **Step 2: Тести і збірка**

```bash
cd "$WT" && npm run test:ci && npm run build
```

Expected: PASS + збірка без помилок.

- [ ] **Step 3: Ручна перевірка в браузері**

```bash
cd "$WT" && npm start
```

Додати продуктів на >2766 ккал (наприклад кілька разів «сало» по 300 г у категорію «й» прийому 4). Перевірити: цифра червона/темно-червона, відсоток >120%, банер «+N ккал понад норму» пульсує, макро-рядки показують «+Nг понад». Скріншот для PR.

- [ ] **Step 4: Комміт**

```bash
cd "$WT" && git add src/components/Header.js && git commit -m "feat: honest health scale - real percent over 100, fear colors, over banner" && git push
```

---

### Task 4: Зняти блокування запису їжі в ClientApp.js

**Files:**
- Modify: `src/pages/ClientApp.js` (два місця: ~425-441 в `addProduct`, ~483-499 в `addProductWithCustomGrams`)

**Interfaces:**
- Consumes: `canAddCategoryProduct` (без змін, лишається як розрахунок).
- Produces: поведінка «запис ніколи не блокується». Task 8 на це спирається.

- [ ] **Step 1: Замінити обидва блоки блокування**

В обох функціях знайти:

```js
      if (!validation.allowed) {
        toast.warning(`Перевищено ліміт калорій! Спожито: ${usedCalories} ккал. Залишок: ${validation.remainingCalories} ккал`);
        return;
      }
```

замінити на (БЕЗ `return` - додаємо завжди, чесно попереджаючи):

```js
      if (!validation.allowed) {
        toast.warning(`Перевищення ліміту категорії (${usedCalories + productCalories} з ${calorieLimit} ккал). Записую чесно.`);
      }
```

- [ ] **Step 2: Тести і збірка**

```bash
cd "$WT" && npm run test:ci && npm run build
```

Expected: PASS (canAddCategoryProduct не мінявся, його тести живі).

- [ ] **Step 3: Ручна перевірка**

У `npm start`: категорія «в» прийому 1, додати «будь-що» кілька разів понад 575 ккал. Продукт ДОДАЄТЬСЯ, з'являється toast про перевищення, прогрес категорії червоніє (це вже вміє getCategoryProgress), шкала калорій росте.

- [ ] **Step 4: Комміт**

```bash
cd "$WT" && git add src/pages/ClientApp.js && git commit -m "feat: never block food logging - warn instead of reject over category limit" && git push
```

---

### Task 5: Checkpoint Етапу 1: PR і деплой **[потрібен Юра]**

**Files:** нових нема.

- [ ] **Step 1: Фінальний прогін**

```bash
cd "$WT" && npm run test:ci && npm run build
```

- [ ] **Step 2: PR**

```bash
cd "$WT" && gh pr create --base main --head feat/honest-scale --title "Чесна шкала здоров'я: реальний відсоток понад 100, зняте блокування запису" --body "Етап 1 зі спеки docs/superpowers/specs/2026-08-24-voice-food-input-design.md. Скріншоти в коментарі.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Прикріпити скріншоти з Task 3/4 коментарем до PR.

- [ ] **Step 3: Показати Юрі, отримати «так» на merge і деплой** **[потрібен Юра]**

Після «так»: merge PR (`gh pr merge --squash`), потім деплой з чистого main:

```bash
cd "$WT" && git checkout main && git pull && npm run build && npx firebase-tools deploy --only hosting --project nutrition-tracker-ua
```

Перевірка на проді: відкрити https://nutrition-tracker-ua.web.app з телефона, повторити сценарій переїдання.

---

## Етап 2: голосовий ввід

### Task 6: Сервіс mealParser (TDD)

**Files:**
- Create: `src/services/mealParser.js`
- Test: `src/services/mealParser.test.js`
- Branch: після merge Етапу 1 - `git checkout main && git pull && git checkout -b feat/voice-input`; якщо PR1 ще не змерджено - гілку робити від `feat/honest-scale`, а PR позначити base `feat/honest-scale`.

**Interfaces:**
- Consumes: `PRODUCTS_DB`, `MEAL_LETTERS` з `src/data/products.js`.
- Produces (використовують Task 7 і Task 8):
  - `buildCatalogForMeal(mealNum)` -> `[{ letter, category, calorieBased, products: [{name, raw, coef, p, f, c, cal}] }]`
  - `toMealItems(parseResult, mealNum)` -> `{ items: [{ letter, product, grams, estimated, dictated, note }], unparsed: string[] }`, де `product` = `{name, raw, coef, p, f, c, cal, estimated}`; `grams` - СИРА вага
  - `parseMealText({ text, mealNum, idToken })` -> Promise з JSON відповіді Worker (формат зі спеки: `{ items: [{dictated, name, matchedName, letter, gramsDictated, weightState, p, f, c, cal, estimated, note}], unparsed }`)

- [ ] **Step 1: Падаючий тест** (`src/services/mealParser.test.js`)

```js
import { buildCatalogForMeal, toMealItems } from './mealParser';

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
});
```

- [ ] **Step 2: Переконатися, що падає**

```bash
cd "$WT" && npm run test:ci -- --testPathPattern=mealParser
```

Expected: FAIL, модуля не існує.

- [ ] **Step 3: Реалізація** (`src/services/mealParser.js`)

```js
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
```

- [ ] **Step 4: Тести зелені**

```bash
cd "$WT" && npm run test:ci -- --testPathPattern=mealParser
```

- [ ] **Step 5: Комміт**

```bash
cd "$WT" && git add src/services/mealParser.js src/services/mealParser.test.js && git commit -m "feat: meal parser service - catalog, cooked-to-raw conversion, letter mapping" && git push -u origin feat/voice-input
```

---

### Task 7: Cloudflare Worker `workers/meal-parser`

**Files:**
- Create: `workers/meal-parser/package.json`, `workers/meal-parser/wrangler.toml`, `workers/meal-parser/src/index.js`, `workers/meal-parser/README.md`, `workers/meal-parser/.gitignore`

**Interfaces:**
- Consumes: POST body `{ text, catalog }` (catalog з `buildCatalogForMeal`), заголовок `Authorization: Bearer <firebase id token>`.
- Produces: JSON `{ items: [{dictated, name, matchedName, letter, gramsDictated, weightState, p, f, c, cal, estimated, note}], unparsed: string[] }` або `{ error }` зі статусом 401/400/405/502.

- [ ] **Step 1: Файли Worker**

`workers/meal-parser/package.json`:

```json
{
  "name": "meal-parser-worker",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "latest",
    "jose": "^5.9.6",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "wrangler": "^4.0.0"
  }
}
```

`workers/meal-parser/.gitignore` (КРИТИЧНО: `.dev.vars` міститиме живий ключ, він не має жодного шансу потрапити в git):

```
node_modules
.dev.vars
.wrangler
```

`workers/meal-parser/wrangler.toml`:

```toml
name = "meal-parser"
main = "src/index.js"
compatibility_date = "2026-08-01"
compatibility_flags = ["nodejs_compat"]

[vars]
ALLOWED_ORIGINS = "https://nutrition-tracker-ua.web.app,http://localhost:3000"
```

`workers/meal-parser/src/index.js`:

```js
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const FIREBASE_PROJECT = 'nutrition-tracker-ua';

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

const ItemSchema = z.object({
  dictated: z.string(),
  name: z.string(),
  matchedName: z.string().nullable(),
  letter: z.string(),
  gramsDictated: z.number(),
  weightState: z.enum(['raw', 'cooked', 'unknown']),
  p: z.number(),
  f: z.number(),
  c: z.number(),
  cal: z.number(),
  estimated: z.boolean(),
  note: z.string().nullable()
});

const ParseSchema = z.object({
  items: z.array(ItemSchema),
  unparsed: z.array(z.string())
});

const buildSystemPrompt = (catalog) => `Ти розбираєш надиктований українською текст про з'їдену їжу (можливі помилки голосового розпізнавання) і повертаєш структурований список продуктів.

КАТАЛОГ продуктів поточного прийому їжі. Поля: letter (літера категорії), category, products (name, raw = стандартна порція в грамах СИРОГО, coef = вага готового / вага сирого, p/f/c/cal на 100 г сирого):
${JSON.stringify(catalog)}

Правила:
1. Продукт мапиться на каталог, якщо є розумний збіг ("варена картопля" -> "картопля"). Тоді matchedName = ТОЧНА назва з каталогу, letter = його літера, p/f/c/cal переписуй з каталогу, estimated = false.
2. weightState: "cooked" якщо названа вага готової страви ("вареного рису 170 г"), "raw" якщо сирої або продукт не готують (помідор, хліб), "unknown" якщо незрозуміло. Ваги НЕ перераховуй, віддавай як надиктовано в gramsDictated.
3. Нема в каталозі: matchedName = null, estimated = true, оціни p/f/c/cal на 100 г у стані як надиктовано, обери найближчу літеру каталогу за профілем макросів, у name дай чисту коротку назву.
4. Смаження без згадки олії: додай окремий item з name "олія", gramsDictated 10, estimated true, note "додано автоматично: смаження".
5. Побутові міри переводь у грами: чайна ложка цукру ~8 г, столова ~25 г, склянка рідини ~250 г. Сумнів між чайною і столовою - бери меншу, estimated = true, поясни в note.
6. Обірвані чи незрозумілі шматки клади в unparsed дослівно. НІЧОГО не вигадуй.
7. dictated = шматок вихідного тексту про цей продукт, дослівно.`;

const json = (body, status, cors) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors }
  });

const corsHeaders = (origin, env) => {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',');
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  // Недозволеному origin заголовок не віддаємо взагалі
  if (allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
};

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request.headers.get('Origin') || '', env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405, cors);
    }

    const auth = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) {
      return json({ error: 'unauthorized' }, 401, cors);
    }
    try {
      await jwtVerify(token, JWKS, {
        issuer: `https://securetoken.google.com/${FIREBASE_PROJECT}`,
        audience: FIREBASE_PROJECT
      });
    } catch (e) {
      return json({ error: 'unauthorized' }, 401, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'bad_request' }, 400, cors);
    }
    if (!body.text || !Array.isArray(body.catalog)) {
      return json({ error: 'bad_request' }, 400, cors);
    }

    try {
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
      const response = await client.messages.parse({
        model: 'claude-opus-5',
        max_tokens: 16000,
        system: buildSystemPrompt(body.catalog),
        messages: [{ role: 'user', content: body.text }],
        output_config: { format: zodOutputFormat(ParseSchema) }
      });

      if (!response.parsed_output) {
        return json({ error: 'parse_failed' }, 502, cors);
      }
      return json(response.parsed_output, 200, cors);
    } catch (e) {
      return json({ error: 'upstream_failed' }, 502, cors);
    }
  }
};
```

`workers/meal-parser/README.md`:

```markdown
# meal-parser Worker

Проксі між SciSense і Claude API. Перевіряє Firebase ID token, тримає ключ.

- Локально: `npm install`, потім `npm run dev` (http://localhost:8787)
- Секрет (один раз): `npx wrangler secret put ANTHROPIC_API_KEY`
- Деплой: `npm run deploy`
- Дозволені origin: wrangler.toml, змінна ALLOWED_ORIGINS
```

- [ ] **Step 2: Встановити залежності і запустити локально**

```bash
cd "$WT/workers/meal-parser" && npm install && npx wrangler dev --local
```

Примітка: якщо import `@anthropic-ai/sdk/helpers/zod` впаде на збірці Worker - запасний шлях: прибрати zodOutputFormat, у `client.messages.create` попросити чистий JSON у system-промпті і зробити `JSON.parse` тексту відповіді з валідацією `ParseSchema.safeParse`.

- [ ] **Step 3: Smoke-тести без ключа** (в іншому терміналі)

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS http://localhost:8787
curl -s -X POST http://localhost:8787 -H "Content-Type: application/json" -d '{"text":"тест"}'
```

Expected: `204`, потім `{"error":"unauthorized"}`.

- [ ] **Step 4: Перевірка, що секретні файли невидимі для git, і комміт**

```bash
cd "$WT" && touch workers/meal-parser/.dev.vars && git status --porcelain | grep -c ".dev.vars"
```

Expected: `0` (файл не видно git). Потім:

```bash
cd "$WT" && git add workers/ && git commit -m "feat: cloudflare worker meal-parser - auth, cors, claude structured output" && git push
```

---

### Task 8: Компонент VoiceInputModal

**Files:**
- Create: `src/components/VoiceInputModal.js`

**Interfaces:**
- Consumes: `parseMealText`, `toMealItems` (Task 6), `PRODUCTS_DB` з products.js.
- Produces: `<VoiceInputModal isOpen selectedMeal meals getIdToken onAdd onClose />`; `onAdd(items)` отримує масив items з `toMealItems` (Task 9 передає сюди `addVoiceItems`).

- [ ] **Step 1: Повний код компонента**

```jsx
import React, { useState } from 'react';
import { Mic, X, Trash2, Loader2 } from 'lucide-react';
import { parseMealText, toMealItems } from '../services/mealParser';
import { PRODUCTS_DB } from '../data/products';

// Прев'ю одного розібраного рядка: назва, ваги, ккал, попередження
function PreviewRow({ item, overLimit, onChangeGrams, onRemove }) {
  const cal = Math.round((item.product.cal || 0) * item.grams / 100);
  const cooked = item.product.coef && item.product.coef !== 1
    ? Math.round(item.grams * item.product.coef)
    : null;

  return (
    <div className="px-3 py-2.5 border-b border-[#C6C6C8]/30 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[15px] text-black break-words">
            <span className="font-semibold text-[#007AFF] mr-1">{item.letter.toUpperCase()}</span>
            {item.product.name}
            {item.estimated && (
              <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded bg-[#FF9500]/15 text-[#FF9500]">
                ≈ оцінка AI
              </span>
            )}
          </div>
          <div className="text-[12px] text-[#8E8E93]">
            {cooked ? `${cooked}г готового (${item.grams}г сир.)` : `${item.grams}г`} · {cal} ккал
          </div>
          {item.note && <div className="text-[12px] text-[#FF9500]">{item.note}</div>}
          {overLimit && (
            <div className="text-[12px] text-[#FF3B30]">перевищить ліміт категорії «в»</div>
          )}
        </div>
        <input
          type="number"
          inputMode="numeric"
          value={item.grams}
          onChange={(e) => onChangeGrams(parseInt(e.target.value, 10) || 0)}
          className="w-16 px-2 py-1.5 bg-[#F2F2F7] rounded-lg text-[15px] text-center focus:outline-none"
        />
        <button onClick={onRemove} className="p-1.5 text-[#FF3B30] active:opacity-50">
          <Trash2 size={17} />
        </button>
      </div>
    </div>
  );
}

export default function VoiceInputModal({ isOpen, selectedMeal, meals, getIdToken, onAdd, onClose }) {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState('input'); // input | loading | preview
  const [items, setItems] = useState([]);
  const [unparsed, setUnparsed] = useState([]);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleParse = async () => {
    setPhase('loading');
    setError(null);
    try {
      const idToken = await getIdToken();
      const parseResult = await parseMealText({ text, mealNum: selectedMeal, idToken });
      const converted = toMealItems(parseResult, selectedMeal);
      setItems(converted.items);
      setUnparsed(converted.unparsed);
      setPhase('preview');
    } catch (e) {
      setError('Не вдалося розібрати. Перевір інтернет і спробуй ще раз.');
      setPhase('input'); // текст зберігається, нічого не втрачено
    }
  };

  // Попередження про ліміт калорійної категорії «в» (не блокує, тільки лякає)
  const vLimit = PRODUCTS_DB['в']?.calorieLimit || 575;
  const vUsed = (meals[selectedMeal]?.['в'] || []).reduce((sum, p) => sum + (p.calories || 0), 0);
  let vRunning = vUsed;
  const overFlags = items.map((item) => {
    if (item.letter !== 'в') return false;
    vRunning += Math.round((item.product.cal || 0) * item.grams / 100);
    return vRunning > vLimit;
  });

  const validItems = items.filter((item) => item.grams > 0);

  const reset = () => {
    setText('');
    setItems([]);
    setUnparsed([]);
    setError(null);
    setPhase('input');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg rounded-t-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-4 py-3 border-b border-[#C6C6C8]/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic size={18} className="text-[#007AFF]" />
            <span className="text-[17px] font-semibold">Надиктувати їжу</span>
          </div>
          <button onClick={() => { reset(); onClose(); }} className="p-1.5 text-[#8E8E93]">
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          {phase !== 'preview' && (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                placeholder="Тисни сюди, натисни мікрофон на клавіатурі і кажи: «варена картопля 200 г, два помідори, сметана 20 г...»"
                className="w-full p-3 bg-[#F2F2F7] rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
              />
              {error && <div className="mt-2 text-[13px] text-[#FF3B30]">{error}</div>}
              <button
                onClick={handleParse}
                disabled={!text.trim() || phase === 'loading'}
                className="mt-3 w-full py-3.5 bg-[#007AFF] disabled:opacity-40 text-white rounded-2xl text-[17px] font-semibold active:opacity-80 flex items-center justify-center gap-2"
              >
                {phase === 'loading' && <Loader2 size={18} className="animate-spin" />}
                {phase === 'loading' ? 'Розбираю...' : 'Розібрати'}
              </button>
            </>
          )}

          {phase === 'preview' && (
            <>
              <div className="bg-[#F2F2F7] rounded-xl overflow-hidden">
                {validItems.length === 0 && (
                  <div className="px-3 py-4 text-[14px] text-[#8E8E93] text-center">
                    Нічого не розпізнано
                  </div>
                )}
                {items.map((item, idx) => (
                  <PreviewRow
                    key={idx}
                    item={item}
                    overLimit={overFlags[idx]}
                    onChangeGrams={(grams) => {
                      const next = [...items];
                      next[idx] = { ...item, grams };
                      setItems(next);
                    }}
                    onRemove={() => setItems(items.filter((_, i) => i !== idx))}
                  />
                ))}
              </div>

              {unparsed.length > 0 && (
                <div className="mt-3 p-3 bg-[#FF9500]/10 rounded-xl text-[13px] text-[#B25000]">
                  Не розібрав: {unparsed.join('; ')}
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setPhase('input')}
                  className="flex-1 py-3.5 bg-[#F2F2F7] rounded-2xl text-[17px] font-semibold text-[#007AFF] active:opacity-80"
                >
                  Назад
                </button>
                <button
                  onClick={() => {
                    onAdd(validItems);
                    reset();
                    onClose();
                  }}
                  disabled={validItems.length === 0}
                  className="flex-1 py-3.5 bg-[#34C759] disabled:opacity-40 text-white rounded-2xl text-[17px] font-semibold active:opacity-80"
                >
                  Додати ({validItems.length})
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Збірка**

```bash
cd "$WT" && npm run build
```

Expected: без помилок (компонент ще не підключений, це нормально).

- [ ] **Step 3: Комміт**

```bash
cd "$WT" && git add src/components/VoiceInputModal.js && git commit -m "feat: voice input modal - dictation textarea, parse preview, edit and add" && git push
```

---

### Task 9: Підключення в ClientApp + бейдж AI + локальний e2e

**Files:**
- Modify: `src/services/nutrition.js` (чиста функція пакетного додавання), `src/services/nutrition.test.js`
- Modify: `src/pages/ClientApp.js` (імпорт, стейт, обробник addVoiceItems, рендер модалки)
- Modify: `src/components/Header.js` (кнопка мікрофона)
- Modify: `src/components/MealSection.js` (бейдж «≈ AI», рядок ~154)
- Create: `.env.development.local` (НЕ комітиться, стандартний .gitignore CRA)

**Interfaces:**
- Consumes: `VoiceInputModal` (Task 8), `canAddCategoryProduct` і `createEmptyMeals` (наявні в nutrition.js), firebase auth user (у ClientApp вже є, звідти `getIdToken`).
- Produces: `appendProductToMeals({ meals, mealNum, letter, product, grams, userPortion, categoryData })` -> `{ meals, warning }` (чиста, вхідні meals НЕ мутує); наскрізний сценарій голосового вводу.

Чому саме так: `addVoiceItems` додає КІЛЬКА продуктів за раз. Викликати наявний
`addProductWithCustomGrams` у циклі не можна: він читає стейт `meals` із
замикання, тому другий виклик перезаписав би перший. Переносити його логіку у
функціональний `setMeals((prev) => ...)` теж погано: React може виконати updater
двічі (StrictMode), і toast усередині спрацював би подвійно. Рішення: чиста
функція без side effects, цикл накопичує результат у локальній змінній, один
`setMeals` наприкінці, усі toast - ПІСЛЯ нього. Наявні
addProduct/addProductWithCustomGrams НЕ чіпаємо (після Task 4 вони вже не
блокують; для одиночного інтерактивного додавання замикання на meals безпечне).

- [ ] **Step 1: Падаючий тест appendProductToMeals** (в кінець `src/services/nutrition.test.js`, до import додати `appendProductToMeals`)

```js
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
```

- [ ] **Step 2: Переконатися, що падає**

```bash
cd "$WT" && npm run test:ci -- --testPathPattern=nutrition
```

Expected: FAIL, `appendProductToMeals is not a function`.

- [ ] **Step 3: Реалізація** (в кінець `src/services/nutrition.js`; `canAddCategoryProduct` уже в цьому файлі)

```js
// Чисте пакетно-безпечне додавання продукту: повертає НОВІ meals і текст
// попередження про переліміт (або null). Side effects тут заборонені:
// toast робить викликач ПІСЛЯ setMeals, бо React може виконати updater двічі.
export const appendProductToMeals = ({ meals, mealNum, letter, product, grams, userPortion, categoryData }) => {
  const isCalorieBased = categoryData?.isCalorieBased || false;
  const calorieLimit = categoryData?.calorieLimit || 575;

  const existing = meals[mealNum]?.[letter] || [];
  const productCalories = Math.round((product.cal || 0) * grams / 100);

  let warning = null;
  if (isCalorieBased) {
    const usedCalories = existing.reduce((sum, p) => sum + (p.calories || 0), 0);
    const validation = canAddCategoryProduct({ isCalorieBased, usedCalories, productCalories, calorieLimit });
    if (!validation.allowed) {
      warning = `Перевищення ліміту категорії (${usedCalories + productCalories} з ${calorieLimit} ккал). Записую чесно.`;
    }
  }

  const portion = userPortion > 0 ? Math.round((grams / userPortion) * 100) : 0;
  const cookedWeight = product.coef && product.coef !== 1 ? Math.round(grams * product.coef) : null;

  const item = {
    name: product.name,
    weight: grams,
    portion: isCalorieBased ? 0 : portion,
    cookedWeight,
    calories: productCalories,
    p: product.p || 0,
    f: product.f || 0,
    c: product.c || 0,
    estimated: product.estimated || false
  };

  return {
    meals: {
      ...meals,
      [mealNum]: { ...meals[mealNum], [letter]: [...existing, item] }
    },
    warning
  };
};
```

- [ ] **Step 4: Тести зелені**

```bash
cd "$WT" && npm run test:ci -- --testPathPattern=nutrition
```

Expected: PASS усі.

- [ ] **Step 5: ClientApp.js**

1. Імпорт: `import VoiceInputModal from '../components/VoiceInputModal';` і до наявного import з `'../services/nutrition'` додати `appendProductToMeals`.
2. Стейт поряд з іншими модалками: `const [showVoiceInput, setShowVoiceInput] = useState(false);`
3. Обробник поряд з addProductWithCustomGrams:

```js
  // Пакетне додавання розібраних голосом продуктів: один setMeals на весь
  // список, toast після нього (чому - коментар у appendProductToMeals)
  const addVoiceItems = (items) => {
    let nextMeals = meals;
    const warnings = [];

    items.forEach(({ letter, product, grams }) => {
      const userPortion = userPortions[product.name] || product.raw || 100;
      const result = appendProductToMeals({
        meals: nextMeals,
        mealNum: selectedMeal,
        letter,
        product,
        grams,
        userPortion,
        categoryData: PRODUCTS_DB[letter]
      });
      nextMeals = result.meals;
      if (result.warning) {
        warnings.push(result.warning);
      }
    });

    setMeals(nextMeals);
    warnings.forEach((w) => toast.warning(w));
    toast.success(`Додано продуктів: ${items.length}`);
  };
```

4. Рендер модалки поряд з іншими:

```jsx
      <VoiceInputModal
        isOpen={showVoiceInput}
        selectedMeal={selectedMeal}
        meals={meals}
        getIdToken={() => firebaseUser.getIdToken()}
        onAdd={addVoiceItems}
        onClose={() => setShowVoiceInput(false)}
      />
```

5. У `<Header ... />` додати проп `onShowVoiceInput={() => setShowVoiceInput(true)}`.

- [ ] **Step 6: Кнопка мікрофона в Header.js**

До імпорту lucide додати `Mic`. У props додати `onShowVoiceInput`. Поряд з кнопкою Settings (рядки 215-221) додати перед нею:

```jsx
              <button
                onClick={onShowVoiceInput}
                className="p-2 text-[#007AFF] active:opacity-60"
                title="Надиктувати їжу"
              >
                <Mic size={18} />
              </button>
```

- [ ] **Step 7: Бейдж у MealSection.js**

Після span з назвою (рядок ~154 `<span className="text-[15px] text-black">{product.name}</span>`) додати:

```jsx
                                {product.estimated && (
                                  <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-[#FF9500]/15 text-[#FF9500] align-middle">
                                    ≈ AI
                                  </span>
                                )}
```

- [ ] **Step 8: Локальний env**

```bash
echo "REACT_APP_MEAL_PARSER_URL=http://localhost:8787" > "$WT/.env.development.local"
```

- [ ] **Step 9: Тести і збірка**

```bash
cd "$WT" && npm run test:ci && npm run build
```

- [ ] **Step 10: Наскрізна перевірка локально** **[потрібен Юра або тимчасовий ключ]**

Потрібен ANTHROPIC_API_KEY у dev-Worker: `cd "$WT/workers/meal-parser" && npx wrangler dev --local` підхоплює `.dev.vars` (створити файл `ANTHROPIC_API_KEY=...`, він у .gitignore Worker; ключ дає Юра, зберегти в Keychain за скілом secrets-keychain). Потім `npm start`, залогінитися, натиснути мікрофон, ввести текст «варена картопля 200 г, два помідори 300 г, сметана 20 г, кава з молоком 180 г молока і ложка цукру», перевірити прев'ю (картопля -> а/200г, помідори -> «в» з бейджем «≈ оцінка AI»: у прийомі 1 овочевої категорії нема, є тільки а/б/в, тому овочі на сніданку падають у «в» і з'їдають частину ліміту 575 - це очікувано, сказати Юрі; сметана -> б/20г, молоко -> б/180г, цукор -> в/~8-25г) і що після «Додати» продукти видно в прийомі, шкала виросла, у Firestore записалось (перезавантажити сторінку).

- [ ] **Step 11: Комміт**

```bash
cd "$WT" && git add src/services/nutrition.js src/services/nutrition.test.js src/pages/ClientApp.js src/components/Header.js src/components/MealSection.js && git commit -m "feat: wire voice input - mic button, batch add via pure appendProductToMeals, AI badge" && git push
```

---

### Task 10: Деплой Етапу 2, перевірка звіту, доки **[потрібен Юра]**

**Files:**
- Create: `.env.production` (тільки URL Worker, не секрет)
- Modify: `DEVELOPMENT.md` (розділ про Worker), `PROJECT-INFO.md` (deploy-команди і статус)

- [ ] **Step 1: Cloudflare онбординг** **[потрібен Юра]**

Юра створює/логінить акаунт: `cd "$WT/workers/meal-parser" && npx wrangler login` (відкриє браузер). Потім ключ:

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

(значення вводиться приховано; той самий ключ зберегти в Keychain за скілом secrets-keychain).

- [ ] **Step 2: Деплой Worker**

```bash
cd "$WT/workers/meal-parser" && npm run deploy
```

Записати видану адресу `https://meal-parser.<акаунт>.workers.dev`.

- [ ] **Step 3: Прод-URL для фронта**

```bash
echo "REACT_APP_MEAL_PARSER_URL=https://meal-parser.<акаунт>.workers.dev" > "$WT/.env.production"
cd "$WT" && git add .env.production && git commit -m "chore: production meal parser url" && git push
```

- [ ] **Step 4: Доки**

У `DEVELOPMENT.md` додати розділ «Meal parser Worker»: що це, локальний запуск, секрет, деплой (3-5 рядків, з README Worker). У `PROJECT-INFO.md` в Deploy додати рядок про `wrangler deploy` і в кінець: «2026-08-2X: Етапи 1-2 голосового вводу реалізовані, доказ - PR #N і e2e на проді». Комміт «docs: worker deploy notes».

- [ ] **Step 5: PR Етапу 2** **[потрібен Юра]**

```bash
cd "$WT" && npm run test:ci && npm run build && gh pr create --base main --head feat/voice-input --title "Голосовий ввід їжі через AI-розбір" --body "Етап 2 зі спеки. Worker: workers/meal-parser. Скріншоти в коментарі.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Після «так» Юри: merge, `git checkout main && git pull && npm run build && npx firebase-tools deploy --only hosting --project nutrition-tracker-ua`.

- [ ] **Step 6: E2E на проді з телефона + Етап 3 (перевірка звіту)**

Юра диктує реальний прийом з телефона. Після додавання: натиснути «Надіслати звіт», звірити текст із форматом тренера (`knowledge/trainer-program.md` в ОСНОВНОМУ дереві). Очікуване: продукти з голосу присутні з сирими грамами, «Калорії: N ккал / 2305». Розбіжність формату - фіксується як окрема маленька задача, не в цьому плані.

- [ ] **Step 7: Закриття**

Журнал сесії в `.agents/journal/` основного дерева, HANDOFF закрити (`status: closed`), worktree прибрати: `git worktree remove ../nutrition-app-scale` (після merge обох PR).

---

## Ризики (для виконавця)

- `client.messages.parse` + `zodOutputFormat` у Workers: якщо збірка впаде на імпорті helpers - запасний шлях описаний у Task 7 Step 2.
- Ліміт CPU безкоштовного Workers: виклик Claude - це очікування мережі, не CPU, вкладається.
- Опус відповідає 2-5 с: у модалці є стан «Розбираю...».
- Якщо `gh pr create` попросить логін: `gh auth status` має показати MILSPIL (правило: чужий акаунт - стоп).
