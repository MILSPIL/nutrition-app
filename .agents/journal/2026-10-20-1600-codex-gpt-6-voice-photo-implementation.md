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
Блок збереження й сервера пройшов незалежну перевірку. Медіаінтерфейс ще не підключений. Це не завершення V01–V09 або продукту.

## Наступні кроки
Завершити блок 2 і commit/push, блок 3 media/preview/pilot ledger, isolated browser QA, фінальні тести/CI/review і PR. Потім конкретний окремий дозвіл на API/телефон.

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
