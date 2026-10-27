# SciSense - Документація розробки

## Посилання

- Firebase Hosting: https://nutrition-tracker-ua.web.app
- GitHub: https://github.com/MILSPIL/nutrition-app

## Поточна версія пакета: 1.9.5

27.10.2026: у чаті одна стрічка повідомлень і прив’язаних до них прев’ю. Збережена їжа показується короткою квитанцією, попередні готові прев’ю згорнуті, а невизначене збереження має доступні кнопки відновлення. Повторне відкриття показує останню відповідь. Native отримує компактний підписаний текст; перед модельним запитом додається один повний актуальний snapshot. Канонічна історія не переписується. [Перевірки й публікація](docs/evidence/trainer-chat-reliability-2026-10-27.json).

Поточна адреса: https://ntzg.pp.ua/. Розгортання та відкат описані в [NORMAL-USE-01](docs/deployment/normal-use-01.md); команди Firebase Hosting нижче залишені для попереднього способу публікації.

26.10.2026: поле дня зберігає незавершене введення локально, включно з порожнім рядком. «Готово» або Enter застосовує лише ціле число в межах програми. Вибір дня відкриває відповідну календарну дату без перезапису її номера; pending-збереження блокує навігацію. Поточний день береться за Europe/Kyiv. Публікацію й докази див. у PROJECT-INFO.md.

23.10.2026: VOICE-LETTERS-01, погоджені локальні кроки 0–6. Форма чекає «Почати запис»; API v2 передає компактний каталог у тому самому аналізі. `planCatalog` фіксує ефективний план, `planAllocation` рахує денні частки, `appendAllocated` записує один пакет транзакційно. Ручні літери й «Без літери» необов’язкові. V1 сумісність, старий writer, unknown/retry та пілот перевіряються на demo. [Локальні докази](docs/evidence/voice-letters-local-2026-10-23.md), [пакет кандидата](docs/VOICE-LETTERS-RELEASE.md). Крок 7, реальні API й телефон потребують окремого погодження. Ця версія ще не опублікована.

23.10.2026: новини та людська версія винесені в `src/data/releases.js`, незалежно від SHA збірки. Виправлено посилання на локальні іконки й додано резервний значок при відмові завантаження. Звіт відкриває прев’ю та копіювання з перевіркою результату; Telegram-передачу прибрано, Hermes ще не підключений. Дані харчування, норми й зв’язки тренера незмінні. Це опис UI-змін; поточну серверну активацію та перевірки див. у `PROJECT-INFO.md`.

20.10.2026: додано локальний [HTTPS-вхід для телефона](docs/PHONE-LAB.md), команди `lab:phone:prepare`, `lab:phone`, `test:phone-lab` і `test:phone-lab-ui`. Окремі demo Firebase/UID, сполучення, ключ TLS у Keychain; CLI live=false. Автоматизований proof використовує підставні відповіді моделей, реальні API й фізичний телефон потребують окремого приймання.

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

### Локальна реалізація голосу й фото, 20.10.2026

У codex/voice-photo-entry додано запис з головного екрана, два фото упаковки, спільне прев’ю, транзакційне збереження за датою і знеособлений облік пілоту. Код c9f3ab3 пройшов незалежне рев’ю, 88 тестів застосунку, 17 Worker і 17 сховища. Реальні API та production вимкнені; це не оголошення нового випуску. [Перевірка й відкриті гейти](docs/VOICE-PHOTO-VALIDATION.md).

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

## 2026-10-22: Groq Free для голосу

Голос використовує окремий Groq whisper-large-v3 адаптер, фото й розбір їжі залишаються на Sonnet. Додано auto/uk/ru та ізольований stt_only. Чинний ledger збережений, безкоштовні спроби враховуються у спільних квотах. Нова активація вимкнена. Конфігурація й майбутні команди: [GROQ-FREE-SETUP.md](docs/GROQ-FREE-SETUP.md).
