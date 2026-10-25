# HERMES-HOST-01: точковий дозвіл sandbox на MS-WEB

Стан 2026-10-25: Юрій явно погодив HERMES-HOST-01 і продовження розгортання. Дозвіл зафіксовано; встановлення ще не почалося. Чинний реліз9f2759b та служба залишилися активними. Модельних викликів у цій перевірці0. Бюджет прочитано без змін: зарезервовано531788 мікродоларів, залишок4468212 із5000000.

## Підстава

Mac розблокований, Keychain через бібліотеку keyring доступний. Погоджений тимчасовий scisense-voice створено для адресної перевірки. На Ubuntu24.04 glibc2.39/systemd255/AppArmor4.0.1 параметр `kernel.apparmor_restrict_unprivileged_userns=1`, профілю bwrap немає. Проба від scisense не змогла записати uid_map у дочірньому user namespace. bwrap ще не встановлений, тому це не тест фінального Hermes runtime. [Доказ](../evidence/hermes-host-preflight-2026-10-25.json).

[Офіційна документація Ubuntu](https://documentation.ubuntu.com/release-notes/24.04/#unprivileged-user-namespace-restrictions) описує цю поведінку й окремий профіль для застосунків, яким потрібні user namespaces. Погоджений [runbook](hermes-coach-02.md) вимагає: «При несумісності host зупинитися; AppArmor/sysctl/capabilities й ресурси не послаблювати». Нове право створення user namespaces потребує конкретного рішення; попередній дозвіл на розгортання не запитується повторно.

## Варіанти

| Варіант | За | Проти |
| --- | --- | --- |
| Окремий профіль bwrap для SciSense та executable0750 | Зберігає глобальне обмеження, наявний сервер і перевірений пакет; доступ до binary лише root/scisense | Додає службі доступ до user namespaces; потрібні справжні host canaries, сумісність ще не доведена |
| Залишити поточний реліз | Захист і працююча стара версія не змінюються | Новий тренер не запускається, довантажений код лишається локальним |
| Окремий сервер для Hermes | Окрема межа ризику від інших сайтів | Нова інфраструктура, оплата й новий план розгортання; надмірно для поточного приватного пілоту |

Рекомендую перший варіант: обмежене право потрібне власному sandbox, збережені наявний бюджет, моделі й ресурси. Другий не досягає задачі, третій додає зайву інфраструктуру. Глобальне вимкнення AppArmor/userns restriction, запуск worker із root/capabilities або без sandbox не пропонуються.

## Точна зміна

- Публічний binary bubblewrap0.11.0 з уже перевіреного пакета: SHA256 `e04f6bb9ac71ed7b39e4ec7ef9ede00a562711f5d35414cbe84caa8865b47824`. Новий `/usr/bin/bwrap`, owner root, group scisense, mode0750, без setuid/setgid/file capabilities. Якщо файл з’явиться до встановлення, зупинитися й звірити; нічого поверх нього не писати.
- Новий `/etc/apparmor.d/scisense-bwrap`, owner root:root, mode0644. Вміст точно з [кандидата](scisense-bwrap.apparmor), SHA256 `4cf4112db08b7a5b1bfd9101bfe11bb3353c3f408b99222c5b1b455c16fd9134`.
- Завантажити лише цей новий профіль, не виконувати загальне перезавантаження AppArmor і не заміняти наявні профілі. До цього перевірити відсутність конфліктного attachment для `/usr/bin/bwrap` й імені scisense-bwrap у файлах та kernel policy.
- Профіль має `flags=(unconfined)` і `userns,`. Це цільовий дозвіл створення namespace, не повний AppArmor allowlist файлового/мережевого доступу. Файлові, мережеві й системні обмеження дочірнього Hermes забезпечують чинні bubblewrap, seccomp та systemd; їх не прибирати.
- `kernel.apparmor_restrict_unprivileged_userns` залишається1. Binary доступний лише root і службовій групі scisense. Перед застосуванням повторно звірити всіх користувачів із primary/supplementary group scisense; очікується тільки службовий користувач, стороннього доступу не додавати.
- Право отримує будь-який процес користувача scisense, який запускає цей binary, а не лише один systemd unit або зафіксований набір аргументів. Тому перевірка executable0750, складу групи та незмінного root-owned binary є обов’язковою.
- Дозвіл діятиме постійно лише поки встановлений цей sandbox. При відмові host canaries або відкаті прибрати саме цей новий профіль і binary після зупинки його власних процесів. Тимчасовий адміністратор не стає постійним.

Синтаксис уже перевірений встановленим parser4.0.1 через `--skip-kernel-load --skip-cache`: exit0, список завантажених профілів до/після однаковий. Це не встановлення й не доказ працездатності Hermes.

## Виконання після погодження

1. Відновити дозволений тимчасовий доступ, звірити актуальний host, UID/GID, старий release/службу/ledger і відсутність сторонніх змін. Зберегти адресну зашифровану резервну копію конфігурації й metadata; ledger не відновлювати поверх свіжих витрат.
2. Установити перевірені public runtime та новий неактивний releasecd7b02d. Чинні current/public/service не перемикати. Установити лише описані binary/профіль, повторити хеші, права, відсутність file capabilities, sysctl1 і kernel attachment.
3. Запустити окремий тимчасовий systemd unit для синтетичної перевірки: UID/GID scisense, ті самі2CPU/2GiB/swap0, порожні capabilities, NoNewPrivileges, read-only/sys та інші параметри кандидата. Жодних production credentials; тільки підставний провайдер, зовнішній мережевий доступ проби заблокований. Явно перевизначити окремі StateDirectory/RuntimeDirectory та ReadWritePaths синтетичної служби, не успадковувати production credential drop-in; чинну службу не зупиняти.
4. Parent canary звіряє фактичний UID scisense996, а не fixtureUID10001 з CI. У діагностичній копії змінити тільки очікуваний UID/вивід, зафіксувати diff/hash; позитивні й негативні перевірки не послаблювати. Довести відсутність capabilities, NoNewPrivileges, видимий/sys read-only, відмову відкриття kernel tunables на запис, незалежну мережу, недоступність host state/credentials, seccomp/namespace/thread checks та фактичний синтетичний Hermes turn у45с.
5. Якщо хоч одна перевірка відмовляє, не переходити до live. Зберегти діагностику без секретів, прибрати власний probe unit/profile/binary, підтвердити старий сайт і параметри захисту. Не збільшувати ресурси й не підбирати нові послаблення автоматично.
6. Лише після успіху продовжити вже погоджений runbookHERMES-COACH-02: сумісні rules/UI, приватний encrypted context і credential store, старий ledger, owner-only activation, живі проби в залишку того самого$5. Після перевірки відкликати адміністратора.

## Доказ після встановлення

Хеші й mode/owner binary/profile; global restriction1; прив’язка профілю до exact binary; відмова запуску для непричетного непривілейованого користувача; parent/nested canaries; позитивний turn і очікувані негативні проби; unchanged ledger до live; чинний/новий release; cleanup/revoke. Синтаксичний PASS не замінює ці докази.

## Незалежне рев’ю

Codex host_profile_review перевірив конкретний документ, profile та evidence читанням: PASS, відкритих P1/P2 немає. Уточнення про всі процеси UIDscisense і окремі StateDirectory/RuntimeDirectory без production credential drop-in внесені. Це приймання плану дозволу, не фактичного runtime чи продукту.
