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
evidence: "2026-10-20: локальний код c9f3ab3 реалізовано; PR https://github.com/MILSPIL/nutrition-app/pull/8 (draft). 88 Jest,17 Worker,17 Firestore,25 browser PASS; build/dry-run PASS; реальний workerd SQLite restart. Незалежні Codex/Claude, підтверджені P2 виправлено. GitHub push і PR CI пройшли для 58e5c70, src/Worker тотожні c9f3ab3. docs/VOICE-PHOTO-VALIDATION.md, synthetic artifacts і журнал2026-10-20-1600. Картка відкрита: real phone/API V01–V03/V09, окремі акаунти/моделі/тарифи/бюджет/retention; G04 до приватного пілоту. Goal активний, G02/G03/G05/G07/G08/G11 не passed.\n2026-10-20: підготовлено docs/VOICE-PHOTO-LIVE-APPROVAL.md та pilot-proposal.json, live=false/погодження відсутнє. A: Haiku5.5 + pinned OpenAI STT, стеля $1 сукупно; 30 викликів резервують $0.451960 (чинний reservation перевірено offline), 16 API/budget tests PASS. B: локальний Whisper+Haiku, $0.25 Claude-кредитів, адаптер ще не реалізовано. Щомісячні Max API-кредити підтверджені офіційно, організація/залишок/проєктні ключі не підтверджені. API/HTTPS/Auth телефонний канал ще pending; платних викликів 0.\n2026-10-20: HTTPS лабораторія реалізована, scripts/phone-lab*, docs/PHONE-LAB.md. 88Jest/3Node/10browserPASS; TLS/UID/project/authcarriers/SQLite guards; Codex review3P2 confirmed+fixed. Квитанція dd6713ad1fa14e96-aaukizbk cleanup_ok/removedtrue. Реальні API CLI не вмикає. Поточна рекомендація B/$0.25 лише Claude-кредитів; вибір, акаунт, Whisper adapter, live binding і фізичний телефон pending. Ніякого закриття G07 за mock.\n2026-10-20, актуальне уточнення: Юрій вибрав Sonnet5.5 й окремий ключ у Default. Keychain/Models GET200 перевірено, inference0. Sonnet JSON outputs адаптер25Worker tests/dry-runPASS. Перерахований резерв20analysis calls $3.0392, пропозиція стелі$5 ще не погоджена. Попередні Haiku/$0.25 пропозиції вище історичні. Локальний Whisper, live binding, підтверджений кредит і фізичний телефон лишаються pending. docs/VOICE-PHOTO-LIVE-APPROVAL.md, docs/evidence/sonnet-preparation-2026-10-20.json. G05/G11 pending."
valid_from: "2026-10-20T08:28:38.202240+00:00"
created_at: "2026-10-20T08:28:38.202240+00:00"
updated_at: "2026-10-20T19:16:20.586204+00:00"
author: Codex
content_hash: "sha256:619757967ccb3867f7a3a82c20ad04cd4232a6b7709305d360ea4658965917ee"
---

Goal objective_e45aa8ac1aa3; критерії G02, G03, G05, G07, G08, G11.

Перший пріоритет Юрія 2026-10-20: мікрофон на головному екрані записує голос у додатку; після голосу фото назви/етикетки упаковки уточнює той самий продукт. API готує назву, спожиту кількість, ккал/БЖВ і джерело. Коротке прев’ю й одна «Додати» з підтвердженим збереженням. Сценарій «цей кефір, 200 грамів» має пройти без ручного пошуку і введення БЖВ; фото в цьому ж першому етапі.

Канон: docs/superpowers/specs/2026-10-20-voice-photo.md та план з тим самим ім’ям. Продуктові рішення, технічний план і пороги пілоту явно погоджені Юрієм 2026-10-20. Реалізація в codex/voice-photo-entry від main 3a7034e, цільово використати текстовий парсер/прев’ю з nutrition-app-scale (feat/voice-input), не зливати стару гілку цілком. Наявні 40 тестів не доводять аудіо/фото. Перевірити sources/units, missing≠zero, race/повтори, server auth/квоти/бюджет, атомарний запис та сумісність ручного введення.

Приймання: V01–V09, реальний телефон та окремо дозволений API E2E, незалежне рев’ю і перечитане сховище на одному SHA. До G04 тільки ізольовані тестові дані. Production/платні API окремо. Картка й G05/G11 не закриваються за одним mock/зеленим unit-suite.
