---
id: card_d3d003c71d10
card_type: convention
title: Картка їжі належить точному повідомленню, збереження показується квитанцією
project: nutrition-app
product: scisense
phase_id: phase_870a15952663
status: open
importance: medium
evidence: .agents/journal/2026-10-27-1210-codex-chat-reliability.md
valid_from: "2026-10-27T10:12:01.544069+00:00"
created_at: "2026-10-27T10:12:01.544069+00:00"
updated_at: "2026-10-27T10:12:01.611135+00:00"
content_hash: "sha256:6ae60e0d5d661c309f9de449094eab7c332d380ce188c977601589d168a8bf8e"
---

Goal objective_e45aa8ac1aa3; G02/G07/G08. Результат: нова розмова йде після старих записів, збережена їжа не виглядає незавершеною формою. Зв'язок тільки через own admission→App inputId/turnId/originTurnIds; Native local_history використовує message_id як alias platform_message_id і стабільний row_id. Не зіставляти за словами чи датою: текст може повторюватися. Один timeline, readonly saved receipt з окремими notes, older ready collapsed; saving/unknown save не ховати. Scroll на останній timeline item. Межа: без Native SQL rewrite, food autosave чи зміни моделей/ресурсів. Доказ:16a7348; src/services/trainerTimeline.js, server/trainer/personal-backend.mjs;137browser checks,344React та actual Native joint28. Продуктове приймання й пілот лишаються pending.
