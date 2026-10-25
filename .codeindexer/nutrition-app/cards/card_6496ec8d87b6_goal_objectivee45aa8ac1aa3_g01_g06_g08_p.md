---
id: card_6496ec8d87b6
card_type: gotcha
title: Native імпорт Hermes не переносить живу власність сесії
project: nutrition-app
product: scisense
phase_id: phase_870a15952663
status: open
importance: high
tags: [hermes, migration, native-ownership, HERMES-PERSONAL-01]
evidence: .agents/journal/2026-10-25-2212-codex-gpt-6.1-sol-personal-hermes-plan.md
valid_from: "2026-10-25T19:15:12.873569+00:00"
created_at: "2026-10-25T19:15:12.873569+00:00"
updated_at: "2026-10-25T19:15:12.948886+00:00"
content_hash: "sha256:1f3f2cae6d657b3b807008de48cee625909f1d19fdc2657b66ca35212f9a535e"
---

Goal objective_e45aa8ac1aa3; G01/G06/G08. Результат: справжній тренер продовжує ту саму сесію після перенесення. На pin3f2afed hermes_state_portability.py:789 import_sessions відновлює історію, скидає live runtime/ownership і пропускає наявні IDs. Тому schema32/однакові counts/читабельний архів не доводять resume або тотожність при колізії. Перед skip перевіряти семантичний fingerprint; до приватного cutover синтетично довести підтримане native resume через owner API. Для відкату з новим хвостом потрібен свіжий export у новий порожній store, не overlay старої копії. Межа: перевірений source-контракт і гейт плану; фактична міграція ще не виконана. Приватні IDs/контекст не індексувати.
