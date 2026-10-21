---
id: card_0a9d61a0b5eb
card_type: gotcha
title: Whisper large-v3-turbo не проходить 45s на 1 або 2 CPU Linux
project: nutrition-app
product: scisense
phase_id: phase_870a15952663
status: open
importance: high
signal: verification
evidence: .agents/journal/2026-10-21-1336-codex-gpt-6-local-server-implementation.md; docs/evidence/linux-whisper-2cpu-preparation-2026-10-21.json; docs/evidence/linux-whisper-2cpu-diagnostic-2026-10-21.json; docs/SCISENSE-SERVER-PREPARATION.md
valid_from: "2026-10-21T13:47:18.520657+00:00"
created_at: "2026-10-21T13:47:18.520657+00:00"
updated_at: "2026-10-21T15:14:16.054859+00:00"
author: Codex
content_hash: "sha256:98e798bb90bd45cb94703082a15dc0156ee548da9adf24ce225b3b20b49bf177"
---

Goal objective_e45aa8ac1aa3, G05/G07/G08/G11. Голос має завершуватися до таймауту. Baseline1CPU та погоджений2CPU CI39620593130:0/6 UA/RU5/30/90s, усі timeout45s;2CPU/2GiB підтверджені,peak774MiB,4controls/cleanupPASS. Diagnostic39622898172: CLI прочитав усі160044bytes, CPU89695ms за45058ms, stdin не завис; coldinit/inference окремо не виміряні. STT-SMALL-01: запропоновано small-q5_1 у тих самих лімітах, ще не погоджено/не завантажено. До наступного повного тесту перевірити ризик stdout reopen. ProductionCPU1, keys/$5/server0, Sonnet незмінний. MS-WEB/телефон не перевірені.
