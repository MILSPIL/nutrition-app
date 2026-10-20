---
id: card_085fe3191ff9
card_type: todo
title: Розібрати залежності CRA та невідповідності документації
project: nutrition-app
product: scisense
phase_id: phase_1725e5d7c26b
status: open
importance: medium
review_required: true
acceptance: "[{\"reviewer_rubric\":\"Goal objective_e45aa8ac1aa3, G08: перевірено runtime/dev досяжність, немає невирішених релізних P0/P1, зміни залежностей вузькі й перевірені test/build/CI, версія документації узгоджена.\"}]"
evidence: .agents/journal/2026-10-20-1130-codex-gpt-6-codeindexer-audit.md
valid_from: "2026-10-20T08:28:40.998344+00:00"
created_at: "2026-10-20T08:28:40.998344+00:00"
updated_at: "2026-10-20T08:52:59.440987+00:00"
author: Codex
content_hash: "sha256:3a3d864273c271c4255afec4a28b4f2667e0f19dffae16ebfae886e8c4b9b91d"
---

Goal objective_e45aa8ac1aa3; критерії G08.

npm audit 2026-10-20 позначив 355 пакетів основного застосунку; ці числа не доводять досяжності всіх вразливостей у браузерній збірці. Окремо оцінити інструменти розробки й виконуваний код, підготувати план оновлення без сліпого audit fix. Узгодити версію DEVELOPMENT.md 1.5.0 з package.json 1.6.0. Критерій: перевірений план, після погоджених змін тести й збірка проходять.

Внесок: відтворюваний і перевірений кандидат у реліз. Закриття: класифікація фактичної досяжності ризиків, узгоджений версійний стан і успішні перевірки одного release SHA; сам перелік npm audit не є оцінкою продуктового ризику.
