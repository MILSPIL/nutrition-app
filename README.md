# SciSense

SciSense is a nutrition tracker for clients and coaches. It helps log meals, track macros and calories, record body measurements, and share daily progress with a trainer through Firebase.

## Голос і літери програми, кандидат 1.8.0

Мікрофон відкриває форму, запис запускає «Почати запис». AI-відповідник із компактного каталогу дозволяє показати літеру та частку денної норми без додаткового модельного запиту. У прев’ю літера необов’язкова: її можна змінити або вибрати «Без літери». Один атомарний запис зберігає їжу у фактичний прийом; підсумок літери спільний за день.

Локальні кроки 0–6 VOICE-LETTERS-01 погоджені. [Докази](docs/evidence/voice-letters-local-2026-10-23.md) та [пакет кандидата](docs/VOICE-LETTERS-RELEASE.md). Справжній Sonnet, телефон і розгортання ще не перевірені для цієї версії, це окремий крок 7.

## Stack

- React 18
- React Router 7
- Firebase Auth, Firestore, Hosting
- Tailwind v3 compiled locally from `src/tailwind.css` and `tailwind.config.js`
- Jest via `react-scripts`

## Scripts

```bash
nvm use
npm install
npm start
npm run build
npm run test:ci
```

## Runtime

- Node.js `24.22.1` via `.nvmrc`
- npm `11.x`
- CI uses the same Node version to avoid lockfile drift between local work and GitHub Actions

## Project Map

- `src/pages/ClientApp.js`: client flow
- `src/pages/TrainerDashboard.js`: trainer flow
- `src/services/`: shared business logic and API helpers
- `src/utils/date.js`: local date helpers
- `src/data/products.js`: product database and default portions
- `firestore.rules`: Firestore access rules
- `.github/workflows/ci.yml`: CI checks

## Firestore Shape

```text
users/{uid}
users/{uid}/mealHistory/{YYYY-MM-DD}
users/{uid}/measurements/{YYYY-MM-DD}
trainers/{trainerId}
trainerRequests/{requestId}
```

## Quality

- Unit tests cover date helpers, nutrition math, measurement comparison, and barcode parsing.
- CI runs tests and production build on every push and pull request.
- Production build disables sourcemaps to avoid noisy `html5-qrcode` warnings in CRA.

## Collaboration

- `CONTRIBUTING.md`: branch, commit, PR, and review rules
- `.github/PULL_REQUEST_TEMPLATE.md`: PR checklist
- `.github/ISSUE_TEMPLATE/`: bug report and feature request templates
- `RELEASE_CHECKLIST.md`: release and merge checklist

## Notes

- Людська версія й новини беруться з `src/data/releases.js`; тест звіряє її з `package.json`. SHA збірки не використовується як версія для користувача. Закриті новини показуються знову лише для нової версії.
- Shared local date helpers replace `toISOString().split('T')[0]` to avoid UTC drift near midnight.

## Продуктова мета

Критерії завершеного випуску SciSense, ролі приймання та зв’язок карток із кінцевим результатом: [PRODUCT-GOAL.md](docs/PRODUCT-GOAL.md). Поточний стан і порядок роботи агентів: [PROJECT-INFO.md](PROJECT-INFO.md), [AGENTS.md](AGENTS.md). План голосу й фото та пороги пілоту погоджено 2026-10-20. Реалізація проходить локальну перевірку; реальні API, телефон, доступ G04 і реліз мають окремі гейти. План доступу не погоджений для коду.


## Голос і фото

На головній є «Додати їжу голосом». Після зупинки запис автоматично переходить у прев’ю. До одного продукту можна додати два фото упаковки, перевірити кількість і натиснути «Додати». Прийом вважається збереженим лише після відповіді Firestore; повтор тієї самої спроби не дублює їжу. Старі недатовані записи потребують одноразового підтвердження дати.

API ще не ввімкнено. Підключення й межі лабораторії описані в [docs/VOICE-PHOTO-OPERATIONS.md](docs/VOICE-PHOTO-OPERATIONS.md), серверні параметри в [workers/meal-parser/README.md](workers/meal-parser/README.md). Ключі не належать клієнтській збірці.

```sh
npm ci
npm ci --prefix workers/meal-parser
npm run test:voice-photo
npm run build
```

Для тесту сховища потрібні Java 21 і Firebase CLI 15.2.1. На цій машині браузерні перевірки запускаються окремою командою поза пісочницею:

```sh
/Users/user/.local/bin/agent-test-browser run scisense-voice-photo
```

Вона збирає тільки demo-конфігурацію, запускає емулятори та власний браузер і прибирає процеси після тесту. Підставні відповіді API не доводять якість розпізнавання реального голосу або фото.

## Звіт про харчування

Внизу головної сторінки є «Переглянути звіт». Прев’ю зберігає дату, продукти, кількості, підсумки та активність; «Копіювати» підтверджує лише фактичне копіювання. Автоматичної передачі в Telegram немає. Hermes ще не підключений, звіт можна передати вручну. Збережені зв’язки тренера й права доступу не змінюються.
