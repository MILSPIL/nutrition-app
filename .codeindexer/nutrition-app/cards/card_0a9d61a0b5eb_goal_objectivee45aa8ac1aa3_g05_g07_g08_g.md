---
id: card_0a9d61a0b5eb
card_type: gotcha
title: Whisper large-v3-turbo не вкладається у 45s на одному CPU Linux
project: nutrition-app
product: scisense
phase_id: phase_870a15952663
status: open
importance: high
signal: verification
evidence: .agents/journal/2026-10-21-1336-codex-gpt-6-local-server-implementation.md; docs/evidence/linux-whisper-preparation-2026-10-21.json
valid_from: "2026-10-21T13:47:18.520657+00:00"
created_at: "2026-10-21T13:47:18.520657+00:00"
updated_at: "2026-10-21T13:47:18.802839+00:00"
author: Codex
content_hash: "sha256:3fd1b5f3adfb1fd8f9abc52591c593951468698dc29bbffad4b16ee2cfcc48f6"
---

Goal objective_e45aa8ac1aa3, G05/G07/G08/G11. Результат для користувача: голос має встигати до таймауту, а не тільки збиратися. Фактичний Linux benchmark c0c334b: усі6 UA/RU fixtures5/30/90s timeout45017–45046ms при1CPU/2GiB, peak795–811MB, безOOM. Abort/timeout/concurrency/OOM і cleanup PASS, це не успішне розпізнавання. Межа: не міняти модель/ресурси автоматично, не використовувати ключі/$5/production. Потрібне погодження наступної синтетичної проби; запит про2CPU надісланий, відповіді поки немає. MS-WEB не вимірювався.
