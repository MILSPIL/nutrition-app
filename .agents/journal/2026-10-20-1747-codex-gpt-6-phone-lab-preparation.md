# Підготовка локального входу з телефона

- Дата і час: 2026-10-20T17:47:07+03:00
- Агент: Codex, модель GPT-6
- Chat ID: 01a1585d-ba1e-7da0-a174-903bee0573b3
- Гілка: codex/voice-photo-entry, PR https://github.com/MILSPIL/nutrition-app/pull/8

## Ціль
За запитом Юрія підготувати реальні API/телефон і конкретні моделі/бюджет на погодження. Спільну локальну частину блоку3 вже погодженого плану виконано до фінального питання про витрати. Дозвіл на попередній план повторно не запитувався. API-запити й прив’язка кредитів не дозволені цим записом.

## Що зроблено
Пакет пропозиції61b24f0 committed+pushed. Уточнив поточну рекомендацію: B (локальний Whisper large-v3-turbo-q5_0 + claude-haiku-5-5, $0.25 тільки Claude-кредитів) відповідає прямій вимозі користувача. A з OpenAI STT/$1 лишається альтернативою з окремою оплатою звуку, лише наявний баланс, без поповнення. B ще не реалізований. Конкретна організація/баланс/API key не перевірені. Пакет pending/live=false.

Нові scripts/phone-lab*.mjs і scripts/phone-lab/: HTTPS на конкретному приватному IPv4, одноразовий 15-хвилинний код тільки на Mac, secure/HttpOnly cookie4год, test-only Auth adapter, fixed demo UID/project, loopback Auth/Firestore, перевірка всіх носіїв токена та SID. Production RS256 handler незмінний. src/firebase.js додає окрему phone lab конфігурацію з exact origin/ssl:true; ClientApp використовує synthetic custom token, LoginScreen чесно підписує тестовий вхід.

TLS CA генерується без ключових файлів через OpenSSL pipe; його private key не зберігається. Server private key у Keychain scisense-phone-lab/tls-key, значень у логах/argv немає. prepare виконано для фактичної LAN-адреси, збірка й публічні сертифікати у ignored tmp/phone-lab. CLI дозволяє тільки live=false, provider keys не читає. Одноразовий start/curl із перевіркою CA повернув200; Ctrl+C завершив власні сервери, lsof порожній. TLS-довіру на телефоні власник ще не встановлював.

SQLite adapter використовує чинний PilotBudget. Metadata cap/version і schema перевіряються після open до створення таблиць; відсутній/порожній/пошкоджений файл та зміна cap не стають новим бюджетом. initialize допускає лише новий файл wx. Live binding не активовано.

## Змінені файли
scripts/phone-lab.mjs, scripts/phone-lab-ui.mjs, scripts/phone-lab-browser.mjs, scripts/phone-lab/*; src/firebase.js, src/pages/ClientApp.js, src/components/LoginScreen.js; package.json; docs/PHONE-LAB.md, API-пакет/PRODUCT-GOAL/докази; PROJECT-INFO, DEVELOPMENT, WorkerREADME/proposal; .codeindexer. Старі primary/scale дерева не правилися, крім ignored runtime головного агента.

## Докази
- npm run test:ci -- --runInBand:88/88.
- node --test scripts/phone-lab/gateway.test.mjs:3/3 інтеграційні тести, у кожному кілька негативних сценаріїв.
- npm run build:PASS; phone lab build:PASS.
- agent-test-browser run scisense-phone-lab:10/10; HTTPS SDK auth, WAV, фото,106ккал, збереження та reload, правильний UID; лише synthetic provider3calls/paid0. Pairing form gutters24/24.
- Останній launcher dd6713ad1fa14e96-aaukizbk:exit0,cleanup_ok=true,removed=true. Незалежно перевірено закриті8444/9445/9446/9099/8088. Actual LAN smoke після цього також зупинений,8443/9099/8088 закриті.
- Файли docs/evidence/phone-lab-2026-10-20/:verification.json,launcher.json,saved.png,summary.json. Немає JS errors/production traffic. Три старі category-*-v4 іконки відсутні й дають404; не змінювали цей суміжний борг.
- Context7 quota exhausted: офіційні Firebase host/ssl/emulator, Node HTTPS/SQLite, Apple certificate trust; встановлений Firebase/WebChannel SDK прочитано для точних routes/headers.

## Рев’ю і виправлення
Codex phone_lab_security_review, свіжий контекст, read-only. Три підтвердженіP2: truncatedSQLite міг обнулити ліміт; proxy пропускав foreignUID/project; друга форма Authorization обходила першу. Сам перевірив код, додав guards/regression, рев’юер повторно відтворив усунення. Фінальний вердикт done для локальної підготовки, openP1/P2=0.
Браузер додатково виявив, що no-referrer дає nullOrigin у formPOST, та пропущений unary Firestore route для транзакції. Виправлено same-origin policy й точний route. Один прогін упав тільки на неправильному Authlistendpoint у самому тесті після успішного save/reload; доказ замінено прямим читанням users/UID у Firestore. Усі невдалі browser runs також cleanup_ok/removedtrue.

## Стан і далі
Профілі nutrition-app/scale, картка голосу та phase оновлені, export --skip reports для обох індексів виконано. G07 лишається pending, Goal active. Потрібні рішення B/A, підтверджені кредити/організація/проєктний ключ, обраний аудіоадаптер і live конфігурація, фізичний телефон/TLS-довіра. Реальних API0, deploy/merge0; G04 до приватного пілоту. Журнал і код у PR-гілці, main ще не містить їх.

Додаткова перевірка find.py --len для нового TLS-key завершилась таймаутом security5с. Це не доказ відсутності ключа: serve перед цим успішно прочитав його через Pythonkeyring, HTTPS із перевіркою CA відповів200. Значення не виводили й обхід доступу не використовували.
