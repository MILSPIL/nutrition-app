# SciSense / nutrition-app

## Project

- Назва: SciSense
- Репозиторій: `nutrition-app`
- Поточний стан робочого дерева: є незакомічені локальні зміни

## Перевірений стан на 2026-10-20

- 2026-10-20: підключено індекси `nutrition-app` і `nutrition-app-scale`; перевірено пошук символів та `firestore.rules`. Код застосунку під час перевірки не змінювався.
- Основне дерево до перевірки: `codex/stabilize-core-foundation`, коміт `7ddf42b`; налаштування індексатора й журнал зберігаються окремо в `codex/codeindexer-audit`.
- Продовження голосового введення: сусіднє дерево `../nutrition-app-scale`, гілка `feat/voice-input`, коміт `d51edec`. Його `.indexer.toml` є локальним налаштуванням цього робочого дерева.
- GitHub підтвердив злиття PR #2 зі шкалою калорій і PR #3 із виправленням Firebase Hosting. Стан розгорнутого застосунку цією перевіркою не встановлено.
- Node `24.11.1`: базове дерево має 21/21 успішний тест; голосове введення має 40/40; обидві збірки успішні.
- Локальні сценарії доступу Firestore виявили дефекти, які потрібно виправити до наступного релізу. У гілці голосового введення локально не задано `REACT_APP_MEAL_PARSER_URL`; наскрізний виклик AI не перевірено.
- Детальний локальний звіт: `tmp/codeindexer-audit/2026-10-20-review.md`. Ця тека виключена з Git та індексу; загальні задачі продовження збережено в Code Indexer.
- Наступний пріоритет: узгодити та перевірити правила доступу клієнта/тренера на емуляторі, потім завершувати інтеграцію голосового введення.

## Working Language

- За замовчуванням працюй і відповідай українською мовою, якщо користувач не попросив інше.
- Частина процесної документації в репозиторії англійською. Це нормально. Нові робочі нотатки за замовчуванням веди українською.

## Purpose

- Трекер харчування для клієнтів і тренерів.
- Дає змогу логувати прийоми їжі, рахувати БЖВ і калорії, зберігати заміри тіла та ділитися прогресом через Firebase.

## Stack

- React 18
- React Router 7
- Firebase Auth
- Firestore
- Firebase Hosting
- `react-scripts` / CRA
- Tailwind через CDN у `public/index.html`
- Jest через `react-scripts`

## Local Run

```bash
nvm use
npm install
npm start
```

## Build

```bash
npm run build
```

## Tests

```bash
npm run test:ci
```

## Deploy

```bash
npx firebase-tools deploy --only hosting --project nutrition-tracker-ua
npx firebase-tools deploy --only firestore:rules --project nutrition-tracker-ua
```

## Environments

- Локальна розробка через `npm start`
- Production Hosting: [nutrition-tracker-ua.web.app](https://nutrition-tracker-ua.web.app)
- Firebase project: `nutrition-tracker-ua`

## Architecture Notes

- Клієнтський потік: `src/pages/ClientApp.js`
- Тренерський потік: `src/pages/TrainerDashboard.js`
- Бізнес-логіка та API helper-и: `src/services/`
- Локальні date helper-и: `src/utils/date.js`
- Дані продуктів: `src/data/products.js`
- Правила доступу Firestore: `firestore.rules`
- CI: `.github/workflows/ci.yml`

## Important Paths

- `src/pages/`
- `src/components/`
- `src/services/`
- `src/utils/`
- `src/data/products.js`
- `firestore.rules`
- `firebase.json`
- `README.md`
- `CONTRIBUTING.md`
- `DEVELOPMENT.md`
- `RELEASE_CHECKLIST.md`

## Important Links

- GitHub: [MILSPIL/nutrition-app](https://github.com/MILSPIL/nutrition-app)
- Firebase Hosting: [nutrition-tracker-ua.web.app](https://nutrition-tracker-ua.web.app)

## Working Agreements

- Перед встановленням залежностей і запуском команд використовуй runtime з `.nvmrc`.
- Не пуш у `main` напряму. Працюй через короткі task-branches.
- Один PR має закривати одну чітку зміну.
- Якщо змінюється поведінка, додавай або оновлюй тести.
- Якщо змінюється setup, поведінка або архітектурні домовленості, оновлюй `README.md` або `DEVELOPMENT.md`.
- Перед PR або merge проганяй `npm run test:ci` і `npm run build`.
- Для UI-змін у PR потрібні скріншоти або коротке відео.

## Contacts / Access Notes

- Firebase deploy потребує локально налаштовану авторизацію для `firebase-tools`.
- Project-specific MCP окремо не знайдено. Якщо пізніше з'являться підключення, не записуй секрети, токени чи ключі в markdown.

## TODO / Unknowns

- `package.json` вже має версію `1.6.0`, але `DEVELOPMENT.md` починається з `1.5.0`. Перед наступним релізом варто вирівняти джерела правди.
- Немає окремо зафіксованої процедури release tagging.
- Спільний журнал агентів розміщено в `.agents/journal/`; старі записи ще не перенесені в `main`.
- MemPalace у репозиторії не використовується. Зараз його ігноруємо, поки не з'явиться явний запит або готовий workflow.
