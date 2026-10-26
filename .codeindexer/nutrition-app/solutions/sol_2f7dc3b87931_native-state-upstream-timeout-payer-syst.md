---
id: sol_2f7dc3b87931
problem: "Після перемикання native моделі перший /state повертає upstream_timeout, хоча payer уже перезапущений і systemd показує Started."
created_at: "2026-10-26T10:36:38.810028+00:00"
project: nutrition-app
category: troubleshooting
error_signature: upstream_timeout after selectModel before contextRead
updated_at: "2026-10-26T10:45:57.493577+00:00"
author: Codex
tags: [hermes, readiness, model-selection, context, cancellation, javascript]
---

gateway contextValue має 5 секунд і виконується перед history/bot. core.context спочатку чекає ownerFor, тому холодний запуск authority входить у ці 5 секунд. Початковий runtime готує core.history для всіх профілів, а selectModel раніше готував лише payer. Відтворено timeout на 5004 мс, owner-ready на 5202 мс, bot не викликався. Координатор має готувати обидва native чати до підтвердження вибору й тримати changing-fence. Скасування та спільний deadline фізично зупиняють лише підготовлювані owners; до завершення всіх drain чергу не звільняти. Не піднімати таймери чи ресурси. Локальні 46 перевірок пройдені; новий CI й повтор actual-host B1 ще очікуються.

**Evidence:** server/trainer/personal-coordinator.mjs:272; .agents/journal/2026-10-26-1215-codex-gpt-6.1-sol-hermes-host-b1.md
Додано скасування підготовки startup/bot/payer: observer від входу в чергу, abortable payer.start, фізичний drain payer та всіх профілів до зняття огорожі. Фінальне незалежне рев’ю PASS, 48/48 тестів і два OS-процесні відтворення PASS; новий CI та actual-host B1 ще не виконані.
