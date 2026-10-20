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
evidence: "Актуально 2026-10-20: базовий голос/фото c9f3ab3 (88Jest/17Worker/17Firestore/25browser/build), phone-lab9f30193 (3Node/10browser), Sonnetf61e1ef (25Worker), Whisper+budget b8f7351 (27Worker/8Node/build/dry-run). Підтверджені Codex/Claude findings виправлені; свіжий Whisper review P1 -otxt виправлено й прийнято. Реальний synthetic UA 2.63s → правильні кефір/200г за2872мс наMac; не доказUbuntu/phone. Юрій погодив Whisper+Sonnet5.5/$5 і підтвердив кредит; Default/окремийключ/ModelsGET200. Генерацій0, livebindingнеактивний, бюджетнескидався. Новий target https://ntzg.pp.ua на MS-WEB. Read-only xCloud4cores/8GB/Nodeнеinstalled/siteнемає, gitdetectcompatible; creationdryrun403. DomainTLS200/SSLfull,originstrictpending. Потрібніdeploymenttoken,сервернийпакет/G04,realSonnet/phone і фінальний пілот. PR8draft; журналключаmergedmainPR10b6c0579, коднеmerged. Канон PROJECT-INFO.md, journal2322, docs/evidence/whisper-local-2026-10-20.json, docs/superpowers/plans/2026-10-20-ntzg-whisper-addendum.md. Картка/Gxx лишаютьсявідкриті."
valid_from: "2026-10-20T08:28:38.202240+00:00"
created_at: "2026-10-20T08:28:38.202240+00:00"
updated_at: "2026-10-20T20:21:09.425062+00:00"
author: Codex
content_hash: "sha256:619757967ccb3867f7a3a82c20ad04cd4232a6b7709305d360ea4658965917ee"
---

Goal objective_e45aa8ac1aa3; критерії G02, G03, G05, G07, G08, G11.

Перший пріоритет Юрія 2026-10-20: мікрофон на головному екрані записує голос у додатку; після голосу фото назви/етикетки упаковки уточнює той самий продукт. API готує назву, спожиту кількість, ккал/БЖВ і джерело. Коротке прев’ю й одна «Додати» з підтвердженим збереженням. Сценарій «цей кефір, 200 грамів» має пройти без ручного пошуку і введення БЖВ; фото в цьому ж першому етапі.

Канон: docs/superpowers/specs/2026-10-20-voice-photo.md та план з тим самим ім’ям. Продуктові рішення, технічний план і пороги пілоту явно погоджені Юрієм 2026-10-20. Реалізація в codex/voice-photo-entry від main 3a7034e, цільово використати текстовий парсер/прев’ю з nutrition-app-scale (feat/voice-input), не зливати стару гілку цілком. Наявні 40 тестів не доводять аудіо/фото. Перевірити sources/units, missing≠zero, race/повтори, server auth/квоти/бюджет, атомарний запис та сумісність ручного введення.

Приймання: V01–V09, реальний телефон та окремо дозволений API E2E, незалежне рев’ю і перечитане сховище на одному SHA. До G04 тільки ізольовані тестові дані. Production/платні API окремо. Картка й G05/G11 не закриваються за одним mock/зеленим unit-suite.
