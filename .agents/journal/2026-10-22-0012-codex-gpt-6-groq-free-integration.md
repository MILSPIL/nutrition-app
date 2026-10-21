# Локальна інтеграція Groq Free для голосу SciSense

- Дата і час: 2026-10-22 00:12, Europe/Kyiv
- IDE / агент: Codex Desktop
- Модель: GPT-6
- Chat ID: 01a1585d-ba1e-7da0-a174-903bee0573b3
- Робоча гілка: codex/scisense-server-prep

## Ціль

Виконати пряме доручення Юрія реалізувати знайдений Groq Free варіант перед сном. Goal objective_e45aa8ac1aa3, G05/G07/G08/G11. Погоджена локальна реалізація STT-API-01; попередня заборона на Anthropic, $5 і сервер зберігається.

## Що зроблено

- Groq whisper-large-v3: фіксований HTTPS endpoint, мова auto/uk/ru, нормалізований WAV, обмежена відповідь, скасування й 45 с; без prompt, ідентифікаторів користувача, redirect, повторів або платного fallback.
- Нульова сума Groq у чинному ledger; всі старі суми/рядки та Anthropic cap збережені. Глобальні квоти 6/хв, 30/UTC-добу, один активний запит; restart/transfer/rollback перевірені. Нова схема SQLite не потрібна.
- Runtime і лабораторія використовують Groq. Режим лише голосу відхиляє аналіз до ключа Anthropic, резерву й мережі; у UI немає фото та «Додати». Звичайний сценарій голосу/фото/прев’ю збережено, мовний вибір переживає reload.
- Manifest/receipt v2 прив’язані до поточних revision/hash. Старий full-дозвіл не активує новий провайдер. Дати нової активації порожні, LIVE вимкнено, allowedUids порожній. Підготовлено encrypted credentials groq/anthropic; не встановлено.
- Незалежне рев’ю Codex: backend, UI, runtime. Усі підтверджені зауваження виправлені та повторно перевірені.

## Причини та виправлення

- Причина race: відкладений ledger.start після скасування перезаписував поточний attempt. Регресія спочатку червона; тепер newAttempt перевіряє session revision після кожного await, позначає застарілий запис abandoned і не змінює актуальний. Незалежні probes ledger.start і ledger.update підтвердили один onAdd та правильні статуси.
- Причина shutdown race: gateway.close завершувався раніше за provider abort і budget.finish. Тепер шлюз зберігає контролери та pending promises, скасовує їх і чекає завершення перед закриттям ledger. Додано окремі таймери тіла 15 с і запиту 65 с; незачитане тіло закриває keep-alive. Регресії пройдені.
- Усунуто помилкову згадку Groq у повідомленні для Anthropic 429. Docker fixture тепер встановлює pinned jose через lockfile; синтаксис manifest і fullApproval перевіряється до ключів.

## Змінені файли

- workers/meal-parser/src/{groq.js,providers.js,index.js,budget.js}, test/groq.test.js, pilot-proposal.json.
- src/components/VoiceInputModal.{js,css,test.js}, src/services/voiceApi.{js,test.js}.
- scripts/phone-lab{.mjs,-ui.mjs,-browser.mjs}, scripts/phone-lab/{approval,live,keychain,gateway,sqlite}.mjs та регресії.
- server/{api,runtime,ledger,transfer}.mjs та тести, deployment.json, groq.Dockerfile, groq-linux-check.mjs; deploy/scisense-api.service.
- CI workflow, документація запуску/план, PROJECT-INFO.md та docs/evidence/groq-free-implementation-2026-10-22.json.

## Команди / перевірки / тести

- npm run test:ci -- --runInBand: 123/123, 11 наборів.
- npm --prefix workers/meal-parser test: 39/39.
- npm run test:server: 27/27; npm run test:phone-lab: 17/17.
- Ізольований browser launcher: full 28/28, STT-only 25/25; source hashes зафіксовані до й після запуску, збігаються з dab68d5. У full один STT, два аналізи, одне збереження; у STT-only один STT, нуль аналізів/прийомів/резерву Anthropic. Лише підставний транспорт.
- 375/390/1366 px: сім горизонтальних відхилень 0 px, проміжок 10 px. Контексти/браузери/емулятори прибрані, cleanup_ok/removed true; порти звільнені.
- CI=true REACT_APP_MEAL_API_URL=/meal-api npm run build: успішно. Є давнє попередження Browserslist; залежності в межах задачі не оновлювалися.
- CI 39676485745 на dab68d5: обидва jobs успішні. Окремий Linux контейнер: 35/35 за 1560 мс, cpu.max="100000 100000", memory.max=2147483648, мережа вимкнена. Повний CI повторно підтвердив app123/Worker39/server27/rules29/phone-lab17, 17 перевірок сховища, чотири браузерні сценарії та збірку.

## Результат

Коміти 6b0c9dd (адаптер/квоти), 888d0e4 (UI), dab68d5 (runtime/CI) запушені. PR16 залишається draft, PR8 не злитий. Нових реальних Groq/Anthropic викликів, читання модельних ключів та дій на сервері 0. Моки не закривають G02–G11 або приймання Юрієм.

## Наступні кроки

- Отримати підтвердження Groq Free/ZDR для особистого голосу, пройти телефонний STT тест; після цього погодити конкретну інвентаризацію та розгортання. Anthropic/$5/сервер без нового дозволу не активувати.
- Перенести журнал 2352 та цей журнал у main після згоди; продуктові PR8/16 не зливати автоматично.

## Ризики / нотатки

- Старий pull_request trigger Linux preparation повторив small-q5_1 на 6b0c9dd (39675285278), результат failure. Наступний старий прогін 39676413896 скасовано до inference. Trigger тепер тільки ручний workflow_dispatch, повторів автоматично не буде. API/ключі/сервер ці CI не використовують.
- Відомі 404 трьох успадкованих іконок category-{carbs,dairy,treats}-v4.png збережені в evidence; нових HTTP/JavaScript помилок немає. Фізичний телефон, мобільна мережа, реальний ZDR та спільний Groq/Sonnet сценарій ще не перевірені.
- Context7 недоступний через місячну квоту; використано офіційні Groq STT/rate-limits/billing/data docs. Секретів або сирого людського аудіо в репозиторії немає.

codeindexer 2026-10-22: solutions 2 (sol_f42633ebc887, sol_aa62d4219d4f), картки 2 оновлені; фаза/профілі актуалізовані, G05/G07/G08/G11 pending. Експорт обох індексів додається до цього документного коміту.
