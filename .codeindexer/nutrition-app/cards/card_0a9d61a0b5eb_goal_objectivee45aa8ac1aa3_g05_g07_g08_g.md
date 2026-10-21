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
evidence: .agents/journal/2026-10-21-2227-codex-gpt-6-whisper-small-trial.md; docs/evidence/linux-whisper-small-preparation-2026-10-21.json; docs/SCISENSE-SERVER-PREPARATION.md; .agents/journal/2026-10-21-2257-codex-gpt-6-stt-api-proposal.md; docs/superpowers/plans/2026-10-21-scisense-stt-api.md
valid_from: "2026-10-21T13:47:18.520657+00:00"
created_at: "2026-10-21T13:47:18.520657+00:00"
updated_at: "2026-10-21T19:57:49.807808+00:00"
author: Codex
content_hash: "sha256:6cc3105711b6ead114062eae27c1fa85c93780d5ada7a010b1f4d98d940d13fe"
---

Goal objective_e45aa8ac1aa3, G05/G07/G08/G11. Потрібний правильний голосовий запис їжі до таймауту. Large-v3-turbo на1/2CPU:0/6, timeout45s. Погоджена STT-SMALL-01 small-q5_1, CI39662207789/bf8e22d, actual2CPU/2GiB/45s:0/6normal (2timeout,1empty,3 без підтверджених продукту/200г),4/4negative/cleanupPASS, peak493.9–531MiB, безOOM. Linux10/10 і app CI39662207602 PASS. Native stdout-дефект виправлено; independent review done. Це eSpeak-ng synthetic fixtures; якість TTS, auto-language та реального голосу не доведені. Нову модель/ресурси не погоджено, ключі/$5/сервер не чіпали, productionCPU1/live=false. Межа: без inference повторів/розгортання; потрібне рішення про наступну перевірку. STT-API-01 підготовлено на погодження 2026-10-21: рекомендовано Groq whisper-large-v3 + чинний claude-sonnet-5-5, Node1CPU/до2GiB без GPU/ваг. Пропозиція:20Groq викликів(10lab STT-only+10phone), стеля$0.10 окремо від єдиних$5Anthropic; GroqZDR і реальне аудіо потребують дозволу. Користувач ще не погодив новий варіант. Жодного коду/inference/ключів/серверних дій; ST01–ST05 та G02–G11 pending. Канон docs/superpowers/plans/2026-10-21-scisense-stt-api.md, docs/evidence/stt-api-proposal-2026-10-21.json, journal2257.
