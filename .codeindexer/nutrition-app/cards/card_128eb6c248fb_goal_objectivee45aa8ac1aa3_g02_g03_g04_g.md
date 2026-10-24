---
id: card_128eb6c248fb
card_type: todo
title: "HERMES-FOOD-01: локальна реалізація чату 0–7"
project: nutrition-app
product: scisense
phase_id: phase_870a15952663
status: done
importance: high
signal: verification
complexity: high
tags: [HERMES-FOOD-01, local-only, implementation]
links: [{to: card_29bef280dd54, kind: related}]
summary_on_close: "Незалежний Codex reviewer hermes_final_local_review: ВЕРДИКТ done для локальних кроків0–7/H01–H10 наce62052,0відкритих блокерів. Звірив source/runtime/CI/артефакт, відмови та ізоляцію. Функція локально готова з вимкненими інтеграціями; H11, B1/B2/C, реальний телефон, пілот і продуктове приймання не виконані та потребують окремих дозволів."
review_required: true
acceptance: "[{\"reviewer_rubric\":\"Погоджені локальні0–7 та H01–H10 перевірені на конкретному SHA, з actual pinned Hermes/mock provider і незалежним verdict; приватні/production дії відсутні. H11 окремо.\"}]"
commit_range: "{\"from\":\"94ea293\",\"to\":\"ce62052bb43aa21195af784201aa330c9221bf00\"}"
evidence: "2026-10-24: погоджені локальні0–7 завершено на ce62052bb43aa21195af784201aa330c9221bf00. Журнал1326 main PR27/2a71687 exactblob. CI40099514295 attempt2 SUCCESS4/4;250Jest/43Worker/47oldwriter,локально150server,38rules+7notesrules,31Hermes browser375/390/1366 edges0/gutter16/44px. Actual pinned Hermes3f2afed/fullUSDA13588:2CPU/2GiB/45s,turn9.428s,systemdpeak311238656B/OOM0;fullfailure cancel/429/deadline/SIGKILL/recovery PASS,0media leaks. Вимкнений пакет209app/31726runtime,manifestSHA50209c011c545a3868aa4838d31610bb93bcf6e1d0a3822c415820d77cd06c97;незалежно77source/28build byte-equal,5packagedHTTP/external0/keys0. ПершийCI502batchGet невстановленої причини збережено; незмінний локальний іCIповторPASS без послабленняassertions. docs/evidence/hermes-food-local-acceptance-2026-10-24.json;docs/deployment/hermes-food-local.md. Реальні API/приватний профіль/ключі/$5/сервер не зачіпались. H11/B/C/G02–G11 pending."
valid_from: "2026-10-24T11:19:34.460257+00:00"
created_at: "2026-10-24T11:19:34.460257+00:00"
updated_at: "2026-10-24T14:02:37.419173+00:00"
created_for: Codex
author: Codex
content_hash: "sha256:1c00f216425e1d13a8ec74e1d0bb7807d01b04884d59f93d59fbd2930028adca"
---

Goal objective_e45aa8ac1aa3, G02/G03/G04/G05/G06/G07/G08/G09/G11. Результат для користувача: один чат із наявним Hermes, текст/голос/фото, пошук або позначена оцінка, preview/Add, необов’язкова літера. Юрій2026-10-24 погодив локальні0–7 і А1–А4. Виконання у codex/hermes-food-chat-local від94ea293 за docs/superpowers/plans/2026-10-24-hermes-food-chat.md. Ранній gate1: справжній pinned Hermes3f2afed з синтетичним профілем/mock provider, без доступу до приватного профілю/реальних API/ключів/$5/сервера. Доказ: H01–H10, regression suites, exact CI, незалежні рев’ю та вимкнений пакет. H11/Gxx пілоту й B/C окремо, не приймати локальними mock. Зупинитися при непроходженні privacy/allowlist gate, не міняти runtime/модель/ресурси самовільно.
