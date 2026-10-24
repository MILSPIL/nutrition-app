# VOICE-LETTERS-01: локальні кроки 0–6 завершено

- Дата і час: 2026-10-23 16:40 EEST
- IDE / агент: Codex desktop, основний агент
- Модель: GPT-6
- Chat ID: 01a1585d-ba1e-7da0-a174-903bee0573b3

## Ціль

Виконати прямий дозвіл Юрія: перенести п’ять журналів у main та реалізувати локальні кроки 0–6 VOICE-LETTERS-01. Реальні API, ключі, $5 і сервер не чіпати. Goal objective_e45aa8ac1aa3; G02/G03/G05/G06/G07/G08/G09/G11.

## Що зроблено

- П’ять погоджених журналів 2250/0105/1224/1403/1438 перенесено через PR25, main9bd8629990b4ef0b1dd0c09be902c848631eb5d0. Джерело й main побайтово збігаються. Продукт, PR8/16 і сусідні дерева не злиті.
- Гілка codex/voice-plan-letters відfd65fb9; фінальний код 53248f70660c1c1b6fdf4cd6278a72f17928c6fd. Кожний логічний блок закомічений і запушений без force.
- Форма відкривається без recorder/API/спроби пілоту, запис запускає «Почати запис». API v2 додає відповідник каталогу до чинного аналізу, зберігаєv1 і правдиві metadata. Літера необов’язкова; ручний вибір/«Без літери» має пріоритет, unknown не блокує валідні калорії.
- Частка норми рахується за день незалежно від прийому. Норма зберігається snapshot, маса/стан не губляться при Auto/фото. Додавання понад норму дозволене, кількість/ккал не подвоюються.
- Атомарний пакет, повтор тієї самої команди після unknown, захист logout/lateACK. Остання гонка profileACK перед mealACK виправлена queued reload з одним читанням; збій лишає явний шлях відновлення.
- Незалежні API, save/UI і фінальний reviewer прийняли локальну частину. Claude Fable-рев’ю завершене; кожну знахідку звірено з кодом, деталі нижче.
- Підготовлено архів 1.8.0 з 146 файлами та manifest; SHA256939dd9d7aa9501e880572cf81eaa12977c99f4ff2fa8d9caf72923bd78a6cb3d. Файли повторно перевірені в архіві; deployment template неактивний.
- Заморожено 6 синтетичних входів L10 і каталог 45 відповідників. Локальний розрахунок резерву$0.595136, без API та читання ledger. Майбутня пропозиція$0.60 у межах чинного cap потребує окремого дозволу та актуальної перевірки залишку/тарифів.

## Змінені файли

- src/components/VoiceInputModal.*, PlanAllocationFields.js, DecimalInput.js, MealSection.js, ProductModal.js та регресійні тести.
- src/pages/ClientApp.js; src/services/planCatalog.js, planAllocation.js, mealItems.js, mealCommands.js, mealStore.js, useMealDay.js, voiceApi.js, pilotLedger.js, nutrition.js; src/data/planReferences.js, releases.js.
- workers/meal-parser/src/index.js, providers.js, schema.js і тести; браузерні/емуляторні fixtures у scripts/.
- README.md, DEVELOPMENT.md, PROJECT-INFO.md, docs/PRODUCT-GOAL.md, spec/plan, docs/VOICE-LETTERS-RELEASE.md, docs/evidence/voice-letters-*, .codeindexer, package version1.8.0.
- Firestore rules, бюджетне сховище, чинна модельна конфігурація, залежності й норми не змінювалися. У lockfile лише версія застосунку.

## Команди / перевірки / тести

Runtime Node24.22.1 із .nvmrc. На фінальному SHA:

- npm run test:ci:223/223 у 24 наборах.
- npm run test:voice-photo: application +43 Worker +47 demo-store, включно зі справжнім старим writer зfd65fb9.
- npm run test:server:47; npm run test:rules:38. CI також виконав test:phone-lab.
- Власний headless browser:71 voice; точний CI повторив їх і 50 full phone,34 STT-only,7 trainer, разом 162. JS/неочікувана мережа 0. 375/390/1366:20/20px,15/15px, решта дельт країв 0, overflow0, основні контроли 44px, focus/клавіатура PASS.
- npm run build: production1.8.0, /meal-api, lab/phone_lab/stt_only=0, pilot=1, PASS. 10 тестів упакованого API PASS, усі 146 hashes архіву звірені.
- CI39962158744 на 53248f7: усі 3 jobs SUCCESS, у тому числі 1CPU/2GiB без мережі/credentials та systemd із синтетичними encrypted credentials.
- Фінальний незалежний reviewer сам повторив 223 Jest і фактичні hook/component probes, звірив CI source/run та browser artifact12505366454. Локальні L01–L09 PASS, код-блокерів немає.
- git diff --check; JSON/SVG/UTF-8/nonempty; локальні посилання перевірені. Контрольований red→green для регресій збережений у runtime.

## Claude-рев’ю та звірення

Модель фактично claude-fable-5-1; вхід 194, вихід 69627, cache-write257006, cache-read766631; разом 1093458 токенів,981.3 с, exit0. Через Claude CLI/Max, без API-ключів застосунку й$5. Сирий звіт поза Git. Context7 недоступний через квоту; structured outputs/token counting звірялися з офіційними документами Anthropic.

| Знахідка Claude | Що звірив | Вердикт/дія |
|---|---|---|
|1 Застарілий план users |ClientApp передавав users; свіжий day.planContext був невикористаний |Підтверджено; snapshot дня, одноразовий await refresh, own settings reload |
|2 Custom дубль вимикає каталог |planCatalog однаковий refId давав collision |Підтверджено; тотожні записи дедупліковані, чесне повідомлення fallback |
|3 Незавершений ввід →NaN |DecimalInput порівнював NaN через !== |Підтверджено; Object.is, тест коми |
|4 Довгий десятковий надлишок |ProductModal виводив raw різницю |Підтверджено; percentText, тест 2.499999→2.5 |
|5 not_ready без recovery |useMealDay/Voice: not_ready не мав планового повтору |Підтверджено; явний текст, refresh, gate requiresReload; late logout regression |
|6 Маса перед кількістю →Infinity |PlanAllocationFields ділив на порожню базу |Підтверджено; поле доступне лише за додатної кількості, guard бази |
|7 Непомітні unresolved/voice |MealSection не показував row label/count |Підтверджено; один спільний helper, label/count |
|8 unknown після retry |Головний retry вже оновлював PilotPanel, який звіряє marker; modal retry цього не робив |Частково; ACK/modal retry оновлюють версію, явний відгук; існуюче відновлення доведене тестом |
|9 «Сервер» не перевіряє factor |mealStore є клієнтським адаптером; factor1 валідний для raw, маса підтверджується користувачем |Хибне як доведений дефект; без нового захисного контракту й припущень про cooked |
|10a Автоматично стирає масу/стан |select повертав{} |Підтверджено; прибирає лише ручний letter/reference, масу й стан зберігає |
|10b Default у profile маєcatalog |S3 дає пріоритет збереженому ключу профілю; рівність чисел не є походженням |Хибне як дефект; уточнений fallback, тест обох форм, без міграції |
|10c Мертвий canAdd код |Константиtrue/disabledfalse й unused argument |Підтверджено; вузька чистка, правило дозволяти факт понад норму незмінне |

Разом 12 підпунктів:9 підтверджено і виправлено,1 частково підтверджено і виправлено,2 не підтверджено як дефекти.

## Результат

Погоджена локальна реалізація 0–6 завершена. Канон доказів docs/evidence/voice-letters-local-2026-10-23.md, машинні CI/package/reserve JSON. PROJECT-INFO оновлено. Картка card_183b5e5eefe1 отримала результат і докази, але лишається open: вбудований manual_approval при закритті вимагає людину в dashboard. Гейт не вилучався й не обходився. G02–G11 pending, продукт не прийнятий.

## Наступні кроки

- Після окремого дозволу перенести цей новий журнал у main; він не належить до вже погоджених 5.
- Конкретний крок 7 описаний у docs/VOICE-LETTERS-RELEASE.md: свіжий стан/резервна копія, API v2 зі старим v1, той самий ledger/cap/receipt,6 L10 без повторів; UI лише після PASS; перевірка телефона власником. Без нових прав, reset/transfer/init або самовільного бюджету.

## Ризики / нотатки

L10/справжня точність моделі й фізичний телефон не перевірені. Локальні mocks і CI не замінюють ці приймання. Ключі, реальні API застосунку, живий Firebase, сервер і$5 не використовувалися. Цей кандидат на проді не публікувався. Новий журнал лише у feature-гілці до згоди Юрія.
