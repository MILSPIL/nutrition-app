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
evidence: .agents/journal/2026-10-21-2227-codex-gpt-6-whisper-small-trial.md; docs/evidence/linux-whisper-small-preparation-2026-10-21.json; docs/SCISENSE-SERVER-PREPARATION.md; .agents/journal/2026-10-21-2257-codex-gpt-6-stt-api-proposal.md; docs/superpowers/plans/2026-10-21-scisense-stt-api.md; docs/evidence/groq-whisper-free-2026-10-21.json; .agents/journal/2026-10-21-2352-codex-gpt-6-groq-free-whisper-smoke.md
valid_from: "2026-10-21T13:47:18.520657+00:00"
created_at: "2026-10-21T13:47:18.520657+00:00"
updated_at: "2026-10-21T20:52:51.137585+00:00"
author: Codex
content_hash: "sha256:566b434366a0b8ed9cd543cb1309f06b6bbe458f5140ea7e54183e39e125fa16"
---

Goal objective_e45aa8ac1aa3, G05/G07/G08/G11. Результат для користувача: правильні продукти й порції з голосу до таймауту. Історичні Linux-проби large-v3-turbo на 1/2 CPU і small-q5_1 на 2 CPU/2 GiB/45 с: 0/6 звичайних сценаріїв, 4/4 негативних; stdout-дефект виправлено, тести успішні. Це eSpeak-ng fixtures, якість TTS і справжнього голосу не доведені. 2026-10-21 за окремим прямим дозволом виконано GROQ-FREE-SMOKE-01: один Lesya uk_UA WAV 7.2758125 с, whisper-large-v3, language=uk, без prompt/повторів; HTTP200 за 0.621916 с включно з мережею; 3/3 продуктів/порцій/одиниць правильні, лише числа цифрами та мл. API-квота 2000/1999 відповідає Free. Це один чистий synthetic зразок, не порівняльний benchmark або телефонна перевірка. Межа: Anthropic/$5/сервер не чіпали; згода на один тест вичерпана, нові виклики не запускати автоматично. Повний STT-API-01 (20 викликів/інтеграція/людські записи/ZDR/production) ще не погоджений; ST01–ST05, G02–G11 pending. Доказ: docs/evidence/groq-whisper-free-2026-10-21.json та журнал2352; попередні Linux-докази збережені.
