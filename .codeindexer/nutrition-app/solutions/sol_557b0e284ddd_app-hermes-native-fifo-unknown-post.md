---
id: sol_557b0e284ddd
problem: "Після скасування App-спроби Hermes Native FIFO лишається заблокованим: стара unknown-спроба стоїть головою, нові входи чекають і не роблять жодного модельного POST."
created_at: "2026-10-26T23:25:23.370424+00:00"
project: nutrition-app
category: troubleshooting
updated_at: "2026-10-26T23:26:18.828221+00:00"
author: Codex
tags: [hermes, native-fifo, cancellation, no-replay, javascript]
---

Стан App cancelled не доводить Native terminal. cancelNativeInput перечитує і перевіряє незмінний UID/input/birth-session binding. Queued скасовується prompt.cancel. Started переривається, глобальна черга утримується до фізичного завершення процесу; далі холодне відновлення того самого входу. Unknown вирішується лише з точним execution_generation і доказом session.resume, що інших pending немає. Спершу скасувати queued-хвіст, потім unknown-голову: resolve_unknown одразу запускає наступний вхід. Maintenance не вирішує unknown; lost ACK ніколи не дозволяє resubmit. Невдале скасування зберігає cleanup-job, UI блокує Send до підтвердження. Read-only RPC whitelist не розширюється.
