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
tags: [HERMES-COACH-02, implementation, owner-authorized, live-pending]
links: [{to: card_128eb6c248fb, kind: related}]
review_required: true
acceptance: "[{\"manual_approval\":\"Юрій явно погодив локальні кроки0–5 HERMES-COACH-02 та припущення А1–А4; окремо назвав I01, якщо включає його.\"}]"
evidence: "2026-10-25: інтегровано b1f81d8.267 Jest PASS; серверні195 cases закриті повним run194/195 та вузьким повтором sandbox-blocked packaging file2/2. Browser coach21/voice-photo73/phone-lab50+34 PASS. Linux ab1 CI40131465855: повний C05 5.585с/max31944B/2CPU2GiB/OOM0; native recovery/systemd PASS. Rules20позицій і фінальний CI ще в роботі. Mac/Keychain повторно locked, production/model API без змін. Джерело PROJECT-INFO.md, docs/evidence/*coach*."
valid_from: "2026-10-24T19:53:39.617297+00:00"
created_at: "2026-10-24T19:53:39.617297+00:00"
updated_at: "2026-10-24T21:08:35.983434+00:00"
author: Codex
content_hash: "sha256:c4c9cdb91c4ba6eeee10d5a8ed8b569b0fb4b8f5c68e37a573369df7c7071461"
---

Goal objective_e45aa8ac1aa3; G01/G02/G03/G05/G06/G07/G08/G09/G11. Результат: один вебтренер дає поради за свіжим днем, приймає побутову їжу без обов’язкової етикетки, сам визначає літеру/частку й дату «вчора», зберігає лише через прев’ю + одну «Додати». Специфікація/план docs/superpowers/{specs,plans}/2026-10-24-hermes-coach-next.md. Поточний дозвіл власника від2026-10-24: виконати0–5/I01, підготувати приватний кураторський пакет, провести необхідне розгортання й перевірки на ntzg.pp.ua в межах чинного$5, погоджених моделей і ресурсів. Продуктовий main не зливається автоматично. Кінцеве приймання залишається за власником. Доказ документа: baseline,2 незалежні spec-проби, перевірене Fable-review та D01–D06 PASS; приймання реалізації C01–C08, телефон і незмінний G09. Telegram замінюється лише після приймання вебсценарію й окремого cutover. Невдалий baseline не дорівнює виправленню.
