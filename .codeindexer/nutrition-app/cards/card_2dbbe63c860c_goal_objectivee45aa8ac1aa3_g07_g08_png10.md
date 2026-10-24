---
id: card_2dbbe63c860c
card_type: todo
title: "I01: пришвидшити категорійні іконки без зміни малюнків"
project: nutrition-app
product: scisense
phase_id: phase_870a15952663
status: open
importance: medium
complexity: medium
tags: [I01, performance, awaiting-approval]
valid_from: "2026-10-24T19:53:49.891103+00:00"
created_at: "2026-10-24T19:53:49.891103+00:00"
updated_at: "2026-10-24T19:53:49.968100+00:00"
author: Codex
content_hash: "sha256:8573f17e10092bb71b803a38a255854a4ba28a89a8216bf2c62f558270c3d9a0"
---

Goal objective_e45aa8ac1aa3; G07/G08. Результат: маленькі категорійні іконки швидко відкриваються на телефоні. Виміряно: три PNG1024px разом2396262bytes,3748–4123мс,Cache-Control:no-store; повтор передає повне тіло. Доказ docs/evidence/category-icons-network-2026-10-24.json. План I01 у docs/superpowers/plans/2026-10-24-hermes-coach-next.md: оптимізація WebP з DPR3 та versioned build imports, без глобальної серверної зміни кешу. Межа: поки лише діагностика/план. Реалізація потребує погодження I01, deployment окремо. Приймання: три≤100KiB/усі8≤300KiB за збереженої якості, виміряні краї, без layout shift, повтор з кешу; потім live headers.
