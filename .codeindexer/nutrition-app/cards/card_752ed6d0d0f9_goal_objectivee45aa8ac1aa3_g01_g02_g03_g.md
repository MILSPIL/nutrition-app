---
id: card_752ed6d0d0f9
card_type: todo
title: "HERMES-COACH-02: погодити тренера, порції й автоматичні дати"
project: nutrition-app
product: scisense
phase_id: phase_870a15952663
status: open
importance: high
complexity: high
tags: [HERMES-COACH-02, spec-plan, awaiting-approval]
links: [{to: card_128eb6c248fb, kind: related}]
review_required: true
acceptance: "[{\"manual_approval\":\"Юрій явно погодив локальні кроки0–5 HERMES-COACH-02 та припущення А1–А4; окремо назвав I01, якщо включає його.\"}]"
evidence: "2026-10-24: D01–D06 незалежний Codex PASS;2 spec-probe; Claude Fable5.1:9 confirmed/3partial, усі враховано. docs/evidence/hermes-coach-plan-review-2026-10-24.json та baseline. Продуктового diff немає; G01/local0–5+I01 і B/C не погоджені."
valid_from: "2026-10-24T19:53:39.617297+00:00"
created_at: "2026-10-24T19:53:39.617297+00:00"
updated_at: "2026-10-24T20:09:24.341346+00:00"
author: Codex
content_hash: "sha256:c7296e206ef7dc496a15802067d0f8315b058b7583c526b4aab9899876a489ff"
---

Goal objective_e45aa8ac1aa3; G01/G02/G03/G05/G06/G07/G08/G09/G11. Результат: один вебтренер дає поради за свіжим днем, приймає побутову їжу без обов’язкової етикетки, сам визначає літеру/частку й дату «вчора», зберігає лише через прев’ю + одну «Додати». Специфікація/план docs/superpowers/{specs,plans}/2026-10-24-hermes-coach-next.md. Межа зараз: лише документна підготовка та синтетична діагностика, код/приватне перенесення/API/$5/server/main не дозволені. Локальні0–5 ще потребують явного погодження, B1/B2/C окремі. Доказ документа: baseline,2 незалежні spec-проби, перевірене Fable-review та D01–D06 PASS; приймання реалізації C01–C08, телефон і незмінний G09. Telegram замінюється лише після приймання вебсценарію й окремого cutover. Невдалий baseline не дорівнює виправленню.
