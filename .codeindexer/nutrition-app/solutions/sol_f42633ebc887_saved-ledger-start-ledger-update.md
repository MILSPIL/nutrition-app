---
id: sol_f42633ebc887
problem: "Скасований голосовий запис може отримати статус saved замість нової спроби, якщо ledger.start або ledger.update завершиться із затримкою."
created_at: "2026-10-21T21:12:07.805437+00:00"
project: nutrition-app
category: troubleshooting
author: Codex
tags: [voice, cancellation, async, ledger, javascript]
---

newAttempt захоплює session revision до await і перевіряє її після кожного await. Застарілий новостворений ID позначається abandoned; attempt.current і metrics змінюються тільки для чинного сеансу. track отримує явні id/session. Причина: перевірка тільки в runTask була запізнілою, stale ledger.start уже перезаписував attempt.current. Регресії з відкладеними start/update підтверджують правильні статуси і рівно один onAdd.

**Evidence:** 888d0e4; src/components/VoiceInputModal.js:180; src/components/VoiceInputModal.test.js; .agents/journal/2026-10-22-0012-codex-gpt-6-groq-free-integration.md
