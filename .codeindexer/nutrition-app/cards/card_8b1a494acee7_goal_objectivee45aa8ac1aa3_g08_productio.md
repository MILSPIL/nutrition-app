---
id: card_8b1a494acee7
card_type: todo
title: "COACH-PROBLEMS-01: публікація журналу проблем (кроки 8-10)"
project: nutrition-app
product: scisense
phase_id: phase_870a15952663
status: open
importance: high
complexity: medium
host_need: [interactive]
tags: [COACH-PROBLEMS-01, deploy, owner-approval-required]
acceptance: "[{\"manual_approval\":\"Юрій дав «так» на публікацію і перевірив хід тренера з телефона після публікації\"}]"
evidence: docs/superpowers/plans/2026-10-28-coach-problem-reports.md
valid_from: "2026-10-28T23:10:58.632023+00:00"
created_at: "2026-10-28T23:10:58.632023+00:00"
updated_at: "2026-10-28T23:10:58.826928+00:00"
content_hash: "sha256:911d2f4fece36db0724623a09a45b4d81f84edcce43632495ee5aa78ee06d8ac"
---

Goal objective_e45aa8ac1aa3; G08. Результат: журнал проблем тренера працює на production, щоранку автокартки в codeindexer без участі Юрія. Код готовий: гілка claude/coach-problem-reports, draft PR #51 у codex/hermes-personal-server, ревʼю Codex і spec-reviewer done. Межа: лише після окремого «так» Юрія. Кроки: (8) дата 1.9.8 у src/data/releases.js окремим комітом у день публікації, test:ci, build, збірка пакета; публікація А (код і маніфест з 5 credentialNames, БЕЗ ключа) операторами 1.9.6, перевірка health 200, ops/problems 401, телефон; (9) публікація Б: ключ `printf %s` → `systemd-creds encrypt` → /etc/credstore.encrypted/ops-reader, drop-in `LoadCredentialEncrypted=ops-reader` без шляху, рестарт, K8; (10) перший pull.py --apply, launchctl load plist з хабу, K9, K10. Доказ: K8-K10 спеки docs/superpowers/specs/2026-10-28-coach-problem-reports.md.
