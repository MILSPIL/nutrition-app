# Новий домен ntzg.pp.ua у Cloudflare

- Дата і час: 2026-10-20 16:09 Europe/Kiev
- IDE / агент: Codex desktop
- Модель: GPT-6
- Chat ID: 01a15964-a026-7b63-811a-a8852931bf65

## Ціль

Підключити новий домен застосунку через Cloudflare до власного сервера, який Юрій підтвердив окремим повідомленням і знімком xCloud.

## Що зроблено

- Прочитано контекст репозиторію, два останні журнали, PRODUCT-GOAL, briefing і чинний Goal. Поточний продуктовий пріоритет не змінювався.
- DNS на старті: parked1.uadns.com та parked2.uadns.com. У підключеному Cloudflare домен був відсутній.
- Створення зони через MCP OAuth отримало HTTP 403: цей тип авторизації не підтримує створення зон. Повторний GET підтвердив відсутність зони. Keychain перевірено лише за назвами записів; клієнтські ключі не використовувалися.
- Домен створено через авторизований кабінет того самого акаунту, обрано безкоштовний тариф. Ручне введення DNS, автоматичну зміну robots.txt не вмикали.
- Через MCP створено один A-запис на погоджений MS-WEB Server, proxied=true, TTL=Auto. GET зони й записів та окрема сторінка DNS підтвердили результат. NS: joyce.ns.cloudflare.com і kayden.ns.cloudflare.com; статус pending.
- SSL режим при читанні: Full. Перед запуском потрібен сертифікат origin і Full (strict). Серверні налаштування, NIC.UA, старий Firebase Hosting, Auth і Firestore не змінювалися.
- PROJECT-INFO.md оновлено в ізольованій гілці від origin/main 3a7034e. Основне та голосове робочі дерева не змінювалися.

## Змінені файли

- PROJECT-INFO.md
- .agents/journal/2026-10-20-1609-codex-gpt-6-ntzg-cloudflare.md

## Команди / перевірки / тести

- git status, git worktree list, journal-scan.sh --quiet: початковий стан; два старі незакомічені журнали та .gitkeep лишилися поза main.
- dig NS/A/AAAA; Cloudflare GET /accounts, GET /zones, GET /zones/{zone_id}/dns_records, GET /zones/{zone_id}/settings/ssl.
- Code Indexer search_code та читання AuthContext/ClientApp/TrainerDashboard: вхід використовує signInWithPopup. Розгортання на іншому хості потребує перевірки дозволеного домену й реального входу.
- Context7: квота вичерпана. Перевірено офіційні Cloudflare full setup / proxy / Full strict і Firebase redirect best practices. Обидва посилання Cloudflare для налаштування повернули HTTP 200.
- Доказ DNS у кабінеті збережено локально: /private/tmp/ntzg-cloudflare-dns.png. Знімок, адреса origin, ідентифікатори акаунту/зони не додаються у публічний Git.
- Перевірка документації: git diff --check, непорожні файли, diff лише двох документів. Тести застосунку не повторювалися: код не змінювався, PR не створювався.

## Результат

Cloudflare налаштований для нового домену; делегування з NIC.UA ще очікується. Застосунок на новому сервері не опублікований. Підключення DNS, розгортання та приймання продукту є окремими станами.

## Наступні кроки

1. Замінити паркувальні NS у NIC.UA на видану пару та перевірити делегування/стан active.
2. Підготувати окремий сайт ntzg.pp.ua у xCloud, сертифікат, маршрути SPA, процедуру викладання й відкату. Перед переносом застосунку погодити конкретний план і release SHA; G04 зберігається гейтом до приватного пілоту/релізу.
3. Узгодити дозволений домен Firebase Auth, перевірити вхід Google на телефоні. Рекомендація на цьому етапі: залишити Auth/Firestore; заміна backend окремо не запитувалася.
4. Юрій явно погодив перенесення цього журналу й статусу в main; виконати через PR із перевірками згідно з CONTRIBUTING.md.

## Ризики / нотатки

- Наявні сайти спільного сервера та повідомлення xCloud про його default TLS certificate не входили в задачу.
- Ключі, cookies, приватні дані й чужі незавершені файли не копіювалися.
- Джерела: https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/ ; https://developers.cloudflare.com/dns/proxy-status/ ; https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/ ; https://firebase.google.com/docs/auth/web/redirect-best-practices .

## Продовження 2026-10-20 16:16: перевірка NS і погоджене перенесення

- Пряме доручення Юрія: «Так, перенеси журнал і статус у main та перевір, чи вже оновилися NS для ntzg.pp.ua».
- Повторний git fetch: origin/main 3a7034e, гілка містить лише PROJECT-INFO.md і цей журнал. Чужі журнали й незавершена реалізація голосу не входять у перенесення.
- dig з +norecurse до всіх трьох ns1/ns2/ns3.uadns.com: AUTHORITY містить тільки joyce.ns.cloudflare.com та kayden.ns.cloudflare.com, TTL 600. До обох Cloudflare NS: авторитетна відповідь aa з тією самою парою. Делегування підтверджено незалежно від кешу рекурсивних резолверів.
- Локальний DNS, Google DNS і Cloudflare DNS через HTTPS поки повертають parked1/parked2.uadns.com. Прямий UDP до 1.1.1.1 не відповів; перевірку Cloudflare DNS виконано через DNS-over-HTTPS.
- GET зони: pending, activated_on=null; запис A з proxied=true відповідає погодженому серверу. Разова спроба activation_check відхилена 403 через відсутність scope zone.write у підключення; ручну активацію не заявляємо. Нових ключів або розширення прав не було.
- Для обов’язкового гейту перед PR: фактичний Node v24.11.1 збігається з .nvmrc; npm ci з чинного lockfile; npm run test:ci -- --runInBand: 26/26, 4 suites; npm run build: успішно. Залежності та код не змінювалися. Є попередження старого toolchain про fs.F_OK і застарілі дані Browserslist, збірку вони не зупинили.
- PROJECT-INFO.md уточнено: делегування вже змінене, публічний кеш і статус Cloudflare ще очікують оновлення. Серверне розгортання не виконувалося.
- Квитанцію PR/merge, перевірку побайтового збігу файлів у origin/main та останній стан Cloudflare зберегти в локальному runtime цього чату після злиття; не створювати новий незлитий журнал лише заради квитанції.
