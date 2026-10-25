---
id: card_d5913121e1be
card_type: bug
title: "P3: нейтральне пояснення непідтвердженого походження маси"
project: nutrition-app
product: scisense
phase_id: phase_870a15952663
status: open
importance: low
signal: verification
complexity: low
tags: [HERMES-COACH-02, P3, copy, known-limitation]
valid_from: "2026-10-25T16:37:33.750581+00:00"
created_at: "2026-10-25T16:37:33.750581+00:00"
updated_at: "2026-10-25T16:37:34.026079+00:00"
author: Codex
content_hash: "sha256:58e2151f8a0005a665c0a87ad0cc482441bbb96068b9a1bbed42c1ecdce31534"
---

Goal objective_e45aa8ac1aa3; G07/G11. Результат: прев’ю не стверджує, що користувач не вказав масу, якщо консервативний parser не зв’язав 200 г із довгою назвою продукту. LIVE21b числа, літери, частки й Add правильні, але fallback «точну масу користувач не вказав» у server/trainer/food-resolver.mjs та src/services/foodProvenance.js може бути хибним. Межа: замінити лише цей текст на нейтральне «Перевірте кількість для цього продукту перед додаванням», не змінювати binding/estimate/нутрієнти. Доказ майбутньої правки: локальні регресії для довгих назв картоплі/кефіру та single-item quantity path; живий API не потрібний. Незалежний Codex coach_backend оцінив як P3, не блокує приймання основного сценарію. 2026-10-25: виправлення ще не виконано.
