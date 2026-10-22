---
project: nutrition-app
domain: constraint
slot: live_api_approval
confidence: 1
valid_at: "2026-10-22T21:43:10.206876+00:00"
provenance: PROJECT-INFO.md; journal2250; docs/evidence/ntzg-execution-2026-10-22.json; exact rules/public HTTP/mobile QA and admin absence receipts 2026-10-23
---

2026-10-23: NTZG-DEPLOY-03 0+A+B погоджені. PR24 переніс тільки журнал2146 у main; журнал2250 ще лише в codex/scisense-server-prep. 0/A пройдені, B опублікував https://ntzg.pp.ua з точного bad8217, Node24.22.1, API inferenceEnabled:false. 162 payload hashes і 27 build hashes звірені. Firebase domain збережений, нові rules опубліковані; writer fence двічі поспіль PASS: нові create/update дозволені, legacy merge/full-set403, синтетичні дані прибрані. HTTPS Full(Strict), HTML/API no-store, static immutable; один OLS reload, global config unchanged, сусіди3x200. Виправлений тільки mtime index для старої Brotli-копії, байти незмінні. Публічні хеші та мобільний екран390x844 PASS; вхід із реального телефона pending. Admin B відкликаний, present:false підтверджено; ephemeral Firebase ID token видалений, власні вкладки закриті. Приватний операційний інцидент конфігурації не закритий, деталі лише runtime/handoff. C, model keys/read/transfer/calls/$5 заморожені; перед C потрібні явний дозвіл, Free/ZDR, exact UID, root receive transport, чинний ledger без reset. PR8/16 не зливати. G02–G11 pending. Журнал2250 у main лише після окремого так.
