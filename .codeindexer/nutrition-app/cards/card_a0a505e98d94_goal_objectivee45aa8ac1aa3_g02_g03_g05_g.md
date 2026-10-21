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
evidence: "Код dab68d57139f4d94158fef6bd2aae9230b846a73: CI39676485745 SUCCESS, обидва jobs. App123/Worker39/storage17/server27/rules29/phone-lab17; чотири browser flows і build PASS. Окремо 35 Linux fixture перевірок у 1 CPU/2 GiB за 1560 мс без мережі/ключів. Незалежні Codex reviews PASS. Канон PROJECT-INFO.md, docs/GROQ-FREE-SETUP.md, docs/evidence/groq-free-implementation-2026-10-22.json та .agents/journal/2026-10-22-0012-codex-gpt-6-groq-free-integration.md. LIVE false; реальне приймання pending."
valid_from: "2026-10-20T08:28:38.202240+00:00"
created_at: "2026-10-20T08:28:38.202240+00:00"
updated_at: "2026-10-21T21:15:14.120170+00:00"
author: Codex
content_hash: "sha256:a933ff3775ea1ae3ca21fc0db6e2094c1b8089d7f60236c20c78dff1a201d2d9"
---

Goal objective_e45aa8ac1aa3; критерії G02/G03/G05/G07/G08/G11. Результат для користувача: мікрофон на головному екрані → голос → фото назви/етикетки упаковки в тій самій чернетці → прев’ю з порцією/ккал/БЖВ/джерелом → одна «Додати» і підтверджений запис без дубля. Юрій погодив продуктовий сценарій, план і пороги пілоту. 2026-10-22 прямо погодив локальну реалізацію Groq Free whisper-large-v3; вона виконана в codex/scisense-server-prep. Sonnet 5.5 лишається в прямому Anthropic. Мова auto/uk/ru зберігається, є окремий stt_only режим без ключа/аналізу/резерву Anthropic. Чинний ledger не обнуляється, Groq резервує 0; глобально 6/хв,30/UTC-добу,1 активний. Межа: LIVE вимкнено, дати активації порожні; нових живих API/ключів/серверних дій немає. Приймання: V01–V09, реальний дозволений API, телефон і перечитаний запис на одному release SHA, G04 та пілот; продукт приймає Юрій. Нові реальні голосові записи/Free/ZDR, Anthropic/$5 і розгортання потребують наступного погодженого кроку. Картка та G02–G11 відкриті, моки не означають приймання.
