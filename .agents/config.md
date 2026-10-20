---
name: Project Config
description: Єдине джерело істини для ФАКТІВ проєкту (git remote, стек, команди, шляхи, точка входу). Скіли/воркфлоу парсять звідси.
standard_version: "1.0"
---

# Конфіг роботи агентів

> **Тип: код-репо (React SPA на Firebase), НЕ сайт на CMS.** WP/SSH-поля не застосовні —
> деплой іде через Firebase Hosting, а не SSH/rsync. Тут SSOT фактів: git remote, стек, команди,
> точка входу. Наратив (архітектура, історія рішень, gotchas) — у `PROJECT-INFO.md`.

## 🎯 Призначення (факт)

Трекер харчування **SciSense**: клієнти логують їжу, рахують БЖВ/калорії, зберігають заміри тіла;
тренери ведуть клієнтів і бачать прогрес. Backend — Firebase (Auth + Firestore + Hosting).

## 🌐 URLs / ідентифікатори

| Що | Значення |
|----|----------|
| Production (Firebase Hosting) | <https://nutrition-tracker-ua.web.app> |
| GitHub repo (origin) | <https://github.com/MILSPIL/nutrition-app.git> |
| Firebase project id | `nutrition-tracker-ua` |

## 🧱 Стек (факт)

| Що | Значення |
|----|----------|
| Рантайм | Node `24.11.1` (`.nvmrc`), npm `11.x` (`engines`) |
| UI | React `18.2` |
| Роутінг | `react-router-dom` `7.14` |
| Backend/SDK | `firebase` `12.12` (Auth, Firestore, Hosting) |
| Тулчейн | `react-scripts` `5.0.1` (Create React App) |
| Стилі | Tailwind через CDN у `public/index.html` |
| Тести | Jest через `react-scripts` |
| Barcode-скан | `html5-qrcode` `2.3.8` |
| Іконки | `lucide-react` `0.263.1` |

## 📁 Шляхи (факт)

| Що | Шлях |
|----|------|
| Корінь (локально) | `/Users/user/Documents/Мої-розробки/nutrition-app/` |
| Точка входу | `src/index.js` → `src/App.js` |
| Клієнтський потік | `src/pages/ClientApp.js` |
| Тренерський потік | `src/pages/TrainerDashboard.js` |
| Бізнес-логіка / API | `src/services/` |
| Firebase init | `src/firebase.js` (публічний web-config, не секрет) |
| Правила доступу Firestore | `firestore.rules` |
| Прод-збірка | `build/` |
| CI | `.github/workflows/ci.yml` |

## 🛠️ Команди (факт)

```bash
nvm use                 # рантайм із .nvmrc (24.11.1)
npm install
npm start               # dev-сервер react-scripts
npm run build           # прод-збірка → build/
npm run test:ci         # Jest, CI=true, без watch (гейт перед PR/merge)
# Deploy — Firebase (потрібна локальна авторизація firebase-tools):
npx firebase-tools deploy --only hosting --project nutrition-tracker-ua
npx firebase-tools deploy --only firestore:rules --project nutrition-tracker-ua
# Refresh довговічної памʼяті (fail-fast, якщо бінар MemPalace недоступний):
bash .agents/bin/mempalace-refresh.sh
```

> Окремого `npm run lint` немає: ESLint-конфіг `react-app` вбудований у `react-scripts`
> (лінт відпрацьовує під час `build`/`test`). Секрети — тільки macOS Keychain, ніколи у файлах репо.

## Мова

За замовчуванням працюй і відповідай українською мовою, якщо користувач не попросив інше.

## Старт сесії

1. Прочитай `.agents/config.md`.
2. Прочитай `PROJECT-INFO.md`, якщо файл існує.
3. Прочитай 1-3 найновіші файли з `.agents/journal/`, якщо вони є.
4. Використай цей контекст перед початком роботи.
5. Не повторюй уже завершену роботу без причини.
6. Незавершені `next steps` з останніх записів вважай пріоритетним контекстом.

## Завершення сесії

1. Створи новий markdown-файл у `.agents/journal/`.
2. Ім'я файлу: `YYYY-MM-DD-HHMM-ide-model-short-title.md`.
3. Запиши: дату і час, IDE / агента, модель, chat id якщо є, ціль задачі, що зроблено, змінені файли, команди/перевірки/тести, результат, наступні кроки, ризики/нотатки.

## Джерела правди

- `PROJECT-INFO.md`
- `AGENTS.md`
- `CLAUDE.md`
- `ANTIGRAVITY.md`
- `.agents/config.md`
- `.agents/journal/**/*.md`

## MCP політика

Always-on MCP:

- `chrome-devtools`
- `context7`
- `desktop-commander`

Правила вибору:

- Для сайтів, сторінок, браузерної поведінки, скріншотів, console errors і layout-перевірок спочатку використовуй `chrome-devtools`.
- Для бібліотек, API docs, framework docs, SDK usage і актуальної технічної документації спочатку використовуй `context7`.
- Для локальних файлів, структури проєкту й системних локальних дій спочатку використовуй `desktop-commander`.
- Не питай, який MCP вибрати, якщо намір користувача очевидний.
- Якщо потрібний MCP недоступний у поточній сесії, використай найкращу локальну альтернативу і коротко зафіксуй обмеження.
- Не додавай нові MCP-інструменти без явної потреби проєкту.

## Успадковані правила проєкту

- Використовуй runtime з `.nvmrc`.
- Не пуш напряму в `main`.
- Тримай зміни вузькими за обсягом.
- Оновлюй тести і документацію, коли змінюється поведінка.
- Перед PR або merge проганяй `npm run test:ci` і `npm run build`.

## MemPalace

- У цьому проєкті MemPalace не використовується.
- Якщо його додадуть пізніше, джерелом правди все одно лишаються memory-файли цього репозиторію, а не індекс.

---

## 🔌 Integrations

Які опційні модулі стандарту увімкнені. `yes` = активний (читай відповідний файл, ключ → шлях).
Скіли/воркфлоу орієнтуються саме на цей блок.

```yaml
integrations:
  skills:    no    # skills/ + .agents/orchestrator.md (персонажний шар)
  trello:    no    # .agents/TRELLO.md
  notion:    no    # .agents/NOTION.md
  ua_ru:     no    # .agents/modules/ua-ru-bilingual.md (тільки WPML)
  site:      no    # site/ (вкладений підпроєкт)
  staging:   no    # .agents/STAGING-RULES.md (staging-first)
```

> Код-репо: жоден опційний модуль не ввімкнено. `.agents/bin/mempalace-refresh.sh` — частина
> обовʼязкового ядра, не модуль (тому в `integrations:` його нема). MemPalace у проєкті не
> використовується; скрипт присутній за вимогою стандарту і робить fail-fast без бінаря.


## Code Indexer

- Індекс основного робочого дерева: `nutrition-app`.
- Індекс `../nutrition-app-scale`: `nutrition-app-scale`; локальний конфіг у тому дереві.
- Спільний конфіг цього дерева: `.indexer.toml`.
- На старті: `briefing(project="nutrition-app")`; для голосового введення також `briefing(project="nutrition-app-scale")`.
- Локальні результати перевірки доступу: `tmp/codeindexer-audit/`; у публічний Git не експортувати.
- Профіль і картки є пошуковою копією журналу та `PROJECT-INFO.md`.
