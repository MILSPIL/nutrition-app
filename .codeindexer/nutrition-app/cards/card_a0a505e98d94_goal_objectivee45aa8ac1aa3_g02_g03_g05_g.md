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
evidence: "Writer d08e433, transfer35f0976, systemd02bf771807b6e563fd6ee3e3df6575ee3dcc9af1. CI39775149334 успішний на02bf771: усі3jobs,4browserflows,build; systemd8/8 наARMлокально таx86CI, budget/receipt/anchorretained, cleanuptrue. Rules38,storage26,app123,server47. Незалежні Codex reviews PASS, знайдені permission/fsync/cleanup/context прогалини виправлені. QA-only уточнення Google SDK probe продовжує route.abort; STT-only26/26 локально. Детальні поточні SHA/CI, помилки та докази: docs/evidence/local-deployment-fixes-2026-10-22.json і PROJECT-INFO.md. Це не встановлення й не приймання телефона."
valid_from: "2026-10-20T08:28:38.202240+00:00"
created_at: "2026-10-20T08:28:38.202240+00:00"
updated_at: "2026-10-22T12:12:18.091594+00:00"
author: Codex
content_hash: "sha256:473fae060ab3ad3ced7c475a9e0d9cc57520e643d02609d57e0d2c8f0f71d37f"
---

Goal objective_e45aa8ac1aa3; G02/G03/G05/G07/G08/G11. Результат: мікрофон на головній → голос → фото упаковки в тій самій чернетці → прев’ю порції/ккал/БЖВ/джерела → одна «Додати» й підтверджений запис без дубля. Groq Free whisper-large-v3 + прямий Anthropic Sonnet 5.5 реалізовані локально в codex/scisense-server-prep; мова auto/uk/ru, режим stt_only без Anthropic/збереження. Чинний ledger збережено; Groq резервує0, спільно6/хв30/UTC-добу, один активний запит. 2026-10-22 завершені три локальні доробки: systemd стартує без ключів і активується окремим drop-in; CLI переносить той самий бюджет і encrypted credentials без активації; Firestore writerNonce/version блокує старі вкладки, зберігаючи G04. Журнал1308 перенесено PR22 у main8e57aea. Межа: LIVE=false; реальні ключі/API/$5/сервер не використовуються, PR8/16 не злиті. Далі потрібні конкретні серверні передумови/дозвіл, реальний API+телефон, V01–V09 одного релізу й пілот. Інвентар лише в ігнорованому runtime. Продукт приймає Юрій; картка та G02–G11 відкриті.
