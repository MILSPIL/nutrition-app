# SciSense - Документація розробки

## Посилання

- Firebase Hosting: https://nutrition-tracker-ua.web.app
- GitHub: https://github.com/MILSPIL/nutrition-app

## Поточна версія: 1.5.0

## Команди

```bash
# Розробка
npm start

# Production build
npm run build

# Тести без watch
npm run test:ci

# Деплой на Firebase Hosting
npx firebase-tools deploy --only hosting --project nutrition-tracker-ua

# Деплой Firestore rules
npx firebase-tools deploy --only firestore:rules --project nutrition-tracker-ua
```

## Структура проекту

```text
src/
├── App.js
├── firebase.js
├── index.js
├── components/
│   ├── BarcodeScannerModal.js
│   ├── Header.js
│   ├── MealSection.js
│   ├── ProductModal.js
│   ├── SettingsModal.js
│   ├── WelcomeModal.js
│   ├── client/
│   ├── measurements/
│   └── trainer/
├── data/
│   └── products.js
├── services/
│   ├── measurements.js
│   ├── nutrition.js
│   └── openFoodFacts.js
└── utils/
    └── date.js
```

## Дані

```text
users/{uid}
  users
  globalCustomProducts
  productOverrides
  trainerId
  trainerEmail

users/{uid}/mealHistory/{YYYY-MM-DD}
users/{uid}/measurements/{YYYY-MM-DD}
trainers/{trainerId}
trainerRequests/{requestId}
```

## Безпека

- `firestore.rules` обмежує доступ до профілю, історії харчування і замірів тільки власнику або прив'язаному тренеру.
- Запити до тренера читаються тільки клієнтом-власником або тренером з відповідним email.
- Видалення основних документів з клієнтськими даними правилами заборонено.

## Якість

- Unit-тести лежать у `src/**/*.test.js`
- CI: `.github/workflows/ci.yml`
- Production build робиться без sourcemaps через шум від `html5-qrcode` у CRA

## Версії

### v1.5.0 (20.04.2026)
- Додано `src/utils/date.js` з єдиними helper-функціями для локальних дат, `today`, max date для input і розрахунку дня програми
- Замінено використання `toISOString().split('T')[0]` у клієнтській частині, модалках замірів і тренерському дашборді на локальні дати без UTC-зсуву
- Додано `src/services/nutrition.js` з логікою створення порожніх прийомів їжі, дефолтного профілю клієнта і розрахунку БЖВ/ккал
- Додано `src/services/measurements.js` з єдиним списком параметрів замірів і helper-функціями для порівняння прогресу
- Розвантажено `src/pages/ClientApp.js`: частину бізнес-логіки винесено в `services/` та `utils/`
- Оновлено `src/pages/TrainerDashboard.js`, `src/components/measurements/MeasurementsModal.js`, `src/components/measurements/MeasurementReminderModal.js` і `src/components/trainer/ClientDetailsModal.js` під нову логіку дат і замірів
- Додано unit-тести: `src/utils/date.test.js`, `src/services/nutrition.test.js`, `src/services/measurements.test.js`, `src/services/openFoodFacts.test.js`
- Додано GitHub Actions CI у `.github/workflows/ci.yml` з перевірками `npm run test:ci` і `npm run build`
- Оновлено `src/services/openFoodFacts.js`: винесено нормалізацію даних, прибрано debug-логи, виправлено обробку `product not found`
- Додано `firestore.rules` з обмеженнями доступу до профілю, історії харчування, замірів, профілів тренерів і запитів на прив'язку
- Додано `firestore.indexes.json` і підключено Firestore конфіг у `firebase.json`
- Синхронізовано версію `1.5.0` у `package.json`, `DEVELOPMENT.md` і `src/components/WelcomeModal.js`
- Оновлено `README.md` і переписано `DEVELOPMENT.md` під актуальну структуру проекту
- Оновлено залежності `firebase` до `12.12.0` і `react-router-dom` до `7.14.1`
- Оновлено npm scripts: версія прокидується через `REACT_APP_VERSION`, production build йде без sourcemaps
- Прибрано lint warnings у `BarcodeScannerModal`, `MealSection`, `SettingsModal`, `ClientApp` і `TrainerDashboard`
- Додано `.gitignore` для `.DS_Store` і дубльованих `node_modules*`
- Видалено зайвий локальний каталог `node_modules (1)`
- Додано `CONTRIBUTING.md`, `RELEASE_CHECKLIST.md`, шаблон PR і шаблони issue для порядку в GitHub-процесі
- У GitHub увімкнено захист default branch: PR перед merge, обов'язковий зелений CI, resolved conversations, linear history, squash/rebase merge і авто-видалення злитих гілок
- Вирівняно runtime між локальною розробкою і CI через `.nvmrc`, `engines` у `package.json` і `setup-node` по `node-version-file`
- Перевірено, що `npm run test:ci` і `npm run build` проходять успішно
- Після `npm audit fix` залишилися вразливості у ланцюжку `react-scripts`; для повного прибирання потрібна міграція з CRA на сучасний toolchain

### v1.4.0 (12.01.2026)
- Сканування штрих-кодів продуктів
- Автозаповнення БЖВ з Open Food Facts
- Підтримка EAN-8 та EAN-13
- Ручне введення штрих-коду

### v1.3.0 (10.01.2026)
- Тренерський дашборд
- Історія харчування по днях
- Система замірів
- Підключення тренера через email

### v1.1.0 (09.01.2026)
- Плавні анімації для модалок
- Toast замість alert

### v1.0.0 (08.01.2026)
- Перший реліз
- Google авторизація
- Трекінг харчування по прийомах

## TODO

- [ ] Графіки прогресу ваги
- [ ] Експорт даних в Excel
- [ ] PWA офлайн режим
- [ ] Push-нотифікації
- [ ] Темна тема
