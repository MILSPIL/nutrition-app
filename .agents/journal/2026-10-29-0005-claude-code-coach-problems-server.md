# COACH-PROBLEMS-01: серверна частина в хмарі (кроки 1, 2, 3, 5, 6)

Дата: 2026-10-28 23:40 - 2026-10-29 00:05 (Київ). IDE: Claude Code, хмарна сесія (claude.ai/code). Модель у репозиторії не вказується (правило хмарної сесії). Гілка `claude/coach-problem-reports`, база `origin/codex/hermes-personal-server` @ `47ac923`, draft PR #51. Goal `objective_e45aa8ac1aa3`; G08. Продовження запису `2026-10-28-2325-claude-code-coach-problems-cloud-blocker.md`.

## Мета і рішення

Після зупинки на базовій лінії K7 (хост USDA заборонений у хмарній сесії) CI на голові `d80754c` показав `hermes-resource-check` success, тобто USDA з GitHub Actions знову доступний. Я запропонував варіант 3: `test:server`, `test:ci`, `build` тут; `test:hermes-native` через CI `hermes-resource-check` після кожного пушу. Батьківська (локальна) сесія, яка веде задачу для Юрія, обрала варіант 3 як зміну місця одного тесту в межах погодженого плану; вона ж окремо прожене `test:hermes-native` на Mac перед ревʼю. Окремого «так» Юрія саме на варіант 3 у цій сесії немає.

## Що зроблено

| Крок | Коміт | Що |
|---|---|---|
| 1 | `743af3c` | `server/trainer/problem-journal.mjs`: SQLite 0600, WAL, `synchronous=NORMAL`, `secure_delete`; ключ (доба за Києвом, реліз, категорія, код, інструмент), `count`, `first_at`/`last_at` до хвилини UTC; `KNOWN_CODES` (200 кодів, статичний масив) і `TOOLS` як фільтр; ретеншн 30 діб при відкритті і на зміну доби; межа 5000 з рядком `overflow`; `writeErrors`. `PAYER_DIAGNOSTIC_CODES` винесено з `safePayerDiagnostic` без зміни поведінки (для імпорту в K1). Тести K1, K2. |
| 1 | `7f4b478` | Спека: «Червоне до коду» для K1 і K2, зокрема інсценування K2. |
| 2 | `71b2c22` | `turn-store.mjs`: `onTransition` після коміту для `fail()`, `cancel(uid, id, reason)` і старт-відновлення (SELECT running у транзакції); запис лише коли стан змінився. `gateway.mjs`: причини `expired`, `user_cancel`, `native_cancelled`, `shutdown`. `personal-backend.mjs`: `tool_error` з назвою інструмента до розгалуження. `trainer/personal-runtime.mjs`: журнал на старті (збій відкриття = вимкнений журнал), `payer_failure` першим в `onDiagnostic`, закриття після `gateway.close()`, `runtime.problems` лише `rows`/`status`; `releaseId` з маніфесту (`server/personal-runtime.mjs`). Тести K3 (ядро), K5. |
| 3 | `bb73328` | `server/ops-problems.mjs` і маршрут у `api.mjs` одразу після health (до Origin, `closing`, слотів). `ops-reader` у `server/personal-runtime.mjs`: читається лише при `liveEnabled` і 5 іменах у маніфесті, зберігається sha256, буфер обнуляється; відсутній чи невалідний файл дає 401. `credentialNames` приймає рівно два списки; `server/deployment-personal.json` з 5 іменами. Тести K4, S4. |
| 5 | `ddb0c9d` | `turn_cause` у `gateway.mjs` перед `store.fail`; `food_total`, `food_estimate`, `food_unknown`, `food_portion_estimate` після успішного `propose_food_draft` лише для нових позицій (з `name`). `overflow` уже в кроці 1. Спільна фікстура в `server/trainer/problem-journal-fixture-test.mjs` (`*-test.mjs` не йде в пакет і в джерела `KNOWN_CODES`). K2 справжнім шляхом у файлі K1. |
| 6 | `68e1cf3` | 1.9.8: `package.json`, `package-lock.json`, `releases.js` (дата 28.10.2026, текст S8 дослівно), `WelcomeModal.test.js` як у попередніх релізах. |

## Перевірки

- Базова лінія до коду (Node 24.22.1): `test:server` 427/426 pass/0 fail/1 skipped; `test:ci` 376/376; `build` ok; `hermes-resource-check` на `d80754c` (прогін 40771625717) success.
- Червоне до коду: K1/K2 `ERR_MODULE_NOT_FOUND`; K3/K5 9 тестів fail через відсутню проводку (`actual: []`, `runtime.problems` undefined, `no such table`); K4 `ERR_MODULE_NOT_FOUND`; S4 4 fail; крок 5: 3 fail (`actual: []`, `food_estimate` не записано). Тест повноти `KNOWN_CODES` сам зловив новий код `problem_journal_invalid` з мого модуля.
- K2 інсценування: фільтр `known.has(code)` → `true`, `AssertionError: problems.sqlite-wal містить private_marker_vivsianka`, exit 1; повернуто, `cmp` без різниці.
- Після кроку 5: `node --test server/trainer/problem-journal.test.mjs server/trainer/problem-journal-sources.test.mjs` 20/20; `node --test server/ops-problems.test.mjs` 6/6; `server/personal-runtime.test.mjs` 14/14.
- K7 (крок 6): `npm ci` ok; `test:server` 457 тестів, 456 pass, 0 fail, 1 skipped; `test:ci` 376/376 (перший прогін 2 fail через версію в `WelcomeModal.test.js`, виправлено); `build` ok; diff за `tools.mjs`, `tool-errors.mjs`, `limits.mjs`, `server/trainer/*.py` порожній; `personalPolicyHash` = `c1d3a2a2…b2a6` (без змін).
- CI `hermes-resource-check`: крок 1 (прогін 40774038984) success, крок 2 (40775072146) success; крок 3 і далі див. PR #51.

## Відхилення від плану і спеки

- `test:hermes-native` лише в CI (варіант 3, див. вище).
- K3 «журнал закривається після `gateway.close()` і запис `shutdown` є у файлі»: запис `shutdown` перевірено на рівні гейтвея (справжній `close()` з ходом у роботі), закриття журналу після закриття гейтвеїв і збереження записів у файлі перевірено на рівні `createPersonalRuntime`. Хід у роботі всередині `createPersonalRuntime` без справжнього Native не створити.
- K3 «платник через проводку `createPersonalRuntime` → `onDiagnostic`»: додано параметр `payerFactory` (за замовчуванням `createPersonalPayer`), тест бере `onDiagnostic`, який збирає сам рантайм, і викликає його з виходом `safePayerDiagnostic`. Справжній процес платника не запускається.
- K4 «під час зупинки 503 з тілом health»: реалізовано в `api.mjs`, але автотесту немає: після `close()` сервер одразу закриває з'єднання, стабільно спостерегти 503 через HTTP не вдалося.
- `food_*` рахуються, якщо обробник `propose_food_draft` не кинув, незалежно від `state` результату (спека: «обробник не кинув»).
- Маніфест з 4 іменами і `liveEnabled`: маршрут є і завжди дає 401 (ключ не налаштований), `ops-reader` не читається.

## Відкриті питання

Немає блокуючих. Для Юрія: варіант 3 погоджено батьківською сесією, не ним напряму.

## Що лишилось локальній сесії

Кроки 4 (`pull.py` у хабі, K6), 7 (spec-reviewer, codex-review), 8-9 (публікація А/Б після «так» Юрія, K8), 10 (перший `--apply`, launchd, K9, K10); `test:hermes-native` на Mac перед ревʼю; дата 1.9.8, якщо публікація буде не 28.10.

## Ризики

- Новий вхід з інтернету (`/meal-api/ops/problems`); захист: ключ 43+ символів, sha256 сталим часом, ліміт, лише лічильники.
- Публікація потребує 5 імен у маніфесті і, для ключа, drop-in `LoadCredentialEncrypted`; без файлу ключа служба стартує, маршрут 401.
- Production, ntzg.pp.ua, xCloud, SSH, ключі не чіпались.
