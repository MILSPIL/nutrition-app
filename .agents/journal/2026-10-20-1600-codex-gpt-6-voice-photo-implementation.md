# Реалізація голосу й фото: збереження та сервер

- Дата і час: 2026-10-20 16:00, Europe/Kiev
- IDE / агент: Codex
- Модель: GPT-6
- Chat ID: 01a1585d-ba1e-7da0-a174-903bee0573b3

## Ціль
Виконати погоджений Юрієм план голосу й фото, Goal objective_e45aa8ac1aa3. План і пороги пілоту явно погоджені: 7 днів, ≥10 спроб, ≥5 з фото, ≥80% правильного збереження без ручного пошуку й введення БЖВ. G01 passed; решта pending.

## Що зроблено
- Нова codex/voice-photo-entry від main 3a7034e. Commit 0722b41: погодження та 3 справжні FAIL на старому коді: 106 ккал ставали 100; мл давали 0; головний екран не мав мікрофона. 26 старих тестів залишались PASS.
- Самодостатня модель item з кількістю, основою, точними ккал/БЖВ, джерелом; сумісність legacy, raw/cooked і відсотка порції. Усі читачі використовують ті самі розрахунки.
- Firestore transaction: day revision, submission marker, атомарний root projection; повтор не дублює. Початкове читання не запускає autosave. Дата явна. Legacy не переноситься мовчки; тотожний день підтверджується без дубля, відмінні записи потребують явного об’єднання.
- Worker: Firebase JWT, UID allowlist, CORS, схема, обмеження медіа, окремі 45-секундні provider calls без retries, відповіді без секретів/транскриптів у логах. Live за замовчуванням вимкнений. Аудіо для API має канонічний WAV PCM16 16k mono ≤90с, перевірений на сервері; frontend ще має перетворювати MediaRecorder output.
- SQLite Durable Object резервує 6/хв,30/UTC-добу,2 одночасних і загальний бюджет перед викликом; після перезапуску дані лишаються. Консервативна верхня вартість лишається зарезервованою після помилки чи завершення.

## Змінені файли
src/services/{mealItems,mealCommands,mealStore,useMealDay,nutrition}.js, ClientApp, MealSection, ProductModal, trainer/ClientDetailsModal; firebase.js і firebase.lab.json; scripts/meal-store-emulator.mjs; workers/meal-parser; tests; Goal/plan/PROJECT-INFO.

## Команди / перевірки / тести
- Node24.11.1/npm11.6.2, npm ci.
- Unit mealItems+nutrition: 37/37 PASS після raw/cooked regression.
- Worker Node tests: 12/12 PASS, включно з реальною SQLite та restart.
- Firebase demo-scisense auth/firestore emulators: 17 checks PASS; repeat/concurrent append, stale snapshot, profile, marker, date, legacy і metadata. Shutdown підтверджено. Посилено mirror тест на різні групи a/b.
- npm run build: PASS без lint warnings після виправлень.
- Wrangler deploy --dry-run: PASS, не публікація.
- Context7 вичерпав місячну квоту. Прочитані офіційні Firebase transactions/auth, React effect, MDN MediaRecorder, Cloudflare SQLite transactionSync, OpenAI file transcription, Anthropic vision/tool-use і jose JWKS docs.

## Незалежна перевірка блоку 2
Codex voice_storage_api_review. Підтверджені й виправлені: pending action могла повертати успіх іншої команди; recursive merge root лишав старі групи; повний profile міг повернути старі налаштування; portion/raw-cooked display після редагування; LAB hostname міг повернути production; legacy тотожного історичного дня блокувався; metadata могла замінювати історичну вагу/номер дня. Додатково виправлено падіння відкриття каталогу групи voice. Остаточний незалежний вердикт блоку 2: done, відкритих findings 0. Рев’юер сам повторив 37 unit, 3 regression (без ще відсутнього мікрофона), 17 emulator, 12 Worker і 6 RSA/JWT auth-сценаріїв без мережі.

## Результат
Локальна реалізація голосу й фото пройшла рев’ю та фінальні тести на коді c9f3ab3: 88 Jest,17 Worker,17 emulator, build і dry-run. Це не завершення реального V01–V03/V09 або продукту.

## Наступні кроки
Завершити GitHub CI для фінального PR. Потім окремо погодити конкретний API-прогін; підготувати телефонний канал. G04 і release залишаються гейтами приватного пілоту.

## Ризики / нотатки
Немає платних API-викликів, deploy, приватного пілоту чи змін access rules. G04 лишається гейтом. Старі deployed writers ще треба відключити/контрольовано оновити перед релізом. Real phone/API V01–V03/V09 pending; синтетичні fixtures не замінюють ці докази. Сирі медіа, особисті дані й секрети не потрапляли у Git.


## Блок 3: голос, фото, пілот
- Storage/server fcb5ce2 запушений. Додано реальний MediaRecorder із cleanup, перетворення в bounded WAV, два фото в одній чернетці, явну прив’язку продукту, editable preview та одну Додати. Медіа очищаються після ACK/закриття; додатковий Guard після async IndexedDB не дозволяє старому фото перейти в новий session.
- Локальний opt-in IndexedDB ledger рахує всі спроби, повтори й відмови; жодного харчового змісту. Правильність підтверджує учасник. Часткове вилучення/ручні БЖВ не зараховуються в успіх.
- 82/82 Jest PASS, build PASS до останніх двох guards/CSS. Browser25 PASS, widths375/390/1366: mic y75,h49.5; gutters20/20, delta0; no console errors. Еталон106 зберігається у списку/Header/звіті/reload. API підставні, actual MediaRecorder+WAV+JPEG+Firestore+IndexedDB локальні.
- Незалежний Codex reviewer відтворив2P2: targetswitch знімав unresolved photo; await ledger дозволяв stalephoto після close/reopen. Обидва виправлено+2regressiontests. Повторне рев’ю триває. Власний screenshot виявив видимий hiddenfileinput черезCSS; виправлено.
- Launcher sessions прибрані; останній PASS55e8d9fe612f4568-oy76gvaq cleanup_ok=true,removed=true. Перший QA помилявся в сценарії тиші через миттєвий Stop до audiochunk; після350ms очікування перевірено саме APIemptytranscript. Порожній recording коректно не створив їжі.
- Context7 знову повернув вичерпану квоту; використано офіційні Playwright browser/context/route й MDN IDB close. Keychain discovery scisense found0, значень не читали. Claude Fable code review запущено, результат ще очікується.

## Блок 3 завершено локально
- 86/86 Jest, 12/12 Worker, 17/17 Firestore emulator, production build і diff check пройдено незалежним Codex voice_photo_code_review. Третій підтверджений P2: числове редагування прибирало семантичне уточнення. Уточнення збережено до нової API-відповіді; додано 4 регресійні тести. Остаточний вердикт рев’юера: локальний код готовий, відкритих P1/P2 немає.
- Фінальний браузерний прогін: 25/25, сесія 3ea2c8b0a2a74d28-8ihqv2nx, cleanup_ok=true, removed=true. Перевірено синтетичний запис, два фото, 106 ккал, reload, звіт, облік невдач. Дані та скриншоти у docs/evidence/voice-photo-2026-10-20; це тільки fixtures, не реальний API/телефон.
- Виправлено нестабільність тестового закриття двох послідовних onboarding-вікон через точний selector і очікування закриття. Продуктова поведінка при цьому не змінювалася.
- npm audit: наявний root має 98 findings (3 critical), новий Worker toolchain має 5 high. Новий інструментарій буде оновлено до виправленої версії; старі залежності залишаються в окремій картці G08.

## Claude: звірка завершена
Модель з шапки: claude-fable-5-1. Вхід 226, вихід 48588, створення кешу 194556, читання кешу 853408, разом 1096778 токенів; 710.3 с; exit 0; відмов дозволу 0. Рев’ю лише читало код. Сирий звіт лишився в ignored runtime.

| Знахідка Claude | Що перевірив | Вердикт і дія |
| --- | --- | --- |
| Фото скидало dirtyText після дописаного продукту | VoiceInputModal.js, analyze з rowId і setDirtyText | Підтверджено; фото зберігає dirtyText, потрібен повний повторний розбір; regression PASS |
| Будь-яке поле стирало clarification | Обробники quantity/name/basis/nutrients | Підтверджено, вже виправлено за Codex-рев’ю; 4 regression PASS |
| Unknown save не дозволяв закрити модалку | close, useMealDay pending, ClientApp retry | Підтверджено; дозволено явний вихід з попередженням, frozen command лишається для retry. Після ACK зовнішнього retry оновлюється панель пілоту |
| Хвилинний резерв не враховував output транскрипції | Worker reservation; офіційні caps моделі 16000/2000 | Підтверджено; окремі input/output ціни та консервативний повний token cap для двох pinned snapshot-ів, невідомі моделі fail closed |
| Emulator JWT несумісний з production JWT, немає WAV contract test | authenticate/RS256, multipart input, browser route fixtures | Частково: телефонний адаптер навмисно ще pending; додано справжній multipart parser → provider adapter тест і відмову unsigned JWT. Production auth не послаблено |

Додаткові нотатки: стан untracked на момент читання усунуто комітом 58fe087; UI QA локальний через власний launcher і не видається за GitHub browser CI. Firebase Web API config є публічним ідентифікатором, не новим секретом продукту; значення не повторюється у звіті. API restrictions/G04 залишаються релізними гейтами.

## Worker після аудиту
Wrangler оновлено з 4.43.0 до 4.151.3, audit 0. Новий Miniflare 5 використовує convertV4MiniflareOptions: старий приклад README не відповідав constructor schema, перший runtime-тест відмовив до запуску. Після звірки власних type declarations та converter: Worker 17/17 PASS, включно з реальною SQLite workerd, одночасними резервами, збереженням маркерів/бюджету після dispose і нового process. Тест блокує мережу, вимикає telemetry/cf і прибирає власну теку у finally. compatibility_date 2026-10-19 відповідає встановленому runtime.

## Фінальна локальна перевірка
- Код c9f3ab3: 88/88 Jest,17/17 Worker,17/17 demo Firestore; npm run build, Worker dry-run і diff check PASS.
- Повторне незалежне рев’ю Codex знайшло ще один P2: після зовнішнього retry панель не оновлювала pilotVersion. Виправлено лише після ACK, повторна in-memory інтеграція справжніх VoiceInputModal/useMealDay/PilotPanel підтвердила тотожну команду, один item, saved та можливість підтвердити1/1. Остаточний вердикт: локальний PR готовий, відкритих P1/P2 немає.
- Оновлено PROJECT-INFO, Goal-документ, AGENTS, DEVELOPMENT, інструкції запуску й приймання; .mjs додано до індексованих типів. Раніше погоджений план повторно не запитувався.

- Фінальний browser на c9f3ab3:25/25, сесія d4cadadc464d4129-9z8ntzwi; cleanup_ok=true,removed=true. Артефакти оновлено, manifest verification.json.
- Code Indexer: Goal active, G01 passed, G02–G11 pending; картки й профілі актуалізовано, обидва експорти успішні. Журнал і код підуть у main лише через PR; прямого push main немає.
