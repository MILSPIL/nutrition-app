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
evidence: .agents/journal/2026-10-20-1130-codex-gpt-6-codeindexer-audit.md; .agents/journal/2026-10-20-1215-codex-gpt-6-product-goal-access-plan.md
valid_from: "2026-10-20T08:28:35.837887+00:00"
created_at: "2026-10-20T08:28:35.837887+00:00"
updated_at: "2026-10-20T09:13:14.050581+00:00"
author: Codex
content_hash: "sha256:ad0692c5d97788595dd569b754b045365b442a5a0e58bbb199d9cf0bfa4a6ad3"
---

Goal objective_e45aa8ac1aa3; критерії G04, G06, G07, G08.

Локальний емулятор 2026-10-20 виявив три дефекти доступу. Деталі й докази є в локальному звіті tmp/codeindexer-audit/2026-10-20-review.md основного дерева та у звітах Code Indexer. Спочатку узгодити протокол зв'язку клієнта/тренера, потім виконати окреме виправлення. Критерії: власник має потрібний доступ, сторонній користувач його не отримує, прийняття запиту атомарне, відмови покрито тестами. Дозволу на зміну production ця картка не надає.

Юрій погодив spec-flow. Специфікація та план пройшли два раунди проби й незалежне рев’ю підготовки (8/8); код ще не змінений, план ще не погоджений. Наступна дія: розглянути docs/superpowers/specs/2026-10-20-trainer-access.md і план поруч; код лише після явного погодження плану. Внесок: клієнт і тренер проходять повний цикл згоди/відкликання. Закриття: A01–A09, незалежне рев’ю й докази одного SHA.
