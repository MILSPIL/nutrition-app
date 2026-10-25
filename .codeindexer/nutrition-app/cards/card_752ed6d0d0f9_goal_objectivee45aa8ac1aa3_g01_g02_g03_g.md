---
id: card_752ed6d0d0f9
card_type: todo
title: "HERMES-COACH-02: завершити вебтренера, порції й автоматичні дати"
project: nutrition-app
product: scisense
phase_id: phase_870a15952663
status: open
importance: high
signal: verification
complexity: high
tags: [HERMES-COACH-02, HERMES-HOST-01, deployed, technical-smoke-passed, owner-acceptance-pending]
links: [{to: card_128eb6c248fb, kind: related}]
review_required: true
acceptance: "[{\"manual_approval\":\"Юрій явно погодив локальні кроки0–5 HERMES-COACH-02 та припущення А1–А4; окремо назвав I01, якщо включає його.\"}]"
evidence: "2026-10-25: API/UI1.9.0 release21b0cd3116fce40d1dd706244cbff4bde81ef156 live на https://ntzg.pp.ua. Exact CI40211603506:4/4PASS; 172 цільові тести, незалежні рев’ю без блокувальнихP1/P2. Живі вхід, явний голос, дата «вчора», Add/replay/reload і порада за підтвердженим днем пройдені. Фінальні яблуко/картопля/фото за20.9/33.7/22.9с отрималиЗ/А/Б і частки норми; фото200г→80ккал. АвторизованийUI375/390/1366:overflow0,дельти0,gutters16/16. Public36/36хешів, здоровий сервіс, погоджені ресурси й бюджет збережені. Тимчасові доступи та власні тестові записи прибрані, приватні квитанції лише локально. C08/телефон/Mac-off/пілот і G02–G11 очікують власника. НеблокувальнийP3поясненнямаси:card_d5913121e1be. Журнал1210 уже в main черезPR32/dca29f3, точнийblob перевірено; продуктовий код не злитий. Канон PROJECT-INFO.md, docs/evidence/hermes-coach-live-deployment-2026-10-25.json."
valid_from: "2026-10-24T19:53:39.617297+00:00"
created_at: "2026-10-24T19:53:39.617297+00:00"
updated_at: "2026-10-25T16:46:56.785548+00:00"
author: Codex
content_hash: "sha256:c4c9cdb91c4ba6eeee10d5a8ed8b569b0fb4b8f5c68e37a573369df7c7071461"
---

Goal objective_e45aa8ac1aa3; G01/G02/G03/G05/G06/G07/G08/G09/G11. Результат: один вебтренер дає поради за свіжим днем, приймає побутову їжу без обов’язкової етикетки, сам визначає літеру/частку й дату «вчора», зберігає лише через прев’ю + одну «Додати». Специфікація/план docs/superpowers/{specs,plans}/2026-10-24-hermes-coach-next.md. Поточний дозвіл власника від2026-10-24: виконати0–5/I01, підготувати приватний кураторський пакет, провести необхідне розгортання й перевірки на ntzg.pp.ua в межах чинного$5, погоджених моделей і ресурсів. Продуктовий main не зливається автоматично. Кінцеве приймання залишається за власником. Доказ документа: baseline,2 незалежні spec-проби, перевірене Fable-review та D01–D06 PASS; приймання реалізації C01–C08, телефон і незмінний G09. Telegram замінюється лише після приймання вебсценарію й окремого cutover. Невдалий baseline не дорівнює виправленню.
