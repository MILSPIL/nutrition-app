# HERMES-FOOD-01: план на погодження

Дата: 2026-10-24. Стан: **Юрій погодив локальні кроки 0–7 і припущення А1–А4 2026-10-24. Виконується локально; B/C не дозволені.**
Специфікація: [чат із наявним Hermes](../specs/2026-10-24-hermes-food-chat.md). Goal objective_e45aa8ac1aa3, G02–G09/G11. Продуктова база d9a57b0, локальна версія 1.8.0 уже містить VOICE-LETTERS-01; це залежність, не повторна реалізація.

## Що отримає користувач

Єдиний чат «Тренер» у SciSense: текст, явний початок голосу, фото, короткі уточнення, готова картка їжі й «Додати». Домашні страви мають знайдене джерело або позначену оцінку. За відсутності оцінки зберігається видима нотатка, а підсумок позначається неповним. За чат відповідає існуючий Hermes-тренер із кураторською пам’яттю; його підтверджені записи беруться зі SciSense.

## Межі наступного погодження (повний перелік)

На погодження винесено **локальні кроки 0–7**: код, синтетичний Hermes-профіль і підставні провайдери, публічні набори харчування, Firebase emulator, тестові ключі у тимчасовому сховищі, локальні/CI перевірки, commits/push feature-гілки. Це не дозвіл читати живий профіль або секрети, викликати моделі, витрачати $5, змінювати сервер/Firebase production, переносити продуктовий код у main чи публікувати реліз.

Зовнішні кроки B/C нижче потребують нового конкретного погодження після готового перевіреного пакета. Ключі й поточний бюджет не перевіряються в локальній частині. Виявлення нового блокера означає зупинку відповідного кроку та звіт, а не мовчазну заміну Hermes іншим тренером.

## Чому така архітектура

| Варіант | За | Проти |
| --- | --- | --- |
| Штатний Hermes API за вузьким шлюзом SciSense | Виконує вибір Юрія; ізоляція браузера, точний контроль пам’яті/витрат | Потрібні перевірка API, turn journal і provider proxy |
| Вбудувати цикл Hermes у Node/переписати його | Прямий доступ до подій | Дублювання чужого agent runtime, складніше оновлювати й перевіряти |
| Лише чатова оболонка поверх поточного Sonnet parser | Менше коду | Нема справжнього Hermes та його персонального контексту |

Рекомендований перший варіант. Пошук у зафіксованій копії USDA, прозорі припущення й особисті підтверджені джерела входять одразу. Другий варіант є зайвим розширенням; третій не відповідає вибору Юрія.

## Кроки 0–7 (повний перелік)

### 0. Зафіксувати контракти та відтворити поточні недоліки

Модель: Codex; середній ризик, не змішувати поточний UI з уже опублікованим релізом.

Створити feature-гілку від погодженої бази. Додати fixtures H01–H10, контракти turn/draft/note/contextProposal і команди `test:hermes`, `test:hermes-ui`. Заморозити 12 H02 прикладів із незалежними очікуваннями. Виконати регресійні перевірки на старій поведінці: потрібні конкретні FAIL, не просто відсутній файл. Для інваріантів зламати тестову копію/fixture і довести FAIL. Зберегти знеособлений baseline.

Файли (орієнтовні, остаточно за роллю модуля): `server/trainer/*.test.mjs`, `src/services/trainer*.test.js`, `scripts/trainer-chat-*.mjs`, package scripts. Коміт: «test: зафіксувати сценарії чату Hermes». Перехід: критерії мають осмислений red/інваріант, невиміряні критерії явно pending.

### 1. Перевірити сумісність Hermes без моделей та приватного профілю

Модель: Codex; високий ризик нового контуру доступу й приватності. Після блока незалежний reviewer.

Окрема закріплена копія Hermes SHA зі специфікації, новий temp HERMES_HOME, синтетичні SOUL/USER/MEMORY/context/skill, фальшивий Anthropic provider. Перевірити штатні runs/session/delete, capabilities, structured tool draft, фото, authoritative history, тимчасові transcripts, фактичні tools і вимкнені небезпечні можливості. Перевірити відсутність base64/audio в DB/dumps/logs після cleanup. Невідомі можливості не оголошувати наявними. Якщо потрібен адаптер, дозволений тільки вузький wrapper/plugin у нашому репо, без зміни встановленого Hermes. Якщо немає надійного закриття обходів або очищення медіа, зупинка й окремий перегляд плану.

Коміт: «test: перевірити контракт закріпленого Hermes». Доказ: actual pinned process з mock provider, deny-network, точні emitted tool names/requests та контроль диска, не mock самого Hermes. Жодного live-модельного endpoint.

Уточнення реалізації 2026-10-24: на pinned SHA штатний DELETE лишає staging image та WAL. Дозволений вузький wrapper запускає canonical authority/adapter як один worker на turn у тому самому профілі, з secure_delete на shared writer. Після збереження результату/cleanup job, native DELETE й повної зупинки worker виконується адресне очищення staging за SHA та quiescent checkpoint з перевіркою busy=0. Нова admission не починається до завершення cleanup. Hosted-room, фонові watchers та інші платформи не запускаються. Жодного TRUNCATE на активному runtime, upstream не змінюється. Startup/recovery/TTL мають повторювати цей самий протокол; якщо stop/cleanup не доведено, стан лишається blocked cleanup, не готовий результат. Це локальний контракт wrapper, не дозвіл на приватне перенесення або запуск.

### 2. Додати обмежений шлюз тренера й контроль кожного виклику

Модель: Codex; високий ризик, свіже зовнішнє рев’ю до наступного блока.

Додати `/meal-api/trainer/*`, owner mapping, server-only conversation/profile/session, admission/turn store, leases із generation/deadline/call counter, status/recovery. Anthropic-compatible proxy використовує існуючий ledger як єдиного власника резервів; кожний upstream має durable reserve, timeout не повертає суму. Фактичний payload і model caps обмежуються сервером. Модель/URL/tools/fallback із браузера відкидаються; Hermes не має прямого provider key або мережевого обходу. Логи редагуються до збереження, контент не потрапляє в telemetry. Чинні transcribe/analyze API залишаються сумісними для окремого legacy-сценарію з тим самим ledger. Новий чат не звертається до analyze і не використовує його як fallback; H08 перевіряє відсутність подвійного paid parser. Snapshot builder застосовує визначене байтове вікно історії, зберігаючи обов’язковий контекст; завершення commit передує DELETE session. Media admission/TTL/restart виконуються за специфікацією.

Файли (орієнтовні): `server/api.mjs`, нові `server/trainer/`, `server/runtime.mjs`, нові runner/tests. Ledger format/receipt/cap/anchor не переписувати. Додати вимкнену policy Hermes 12/60 с, 80/ковзну годину, 120/UTC-добу, default 6/30 зберегти. Рахувати всі старі/нові reserves разом; boundary-тести 12/13, 80/81, 120/121, перехід півночі й спільний legacy/STT/Hermes. Ці числа не є дозволом змінити live квоти чи витрачати. Коміт: «feat: додати обмежений шлюз Hermes». H04/H06/H07/H08 з synthetic ledger, скасуванням, обривом і рестартом.

### 3. Підключити пошук їжі та перевірювані оцінки

Модель: Codex; середній ризик, окреме рев’ю mapping одиниць і джерел.

Імпортер зафіксованих Foundation/SR Legacy/FNDDS JSON із checksum/ліцензією/manifest; компактний read-only індекс. `food_lookup` повертає обмежені записи, фільтрує стан приготування; модель обирає ID, сервер підставляє числовий snapshot. Особисті джерела у першому локальному тесті тільки synthetic. `estimate` дозволений із явними припущеннями, без удаваного ID/посилання; неповний результат зберігається як note. H02 включає cooked/raw, г/мл, часткові дані, незнайдений бренд, label override й ін’єкцію в даних.

Файли (орієнтовні): `scripts/food-data-import.mjs`, `server/trainer/food-lookup.mjs`, typed schema/validators, fixtures; великі архіви й runtime поза Git. Коміт: «feat: знаходити джерела харчових значень для чату».

### 4. Додати версійні чернетки, нотатки й підтверджену пам’ять

Модель: Codex; високий ризик атомарності, доступу та втрати історії. Незалежне рев’ю до UI.

Draft patch із baseRevision/itemId; стара пропозиція не перезаписує ручні зміни. Одна Firestore транзакція saveTrainerDraft для confirmed items + явно обраних notes + marker у day doc, також notes-only; commandId тотожний submissionId. Старі append/appendAllocated не послаблювати. Note conversion через resolveFoodNote теж atomic із тим самим marker/recovery. Firestore rules для foodNotes з owner write/погодженим trainer read, invalid/cross-owner deny. Двофазний writer перехід: сумісні rules v2/v3 при notes off; v3 UI/fallback; лише потім per-owner trusted notes capability/minVersion3, без глобального блокування v2. Тест обох фаз і rollback після першої нотатки. Неповний підсумок однаково показують день, звіт, trainer view й інструмент читання дня. Context proposal з diff/CAS/одноразовим commit; пам’ять пишеться лише після «Запам’ятати». Snapshot/history commit у SQLite; окремі tombstones/deletion manifest, hourly cleanup і recovery без повторної моделі. Медійний runtime очищається на всіх шляхах; queued media після restart не запускає upstream, невдалий DELETE session лишає durable cleanup job після SQLite commit.

Файли (орієнтовні): `src/services/mealCommands.js`, `mealStore.js`, `useMealDay.js`, `nutrition.js`, нові notes/trainer services, `firestore.rules`, server stores, звіт/TrainerDashboard. Коміт: «feat: зберігати чернетки й харчові нотатки без втрат». H03–H06/H10 на емуляторі та actual-path old writer.

### 5. Зібрати чат на телефоні

Модель: Codex; середній ризик UX і станів, перевірка власним ізольованим браузером.

Чат доступний з головної; textarea одразу; явна «Почати запис»; stop автоматично запускає розбір; фото прив’язане до рядка; conversation/update/status видно. Перевикористати recorder/media normalization, preview, PlanAllocationFields, DecimalInput, атомарний save і pending recovery із VOICE-LETTERS-01. Не дублювати два сценарії зі своїм обліком. Питання/майбутні наміри не створюють записи; корекція голосом/текстом, дата, кілька продуктів, ручна літера, source/estimate, note fallback. Одна активна Add на дату, freezing при saving/unknown. Фото скасовується без втрати чернетки.

Файли (орієнтовні): `src/components/TrainerChat.*`, VoiceInputModal/media primitives, `src/pages/ClientApp.js`, `src/services/trainerApi.js`, metrics. Коміт: «feat: додати чат із тренером для тексту голосу й фото». H01/H05/H09. Дизайн зберігає чинні краї/типографіку, без повного редизайну.

### 6. Перевірити відмови, ресурси й сумісність релізу

Модель: Codex; високий ризик другого порядку. Новий reviewer перевіряє свіжий diff.

Повний H01–H10 плюс поточні `test:ci`, Worker, store/server/rules, browser і build. 375/390/1366, overflow0, видимі стани, keyboard/focus/44px; getBoundingClientRect для країв, числові дельти. Дві вкладки, закриття, reload, logout, stale reply, 429, cap, proxy crash, killed Hermes, SQL/Firestore error, відсутність трафіку, backup restore/delete. Linux cgroup для Node+Hermes разом 2 CPU/2 GiB з реальним pinned Hermes і mock upstream, deadline45. Це не замір швидкості Sonnet. За перевищення межі ресурси автоматично не збільшуються.

Перевірити rollback UI/API/rules як одну сумісну версію; старі клієнти не можуть приховати notes чи повторити команду. Коміт: «test: перевірити відмови й готовність пакета Hermes». Потрібні точний SHA/CI, незалежний verdict та чисті приватні runtime outputs.

### 7. Підготувати вимкнений пакет і наступне погодження

Модель: Codex; середній операційний ризик, жодних серверних дій.

Артефакт з SHA256/manifest, pinned Hermes/runtime/food index, feature off, fake credentials відсутні. Інструкції backup/cutover/rollback, roles/writer fence, systemd isolation, network egress, encrypted secret loading. Точний майбутній набір живих тестів H11, payload bounds, актуальні публічні тарифи, верхній резерв; фактичний залишок бюджету перечитується тільки після нового дозволу. Журнал/PROJECT-INFO/Code Indexer оновити; Gxx не приймати локальними тестами. Коміт: «docs: підготувати пакет інтеграції Hermes на погодження».

## Зовнішні етапи B/C, зараз НЕ дозволені (повний перелік)

**B. Приватна інвентаризація й перенесення.** Після готового локального пакета окремий дозвіл на read-only server/profile/ledger, потім точний cutover. Перевірити версії/вільні ресурси/порти, актуальні права, статус Telegram. Узгодити склад контексту й зупинку старого writer; зашифрована резервна копія перед перенесенням. Перенести той самий профіль без чужих credentials і історії; keys лише encrypted platform store. Не запускати два writers. При відкаті повернути свіжі підтверджені context updates, не старий snapshot. Жодного збільшення $5/ресурсів у складі цієї операції без окремого дозволу.

**C. Активація й приймання.** Спочатку сумісні rules v2/v3 й adapter з notes/inference off; потім перевірений v3 UI/fallback; тільки далі capability/minWriter3 для пілотного UID і нова квота після перевірки auth/allowlist/budget/backup. Не блокувати v2 до доступного нового UI. Погоджений синтетичний Groq + Sonnet через реальний Hermes, максимальна сума відома наперед. Лише потім телефон: домашня страва, текстове уточнення, етикетка, літера, reload і перечитування. Mac вимкнений, профіль той самий. Далі 7-денний G09; Юрій підтверджує продукт. Відкритий попередній приватний Firebase-інцидент не оголошувати закритим без окремого доказу, його reachability перевірити як release gate.

## Відкат і межа пошкодження

Кожний локальний блок окремий commit+push, без force і без продуктового merge в main. Базовий d9a57b0 зберігається. Синтетичні дані відновлюються з fixtures. Майбутній production rollback вимикає нові turns, завершує/позначає unknown активні, зберігає поточні ledger/anchors, notes, receipts, memory revision та deletion manifest. Не відновлювати старий ledger і не скидати cap. Старий UI, який приховує notes, не є допустимим fallback; потрібен сумісний read-only UI із видимими нотатками до нового релізу. Firestore notes не видаляти для «відкату схеми».

Область впливу (повний перелік): введення їжі, серверний model gateway, доступ до owner data, нові notes/rules, показ неповних сум, звіт/тренер, приватна пам’ять і історія. Заміри, програма/норми, старі meals, чинні зв’язки клієнт/тренер, інші сайти й проєкти мають лишитися незмінними.

## Виконання й докази

Двигун: послідовно в поточній задачі, commit на блок; без автоматичного /goal, без паралельних writers. Незалежні read-only reviewers після ризикових блоків дозволені AGENTS/spec-flow. Реальні зовнішні кроки зупиняються перед погодженням.

Документна готовність цього плану (повний перелік): D01 журнал1640 у main і точний blob; D02 причина описана зі свіжим no-network probe; D03 вибір фактичного Hermes й H01–H11/0–7/B/C узгоджені; D04 приватність/бюджет/atomic/rollback конкретні; D05 проба спеки та Fable review звірені; D06 у diff лише дозволені документи/знеособлена пошукова копія, код дорівнює базі. D01–D06 перевіряє свіжий spec-reviewer; це не verdict реалізації H01–H11.

Докази: `docs/evidence/hermes-food-plan-2026-10-24.json`, .agents/journal/2026-10-24-1326-codex-gpt-6-hermes-food-plan.md. Команди документного приймання: `git diff --check`, `git diff d9a57b0 -- src server workers scripts firestore.rules package.json package-lock.json .github`, `git show origin/main:.agents/journal/2026-10-23-1640-codex-gpt-6-voice-letters-local.md`, прочитати spec/plan/evidence, повторити no-network probe: `node docs/evidence/hermes-food-baseline-2026-10-24.cjs "$PWD"` на Node24.22.1 із npm ci; діагностичний fixture у Git, код продукту незмінений. Документи мають бути непорожні, UTF-8/JSON валідні, локальні посилання існують.

Перед реалізацією потрібне явне погодження кроків 0–7 і припущень А1–А4 специфікації. B/C цим погодженням не дозволяються.
