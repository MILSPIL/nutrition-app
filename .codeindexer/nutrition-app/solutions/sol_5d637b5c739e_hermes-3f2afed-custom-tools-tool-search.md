---
id: sol_5d637b5c739e
problem: "Закріплений Hermes 3f2afed за замовчуванням приховує custom tools за tool_search і для фото виконує додатковий vision fallback та генерацію заголовка, навіть якщо основна модель Sonnet. Це порушує прямий allowlist і очікувану кількість inference calls."
created_at: "2026-10-24T11:36:39.202946+00:00"
project: nutrition-app
category: architecture
updated_at: "2026-10-24T11:45:16.528792+00:00"
author: Codex
tags: [hermes, HERMES-FOOD-01, allowlist, native-photo, auxiliary-calls]
---

У synthetic actual-runtime probe доведено штатну конфігурацію: tools.tool_search.enabled=off; platform_toolsets.api_server=[scisense,no_mcp]; agent.image_input_mode=native та model_overrides.custom для pinned Sonnet supports_vision=true; auxiliary.title_generation.enabled=false/model_upgrade_enabled=false; auxiliary.background_review.enabled=false; memory обох built-in stores off і disabled_toolsets. Конфіг писати ДО імпортів, щоб кеш не запам’ятав defaults. Native photo + food_lookup/read_trainer_context/propose_food_draft займають рівно 3 fake provider requests; terminal/memory відхилено, DELETE прибирає media. Це сумісність pinned runtime з mocks, не приймання живого API або фінального proxy. Пер-call proxy/leases залишаються обов’язковими, самі settings не є контролем бюджету.

**Evidence:** scripts/hermes-runtime-probe.py; server/trainer/hermes-pin.json; .agents/journal/2026-10-24-1420-codex-gpt-6-hermes-local.md
Caveat confirmed by canonical follow-up: configuration alone is insufficient for media deletion. The standalone adapter proof did not exercise canonical session admission. Use the actual GatewayRunner/session authority gate and the quiescent privacy wrapper described in docs/evidence/hermes-runtime-gate-2026-10-24.json; native DELETE leaves staging/WAL on this pin.
