# SciSense: результат локальної серверної підготовки

Дата: 2026-10-21. Goal objective_e45aa8ac1aa3, G04/G05/G07/G08/G11 pending. Гілка codex/scisense-server-prep. CLOUD-PREP-01 погоджено для коду й синтетичних перевірок; справжні ключі та $5 не чіпати.

## Що підготовлено

- Loopback Node API /meal-api/, RS256 Firebase JWT, Origin/UID, розмір/конкурентність, abort і shutdown. 8 серверних тестів та незалежне рев’ю transport/auth.
- Canonical trainer consent, атомарні request/accept/revoke, закриті профілі/каталоги, очищення UI після revoke. 29 правил, 99 тестів застосунку, власний headless browser із3 синтетичними користувачами; незалежні protocol/UI review.
- Один ledger поза releases, стійкі anchor/lock, permanent transfer-marker, захист від другого checkout/паралельної передачі/відкату SQLite. 12 budget/runtime тестів, загалом server20/20; незалежне рев’ю та child-SIGKILL probe.
- server/deployment.json має liveEnabled=false, порожній allowedUids, releaseId=PENDING_VERIFIED_PACKAGE. server/main.mjs запускає health без inference; активація потребує окремого root-owned receipt і platform credential.
- deploy/scisense-api.service пропонує окремого scisense user, /opt/scisense, /var/lib/scisense, LoadCredentialEncrypted,1CPU/2GiB. Він не встановлений. Не замінює глобальний Node сервера.
- Pinned Linux Whisper source/model/image/Node; ізольовані synthetic benchmark, cgroups, OOM/abort/timeout/concurrency/cleanup. Synthetic systemd255 credential зашифрований через stdin; справжнього передавання немає.

## Блокер Whisper

[Linux CI39590783755](https://github.com/MILSPIL/nutrition-app/actions/runs/39590783755) зібрав large-v3-turbo-q5_0, але всі6 UA/RU записів5/30/90s перевищили45s на1CPU. Peak RAM795–811MB, OOM0; негативні сценарії4/4 та cleanup пройшли. Ці виміри стосуються GitHub runner, не MS-WEB. Повний доказ: [JSON](evidence/linux-whisper-preparation-2026-10-21.json).

| Наступна проба | За | Проти |
| --- | --- | --- |
| Та сама модель,2CPU у синтетичному CI | Зберігає модель і дозволяє виміряти ефект CPU без ключів/production | Не гарантує45s, майбутнє використання двох CPU на MS-WEB потребує перевірки впливу на сусідні сайти |
| Менша багатомовна Whisper-модель у CI | Потенційно менше CPU й RAM | Змінює погоджену модель, точність української й назв продуктів треба виміряти заново |
| Довший таймаут із1CPU | Зберігає модель і ресурсну межу | Погіршує швидкість додавання їжі та тримає єдиний inference слот довше; може не дати прийнятного результату |

Рекомендація: спочатку погодити синтетичну пробу2CPU з тією самою моделлю й45s. Меншу модель розглядати за її результатом; просто подовжувати очікування суперечить продуктовій меті швидкого запису. Це ще не вибір ресурсів production. Жоден із варіантів у цій сесії не застосовано.

## Що заважає назвати пакет готовим до встановлення

1. Performance-рішення та повторна Linux-перевірка. Поточний failed benchmark зберігається, не маскується як PASS.
2. main→feature інтегровано в c2cfecf5cff7c1d128c26a5427f78ffba3e3e8af; build із REACT_APP_MEAL_API_URL=/meal-api і lab flags0 пройшов. Знімок із27 static assets, source archive та app/API/rules/lockfile hashes: docs/evidence/server-preparation-snapshot-2026-10-21.json. Це preparation snapshot з installApproved=false/liveEnabled=false; фінальний CI39617071772 поки у черзі GitHub. Маніфест не є дозволом на встановлення.
3. Стендова матриця старий/новий frontend × API × rules і server-side writer fence. Поточний writerVersion=2 сам не блокує старі вкладки; DNS і maintenance HTML також не блокують Firestore. До доведення fence запис production не перемикати.
4. Read-only inventory MS-WEB: admin SSH, точні user/docroot/ports, systemd/Node/OLS versions, адресні backup. За чинною межею ключі/сервер не використовувалися.
5. Provisioning/TLS payload з dry-run PASS, SAN/renewal/secret storage, OLS proxy/cache config та вплив спільного reload на3 сусідні сайти. Довільні Nginx snippets і глобальний Node upgrade заборонені.
6. Конкретний reviewed Keychain→stdin→SSH→systemd-creds adapter, read-back permanent marker/ledger, root activation receipt і rollback rehearsal. server/transfer.mjs є перевіреним ядром із synthetic marker adapter; справжню передачу не запускали.

## Порядок майбутнього погодження

Після закриття цих пунктів показати Юрію один конкретний пакет із SHA/хешами, точними шляхами й командами, backup, TLS, списком привілейованих дій і відкатом. Погодження CLOUD-PREP-01 не є дозволом виконати його. Production-послідовність: backup → доведений writer fence → G04 rules і read/listener probes → вимкнений API → перевірки → frontend → дозволена активація.

Відкат не повертає небезпечні старі правила, не відновлює старий ledger і не створює нові$5. Для першого випуску потрібна перевірена maintenance-сторінка з вимкненим inference та server-side fence. Crash-lock не видаляють автоматично; спершу зупинка власних процесів і reconcile.

На телефоні ще не перевірено: Google login, мікрофон/камера, справжній кефір200г + фото → прев’ю → одна «Додати» → reload без дубля. G04 на production, пілот і фінальне приймання Юрія залишаються pending.

Чернетка перевірки: [PR16](https://github.com/MILSPIL/nutrition-app/pull/16). Незалежне TLS review done;10/10 і власні overflow/timeout/secret-hygiene probes PASS, доказ tls-portability-preparation-2026-10-21.json.
