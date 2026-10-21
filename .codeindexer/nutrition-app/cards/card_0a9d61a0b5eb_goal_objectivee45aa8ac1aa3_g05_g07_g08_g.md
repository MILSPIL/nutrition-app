---
id: card_0a9d61a0b5eb
card_type: gotcha
title: Whisper large-v3-turbo не вкладається у 45s на одному CPU Linux
project: nutrition-app
product: scisense
phase_id: phase_870a15952663
status: open
importance: high
signal: verification
evidence: .agents/journal/2026-10-21-1336-codex-gpt-6-local-server-implementation.md; docs/evidence/linux-whisper-preparation-2026-10-21.json
valid_from: "2026-10-21T13:47:18.520657+00:00"
created_at: "2026-10-21T13:47:18.520657+00:00"
updated_at: "2026-10-21T14:49:41.968079+00:00"
author: Codex
content_hash: "sha256:7c3ed6757ddfb323431bbf31598311e8f6fef1c13e9c17bbf42f28b4fbeddac4"
---

Goal objective_e45aa8ac1aa3, G05/G07/G08/G11. Результат для користувача: голос має встигати до таймауту. Linux baseline c0c334b: усі 6 UA/RU fixtures 5/30/90s timeout 45017–45046ms при 1CPU/2GiB, peak795–811MB, без OOM; negative controls/cleanup PASS. 2026-10-21 Юрій прямо погодив окрему синтетичну пробу тієї самої моделі на 2CPU, 2GiB,45s у GitHub CI; її результат ще очікується. Production CPU1 не змінюється, ключі/$5/сервер не використовувати. Інших змін моделі/ресурсів/таймауту не погоджено. MS-WEB не вимірювався.
