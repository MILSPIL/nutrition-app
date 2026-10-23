---
id: card_a0a505e98d94
card_type: todo
title: Голос + фото → готовий прийом з однією кнопкою «Додати»
project: nutrition-app
product: scisense
phase_id: phase_870a15952663
order_hint: 0
status: open
importance: high
review_required: true
acceptance: "[{\"reviewer_rubric\":\"G02/G03/G05/G07/G08/G11: усі V01–V09 на одному SHA, прямий запис мікрофона, фото упаковки в тій самій чернетці, одне підтвердження і перечитаний прийом. Джерела/основа/одиниці, повтор/конфлікт/збій перевірені; реальний дозволений API й телефон обов’язкові; продукт приймає Юрій.\"}]"
evidence: ".agents/journal/2026-10-23-1224-codex-gpt-6-ntzg-voice-photo-live.md; docs/evidence/voice-photo-live-2026-10-23.json; CI39923287970 exact9f2759b 3/3; root+independent activation55/recovery14; public28files/3encoding/8icons/3neighbors after cleanup. Попередня незмінена UI-база: browser49+33+26+7, app140/server64. Проба фізичного телефона та особисте збереження не перевірені цією API-пробою."
valid_from: "2026-10-20T08:28:38.202240+00:00"
created_at: "2026-10-20T08:28:38.202240+00:00"
updated_at: "2026-10-23T09:26:29.371149+00:00"
author: Codex
content_hash: "sha256:108fa571c6564cd51617ae9db5e1bccd3b4bcf88bec74cff5e416c462f2ab5da"
---

Goal objective_e45aa8ac1aa3; G02/G03/G05/G07/G08/G11. Результат: мікрофон на головній → голос → фото упаковки в тій самій чернетці → прев’ю порції/ккал/БЖВ/джерела → одна «Додати» й підтверджений запис без дубля. 2026-10-23 release9f2759b опублікований на ntzg.pp.ua: Groq Free whisper-large-v3 + direct Anthropic claude-sonnet-5-5, UI1.7.0, Node24.22.1. Реальний синтетичний API-тест пройдено: голос3193мс, етикетка4512мс, порція200г→106ккал/Б6/Ж5/В8; без фото продукт/порція розпізнані, невідомі БЖВ уточнюються. Один free+два paid, особистий щоденник не змінений. Єдиний cap$5, резерв166108мкдол, reset0, unfinished0; зашифровані ключі. Тимчасовий admin відкликаний, його секрети й app token видалені, APItrue після cleanup. Новини/іконки/report preview-copy виправлені, Hermes не підключений. Межа: main/PR8/16 не злиті; жодного повторного transfer/init або платного STT fallback. Далі: фізичний телефон Юрія, перевірене збереження, V01–V09 одного релізу та пілот. Приватний Firebase incident відкритий. Картка й G02–G11 залишаються відкритими до реального продуктового приймання Юрієм.
