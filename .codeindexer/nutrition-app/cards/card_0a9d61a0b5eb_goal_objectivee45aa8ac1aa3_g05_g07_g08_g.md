---
id: card_0a9d61a0b5eb
card_type: gotcha
title: Синтетичні Linux-проби Whisper не пройшли критерії голосу
project: nutrition-app
product: scisense
phase_id: phase_870a15952663
status: open
importance: high
signal: verification
evidence: "Код dab68d57139f4d94158fef6bd2aae9230b846a73: CI39676485745 SUCCESS, обидва jobs. App123/Worker39/storage17/server27/rules29/phone-lab17; чотири browser flows і build PASS. Окремо 35 Linux fixture перевірок у 1 CPU/2 GiB за 1560 мс без мережі/ключів. Незалежні Codex reviews PASS. Канон PROJECT-INFO.md, docs/GROQ-FREE-SETUP.md, docs/evidence/groq-free-implementation-2026-10-22.json та .agents/journal/2026-10-22-0012-codex-gpt-6-groq-free-integration.md. LIVE false; реальне приймання pending."
valid_from: "2026-10-21T13:47:18.520657+00:00"
created_at: "2026-10-21T13:47:18.520657+00:00"
updated_at: "2026-10-21T21:15:16.085556+00:00"
author: Codex
content_hash: "sha256:7979b5acabc8dc4603c02de7730818fca0d355bf6a754079028772a3e57a233a"
---

Goal objective_e45aa8ac1aa3, G05/G07/G08/G11. Мета: правильні продукти та порції з голосу до таймауту. Історичні Linux-проби large-v3-turbo на 1/2 CPU і small-q5_1 на 2 CPU/2 GiB/45 с не пройшли звичайні сценарії; синтетичний TTS не доводить якість людського голосу. Окрема погоджена Groq Free проба 2026-10-21: один український WAV 7.2758 с, whisper-large-v3, HTTP200 за 0.621916 с; 3/3 продукти/кількості/одиниці. 2026-10-22 Юрій погодив і виконано локальну інтеграцію Groq Free; старий план платних $0.10/20 спроб і міграції SQLite замінено Free-доповненням STT-API-01. Нових живих викликів немає. Старий Linux preparation більше не запускається від PR, тільки вручну за окремим дозволом. Межа: людський голос, Free/ZDR, фізичний телефон, Anthropic/$5 і сервер ще не активовані; ST01/ST02/ST05 та G02–G11 pending. Локальні захисні тести та ресурсний CI не закривають продукт.
