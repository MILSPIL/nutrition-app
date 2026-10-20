---
id: card_a0a505e98d94
card_type: todo
title: Завершити перевірку голосового введення в nutrition-app-scale
project: nutrition-app
phase_id: phase_81834b87789c
status: open
importance: high
review_required: true
evidence: .agents/journal/2026-10-20-1130-codex-gpt-6-codeindexer-audit.md
valid_from: "2026-10-20T08:28:38.202240+00:00"
created_at: "2026-10-20T08:28:38.202240+00:00"
updated_at: "2026-10-20T08:28:38.287346+00:00"
author: Codex
content_hash: "sha256:ae002ac7810e607b91ad86ce8e46937890c4f1a4d80ac8cbe221ff127b876250"
---

Продовжувати у дереві та індексі nutrition-app-scale, гілка feat/voice-input. Код UI та Worker вже є, 40 unit-тестів і збірка проходять. Потрібно перевірити налаштування REACT_APP_MEAL_PARSER_URL, скасування або ігнорування застарілої відповіді, таймаути та ліміти Worker. Критерій: наскрізне додавання їжі й сценарії відмов із перевіркою збереження даних. Платні виклики та production потребують окремого дозволу.
