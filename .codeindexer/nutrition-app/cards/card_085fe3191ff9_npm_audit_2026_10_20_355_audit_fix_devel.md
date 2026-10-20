---
id: card_085fe3191ff9
card_type: todo
title: Розібрати залежності CRA та невідповідності документації
project: nutrition-app
phase_id: phase_81834b87789c
status: open
importance: medium
review_required: true
evidence: .agents/journal/2026-10-20-1130-codex-gpt-6-codeindexer-audit.md
valid_from: "2026-10-20T08:28:40.998344+00:00"
created_at: "2026-10-20T08:28:40.998344+00:00"
updated_at: "2026-10-20T08:28:41.076841+00:00"
author: Codex
content_hash: "sha256:1b3327e25537c2e38e8ebb8a7cbd3f980f8d0ab1efccb4340012675cfeb0b9e4"
---

npm audit 2026-10-20 позначив 355 пакетів основного застосунку; ці числа не доводять досяжності всіх вразливостей у браузерній збірці. Окремо оцінити інструменти розробки й виконуваний код, підготувати план оновлення без сліпого audit fix. Узгодити версію DEVELOPMENT.md 1.5.0 з package.json 1.6.0. Критерій: перевірений план, після погоджених змін тести й збірка проходять.
