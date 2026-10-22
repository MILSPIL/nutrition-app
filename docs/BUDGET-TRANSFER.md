# Перенесення чинного бюджету й credentials

2026-10-22. NTZG-DEPLOY-02, Goal `objective_e45aa8ac1aa3`, G07/G08/G11. Цей CLI підготовлений для майбутнього окремо погодженого перенесення. Підготовка та тести використовують лише синтетичні дані. Реальний Keychain, бюджет $5 і сервер не запускалися.

## Поточний дозвіл, 2026-10-23

Юрій дозволив потрібне перенесення/активацію для ранкової проби в MORNING-READY-01. Повторний дозвіл на C не потрібний; технічні передумови Free/ZDR, exact release/UID, підготовлений root transport і збереження одного бюджету залишаються. Операційний adapter використовує вузький sudo через тимчасового admin, а не новий root SSH. Canonical budget поки не існує; первинне створення можливе лише після документованої перевірки всіх джерел історії. Старі написи про майбутнє погодження нижче описують стан підготовки 22.10, не нову вимогу до Юрія.

## Контракт

Один чинний SQLite ledger, proposal v2/configHash і спільний lock усіх checkout. `export` потребує наявного ledger та відповідної позначки Keychain. Він не створює новий бюджет і не видаляє старі витрати. Запущена лабораторія або stale lock спричиняють відмову до зміни позначки; CLI не надсилає сигналів довільним PID.

До створення bundle `prepareTransfer` записує й перечитує постійну позначку передачі. Вона назавжди блокує локальні live-запуски цього пілоту. Після цього помилка не скидає позначку. Bundle містить SQLite та transfer.json, має права 0700/0600 і не містить модельних ключів.

`send` звіряє receipt із постійною позначкою, hash/counts і попередню перевірку приймача. Лише потім читає два ключі з Keychain. Передає пакет через stdin SSH; argv, stdout і повідомлення помилок не містять ключів. Host key має бути заздалегідь перевірений у відомому файлі. SSH працює без пароля/TTY, без forwarding, без автоматичного прийняття нового host key; автентифікація через уже погоджений SSH agent. Інструмент не створює акаунтів, sudo-прав або доступу.

Приймач працює від root тільки після окремого дозволу. Він перевіряє вимкнений manifest із точним release SHA, неактивну службу, відсутність activation/drop-in/credentials і порожній або відсутній StateDirectory. Пакет обмежений 8 MiB; SQLite обмежений 4 MiB. Перевіряються proposal, cap, hash, counts та receipt усередині SQLite.

Ключі шифрує `systemd-creds --with-key=host` зі stdin з umask 0077, із прив’язкою до імені credential. На диск потрапляють лише ciphertext. Перед підтвердженням файли стану й ciphertext синхронізуються з диском. Новий стан атомарно замінює лише порожню директорію, створену systemd; наявний ledger не перезаписується. Credentials копіюються з `COPYFILE_EXCL`, зокрема між різними файловими системами. Приймач лишає activation.pending.json, не створює activation.json/live drop-in і не запускає службу.

Після звичайної помилки власні staging-файли прибираються. Аварійне завершення процесу може залишити import.lock або staging, що потребує ручної звірки. Повторний імпорт не видаляє та не замінює їх.

## Майбутня операція після погодження

Наведені команди зараз не виконувати. Перед ними мають бути підтверджені backup, адресний SSH-доступ, приватний install-manifest, release SHA та дозвіл на читання/передачу ключів. Значення ключів не вводяться в аргументах.

1. Зупинити локальну лабораторію її штатним способом і перевірити завершення запитів. Не видаляти lock автоматично.
2. Із погодженого checkout виконати `node server/transfer-cli.mjs export --source <абсолютний-шлях-чинного-ledger> --bundle <нова-приватна-тека> --approved-transfer`.
3. Підготувати поза Git приватний transport JSON 0600: `host`, `user`, `port`, `knownHostsFile`, `releaseId`. Він не містить модельних ключів. Host key перевіряється окремо, `releaseId` дорівнює SHA встановленого вимкненого manifest.
4. Виконати `node server/transfer-cli.mjs send --bundle <та-сама-тека> --transport <приватний-JSON> --approved-transfer`.
5. Звірити отримані receiptId, releaseId, consumedMicros і reservedCalls. Активація та модельний тест є наступною окремо погодженою операцією.

`--help` не читає Keychain і не підключається до сервера. Наявність CLI або прапорця в прикладі не є дозволом на перенесення.

## Перервана передача та ручна звірка

Читальна команда після окремого дозволу: `node server/transfer-cli.mjs status --transport <приватний-JSON> --approved-transfer`. Вона використовує той самий перевірений SSH, не читає Keychain, не розшифровує credentials, не створює lock і не змінює ledger. Виводить лише стан, receipt/hash/counts та наявність файлів. `snapshotMatches` порівнює початковий переданий snapshot; після справжніх нових витрат він може бути false, тому не є підставою для відкату SQLite.

| Фаза | Що означає | Дія |
| --- | --- | --- |
| `not_installed` | Немає стану або StateDirectory порожній, credentials відсутні | Звірити bundle/marker. Після погодження повторити send того самого bundle |
| `ledger_only` | Ledger збережено, credentials не встановлені | Зберегти всі файли, звірити receipt/counts; підготувати адресне відновлення на погодження |
| `partial_credentials` | Ledger і один ciphertext | Так само, не видаляти ledger або ciphertext і не повторювати export |
| `staged_unacknowledged` | Ledger і два ciphertext; підтвердження могло загубитися | Звірити receipt/hash/counts, manifest і неактивність служби; цей статус сам не підтверджує розшифрування чи дозвіл на активацію |
| `credentials_without_ledger` або відмова | Неузгоджений чи пошкоджений стан | Зупинитися, зберегти докази та підготувати окремий план відновлення |

`requiresReconciliation` завжди true: команда нічого не приймає автоматично. `importLockPresent`, будь-яка activation/drop-in або активна служба також потребують розбору перед продовженням. Звірити receiptId/configHash із локальним transfer.json і постійною позначкою, а витрати та кількість резервувань із receipt і high-water anchor. Якщо файли не читаються або значення розходяться, не вважати передачу успішною.

Заборонено в рамках recovery: видаляти ledger/anchor, очищати позначку передачі, повторно ініціалізувати $5, повертати старий snapshot або вмикати API. Ручне відновлення конкретних файлів потребує нового адресного плану та дозволу. Приймач навмисно відмовляє повторному імпорту поверх стану.

## Перевірки й джерела

`node --test server/*.test.mjs` включає happy path, current paid+free rows, shared/stale lock, marker read-back failure, перерваний upload, hash/receipt mismatch, missing keys, partial encryption/install, lost ack, повтор, symlinks, fsync failure, restart і rollback. Жодного модельного виклику. Справжній CLI receive із systemd-creds додатково пройшов наскрізний Linux-тест у disposable Docker; [SYSTEMD-VALIDATION](SYSTEMD-VALIDATION.md).

Context7 вичерпав місячну квоту. Використані офіційні [systemd credentials](https://www.freedesktop.org/software/systemd/man/255/systemd.exec.html), [systemd-creds](https://www.freedesktop.org/software/systemd/man/255/systemd-creds.html), [SSH](https://man.openbsd.org/ssh.1) і [Node filesystem](https://nodejs.org/docs/latest-v24.x/api/fs.html).
