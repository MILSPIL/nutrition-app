---
id: sol_5662a3a0d989
problem: "Новий запис їжі з preparation:\"unknown\" (джерела manual/label/estimate після 1.9.9) ламає відкат на 1.9.7: старий itemMacros у src/services/mealItems.js кидає invalid_item, бо itemProblems 1.9.7 вимагає спосіб приготування для будь-якого джерела. Підсумки дня зі збереженими новими записами падали б після відкату."
created_at: "2026-10-30T13:28:57.025697+00:00"
project: nutrition-app
category: troubleshooting
error_signature: invalid_item
author: Claude Opus 5.5
tags: [rollback, mealItems, preparation, food-resolver, 1.9.9, javascript]
---

Причина: itemMacros кидає invalid_item, якщо itemProblems непорожній; у 1.9.7 «Уточніть спосіб приготування» додавалось для будь-якого джерела з preparation unknown. Виправлення: resolver не зберігає поле preparation, коли воно "unknown" (server/trainer/food-resolver.mjs, `...(raw.preparation !== "unknown" ? { preparation } : {})`). Поле ніде не обовʼязкове: firestore.rules його не згадує, сервер не перевіряє. Перевірка відкату: `git show 47ac923:src/services/mealItems.js` (+ planCatalog, foodProvenance, data/products, data/planReferences) у тимчасову теку з імпортами .mjs, викликати itemProblems/itemMacros на рядках нового resolver: [] і макроси; з preparation unknown: invalid_item. Загальний урок: будь-яке нове значення в збереженому записі звіряти зі старим читачем, бо відкат не відновлює дані.

**Evidence:** 90c57fc (claude/simple-logging-199); спека docs/superpowers/specs/2026-10-30-simple-logging-199.md розділ «Ревʼю (фаза 3)»; знахідка Codex P1
