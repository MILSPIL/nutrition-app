# HERMES-FOOD-01: локальний пакет і наступні дозволи

Стан на 2026-10-24: локальна реалізація й вимкнений пакет перевірені на `ce62052bb43aa21195af784201aa330c9221bf00`; фінальне незалежне рев’ю пройдено, відкритих блокувальних зауважень немає. CI40099514295, спроба2, успішний у всіх4 групах. Живі профіль, API, ключі, бюджет і сервер не використовувалися. Наявність пакета не дозволяє його встановлення. [Докази й контрольні суми](../evidence/hermes-food-local-acceptance-2026-10-24.json).

## Вміст та відтворення

Готовий локальний каталог: `.agents/runtime/hermes-package/release-ce62052/`, поза Git. SHA256 `manifest.json`: `50209c011c545a3868aa4838d31610bb93bcf6e1d0a3822c415820d77cd06c97`. Перевірено всі209 файлів застосунку та31726 файлів публічного runtime; п’ять HTTP-запитів до упакованого API, зовнішніх запитів0, ключі не завантажувалися. Локальна копія збережена; GitHub зберігає CI-артефакт7 днів, після чого його можна відтворити з pinned джерел.

- `app.tar.gz`: статичний UI з вимкненим чатом, API, сумісні правила Firestore, кандидат unit, серверні залежності. `server/deployment.json`: `liveEnabled=false`, `trainer.enabled=false`, порожній allowlist.
- `runtime.tar.gz`: публічний Hermes на SHA `3f2afed3eb813cb00bd381d29b084d0e01de048f`, Python 3.14.6 та залежності `uv.lock`, Node 24.22.1 Linux x64, bubblewrap 0.11.0, BPF, USDA SQLite з 13588 записами.
- `app-manifest.json`, `runtime-manifest.json`, `manifest.json`, `SHA256SUMS`: побайтові хеші, версії, розміри. У пакеті немає власного синтетичного профілю, чернеток, медіа, ledger або ключів.
- Початкові ліцензії Hermes, Python, Node та bubblewrap лишаються у публічному runtime. Склад ОС-залежностей зафіксований через `dpkg-query`. Сумісність host libc/libcap/libseccomp треба перевірити на етапі B; копіювати системні бібліотеки поверх чинних не дозволено.

Відтворення у чистому Linux: `server/trainer/hermes.Dockerfile`; доказ ізоляції: `scripts/hermes-linux-isolation-test.mjs`; справжній Hermes з підставним провайдером: `scripts/hermes-gateway-test.mjs`; кандидат unit: `scripts/hermes-systemd-ci.mjs`.

Після зеленого CI завантажити артефакт `hermes-public-runtime` точного SHA. На Node з `.nvmrc` виконати `npm run build:hermes-off`, потім `python3 scripts/hermes-package.py <каталог-runtime> <новий-каталог-пакета>`. Скрипт відхиляє незакомічений код, локальні `.env`, неправильний build receipt, небезпечні шляхи/посилання та невідповідність хешів. Це збірка, не інсталятор.

Карта майбутнього встановлення: `app/` у новий `/opt/scisense/releases/<SHA>`; `runtime/hermes` у `/opt/scisense/hermes`; `runtime/python` у `/opt/scisense/python`; `runtime/node` у `/opt/scisense/node`; індекс у `<release>/data/foods-v1-reviewed.sqlite`; BPF у `<release>/server/trainer/worker-seccomp.bpf`. Публічний source і Python зібрані одразу під цими абсолютними шляхами, їх перевіряє Linux-прогін. Пакет `isolation/bwrap` має відповідати `/usr/bin/bwrap` за SHA; встановлення цього файла потребує окремого операційного дозволу.

## Ізоляція та межі CI

Фактичний ресурсний прогін із підставним провайдером:9,428с; під candidate systemd:9,370с, пік311238656 bytes, OOM0. Це не час відповіді Sonnet. Node і Hermes разом: 2 CPU, 2 GiB, swap0; один активний turn, 45 секунд, до 3 викликів Sonnet, 4096 output tokens на виклик. Groq має незалежний timeout45 секунд; запис до90 секунд.

Дочірній Hermes працює без provider key, без host network і без доступу до Node state/credentials. Окремі user/net/pid/mount namespaces, read-only source/Python/контекстні файли профілю, лише власні profile/work каталоги для запису. BPF забороняє зміну namespaces/mounts/ptrace; clone3 повертає ENOSYS, звичайні потоки працюють. Symlink/hardlink у writable-каталогах відхиляються. У probe є позитивна перевірка та навмисне вилучення network/seccomp захистів, які мають дати FAIL.

Ресурсні й аварійні прогони CI запускають зовнішній контейнер як UID10001 без capabilities, host mounts, published ports і мережі. Для вкладеної ізоляції дозволено її налаштування у зовнішньому контейнері; саме дочірній BPF і namespace є перевірюваною межею. Host sysctl не змінюється. Окрема перевірка systemd потребує privileged зовнішнього контейнера з PID1=systemd у тимчасовому CI-середовищі. Він має network=none, без host bind mounts і published ports; сам candidate unit усередині працює як scisense без capabilities, що перевіряють ExecStartPre canaries. Привілейований контейнер є тестовою конструкцією CI й не переноситься на сервер. [Офіційні пояснення Docker-параметрів для вкладеної ізоляції](https://github.com/moby/buildkit/blob/master/docs/rootless.md).

Ubuntu24 host у першому прогоні відхилив налаштування loopback; Ubuntu22 host пройшов цей етап, але Docker masked `/proc` зупинив новий procfs. Тестова конфігурація враховує обидві умови. Це не доводить сумісність із MS-WEB. Перед увімкненням потрібен такий самий синтетичний probe саме під його kernel/AppArmor/systemd. Заборонено автоматично вимикати AppArmor, змінювати sysctl, додавати capabilities чи збільшувати ресурси.

Кандидат unit: `deploy/hermes/scisense-api.service`. Відмінності від чинної служби: CPU200%, Tasks128, приватний RuntimeDirectory, AF_NETLINK для внутрішнього loopback, `ProtectKernelTunables=false`, `ReadOnlyPaths=/sys` та `BindReadOnlyPaths=/sys`. NoNewPrivileges, порожній capability set, ProtectSystem/ProtectHome/PrivateDevices/ProtectKernelModules/ProtectControlGroups збережені. Перевірка відбувається у власному одноразовому CI-контейнері із systemd, не на сервері.

`ProtectKernelTunables=true` створює підмонтування над частинами `/proc`, які стають locked після переходу в менш привілейований user namespace. Через них kernel відхиляє вкладений procfs без привілеїв. Контрольний A/B у CI617c0e7 довів причину: початковий варіант не пройшов, зміна лише цього параметра дала успішний turn9,459с. Той CI залишився червоним; підмінений варіант не був автоматично прийнятий. [Код systemd](https://github.com/systemd/systemd/blob/v255/src/core/namespace.c#L118), [перевірка Linux](https://github.com/torvalds/linux/blob/v6.8/fs/namespace.c#L4981).

| Варіант | За | Проти |
| --- | --- | --- |
| Залишити `ProtectKernelTunables=true` | Додаткове приховування kernel metadata і mount-заборона запису | Підтверджено блокує приватний procfs Hermes; функція не запускається |
| `false` + явне read-only bind `/sys`, непривілейований UID і нуль capabilities | Сумісно з вкладеним sandbox; прямі canaries перевіряють заборону відкриття proc tunables на запис | Захист не тотожний попередньому: `/proc/kallsyms` не прихований цим прапорцем, proc-запис залежить від DAC/UID/capabilities |
| Додати привілеї чи прибрати дочірню ізоляцію | Може обійти помилку mount | Порушує погоджену межу безпеки; відхилено |

Рекомендований другий варіант: зберігає непривілейований worker і дає перевірюваний запуск. Canaries працюють у самій службі, перевіряють UID10001, порожні effective/permitted/ambient capabilities, NoNewPrivileges, `/sys` read-only та відмову `open(O_WRONLY)` для `/proc/sys/kernel/hostname` і `/proc/sysrq-trigger`. Жоден kernel value не записується навіть при несправному захисті. Конфігурацію на реальному host має окремо підтвердити етап B; автоматичне послаблення заборонене.

Окремий canary виявив, що одного `ReadOnlyPaths=/sys` у systemd255 усередині контейнера недостатньо: автоматичний bind sysfs від ProtectControlGroups може отримати MOUNT_SKIPPED і пропустити RO postprocess. Явний `BindReadOnlyPaths=/sys` примушує застосований recursive bind. Перевірка відкриває `/sys` лише для читання й звіряє `mnt_id` дескриптора з конкретним рядком mountinfo; порядок рядків не використовується. [Парсер systemd](https://github.com/systemd/systemd/blob/v255/src/core/load-fragment.c#L5243), [застосування bind](https://github.com/systemd/systemd/blob/v255/src/core/namespace.c#L1682), [Linux fdinfo](https://man7.org/linux/man-pages/man5/proc_pid_fdinfo.5.html).

Після аварії Node без підтвердженого завершення старого worker його чужий PID namespace не вважається мертвим. Очищення лишається заблокованим до штатного lease TTL, максимум300 секунд, із повтором незалежного таймера. Це не повторює inference і не приймає нову їжу до завершення очищення. З підтвердженим exit wrapper звільняє лише точний terminal/interrupted holder штатним CAS-методом Hermes.

Зашифрована копія попереднього API-контексту має автентифікований абсолютний строк30 днів. Startup/read/таймер прибирають прострочену копію; поточний кураторський контекст і content-free receipts зберігаються. Повернення старої копії не перезапускає її строк.

## B1. Наступний можливий дозвіл, лише читання

Потрібне окреме погодження Юрія на одноразове читання MS-WEB, приватного профілю та поточного ledger. До нього всі дії нижче тільки план.

1. Перевірити OS/arch/glibc, systemd, поточний unit, порт8787, вільні RAM/disk, kernel userns/AppArmor. Перевірити досяжність попереднього приватного Firebase-інциденту, не оголошувати його закритим за локальним тестом.
2. З’ясувати фактичного єдиного writer наявного Hermes-профілю та канал Telegram. Підготувати список тільки потрібного curated context. Без автоматичного перенесення історії, токенів, `.env`, skills, MCP, sessions або чужих platform credentials.
3. Прочитати metadata поточного ledger/receipt/anchor, залишок чинного $5 та reservations. Сума й історія не обнуляються. Перевірити актуальні тарифи й Groq Free у відповідному обліковому записі.
4. Показати точний список змін B2, склад приватного контексту, зашифровану резервну копію та спосіб відкоту. Якщо host не підтримує перевірений sandbox, зупинитися з конкретним варіантом, не послаблювати політику мовчки.

## B2. Перенесення після окремого погодження

Погодження B1 не дозволяє B2. Зняти зашифровану резервну копію поточних ledger/anchors, правил/релізу, curated context та deletion manifest. Зупинити попередній writer, перевірити відсутність процесу й lock ownership. Поставити публічний runtime, перевірити хеші й негативні canaries; поки без живих API і приватного контексту.

Створити curated profile тільки з погоджених файлів та фіксованого `hermes-config.json`. API-owned контекст зберігається окремо; його може змінити лише явне «Запам’ятати». Підготувати platform key32bytes у секрет-сторі; derive state/context/native різними доменами. Секрети передавати через stdin, на сервері лише `systemd-creds` encrypted store; `LoadCredentialEncrypted=trainer-state:...`, існуючі імена `groq` і `anthropic`. Жодного значення у argv, Git, URL або UI. Credentials directory строго `/run/credentials/scisense-api.service`.

Поточний ledger залишається тим самим. Окрема `trainer-activation.json` зв’язує release/config hash, owner/profile, старий receipt, cap5000000, погоджені тарифи та підтверджені context migration/single writer/privacy gate. Runtime не провізіонує відсутній контекст, не створює новий бюджет і не підвищує cap. Встановлений пакет лишається вимкненим.

## C. Активація після окремого погодження

1. Сумісні правила v2/v3, notes off. Старий клієнт продовжує працювати.
2. Новий перевірений UI та fallback, що показує notes і неповні підсумки. Увімкнений чат потребує окремої збірки, адже прапорець UI встановлюється під час build.
3. Лише після доступності UI встановити trusted per-owner minWriter3/notes capability. Після першої нотатки відкат до клієнта, який її приховує, заборонений.
4. Увімкнути owner-only trainer за новим receipt і погодженою policy12/min,80/hour,120/day. Наявний ledger спільний з legacy/Groq, жодного паралельного writer або прихованого `/analyze` fallback.
5. Виконати погоджений H11 із синтетичними даними, потім телефон Юрія з вимкненим Mac, перевірити збереження після reload. Продуктове приймання й 7-денний пілот G09 залишаються за Юрієм.

## Моделі, вартість і живий тест на майбутнє погодження

Groq `whisper-large-v3` для тексту з голосу; Anthropic `claude-sonnet-5-5` для діалогу/фото/пропозицій. На 2026-10-24 офіційна ціна Sonnet: $2 за мільйон input tokens і $10 за мільйон output tokens. [Anthropic Sonnet](https://www.anthropic.com/claude-sonnet-5-5), [документація моделі](https://platform.claude.com/docs/en/models/sonnet-5-5/overview). Groq Free підтверджується знову перед тестом; при вичерпанні безкоштовної квоти автоматичного переходу на оплату немає.

Граничний резерв одного виклику: 32000 текстових bytes, консервативно один token на byte, плюс до20000 image units, плюс4096 output. $0.14496 на виклик, $0.43488 на turn із3 викликами. Пропозиція: **до8 turns /24 викликів, максимум $3.47904 у межах наявного залишку $5**, без автоматичного поповнення чи збільшення. Це верхній резерв, не прогноз середньої ціни. Якщо залишку недостатньо, скоротити тест за погодженням.

Прогон: 1 текстова домашня страва; 2 голос; 3 уточнення ваги; 4 фото читабельної етикетки; 5 конфлікт г/мл з note; 6 питання без додавання; 7 «вчора» з прев’ю дати; 8 явна пропозиція пам’яті без автоматичного commit. Reload/duplicate Add/перечитування/скасування перевіряються без додаткових model turns. Це окремий живий smoke, не заміна всього H02 чи продуктового пілоту.

## Відкат

Спочатку вимкнути нові admission, дочекатися завершення або позначити активні unknown, очистити media/native session за durable job. Не повертати витрачені reservations. Зберегти свіжі notes, markers/rejections, context revision/receipts та зовнішній deletion manifest/anchor. Перемкнути на сумісний read-only UI/API із видимими notes. Старі ledger/history backup не ставити поверх актуальних. Профіль можна повернути попередньому writer лише після доведеного stop нового та перенесення останніх підтверджених context updates. Зворотне копіювання старого приватного snapshot без цього заборонене.
