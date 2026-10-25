---
id: card_752ed6d0d0f9
card_type: todo
title: "HERMES-COACH-02: завершити вебтренера, порції й автоматичні дати"
project: nutrition-app
product: scisense
phase_id: phase_870a15952663
status: open
importance: high
signal: verification
complexity: high
tags: [HERMES-COACH-02, HERMES-HOST-01, implemented-local, packaged, owner-authorized, host-policy-pending]
links: [{to: card_128eb6c248fb, kind: related}]
review_required: true
acceptance: "[{\"manual_approval\":\"Юрій явно погодив локальні кроки0–5 HERMES-COACH-02 та припущення А1–А4; окремо назвав I01, якщо включає його.\"}]"
evidence: "2026-10-25: кандидат cd7b02d345385909ab8c59b42a0d48f78833f7f6, CI40137268017 attempt2 усі4 jobs PASS. Локально283 client,213 server,65 rules/access,47 core storage; actual Hermes writer/reader PASS. Незалежні рев’ю без відкритих P1/P2. Пакет224files/runtime31726,5HTTP/0external; основний UI36files перевірений. Linux C05:9.728с/max31964B/2CPU2GiB/OOM0. Попередній одиничний lab502 зафіксовано, assertion не послаблено. Доказ docs/evidence/hermes-coach-local-acceptance-2026-10-25.json. 2026-10-25: Mac/Keychain/SSH доступні. Host userns проба відмовила на uid_map за AppArmorrestriction1, bwrap/profile відсутні. HERMES-HOST-01 з exact profile підготовлено; parser4.0.1 skip-kernel-load/skip-cache PASS, kernelpolicy незмінна; незалежний Codex review PASS. Конкретний новий дозвіл userns очікується, старий deploy-дозвіл збережено. Доказ docs/evidence/hermes-host-preflight-2026-10-25.json. Новий реліз/приватна активація/живі проби не виконані. G02–G11 pending."
valid_from: "2026-10-24T19:53:39.617297+00:00"
created_at: "2026-10-24T19:53:39.617297+00:00"
updated_at: "2026-10-25T09:35:41.287435+00:00"
author: Codex
content_hash: "sha256:c4c9cdb91c4ba6eeee10d5a8ed8b569b0fb4b8f5c68e37a573369df7c7071461"
---

Goal objective_e45aa8ac1aa3; G01/G02/G03/G05/G06/G07/G08/G09/G11. Результат: один вебтренер дає поради за свіжим днем, приймає побутову їжу без обов’язкової етикетки, сам визначає літеру/частку й дату «вчора», зберігає лише через прев’ю + одну «Додати». Специфікація/план docs/superpowers/{specs,plans}/2026-10-24-hermes-coach-next.md. Поточний дозвіл власника від2026-10-24: виконати0–5/I01, підготувати приватний кураторський пакет, провести необхідне розгортання й перевірки на ntzg.pp.ua в межах чинного$5, погоджених моделей і ресурсів. Продуктовий main не зливається автоматично. Кінцеве приймання залишається за власником. Доказ документа: baseline,2 незалежні spec-проби, перевірене Fable-review та D01–D06 PASS; приймання реалізації C01–C08, телефон і незмінний G09. Telegram замінюється лише після приймання вебсценарію й окремого cutover. Невдалий baseline не дорівнює виправленню.
