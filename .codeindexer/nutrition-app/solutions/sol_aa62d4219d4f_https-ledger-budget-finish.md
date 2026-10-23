---
id: sol_aa62d4219d4f
problem: "Закриття HTTPS-шлюзу голосу могло закрити ledger раніше, ніж обробник виконає budget.finish після скасування провайдера."
created_at: "2026-10-21T21:12:09.777966+00:00"
project: nutrition-app
category: troubleshooting
updated_at: "2026-10-21T21:13:33.638380+00:00"
author: Codex
tags: [gateway, shutdown, async, ledger, timeout, javascript]
---

createPhoneGateway зберігає AbortController і completion promise кожного запиту. close спочатку скасовує активні запити, закриває власні з’єднання й очікує pendingInference; лише після цього caller закриває budget. Сам server.close не чекає async callbacks. Окремий body timer відхиляє повільне завантаження до резерву, а res.shouldKeepAlive=false закриває незачитане тіло. Синтетична регресія затримує abort rejection на 50 ms і доводить finish до закриття budget. Доказ: dab68d5; scripts/phone-lab/gateway.mjs:533; scripts/phone-lab/gateway-lifecycle.test.mjs; .agents/journal/2026-10-22-0012-codex-gpt-6-groq-free-integration.md.
