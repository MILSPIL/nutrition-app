---
id: sol_a0d19330f28c
problem: Поле model у відповіді pinned Hermes CodexAuxiliaryClient повторює запитану модель; саме по собі не доводить фактичну модель backend у серверній підписковій пробі.
created_at: "2026-10-25T18:34:54.488875+00:00"
project: nutrition-app
category: troubleshooting
author: Codex
tags: [hermes, codex-oauth, model-verification, sse]
---

У agent/auxiliary_client.py:1621 wrapper повертає model=model із kwargs. Для доказу GPT-6.1 Sol спостерігати response.completed.response.model і status у фактичному SSE транспорту; вимагати model=gpt-6.1-sol, status=completed та очікувану відповідь. Явний Accept-Encoding: identity і відмова іншому content-encoding запобігають читанню compressed bytes як SSE. Native client на pin3f2afed пройшов дві живі відповіді, друга після native OAuth refresh. Нормалізоване поле wrapper без wire спостереження не використовувати як модельний доказ.

**Evidence:** docs/evidence/codex-server-probe-2026-10-25.json; docs/deployment/codex-server-probe-01.md
