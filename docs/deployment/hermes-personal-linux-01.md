# HERMES-PERSONAL-01: контракт Linux запуску

Статус: локальна реалізація за погодженим планом; Linux canaries і B1 ще не виконані. Цей документ не є доказом установлених служб. Goal objective_e45aa8ac1aa3, G04/G05/G06/G08/G11 pending.

## Обраний спосіб

| Варіант | За | Проти |
|---|---|---|
| Окремі systemd socket-activated служби | Окремі OS користувачі, один ресурсний ancestor, Node без адміністративних прав | Потрібні guardian, transport shim і незалежний drain proof |
| Дочірні процеси через sudo/delegated cgroup | Ближче до наявного ChildProcess harness | Додаткові постійні права та конфлікт із NoNewPrivileges |
| Один UID для всіх профілів | Найменше конфігурації | Не виконує погоджене OS розділення |

Рекомендовано перший варіант. Привілейований spawn-broker тут зайвий. Власник уже погодив B1/B2/B3; точний адресний runbook і перевірений пакет потрібні до будь-якого host write.

## Межі служб

- API працює від scisense. Native Y/W та спільний payer мають окремі nologin UID. Жодних sudo, polkit або cgroup Delegate прав runtime не отримує.
- Усі API/guardian/Native/payer/relay/helper процеси входять у scisense.slice: CPUQuota=200%, MemoryMax=2G, MemorySwapMax=0. Окремі ліміти служб не замінюють сукупний ліміт. Стара й нова inference-служби не працюють паралельно поза цим ancestor.
- Для кожної lane окремий root-owned AF_UNIX socket, Accept=yes, MaxConnections=1, socket0660. Каталог root:broker0710; broker-group лише в Node. Native/Payer не мають доступу до launcher sockets. Desktop ingress має інші адреси та контракт.
- Supervisor звіряє SO_PEERCRED.uid із Node UID. Node не вважає listening PID1 credentials доказом майбутнього User=Y/W/payer; він перевіряє root-owned canonical pathname і фіксований unit.
- Native бачить readonly pinned source/adapters/Python, власний persistent HOME, порожні HOME/CODEX/XDG/tmp, власні PID/user/mount/net namespaces. Host loopback, чужі профілі, Node state й модельні credentials не монтуються.
- Payer отримує новий порожній actual tmpfs HOME на кожний запуск, credentials лише IPC. Він не має profile homes. Мережа провайдера доступна лише payer, усі POST проходять native auth/HTTPX guard.
- Existing /usr/bin/bwrap root:scisense0750 та точковий AppArmor профіль перевіряються за pin перед використанням. Глобальний AppArmor/sysctl/NoNewPrivileges захист не послаблюється.

## Початок і фізичне завершення

1. Guardian перед Native запуском надсилає bounded attestation зі своєї cgroup, instance/invocation і ролі. Native ще не запущений.
2. Node фіксує directory FD, inode/device та identity root-owned service cgroup. Лише після цього надсилає ACK; guardian може запускати bwrap.
3. Launcher повертає повний transport object до асинхронного connect. Remote lifecycle має явну ознаку: відсутній child.pid не означає notStarted. Після початку activation не допускається синхронний throw, який приховає live unit.
4. EOF/ACK/wrapper exit не є proof. Guardian сигналізує власному child через pidfd або утримує unreaped child identity до завершення сигналізації. Numeric PID/group без identity не використовується для пізнього kill.
5. Node дозволяє replacement/release тільки після перевіреного populated=0 всього зафіксованого піддерева. ENOENT без попередньої identity не є proof. Втрата attestation/drain лишає quarantine, новий turn не починається.
6. Unit має KillMode=control-group, Restart=no й обмежений stop timeout. Independent PID1 watchdog контролює guardian; його власний EOF watcher не покриває SIGSTOP guardian.
7. STDIN/STDOUT явно socket/raw IPC; stderr trusted discard. Native stdout redirect у stderr не повинен потрапити в protocol чи публічний journal.

## Watchdog, media і seccomp

- Guardian heartbeat і PID1 watchdog потрібні також у стані idle. RuntimeMaxSec=300 не застосовується до здорового постійного профілю.
- Для Node потрібен watchdog від його event loop: невеликий власний helper може передавати PID1 READY/WATCHDOG лише після байтів із Node pipe. Якщо Node SIGSTOP, helper не генерує heartbeat самостійно. Він рахується в спільному slice; NotifyAccess обмежений API unit, Native/Payer окремі.
- Payer має незалежний OS deadline для синхронного SDK; JS timer не є єдиною межею при зависанні Node. Усі logical calls/refresh/retry одного turn лишаються в45с/3POST.
- Нові upload/cache файли містяться у private tmpfs, а retained native-inputs лишаються persistent. Імпортовані старі шляхи спочатку перетворюються адресною картою. Вони не ховаються новим mount і не стираються заднім числом.
- Ordinary startup може створювати порожні ephemeral каталоги після reboot. Він не створює missing budget/credential/native/context store або deletion anchors. Поточний personal-runtime медіашлях треба адаптувати до /run до live.
- Ephemeral TTL≤300с має діяти без трафіку, після Node/guardian/worker SIGKILL і при backpressure. Для sweeper враховується інтервал, щоб фактичне видалення не було пізніше300с. SIGSTOP guardian покриває PID1 watchdog.
- Пізній seccomp встановлюється з TSYNC на всі наявні threads і фатальною відмовою при помилці. Peer/asyncio threads створюються до setup. execve/execveat/fork/vfork заборонені, clone3 повертає ENOSYS, clone дозволений лише для thread flags.

## Необхідні Linux докази

- Фактичні cpu.max/memory.max/memory.swap.max ancestor і належність кожного процесу; near-limit фото/replay, memory peak нижче2GiB, OOM0.
- Два OS UID/HOME, підміни socket/path/profile, чужі canary файли та Node keys недоступні; немає shell/fork/exec через thread, який існував до фільтра.
- Handshake до ACK/після ACK, lost attestation, wrapper kill, guardian SIGKILL/SIGSTOP, Node kill/pause, blocked child і saturated IPC.
- Cgroup subtree0 до наступного owner; uncertain state не resubmit; native flock/PID namespace restart зберігає історію/receipt.
- Tmpfs identity, TTL після idle/kill/parent loss, без raw disk файлів; clean bootstrap після reboot з тим самим durable ledger.
- Перевірка на фактичному MS-WEB після CI за адресним runbook. Немає автоматичного збільшення ресурсів чи оплачуваного fallback.

## Джерела та рев’ю

Context7 monthly quota вичерпана; прочитані primary [systemd.socket255](https://www.freedesktop.org/software/systemd/man/255/systemd.socket.html), [resource control255](https://www.freedesktop.org/software/systemd/man/255/systemd.resource-control.html), [kernel cgroupv2](https://docs.kernel.org/admin-guide/cgroup-v2.html), pinned gateway/runtime_ownership.py та власний internal-process.mjs. Для реалізації syscall/notify додатково звірити відповідні man pages.

Архітектурне personal_contract_review виявило P1 про !pid→notStarted для UDS; прийнятий двофазний startup і remote lifecycle. Додані вимоги pidfd, peer trust, PID1 watchdog/SIGSTOP, explicit stdio і TSYNC. Нових P1 дизайну рев’юер не бачить. Це не приймання реалізації, canaries чи хоста.
