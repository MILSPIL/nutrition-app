---
id: card_e0c45bb18c67
card_type: bug
title: Виправити доступ клієнта й тренера після локальної перевірки
project: nutrition-app
phase_id: phase_81834b87789c
status: open
importance: high
review_required: true
evidence: .agents/journal/2026-10-20-1130-codex-gpt-6-codeindexer-audit.md
valid_from: "2026-10-20T08:28:35.837887+00:00"
created_at: "2026-10-20T08:28:35.837887+00:00"
updated_at: "2026-10-20T08:28:36.015711+00:00"
author: Codex
content_hash: "sha256:4e0d56701c1c4203c803c0f84a9ba11e8e492107b003fa0027520245234c712a"
---

Локальний емулятор 2026-10-20 виявив три дефекти доступу. Деталі й докази є в локальному звіті tmp/codeindexer-audit/2026-10-20-review.md основного дерева та у звітах Code Indexer. Спочатку узгодити протокол зв'язку клієнта/тренера, потім виконати окреме виправлення. Критерії: власник має потрібний доступ, сторонній користувач його не отримує, прийняття запиту атомарне, відмови покрито тестами. Дозволу на зміну production ця картка не надає.
