---
id: sol_588c3dd3051d
problem: "Приватний Node→Python bridge проходив перевірку залежностей в інтерактивному Python, але очищене дочірнє оточення з PYTHONNOUSERSITE=1 не бачило user-site залежностей і зупиняло перенесення до серверних змін."
created_at: "2026-10-23T09:24:55.054276+00:00"
project: nutrition-app
category: deployment
updated_at: "2026-10-23T09:30:02.580162+00:00"
author: Codex
tags: [python, sanitized-env, keychain-bridge, transfer, one-shot]
---

Залежності потрібно перевіряти тим самим Python, argv та очищеним env, які використовує bridge. Встановити зафіксовані версії тільки у власний venv, зберегти PYTHONNOUSERSITE=1 і виконати read-only smoke реального stdin/FD3 до постійної позначки передачі. Вже створену позначку не видаляти: після доведеного preflight-only збою зберегти original attempt/result і виконати лише окремо перевірений recovery, прив’язаний до тих самих ledger/receipt/release. Невідома відповідь не дозволяє повтор.

**Evidence:** .agents/journal/2026-10-23-1224-codex-gpt-6-ntzg-voice-photo-live.md:25; docs/evidence/voice-photo-live-2026-10-23.json
