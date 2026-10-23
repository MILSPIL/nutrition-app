---
id: card_e0c45bb18c67
card_type: bug
title: Виправити доступ клієнта й тренера після локальної перевірки
project: nutrition-app
product: scisense
phase_id: phase_81834b87789c
status: open
importance: high
signal: verification
review_required: true
acceptance: "[{\"reviewer_rubric\":\"Goal objective_e45aa8ac1aa3, G04/G06/G07/G08: виконано A01–A09 погодженої специфікації; є реальні emulator/UI докази, атомарність і revoke; незалежний reviewer дав done. Погодження плану й SHA записані. Ця картка не закриває весь Goal.\"}]"
evidence: .agents/journal/2026-10-21-1336-codex-gpt-6-local-server-implementation.md; docs/evidence/trainer-protocol-preparation-2026-10-21.json; docs/evidence/trainer-ui-preparation-2026-10-21.json
valid_from: "2026-10-20T08:28:35.837887+00:00"
created_at: "2026-10-20T08:28:35.837887+00:00"
updated_at: "2026-10-21T13:47:28.114190+00:00"
author: Codex
content_hash: "sha256:758fb70adb4687727dd62d8fa66fd860e7664134c162e9eaf098c2763d144f2a"
---

Goal objective_e45aa8ac1aa3, G04/G06/G07/G08. Юрій погодив реалізацію доступу через CLOUD-PREP-01 2026-10-21, потім обрав локальний сеанс. Внесок: зв'язок клієнта/тренера тільки за канонічною згодою, атомарні accept/revoke, відкликані дані зникають із UI. Реалізовано у codex/scisense-server-prep: protocol1015846 і UI faf7e79. Local rules29/29, app99/99, 3-account headless request/accept/revoke/reconnect/outsider PASS; незалежні protocol/UI reviewers done. Межа: лише синтетичні дані, live Firebase не змінено. Закриття картки після перевірки A01–A09 на фінальному інтегрованому SHA; G04 продукту не означає production PASS. Старі зв'язки без proof потребують reconnect після майбутнього rollout.
