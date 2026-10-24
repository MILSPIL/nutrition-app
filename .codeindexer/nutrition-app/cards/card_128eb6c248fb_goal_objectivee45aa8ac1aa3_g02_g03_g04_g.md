---
id: card_128eb6c248fb
card_type: todo
title: "HERMES-FOOD-01: локальна реалізація чату 0–7"
project: nutrition-app
product: scisense
phase_id: phase_870a15952663
status: open
importance: high
complexity: high
tags: [HERMES-FOOD-01, local-only, implementation]
links: [{to: card_29bef280dd54, kind: related}]
review_required: true
acceptance: "[{\"reviewer_rubric\":\"Погоджені локальні0–7 та H01–H10 перевірені на конкретному SHA, з actual pinned Hermes/mock provider і незалежним verdict; приватні/production дії відсутні. H11 окремо.\"}]"
valid_from: "2026-10-24T11:19:34.460257+00:00"
created_at: "2026-10-24T11:19:34.460257+00:00"
updated_at: "2026-10-24T11:19:34.840286+00:00"
created_for: Codex
author: Codex
content_hash: "sha256:1c00f216425e1d13a8ec74e1d0bb7807d01b04884d59f93d59fbd2930028adca"
---

Goal objective_e45aa8ac1aa3, G02/G03/G04/G05/G06/G07/G08/G09/G11. Результат для користувача: один чат із наявним Hermes, текст/голос/фото, пошук або позначена оцінка, preview/Add, необов’язкова літера. Юрій2026-10-24 погодив локальні0–7 і А1–А4. Виконання у codex/hermes-food-chat-local від94ea293 за docs/superpowers/plans/2026-10-24-hermes-food-chat.md. Ранній gate1: справжній pinned Hermes3f2afed з синтетичним профілем/mock provider, без доступу до приватного профілю/реальних API/ключів/$5/сервера. Доказ: H01–H10, regression suites, exact CI, незалежні рев’ю та вимкнений пакет. H11/Gxx пілоту й B/C окремо, не приймати локальними mock. Зупинитися при непроходженні privacy/allowlist gate, не міняти runtime/модель/ресурси самовільно.
