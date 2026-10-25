---
id: sol_784d7fb2be53
problem: Hermes 3f2 native GatewayRunner.stop() може повернутися нормально з живими writer; process_ownership.reserve(home) є process-global та ідемпотентний. Повторний owner у тому самому процесі або ручний close_all_under/release після stop можуть закрити чужі DB й відпустити fence зарано.
created_at: "2026-10-25T21:34:25.154783+00:00"
project: nutrition-app
category: troubleshooting
tags: [hermes, ownership, single-writer, ipc, timeout, shutdown]
---

Один PersonalOwner на весь процес; guard до будь-яких глобальних provider/tool/config змін. Wrapper не викликає close_all_under чи process_ownership.release: native вирішує безпечне DB close, а OS fence тримається до фізичного exit. Parent замінює owner лише після await process.close(), який також чекає фактичного завершення parent model/tool callbacks. EOF/ACK/AbortSignal не є доказом settlement. Native timeout надсилає cancel, parent має власний bounded callback deadline, stderr pipe постійно discard-drain. Доказ5012072: docs/evidence/hermes-personal-owner-2026-10-25.json;12Python/9actualNativeIPC/11Nodefailure/3Peer tests; independentreviewPASS. Payer/publiccoordinator/live цим не прийняті.
