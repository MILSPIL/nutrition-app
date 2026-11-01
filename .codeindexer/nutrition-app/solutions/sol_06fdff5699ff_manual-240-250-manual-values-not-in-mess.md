---
id: sol_06fdff5699ff
problem: "Перевірка «цифри написав користувач» для джерела manual відхиляє вже прийняте виправлення при наступній правці: 240 ккал → «ні, там 250» → «яйця варені» дає manual_values_not_in_message на третьому ході, бо 250 немає ні в поточному тексті, ні в draft.origins."
created_at: "2026-10-30T13:28:57.232111+00:00"
project: nutrition-app
category: architecture
error_signature: manual_values_not_in_message
author: Claude Opus 5.5
tags: [drafts, origins, manual, propose_food_draft, 1.9.9, javascript]
---

Причина: draft.origins (server/trainer/drafts.mjs) зберігає лише перший текст, що створив рядок, а не подальші виправлення; snapshot.history у production порожній (personal-runtime.mjs, history: []). Тому тексти для перевірки = поточне повідомлення + origins, і проміжне виправлення губиться. Виправлення: tools.mjs передає в resolve `confirmed` = Map itemId → рядок попередньої чернетки з source.kind manual; food-resolver.mjs `sameManual` приймає manual без перевірки токенів, якщо основа і чотири значення збігаються з уже прийнятим рядком. Нові числа все одно мають бути в текстах. Тест K2c у server/trainer/simple-logging-199.test.mjs (три ходи через toolsFixture, кожен з begin/propose/complete, бо інакше trainer_busy).

**Evidence:** 90c57fc (claude/simple-logging-199), server/trainer/tools.mjs propose_food_draft, server/trainer/food-resolver.mjs sameManual; знахідка Codex P2
