# NutritionApp - Документація розробки

## Посилання

- **Firebase**: https://nutrition-tracker-ua.web.app
- **Netlify**: https://sacs.netlify.app
- **GitHub**: https://github.com/MILSPIL/nutrition-app

---

## Поточна версія: 1.2.1

### Команди

```bash
# Розробка
npm start

# Білд
npm run build

# Деплой на Firebase
npx firebase-tools deploy --only hosting --project nutrition-tracker-ua

# Git
git add -A && git commit -m "опис змін" && git push origin main
```

---

## Структура проекту

```
src/
├── App.js                 # Головний компонент, вся логіка
├── firebase.js            # Firebase конфігурація
├── index.js               # Entry point
├── components/
│   ├── index.js           # Експорти всіх компонентів
│   ├── Header.js          # Хедер з БЖВ, калоріями, прийомами їжі
│   ├── MealSection.js     # Секція прийому їжі
│   ├── ProductModal.js    # Модалка вибору продукту
│   ├── EditProductModal.js    # Редагування БЖВ продукту
│   ├── AddCustomProductModal.js # Додавання кастомного продукту
│   ├── ReportModal.js     # Звіт для тренера
│   ├── LoginScreen.js     # Екран входу
│   ├── LoadingScreen.js   # Екран завантаження
│   ├── WelcomeModal.js    # Модалка з changelog (APP_VERSION)
│   ├── AnimatedModal.js   # Базовий анімований модал
│   ├── Toast.js           # Система повідомлень
│   ├── PortionSettingsModal.js  # Налаштування порцій
│   ├── DaySelectorModal.js      # Вибір дня
│   ├── StartDateSetupModal.js   # Налаштування дати початку
│   ├── AccountSwitchModal.js    # Перемикання акаунтів
│   ├── ActivitySection.js       # Секція активності
│   └── RulesSection.js          # Секція правил
└── data/
    └── products.js        # База продуктів з БЖВ та калоріями
```

---

## База даних продуктів

Файл: `src/data/products.js`

### Структура продукту

```javascript
{
  name: "куряче філе",      // Назва
  raw: 190,                 // Вага сирого (г)
  cooked: 116,              // Вага готового (г)
  coef: 0.611,              // Коефіцієнт (cooked/raw)
  verified: true,           // Верифікований продукт
  p: 23.6,                  // Білки на 100г сирого
  f: 1.9,                   // Жири на 100г сирого
  c: 0.4,                   // Вуглеводи на 100г сирого
  cal: 113                  // Калорії на 100г сирого
}
```

### Формула калорій
```
cal = білки × 4 + вуглеводи × 4 + жири × 9
```

### Категорії по прийомах їжі

```javascript
MEAL_LETTERS = {
  1: ["а", "б", "в"],           // Сніданок
  2: ["г", "д", "е", "є"],      // Обід
  3: ["ж", "з", "и"],           // Полуденок
  4: ["і", "ї", "й"]            // Вечеря
}
```

---

## Ключові функції в App.js

### Стейт

```javascript
const [firebaseUser, setFirebaseUser] = useState(null);
const [currentUser, setCurrentUser] = useState(null);
const [users, setUsers] = useState({});
const [globalCustomProducts, setGlobalCustomProducts] = useState({});
const [productOverrides, setProductOverrides] = useState({});
const [meals, setMeals] = useState({ 1: {}, 2: {}, 3: {}, 4: {} });
```

### Основні функції

| Функція | Опис |
|---------|------|
| `calculateProductMacros(product, weight)` | Розрахунок БЖВ та калорій для ваги |
| `calculateTotalMacros()` | Загальні БЖВ та калорії за день |
| `getAllProducts(letter)` | Отримати всі продукти категорії з overrides |
| `getOriginalProduct(name)` | Отримати оригінальний продукт без overrides |
| `saveProductOverride(name, values)` | Зберегти персональні зміни БЖВ |
| `resetProductOverride(name)` | Скинути до оригіналу |
| `addProduct(letter, product, portion)` | Додати продукт до прийому їжі |
| `addCustomProduct(productData)` | Додати кастомний продукт |
| `saveToFirestore()` | Зберегти в Firebase |

---

## Firestore структура

```
users/
└── {firebase_uid}/
    ├── users: {}                    # Профілі користувачів
    ├── globalCustomProducts: {}     # Кастомні продукти
    ├── productOverrides: {}         # Персональні зміни БЖВ
    └── updatedAt: "ISO date"
```

---

## Версії та зміни

### v1.2.1 (10.01.2026)
- Показ калорій за день у хедері
- Компактний дизайн БЖВ панелі

### v1.2.0 (10.01.2026)
- Додано калорійність до всіх продуктів
- Редагування БЖВ та калорійності прямо з меню
- Показ БЖВ та ккал під кожним продуктом
- Збереження персональних змін в хмарі
- Можливість скинути до стандартних значень

### v1.1.0 (09.01.2026)
- Додано плавні анімації для всіх вікон
- Замінено alert на стильні повідомлення
- Покращено екран завантаження
- Оптимізовано код додатку

### v1.0.0 (08.01.2026)
- Перший реліз додатку
- Google авторизація
- Трекінг харчування по прийомах
- Звіт для тренера в Telegram

---

## Оновлення версії

1. Змінити `APP_VERSION` в `src/components/WelcomeModal.js`
2. Додати новий запис в `CHANGELOG`
3. `npm run build`
4. `npx firebase-tools deploy --only hosting --project nutrition-tracker-ua`
5. `git add -A && git commit -m "опис" && git push origin main`

---

## TODO / Ідеї на майбутнє

- [ ] Графіки прогресу ваги
- [ ] Історія харчування по днях
- [ ] Експорт даних в Excel
- [ ] PWA офлайн режим
- [ ] Push-нотифікації
- [ ] Темна тема
