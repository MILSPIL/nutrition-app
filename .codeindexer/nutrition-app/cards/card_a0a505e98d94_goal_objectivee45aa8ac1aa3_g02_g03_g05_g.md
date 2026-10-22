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
evidence: "NTZG-DEPLOY-03 перевірено незалежним Codex D01–D08: PR23 mainf31f061, лише journal1440/blob61481bfd/CI2/2; архів163файли і32runtime+89frontend source збігаються; незалежний loopback8/8, externalfetch0, cleanup. Виправлено maintenance до writer fence і receiver inactive/check перед localexport. Архів f9 installAllowedfalse: потрібні Node24.22.1 pins/fullLinuxCI/newSHA, класифікація99rootdependencyadvisories, server prerequisites і погодження. Runtime jose audit0. Root transport для C невідомий. Канон docs/evidence/ntzg-deployment-package-2026-10-22.json, план і PROJECT-INFO.md. Keys/$5/server0; G02–G11pending."
valid_from: "2026-10-20T08:28:38.202240+00:00"
created_at: "2026-10-20T08:28:38.202240+00:00"
updated_at: "2026-10-22T18:56:31.776090+00:00"
author: Codex
content_hash: "sha256:d8ca746cea87b57254d8bbbb2a2b6de84532545c50f5be9e4912b8ad47d02a23"
---

Goal objective_e45aa8ac1aa3; G02/G03/G05/G07/G08/G11. Результат: мікрофон на головній → голос → фото упаковки в тій самій чернетці → прев’ю порції/ккал/БЖВ/джерела → одна «Додати» й підтверджений запис без дубля. Groq Free whisper-large-v3 + прямий Anthropic Sonnet 5.5 реалізовані локально в codex/scisense-server-prep; мова auto/uk/ru, режим stt_only без Anthropic/збереження. Чинний ledger збережено; Groq резервує0, спільно6/хв30/UTC-добу, один активний запит. 2026-10-22 завершені три локальні доробки: systemd стартує без ключів і активується окремим drop-in; CLI переносить той самий бюджет і encrypted credentials без активації; Firestore writerNonce/version блокує старі вкладки, зберігаючи G04. Журнал1440 перенесено PR23 у mainf31f061. NTZG-DEPLOY-03 підготовлено на погодження: 0Node security update24.22.1/повний CI/новий SHA, Aдоступ, Bdisabled install, Cокрема активація. Архівf9 перевірений8/8, ізольований Node24.22.1:8API+47server; встановлення заблоковане до нового релізу й погодження. Root receive transport не підтверджений. Межа: LIVE=false; реальні ключі/API/$5/сервер не використовуються, PR8/16 не злиті. Далі потрібні конкретні серверні передумови/дозвіл, реальний API+телефон, V01–V09 одного релізу й пілот. Інвентар лише в ігнорованому runtime. Продукт приймає Юрій; картка та G02–G11 відкриті.
