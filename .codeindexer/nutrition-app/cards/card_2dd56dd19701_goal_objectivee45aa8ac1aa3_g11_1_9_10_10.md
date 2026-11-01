---
id: card_2dd56dd19701
card_type: todo
title: Автоочищення старих фото тренера (квота 256 МБ)
project: nutrition-app
product: scisense
phase_id: phase_870a15952663
status: open
importance: medium
complexity: medium
tags: [trainer, photos, quota, 1.9.10-followup]
acceptance: "[{\"manual_approval\":\"Юрій погодив спосіб автоочищення фото (за віком чи обсягом) до коду\"}]"
evidence: docs/superpowers/specs/2026-10-31-trainer-unblock-photos.md (Розвилка, Р2)
valid_from: "2026-11-01T12:32:14.559859+00:00"
created_at: "2026-11-01T12:32:14.559859+00:00"
updated_at: "2026-11-01T12:32:14.633292+00:00"
author: claude-opus-5-5
content_hash: "sha256:1ef9fb242502b1ec943d61a2339f2ac8a39fa1bdaa079f741f5c344cb909578c"
---

Goal objective_e45aa8ac1aa3, G11. З 1.9.10 у тренера до 10 фото на повідомлення, тож сховище фото (квота 256 МБ) заповниться швидше. Результат для Юрія: фото не впираються в квоту, старі фото прибираються самі, історія чату не ламається. Межа: лише фото тренера після відповіді, не дані щоденника. Доказ: тест на прибирання за віком/обсягом і перевірка, що відповідь тренера на старе фото лишається в історії. Рішення Юрія Р2 (31.10): окрема задача після 1.9.10.
