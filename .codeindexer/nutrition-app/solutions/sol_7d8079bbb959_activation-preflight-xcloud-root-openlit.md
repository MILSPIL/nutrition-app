---
id: sol_7d8079bbb959
problem: "Activation preflight у xCloud помилково вимагав root-власника всіх конфігів OpenLiteSpeed і повертав directory_guard, хоча файли штатно належали окремому користувачеві панелі."
created_at: "2026-10-23T09:24:57.144732+00:00"
project: nutrition-app
category: deployment
author: Codex
tags: [xcloud, openlitespeed, ownership, activation, recovery]
---

Перед формуванням перевірки прочитати фактичні UID/GID/режими та SHA конкретних конфігів. Дозволити тільки підтверджений набір каталогів і файлів, не послаблюючи решту symlink, mode, hash і budget guards. Не робити chown/chmod OLS для пристосування до helper. Доступ служби до її activation receipt налаштувати окремо для власного каталогу SciSense, зберігши root-only TLS-підкаталог. Після preflight-only відмови зберегти стару спробу, підтвердити незмінні ledger/anchor/ciphers та використовувати окремий одноразовий recovery. Фінальний helper55 і recovery14 перевірені root та незалежним Codex.

**Evidence:** .agents/journal/2026-10-23-1224-codex-gpt-6-ntzg-voice-photo-live.md:26-35; docs/evidence/voice-photo-live-2026-10-23.json
