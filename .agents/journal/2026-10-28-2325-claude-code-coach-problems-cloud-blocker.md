# COACH-PROBLEMS-01: хмарна сесія зупинена на базовій лінії K7

Дата: 2026-10-28, 23:05-23:25 (Київ). IDE: Claude Code, хмарна сесія (claude.ai/code). Модель у репозиторії не вказується (правило хмарної сесії; тому й назва файлу без моделі). Гілка `claude/coach-problem-reports` @ `948e457`, база `origin/codex/hermes-personal-server` @ `47ac923`. Goal `objective_e45aa8ac1aa3`; G08.

## Мета

Виконати серверну частину плану COACH-PROBLEMS-01 у хмарі: крок 0 (Node з `.nvmrc`, `npm ci`, базова лінія K7 до коду), кроки 1, 2, 3, 5 (серверна частина) і 6, draft PR у `codex/hermes-personal-server`. Бриф: якщо Node з `.nvmrc` недоступний або базова лінія K7 червона до змін, нічого не змінювати, описати причину в журналі, закомітити, запушити і зупинитись.

## Що зроблено

Крок 0, лише читання і середовище:

- Node: у контейнері був v22.22.0; `nvm install 24.22.1` пройшов (контрольна сума збіглась), далі все на v24.22.1 / npm 11.19.1.
- `npm ci`: ok.
- `npm run test:server`, перший прогін: 9 файлів падали з `ERR_MODULE_NOT_FOUND: Cannot find package 'jose'` (`workers/meal-parser/src/auth.js`). CI ставить ці залежності окремо (`.github/workflows/ci.yml:28`, `npm ci --prefix workers/meal-parser`); після того самого кроку локально: tests 427, pass 426, fail 0, skipped 1, exit 0.
- `npm run test:ci`: Test Suites 36/36, Tests 376/376, exit 0.
- `npm run build`: exit 0.
- `npm run test:hermes-native`: exit 1, `ENOENT ... .agents/runtime/food-data/foods-v1-reviewed.sqlite` (`scripts/hermes-gateway-test.mjs:175`). На Linux скрипт також вимагає закріплений Hermes у `/opt/scisense/hermes/source` і bubblewrap, тобто реально він працює лише в образі `server/trainer/hermes.Dockerfile` (так його запускає CI, джоба `hermes-resource-check`).
- Спроба зібрати той самий образ (`docker build --file server/trainer/hermes.Dockerfile`): спершу `curl` код 60 (TLS проксі сесії не довірений у контейнері). Тимчасова копія Dockerfile поза репозиторієм лише з довірою до CA проксі і з окремої копії дерева на `948e457`: Node, uv, bubblewrap, Hermes з GitHub, Python 3.14 пройшли; крок `node scripts/hermes-food-prepare.mjs` впав: `getaddrinfo ENOTFOUND fdc.nal.usda.gov`.
- Перевірка з хоста: `curl -I https://fdc.nal.usda.gov/fdc-datasets/...` → `CONNECT tunnel failed, response 403`; проксі сесії: `fdc.nal.usda.gov:443 — connect_rejected`. Тобто мережева політика хмарного середовища забороняє цей хост. Без публічного індексу USDA (контрольна сума `a8e60fe0...`) `test:hermes-native` не запускається.
- Інваріант diff K7 (`git diff --stat origin/codex/hermes-personal-server -- server/trainer/tools.mjs server/trainer/tool-errors.mjs server/trainer/limits.mjs 'server/trainer/*.py'`): порожній (PASS).

## Результат

Базова лінія K7 у хмарі НЕ зелена: `test:hermes-native` не можна прогнати через заборонений хост `fdc.nal.usda.gov`. За брифом і розділом «Хмара» плану зупинився до будь-якого коду: кроки 1, 2, 3, 5, 6 не виконані. Чернетку тесту K1/K2, почату поки збирався образ, видалено з робочої копії; у гілці лише цей журнал.

## Змінені файли

- `.agents/journal/2026-10-28-2325-claude-code-coach-problems-cloud-blocker.md` (новий).

## Відхилення від плану

- Назва журналу без моделі (правило хмарної сесії не писати назви моделей у репозиторій).
- `npm ci --prefix workers/meal-parser` додатково до `npm ci`, як у CI; без нього `test:server` червоний з причини середовища, а не коду.

## Наступні кроки

Два варіанти, рішення за Юрієм:

1. Дозволити хост `fdc.nal.usda.gov` у налаштуваннях мережі хмарного середовища (меню середовища в заголовку сесії → «Edit» → «Network access» → «Allowed domains»), потім перезапустити хмарну сесію з тим самим брифом. Інструкція: https://code.claude.com/docs/en/cloud-environments#network-access.
2. Або робити кроки 0-3, 5, 6 локально на Mac (умова плану «повертаємось локально»), де `.agents/runtime/food-data` уже є.

Що знадобиться наступному виконавцю в хмарі (на 2026-10-28 у цій сесії):

- `nvm install 24.22.1` (у контейнері за замовчуванням Node 22).
- `npm ci && npm ci --prefix workers/meal-parser`.
- Для `test:hermes-native` на Linux: образ `hermes.Dockerfile` і `docker run ... scisense-hermes-ci` як у CI; у хмарі Docker-демон треба запустити (`dockerd`), а в образ додати довіру до CA проксі сесії (`/root/.ccr/ca-bundle.crt`) тимчасовою копією Dockerfile, не змінюючи файл у репозиторії.

## Ризики і нотатки

- Та сама причина (`ENOTFOUND fdc.nal.usda.gov`) з 27.10 21:34 UTC валить і джобу CI `hermes-resource-check` (журнал 1.9.7, розділ «Третє ревʼю»). Якщо USDA недоступний і з GitHub Actions, K7 «CI на PR» для 1.9.8 теж може впасти з тієї ж зовнішньої причини.
- Production, ntzg.pp.ua, xCloud, SSH, ключі: не чіпались.
