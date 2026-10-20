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
