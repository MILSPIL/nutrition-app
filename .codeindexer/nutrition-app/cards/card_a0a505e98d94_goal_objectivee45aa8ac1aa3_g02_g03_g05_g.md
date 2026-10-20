---
id: card_a0a505e98d94
card_type: todo
title: Завершити перевірку голосового введення в nutrition-app-scale
project: nutrition-app
product: scisense
phase_id: phase_870a15952663
status: open
importance: high
review_required: true
acceptance: "[{\"reviewer_rubric\":\"Goal objective_e45aa8ac1aa3, G02/G03/G05/G07: перечитаний запис, редагування/відміна/помилка/повтор/зміна дати, оцінки AI і не розібраний текст. Є дозволений реальний E2E, незалежне рев’ю, SHA; 40 старих unit-тестів самі по собі недостатні.\"}]"
evidence: .agents/journal/2026-10-20-1130-codex-gpt-6-codeindexer-audit.md
valid_from: "2026-10-20T08:28:38.202240+00:00"
created_at: "2026-10-20T08:28:38.202240+00:00"
updated_at: "2026-10-20T08:52:56.662051+00:00"
author: Codex
content_hash: "sha256:d640c3bb40cc2f13637b0545753769682209e635ab30cb1d6e4f91bc5565c164"
---

Goal objective_e45aa8ac1aa3; критерії G02, G03, G05, G07.

Продовжувати у дереві та індексі nutrition-app-scale, гілка feat/voice-input. Код UI та Worker вже є, 40 unit-тестів і збірка проходять. Потрібно перевірити налаштування REACT_APP_MEAL_PARSER_URL, скасування або ігнорування застарілої відповіді, таймаути та ліміти Worker. Критерій: наскрізне додавання їжі й сценарії відмов із перевіркою збереження даних. Платні виклики та production потребують окремого дозволу.

Внесок: користувач отримує зручний правдивий запис їжі до фактичного збереження. Закриття: сценарії G05 на реальній релізній конфігурації; stub/mocked API не доводить повну готовність.
