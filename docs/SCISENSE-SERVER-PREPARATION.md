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

Перші два прогони зібрали ту саму pinned large-v3-turbo-q5_0. Модель, 2 GiB RAM і таймаут 45 секунд збережені; друга проба на 2 CPU прямо погоджена Юрієм.

| Синтетична конфігурація | UA/RU записи 5/30/90 секунд | Пік пам’яті | Захисні сценарії |
| --- | --- | --- | --- |
| 1 CPU, 1 потік | 0/6, усі завершилися за таймером | 758.5–772.8 MiB | 4/4 та очищення пройдені |
| 2 CPU, 2 потоки, large-v3-turbo | 0/6, усі завершилися за таймером | 759.8–774.0 MiB | 4/4 та очищення пройдені |
| 2 CPU, 2 потоки, small-q5_1 | 0/6: 2 timeout, 1 порожній, 3 без підтверджених продукту/200г | 493.9–531.0 MiB | 4/4 та очищення пройдені |

Докази: [1 CPU, CI39590783755](https://github.com/MILSPIL/nutrition-app/actions/runs/39590783755), [2 CPU, CI39620593130](https://github.com/MILSPIL/nutrition-app/actions/runs/39620593130), JSON у docs/evidence/linux-whisper{,-2cpu}-preparation-2026-10-21.json. Фактичні cgroups і threads підтверджено; OOM при 2 GiB немає, зашифрований синтетичний credential пройшов перевірку. MS-WEB не вимірювався.

[Діагностичний CI39622898172](https://github.com/MILSPIL/nutrition-app/actions/runs/39622898172) підтвердив: stdin завершено, CLI прочитав усі 160044 байти WAV, cgroup витратив 89695ms CPU за 45058ms очікування, у середньому 1.991 CPU. Аудіо не зависло на передаванні; процес активно обчислював. Ініціалізація моделі й inference окремо не виміряні. Пік 771.4 MiB, OOM немає, дочірніх процесів/тимчасових файлів після завершення 0. Це одна UK5s проба, fixtureSet=diagnostic, а не нове приймання. Доказ: evidence/linux-whisper-2cpu-diagnostic-2026-10-21.json.

Незалежне рев’ю перевірило quota/threads, mock harness, telemetry privacy та cleanup; 6/6 локальних і Linux-тестів лімітів/діагностики пройдені. App CI39622897711 також SUCCESS. Build log підтвердив AVX2/F16C/FMA. Ризик повторного відкриття /dev/stdout відтворено негативною Linux-регресією й виправлено native segment callback у bf8e22d. Це окремий дефект виводу; походження старих таймаутів ним не доведене.

Production deployment.json і systemd лишаються на 1 CPU. Окрема проба меншої small-q5_1 погоджена й виконана нижче. Довший таймаут, нові серверні ресурси та paid STT не погоджені.

## Що заважає назвати пакет готовим до встановлення

1. Performance-рішення та повторна Linux-перевірка. Обидва невдалі повні прогони зберігаються; діагностичний запуск їх не замінює.
2. main→feature інтегровано в c2cfecf5cff7c1d128c26a5427f78ffba3e3e8af; build із REACT_APP_MEAL_API_URL=/meal-api і lab flags0 пройшов. Знімок із27 static assets, source archive та app/API/rules/lockfile hashes: docs/evidence/server-preparation-snapshot-2026-10-21.json. Це preparation snapshot з installApproved=false/liveEnabled=false; інтегрований CI39617071772 пройшов усі перевірки включно з3 browser flows. Маніфест не є дозволом на встановлення.
3. Стендова матриця старий/новий frontend × API × rules і server-side writer fence. Поточний writerVersion=2 сам не блокує старі вкладки; DNS і maintenance HTML також не блокують Firestore. До доведення fence запис production не перемикати.
4. Read-only inventory MS-WEB: admin SSH, точні user/docroot/ports, systemd/Node/OLS versions, адресні backup. За чинною межею ключі/сервер не використовувалися.
5. Provisioning/TLS payload з dry-run PASS, SAN/renewal/secret storage, OLS proxy/cache config та вплив спільного reload на3 сусідні сайти. Довільні Nginx snippets і глобальний Node upgrade заборонені.
6. Конкретний reviewed Keychain→stdin→SSH→systemd-creds adapter, read-back permanent marker/ledger, root activation receipt і rollback rehearsal. server/transfer.mjs є перевіреним ядром із synthetic marker adapter; справжню передачу не запускали.

## Порядок майбутнього погодження

Після закриття цих пунктів показати Юрію один конкретний пакет із SHA/хешами, точними шляхами й командами, backup, TLS, списком привілейованих дій і відкатом. Погодження CLOUD-PREP-01 не є дозволом виконати його. Production-послідовність: backup → доведений writer fence → G04 rules і read/listener probes → вимкнений API → перевірки → frontend → дозволена активація.

Відкат не повертає небезпечні старі правила, не відновлює старий ledger і не створює нові$5. Для першого випуску потрібна перевірена maintenance-сторінка з вимкненим inference та server-side fence. Crash-lock не видаляють автоматично; спершу зупинка власних процесів і reconcile.

На телефоні ще не перевірено: Google login, мікрофон/камера, справжній кефір200г + фото → прев’ю → одна «Додати» → reload без дубля. G04 на production, пілот і фінальне приймання Юрія залишаються pending.

Чернетка перевірки: [PR16](https://github.com/MILSPIL/nutrition-app/pull/16). Незалежне TLS review done;10/10 і власні overflow/timeout/secret-hygiene probes PASS, доказ tls-portability-preparation-2026-10-21.json.

## Погоджена проба STT-SMALL-01: виконано, критерії не пройдено

Статус: Юрій явно погодив 2026-10-21 пробу small-q5_1 на 2 CPU / 2 GiB / 45s, без ключів, $5 і сервера. CI39662207789 на bf8e22d завершено:0/6 normal,4/4 negative controls. Виробнича модель не перемикається. Sonnet залишається claude-sonnet-5-5.

| Варіант | За | Проти |
| --- | --- | --- |
| Whisper small-q5_1 у synthetic CI, 2 CPU / 2 GiB / 45s | Перевіряє меншу багатомовну модель без нового сервера й оплати API | Швидкість і точність української/російської та назв продуктів ще треба довести |
| Та сама large-v3-turbo з більшим CPU або таймаутом | Зберігає модель | Потребує нової ресурсної межі або довшого очікування; поточні прогони не доводять достатність |
| Зупинити експерименти й зберегти блокер | Жодних нових змін | Голосовий сценарій лишається неготовим |

Рекомендація до погодження, збережена як історія рішення: small-q5_1 лише як наступна синтетична проба. Збільшувати ресурси або очікування перед перевіркою меншої моделі не пропоную; зупинка не наближає до голосового запису. Її точність не вважається відомою заздалегідь.

Погоджена межа виконаної проби:
1. Відтворити окремий ризик stdout і забезпечити pipe-вивід без сирих transcript/media файлів; негативний regression, незалежне review. Це виправлення адаптера, а не спосіб обходу 45s.
2. Тільки тестовий allowlist моделі small-q5_1; production model/runtime не перемикається. Artifact ggml-small-q5_1.bin, size190085487, SHA256 ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb, Hugging Face revision5359861c739e955e79d9a303bcbc70fb988958b1. Whisper source лишається d1be6fde11ac6e0407606b4e42fe72d34add8037. Ваги завантажені тільки у CI; SHA256 перевірений під час збірки та кожного сценарію.
3. Повні UA/RU 5/30/90s, та сама CPU2/RAM2GiB/deadline45s, перевірка продукту й200г у результаті, abort/timeout/concurrency/OOM/cleanup. Зберігати лише метрики/булеві оцінки, без тексту розпізнавання. До PASS усіх шести та захисних сценаріїв результат не приймати.
4. Ключі, $5, MS-WEB, DNS/Firebase production, Sonnet і остаточний вибір production-моделі не входять. Невдача означає звіт і зупинку без автоматичного збільшення ресурсів чи заміни ще однієї моделі. Точність на голосі Юрія та продуктовий пілот залишаються окремими.

Підстава окремого рішення: погоджений серверний план фіксує large-v3-turbo-q5_0 і зупинку після невдалого benchmark; інша модель також змінює ризик помилок розпізнавання.

Джерела: [pinned CLI](https://github.com/ggml-org/whisper.cpp/blob/d1be6fde11ac6e0407606b4e42fe72d34add8037/examples/cli/cli.cpp), [stdin](https://github.com/ggml-org/whisper.cpp/blob/d1be6fde11ac6e0407606b4e42fe72d34add8037/examples/common-whisper.cpp), [моделі](https://github.com/ggml-org/whisper.cpp/blob/d1be6fde11ac6e0407606b4e42fe72d34add8037/models/README.md), [small-q5_1 на зафіксованій ревізії](https://huggingface.co/ggerganov/whisper.cpp/blob/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-small-q5_1.bin). Context7 у цій сесії недоступний через квоту; використано первинний код/документацію.

### Фактичний результат small-q5_1

| Мова / запис | Час | Результат |
| --- | --- | --- |
| Українська,5с | 25.279с | Текст повернуто; продукт і200г не підтвердилися |
| Українська,30с | 45.023с | Завершення за таймером |
| Українська,90с | 45.033с | Завершення за таймером |
| Російська,5с | 15.305с | Текст повернуто; продукт і200г не підтвердилися |
| Російська,30с | 13.875с | Порожній текст |
| Російська,90с | 28.041с | Текст повернуто; продукт і200г не підтвердилися |

Усі10 запусків підтвердили model SHA256, quota2CPU, належний memory.max, очищення контейнера й0 дочірніх процесів/тимчасових файлів. Пік normal493.9–531.0MiB, без OOM;4 захисні сценарії та синтетичний encrypted credential PASS. Linux10/10 regression tests і app CI39662207602 PASS. Незалежне рев’ю реалізації: done; P2 числового контексту тесту200г відтворено й виправлено до CI.

Доказ: [CI39662207789](https://github.com/MILSPIL/nutrition-app/actions/runs/39662207789), docs/evidence/linux-whisper-small-preparation-2026-10-21.json. Це eSpeak-ng synthetic fixtures з повторенням фрази; загальну точність на реальному голосі та причину помилок розпізнавання не встановлено. Протокол вимагає6/6 normal, тому результат не прийнятий. Наступного inference, заміни моделі, збільшення ресурсів чи deployment не виконано.

Незалежне рев’ю фактичних результатів завершене: linux_prep_review підтвердив метрики, обмеження й очищення та виконав 9 перевірок складання PCM/WAV. Очевидного дефекту складання не виявлено. Якість озвучення eSpeak-ng й автоматично визначена Whisper мова не виміряні; цей результат не є оцінкою справжнього голосу Юрія.

## Наступне рішення на погодження

2026-10-21: на запит Юрія підготовлено [STT-API-01](superpowers/plans/2026-10-21-scisense-stt-api.md) із Groq whisper-large-v3 + Sonnet 5.5, ресурсами, окремим тарифом і маршрутом до телефона. Пропозиція ще не погоджена й не замінює чинного deployment.json. Невдалі CPU-проби залишаються доказами; нового inference, серверного доступу та роботи з ключами немає.
