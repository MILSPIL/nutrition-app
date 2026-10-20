---
id: card_32632bf25921
card_type: todo
title: Перевірити голос, фото, збереження й доступ на одному релізі
project: nutrition-app
product: scisense
phase_id: phase_1725e5d7c26b
status: open
importance: high
review_required: true
acceptance: "[{\"reviewer_rubric\":\"На одному release SHA пройдені G02–G08 і G11 з доказами. Незалежний рев’юер перевірив інтегрований шлях голос+фото, одиниці, збереження/повтори/старі клієнти та доступ. Публікація і rollback підтверджуються окремо.\"}]"
evidence: docs/PRODUCT-GOAL.md; docs/superpowers/specs/2026-10-20-voice-photo.md
valid_from: "2026-10-20T08:53:03.457153+00:00"
created_at: "2026-10-20T08:53:03.457153+00:00"
updated_at: "2026-10-20T09:46:12.623388+00:00"
author: Codex
content_hash: "sha256:e77fea1bc1c8735bc685b4b6d64dabe3607ff11b3f32117c0924182058b32b03"
---

Goal objective_e45aa8ac1aa3; критерії G02–G08, G11.

Звести голос+фото та виправлений доступ у один погоджений release SHA. Пройти мікрофон → API → фото упаковки → прев’ю → «Додати» → перечитування → підсумки/звіт → тренер → відкликання. Звірити legacy г/мл/порції, raw/cooked, старий відкритий клієнт і конфліктні writers; несумісний старий запис має бути заблокований або забезпечене контрольоване оновлення до змішаного розгортання.

Зафіксувати app/rules/Worker/model/config SHA, test/build/CI/E2E, квоти/бюджет/retention, оцінку залежностей, rollback. До реального приватного пілоту G04 обов’язково passed. Окремі дерева й старі unit-тести не доводять інтегрований продукт. Production за окремим рішенням; merge не є deployment.
