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
commit_range: "{\"from\":\"fd65fb9\",\"to\":\"53248f70660c1c1b6fdf4cd6278a72f17928c6fd\"}"
evidence: "docs/evidence/voice-letters-local-2026-10-23.md; docs/evidence/voice-letters-ci-2026-10-23.json; docs/evidence/voice-letters-package-2026-10-23.json. CI39962158744 exact53248f7:3/3 SUCCESS. 223 Jest/43 Worker/47 store/47 server/38 rules,162 browser checks,10 packaged API PASS. Codex final reviewer незалежно повторив223 Jest і actual-hook/component probes; фінальний PASS. Fable12 знахідок:9 підтверджених і1 часткова виправлені,2 відхилені після звірення."
valid_from: "2026-10-23T11:34:01.646371+00:00"
created_at: "2026-10-23T11:34:01.646371+00:00"
updated_at: "2026-10-23T13:39:32.454437+00:00"
created_for: Codex
author: Codex
content_hash: "sha256:d595de05ab4014d9f85851bab0bff6434433809615d745df5ba7c87d0464bf14"
---

Goal objective_e45aa8ac1aa3; G02/G03/G05/G06/G07/G08/G09/G11. Локальні кроки 0–6 VOICE-LETTERS-01 виконані на 53248f70660c1c1b6fdf4cd6278a72f17928c6fd у codex/voice-plan-letters. Результат: окрема «Почати запис», AI-відповідник у чинному аналізі, необов’язкова літера/«Без літери», частка денної норми незалежно від прийому, атомарний запис із відновленням unknown. П’ять журналів у main: PR25/9bd8629. Локальні L01–L09 прийняті незалежним рев’юером; L08 фізичний телефон і L10 pending. Картка лишається open через вбудований manual_approval під час закриття: інструмент вимагає людину в dashboard, агент не підмінює її. Реальні API, ключі, $5, живі дані, сервер і merge продукту не виконувалися. Пакет: docs/VOICE-LETTERS-RELEASE.md. G02–G11 pending.
