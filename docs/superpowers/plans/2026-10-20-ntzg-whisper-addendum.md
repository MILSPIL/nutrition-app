# Доповнення: SciSense з голосом на MS-WEB

Дата: 2026-10-20. Goal objective_e45aa8ac1aa3; G04/G05/G07/G08/G11.
Статус: уточнення плану для розгляду. Серверний код і привілейоване встановлення не виконувалися.

## Доручення й актуальна база

Юрій уточнив: застосунок має працювати на https://ntzg.pp.ua на власному MS-WEB Server, як передав сусідній чат. Whisper + Sonnet 5.5 та $5 із Claude-кредитів уже погоджені. Власник підтвердив доступність кредитів. Не повертатися до погодження моделі, бюджету чи домену.

Це доповнення до [доменного плану](2026-10-20-ntzg-deployment.md): там сервер роздає лише інтерфейс, а API лишається Worker. Щоб Whisper працював без увімкненого Mac, потрібне окреме серверне виконання. Firebase Auth/Firestore лишаються, дані не мігрують на VPS. Реалізація [доступу G04](2026-10-20-trainer-access.md) і її наслідок для старих тренерських зв’язків досі потребують погодження до коду та релізу.

Read-only інвентаризація 20 жовтня: xCloud API підтвердив MS-WEB/OpenLiteSpeed/Ubuntu 24.04.4, 4 ядра, 7935 MiB RAM, близько 5262 MiB доступно. Node не встановлений, Supervisor доступний, окремого SciSense-сайту немає. Три сусідні сайти до змін мають HTTPS 200. Запас пам’яті є моментним виміром, а не гарантією швидкості Whisper.

Cloudflare має активну зону, proxied A на погоджений сервер, HTTPS 200 із валідною перевіркою TLS; SSL mode full. Origin certificate/Full(strict) ще не доведені. xCloud git/detect підтвердив public repo, CRA/static/build і native compatibility; це не dry-run створення. Dry-run повернув 403, діагностика прав токена теж 403. Історичний токен не змінювався. Оновлення 23:39: спільний Keychain-токен і MCP для Codex/Claude перевірені (REST/MCP200, servers.index MS-WEB); dry-run тепер повертає 422 required ssl_certificate/ssl_private_key для custom TLS. Сайт не створено.

## Варіанти

| Варіант | За | Проти |
| --- | --- | --- |
| A. Інтерфейс і невеликий Node API з Whisper на MS-WEB, Sonnet зовнішній | Працює без Mac, один origin, повторно використовує чинні auth/validation/provider/budget, без окремої оплати розпізнавання | Новий керований процес, ресурсні межі та секретне сховище; швидкість CPU треба перевірити |
| B. Інтерфейс на MS-WEB, Worker для Sonnet, окремий серверний STT | Ключ Sonnet зберігається у Cloudflare secrets, Worker лишається окремим сервісом | Два API й додаткова захищена взаємодія, складніший спільний бюджет і квоти; зайва інфраструктура для цього пілоту |
| C. Інтерфейс на MS-WEB, Whisper на Mac | Найменше нового коду, Mac уже перевірений | Mac мусить працювати; потрібне захищене з’єднання через мережу, не виконує очікувану незалежність сервера |

Рекомендую A. Це перенесення точки виконання готових модулів, без переписування харчової моделі чи перенесення Firebase. B додає непотрібну координацію, C зберігає залежність, яку прибирає уточнення Юрія. Не називати A просто статичним deploy: він розширює початковий доменний план.

## Межі

Повний обсяг: окремий xCloud сайт/корінь/користувач; static release; Node 24.11.x API на loopback; Linux Whisper тієї самої версії/моделі; точний origin/реальний Firebase JWT/UID allowlist; постійний бюджет; секретне сховище; HTTPS; потрібний G04 і сумісність старих writers; перевірений відкат; дозволений API тест у межах $5.

Не входить: нова БД або міграція Auth, WordPress, Docker, платний STT, нова підписка/баланс/автопоповнення, загальний firewall, зміни сусідніх vhost, збільшення API-ліміту, авто-deploy на push. Наявний local demo gateway не стає публічним reverse proxy, його непідписані JWT й емулятори не потрапляють на VPS.

## Кроки

1. Завершити доступ і preview. За уточненням Юрія спільний токен агентів ms-web-xcloud/api-token у Keychain, права read:servers/write:servers/read:sites/write:sites/read:billing та mcp:invoke. Назва ms-web-agents не звужує доступ до одного сервера; фактична межа визначається командою xCloud. Full Access, token-management і add-on permissions для деплою не потрібні. Повторити dry-run без AI script generation і без creation. Перевірити точні site user/docroot, доступ SSH, xCloud підтримку окремого vhost, чинні тарифні наслідки створення сайту. Не міняти інші токени. Якщо виникає новий платіж, зупинитися з точною сумою до створення.
2. Підготувати Node adapter локально. Використати createHandler без підміни authenticate: реальний RS256, issuer/audience/час, allowlist UID, точний origin https://ntzg.pp.ua. Same-origin /meal-api/transcribe і /meal-api/analyze; обмежені тіла, AbortSignal, незалежні timeouts, секрети не йдуть у subprocess env. Файли статичної збірки й API мають окремі обробники; missing.js/api/.env/.git не повертають HTML. xCloud Static керує vhost і статикою; Node/Whisper запускає один окремий systemd unit. Managed SSR/Hybrid або Supervisor для того самого API не вмикати; якщо панель не зберігає route/unit, зупинитися. Тести 401/403/429/413/503 без upstream та успішний fixture, локально згенерований тестовий RS256 ключ не стає production bypass. Коміт і push.
3. Підготувати серверний пакет та репетицію в ізоляції. Артефакт з exact SHA/config/hash і Linux Whisper source/model hashes; збирати бінарник під фактичну архітектуру сервера, Mac-бінарник не копіювати. Початково 1 Whisper процес/1 потік, CPUQuota=100%, MemoryMax=2G для сервісу, timeout 45s. Ці межі перевірити на 5/30/90s синтетичних UA/RU WAV; OOM або timeout означає непройдену перевірку, без тихого збільшення ресурсів/заміни моделі. Після репетиції має лишитися щонайменше 2 GiB доступної RAM; сусіди без нових 5xx, явна затримка довших фраз відображена. Час Mac 2872ms не переноситься на VPS.
4. Секрет і бюджет. Anthropic key передавати Keychain → stdin → encrypted platform credential (LoadCredentialEncrypted/systemd-creds), тільки для окремого сервісу SciSense. До використання перевірити підтримку встановленою systemd та можливість xCloud не перезаписувати unit. Жодного plaintext .env з API-ключем, HTTP-логів Authorization або медіа. Бюджет SQLite поза releases і webroot, одноразовий marker поза станом, який здатен відновити deploy. Усе лишається одним proposalId/$5, restart/rollback/інший UID не створюють нові гроші; missing/corrupt DB або marker зупиняє inference. Локальний бюджет ще не активовано, витрати 0. Передавання права витрачати бюджет є окремою обов’язковою операцією: зупинити всі власні локальні lab-процеси, повторно звірити відсутність активованої SQLite/витрат і записати permanent transfer-marker у той самий Keychain scisense-phone-lab/pilot-2026-10-20. Marker містить proposalId, cap, consumed=0, receipt-id та target=ntzg.pp.ua. Поточний liveRuntime відхиляє initialize за будь-якого попереднього marker і normal start за невідповідного marker, тому інший checkout Mac не створить паралельні $5. Перечитати marker і довести відмову local initialize/start до дозволу server activation. Receipt передати серверу без API-ключа в ньому, зафіксувати поза releases root-owned marker та звірити початковий ledger; серверна активація одноразова. Якщо до передавання виявлено ініціалізацію або витрати, автоматичний старт зупиняється до offline snapshot/reconcile, резерви не обнуляються. Повернення на Mac вимагає зупинки сервера й зворотного передавання поточного ledger, не запуску другого бюджету. Перервана операція має лишати inference вимкненим на обох хостах. При першому API тесті зафіксувати reservation і фактичний usage без тексту.
5. Виконати погоджений G04 у окремому логічному блоці. За планом trainer-access перевірити A01–A09, canonical consent, відкликання, конкуренцію, legacy. Перед live rules інвентаризація й адресний backup метаданих, перевірена матриця старий/новий клієнт+rules. Старі зв’язки без доказу згоди потребують повторного підключення; цей наслідок показати Юрію до застосування. Не синтезувати consent і не послаблювати rules для демо.
6. Підготувати конкретний release package. Збірка з production Firebase і same-origin API, без emulator flags. Окремий vhost, Origin CA і Full(strict), no-store HTML/API, immutable hashed assets, збережені старі assets. Зафіксувати майбутні абсолютні server paths після inventory. Публікація/privileged install виконуються тільки за точним пакетом: site/user, unit і encrypted credential, потрібні команди, адресний backup, scoped reload, порядок rules/API/app та відкат. Дозвіл на домен і $5 не означає sudo на весь сервер.
7. Після дозволеного перемикання перевірити D01–D07 із базового плану на фінальному SHA, реальний Google-вхід і телефонні голос/фото/preview/одна «Додати»/reload. Негативні API сценарії не викликають upstream. Повернення на попередній safe bundle або технічну сторінку не відновлює старі небезпечні rules і не скидає бюджет. Продукт приймає Юрій після пілоту, не після одного успішного запиту.

Кроки 2–5 є технічним розширенням, яке треба погодити до нового серверного коду. Підготовка read-only, документація та вже дозволений локальний Whisper виконуються зараз. Конкретні привілейовані операції не починаються до перевірки серверних шляхів і явного дозволу на їхній обсяг.

## Критерії доповнення та майбутнього виконання

Підготовка документа: N01 актуальні факти й межі доказів; N02 усі варіанти мають за/проти та рекомендацію; N03 точна зміна попереднього плану, витрат і зберігання; N04 не втрачено G04/старих writers/rollback; N05 є конкретні критерії й немає вигаданого deployment; N06 журнал/статус/Code Indexer узгоджені.

Майбутнє виконання: N10 Node auth/media/abort/timeout/zero-upstream тести; N11 Linux UA/RU Whisper у заданих ресурсах і без медіафайлів; N12 restart/lost/corrupt/rollback бюджету та encrypted secret; N13 G04/A01–A09 і матриця сумісності; N14 усі D01–D07 на інтегрованому release; N15 фізичний телефон і дозволений Sonnet/photo у межах того самого $5. Усі N10–N15 pending.

## Джерела

Context7 мав вичерпану місячну квоту. Прочитано первинні джерела і власний код:
- https://xcloud.host/docs/deploy-git-projects-with-xcloud-public-api-and-mcp/ та https://app.xcloud.host/api/v1/openapi.json: native static, dry_run, write:servers, resolved config, провізіонування не тотожне deployment.
- https://xcloud.host/docs/how-to-access-the-xcloud-api/: точні read/write permissions й UI створення окремого token.
- https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html: encrypted credentials, доступ лише сервісу/root; версію на сервері перевірити перед використанням.
- pinned whisper.cpp d1be6fde11ac6e0407606b4e42fe72d34add8037, CLI stdin/output код; модель SHA1 e050f7970618a659205450ad97eb95a18d69c9ee; власні worker index/budget/provider та phone-lab modules.

## Перевірка підготовки

Незалежний Codex ntzg_whisper_plan_review: N01–N05 пройдено після уточнення єдиного бюджету. Закрито ризик паралельних $5 на Mac і сервері: перед запуском VPS потрібен незворотний для локального initialize transfer-marker та негативна перевірка локального запуску. Привілейованих дій, нового серверного коду та live API у рев’ю не було. N06 узгоджено документацією/профілями/карткою/фазою; N10–N15 pending.
