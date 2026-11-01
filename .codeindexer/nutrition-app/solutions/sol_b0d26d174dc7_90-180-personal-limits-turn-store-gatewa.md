---
id: sol_b0d26d174dc7
problem: "Після підняття межі обробки тренера з 90 до 180 с (PERSONAL_LIMITS, turn-store, gateway, internal-process, payer, worker-lock.c) CI-перевірка hermes-resource-check падає: перший хід у systemd-контейнері одразу стає failed. Юніт-тести K18 зелені."
created_at: "2026-11-01T12:31:27.488829+00:00"
project: nutrition-app
category: troubleshooting
error_signature: "hermes-resource-check: syntheticStage native-web-turns, actual 'failed' expected 'completed'"
author: claude-opus-5-5
tags: [trainer, deadline, hermes, 1.9.10, ci, python]
---

Межа часу ходу живе в чотирьох шарах, а не в одному: JS (`server/trainer/personal-limits.mjs` і похідні), Python платник (`hermes_personal_payer.py` invoke `timeout_ms <= 180000`), Python захист HTTP моделі (`hermes_personal_egress.py` HTTPXEgressGuard `0 < deadline_seconds <= 180`) і Python IPC (`hermes_personal_ipc.py` `Peer.ask(timeout=180)`, воркер кличе без явного timeout). Платник передає весь залишок дедлайну в HTTPXEgressGuard, і при залишку понад стару межу той кидає `model_payload_invalid` ще до HTTP, тому хід `failed`. Виправлено в `85e583a`, тести в `hermes_personal_egress_test.py` і `hermes_personal_ipc_test.py`. Egress-тест локально не йде (немає `openai`), доказ лише CI `scripts/hermes-personal-owner-check.py` і hermes-resource-check.

**Dead end tried:** Пошук залишків `git grep -nE '\b90000\b'`: на цій macOS `git grep -E` не розуміє `\b` і нічого не знаходить; брати `git grep -nwE '90|90000'`. Тест K18 перевіряв лише рядки 90000/225000 у п'яти файлах і не бачив `<= 90` у секундах.

**Evidence:** 85e583a; Codex-ревʼю 2026-11-01 P1/P2; server/trainer/hermes_personal_egress.py:204, hermes_personal_ipc.py:79
