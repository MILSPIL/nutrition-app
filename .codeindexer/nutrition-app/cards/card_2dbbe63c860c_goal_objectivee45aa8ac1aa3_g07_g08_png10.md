---
id: card_2dbbe63c860c
card_type: todo
title: "I01: пришвидшити категорійні іконки без зміни малюнків"
project: nutrition-app
product: scisense
phase_id: phase_870a15952663
status: open
importance: medium
signal: verification
complexity: medium
tags: [I01, performance, implemented-local, live-pending]
evidence: "2026-10-24: локально реалізовано versioned WebP192px, всі8=49322bytes, перші3=18350bytes; browser cold/warm cache та реальні42px boxes перевірені. Commit9053459, docs/evidence/hermes-coach-ui-2026-10-24.json; phone-lab full50/STT34 PASS. Production ще не оновлювався, приймання власником pending."
valid_from: "2026-10-24T19:53:49.891103+00:00"
created_at: "2026-10-24T19:53:49.891103+00:00"
updated_at: "2026-10-24T21:08:38.970039+00:00"
author: Codex
content_hash: "sha256:70ef4d5a1c9a229222134206abd1c37930d36ba3cbebf625c3eebfe910838ca2"
---

Goal objective_e45aa8ac1aa3; G07/G08. Результат: маленькі категорійні іконки швидко відкриваються на телефоні. Виміряно: три PNG1024px разом2396262bytes,3748–4123мс,Cache-Control:no-store; повтор передає повне тіло. Доказ docs/evidence/category-icons-network-2026-10-24.json. План I01 у docs/superpowers/plans/2026-10-24-hermes-coach-next.md: оптимізація WebP з DPR3 та versioned build imports, без глобальної серверної зміни кешу. I01 та необхідне розгортання погоджені власником2026-10-24. Локальна реалізація й перевірки завершені; публікація входить у пакет HERMES-COACH-02 і очікує доступу до розблокованого Mac/Keychain. Приймання: три≤100KiB/усі8≤300KiB за збереженої якості, виміряні краї, без layout shift, повтор з кешу; потім live headers.
