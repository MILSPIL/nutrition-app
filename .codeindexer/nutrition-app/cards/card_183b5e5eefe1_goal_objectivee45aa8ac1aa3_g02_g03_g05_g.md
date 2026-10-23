---
id: card_183b5e5eefe1
card_type: todo
title: "VOICE-LETTERS-01: явний початок запису та необов’язкові літери денного плану"
project: nutrition-app
product: scisense
phase_id: phase_870a15952663
status: open
importance: high
complexity: high
tags: [scisense, voice, plan-letters, local-implementation]
links: [{to: card_a0a505e98d94, kind: related}]
review_required: true
acceptance: "[{\"manual_approval\":\"Юрій погодив конкретний план локальної реалізації 0–6; зовнішній етап 7 погоджується окремо.\"},{\"reviewer_rubric\":\"Для реалізації: доказ L01–L09 на точному SHA, незалежне рев’ю; L10 і телефон лише після окремого дозволу. Закриття картки не закриває Gxx або продуктовий Goal.\"}]"
evidence: docs/evidence/voice-letters-local-2026-10-23.md; commit82546d8. 205 Jest,43 Worker,47 demo-store перевірок PASS. Фінальне Claude-рев’ю та точний CI ще очікуються.
valid_from: "2026-10-23T11:34:01.646371+00:00"
created_at: "2026-10-23T11:34:01.646371+00:00"
updated_at: "2026-10-23T12:59:51.810692+00:00"
created_for: Codex
author: Codex
content_hash: "sha256:79b97c401889505f9fea57bed04d32135478828f8c2164e1155769eb7a3589e9"
---

Goal objective_e45aa8ac1aa3; G02/G03/G05/G06/G07/G08/G09/G11. Результат: ready → «Почати запис», AI-відповідник і частка денної норми, необов’язкова літера/«Без літери», один запис без дублів. Юрій 2026-10-23 погодив локальні кроки 0–6 VOICE-LETTERS-01. Реалізація в codex/voice-plan-letters від fd65fb9. П’ять журналів у main через PR25/9bd8629. Локальні тести/емулятор проходять; фінальні рев’ю/CI в роботі. Межа: реальні модельні API, ключі, $5, живі дані, сервер і крок 7 заборонені; продукт у main не переносити. Документи: docs/superpowers/specs/2026-10-23-voice-plan-letters.md; docs/superpowers/plans/2026-10-23-voice-plan-letters.md. L10 і реальний телефон pending; картка не приймає Goal.
