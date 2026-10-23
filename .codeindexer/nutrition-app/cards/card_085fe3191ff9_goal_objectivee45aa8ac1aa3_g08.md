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
evidence: "2026-10-20 c9f3ab3: свіжий root audit98 findings:5low/13moderate/77high/3critical; це уточнює історичну цифру355. npm ls: proxy-addr/shell-quote через CRA/dev-server; websocket-driver також через Firebase database; react-router-dom runtime. Reachability browser bundle ще не завершено, G08 pending. Новий Worker Wrangler4.151.3 audit0,17Worker/88Jest/17emulator/build PASS. DEVELOPMENT версію узгоджено1.6.0 без оголошення нового релізу. docs/VOICE-PHOTO-VALIDATION.md."
valid_from: "2026-10-20T08:28:40.998344+00:00"
created_at: "2026-10-20T08:28:40.998344+00:00"
updated_at: "2026-10-20T13:48:32.997528+00:00"
author: Codex
content_hash: "sha256:3a3d864273c271c4255afec4a28b4f2667e0f19dffae16ebfae886e8c4b9b91d"
---

Goal objective_e45aa8ac1aa3; критерії G08.

npm audit 2026-10-20 позначив 355 пакетів основного застосунку; ці числа не доводять досяжності всіх вразливостей у браузерній збірці. Окремо оцінити інструменти розробки й виконуваний код, підготувати план оновлення без сліпого audit fix. Узгодити версію DEVELOPMENT.md 1.5.0 з package.json 1.6.0. Критерій: перевірений план, після погоджених змін тести й збірка проходять.

Внесок: відтворюваний і перевірений кандидат у реліз. Закриття: класифікація фактичної досяжності ризиків, узгоджений версійний стан і успішні перевірки одного release SHA; сам перелік npm audit не є оцінкою продуктового ризику.
