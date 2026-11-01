---
id: card_067ff3dceee5
card_type: todo
title: "Тренер у Hermes: знання Мандзяка і людський голос"
project: nutrition-app
status: open
importance: high
signal: verification
complexity: high
host_need: [interactive]
tags: [hermes, trainer, mandziak]
acceptance: "[{\"manual_approval\":\"Юра підтвердив: тренер у живій розмові відповідає з урахуванням порад Мандзяка і звучить як людина-тренер; зміни на сервері зроблено з бекапом і його «так»\"}]"
evidence: "I am and Claude: sessions/mandziak-trainer-knowledge.md (журнал 28.10, «Відомі проблеми»)"
valid_from: "2026-10-28T17:01:18.407694+00:00"
created_at: "2026-10-28T17:01:18.407694+00:00"
updated_at: "2026-10-28T17:01:18.407694+00:00"
content_hash: "sha256:7e1fd3d2672bc301582c27eddea9a8983324ae64da20ef1b1e41c987ab4f3523"
---

Дати живому тренеру на сервері SciSense стислий конспект порад Мандзяка (knowledge/mandziak/digest.md 575 КБ не влазить у ліміт джерел 400 КБ) і опис людського голосу (SOUL серверного профілю або TRAINER_POLICY у server/trainer/tools.mjs). Mac-профіль scisense-trainer припаркований з 26.10, правки там тренер не побачить. Спершу рішення Юри: чий голос, мова, канал; далі spec-flow, backup, точний текст, окреме «так» (спека Codex 2026-10-26-telegram-coach-knowledge.md, «Межа Hermes»).
