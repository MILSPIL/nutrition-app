---
id: card_9cb29409bd85
card_type: todo
title: gateway close() чекає settleTask
project: nutrition-app
product: scisense
phase_id: phase_870a15952663
status: open
importance: low
complexity: low
tags: [trainer, gateway, 1.9.10-followup]
links: [{to: card_2dd56dd19701, kind: related}]
evidence: docs/superpowers/specs/2026-10-31-trainer-unblock-photos.md (розділ «Після ревʼю spec-reviewer»)
valid_from: "2026-11-01T17:23:14.913865+00:00"
created_at: "2026-11-01T17:23:14.913865+00:00"
updated_at: "2026-11-01T17:23:14.958925+00:00"
content_hash: "sha256:6c97f8f97e3b74d21549049b10918f2d033dc04d119c3811b01f2c917b59e435"
---

Goal objective_e45aa8ac1aa3, G07. `server/trainer/gateway.mjs:577-590`: `close()` не чекає `settleTask`, тож нативна зупинка, що вже йде (до 90 с), може тривати після закриття шлюзу. Результат для Юрія: зупинка сервісу не лишає незавершених записів. Межа: лише порядок завершення в close(), без зміни логіки settleStalled. Доказ: тест «close() під час утриманого cancelInput закінчується без записів у store після закриття» (червоне до коду). Знайдено spec-reviewer 1.9.10 (💭), помилки зараз ловляться.
