---
id: sol_d166674e868e
problem: Actual Hermes API з fake aiohttp provider на тому самому event loop затримував перший run на 37–49 секунд до модельного циклу.
created_at: "2026-10-24T11:36:41.149029+00:00"
project: nutrition-app
category: troubleshooting
author: Codex
tags: [hermes, mock-provider, event-loop, compatibility-test]
---

Стек показав синхронний fetch_endpoint_model_metadata через httpx усередині APIServerAdapter._create_agent. Mock HTTP server у тому самому event loop не міг віддати навіть 404, доки не завершувалися timeout. Підставний provider перенесено на окремий thread/event loop і додано локальний GET /models та /v1/models. Незмінений pinned AIAgent пройшов текстовий цикл за1.177с, фото за1.562с. Не вимикати мережеву ізоляцію й не підміняти AIAgent mock, щоб приховати проблему.

**Evidence:** scripts/hermes-runtime-probe.py: serve_mock; Hermes3f2afed agent/model_metadata.py fetch_endpoint_model_metadata
