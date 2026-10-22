---
project: nutrition-app-scale
domain: deploy
slot: target
confidence: 1
valid_at: "2026-10-22T22:25:20.430036+00:00"
provenance: MORNING-READY-01, CI39863603936, exact release receipt і публічні HTTP/browser перевірки 2026-10-23.
---

2026-10-23: SciSense 1.7.0 опублікований на https://ntzg.pp.ua, release f8a11a6c03bd1dc47bd74a444aae5f2846a6bf61, Node 24.22.1. Виправлено новини, 8 іконок та звіт із прев’ю/копіюванням без Telegram; Hermes ще не підключений. CI 39863603936: усі 3 перевірки успішні. Пакет 162 файли, archive SHA256 b5d57055a265d829eb5f6c8cef48498db6b410fe57d125696906ca22a5d9396b. Публічна перевірка: 28 файлів збігаються, identity/gzip/br правильні, 3 сусіди HTTP200, мобільний екран 390x844 без JS-помилок і overflow. Власний API 127.0.0.1:8787, 1 CPU/2 GiB, inferenceEnabled=false; модельні credentials/ledger/activation не встановлені, реальних модельних викликів 0. Groq Free whisper-large-v3 + прямий Anthropic claude-sonnet-5-5 погоджені для подальшої активації, один cap $5, квоти 6/хв і 30/UTC-добу, без платного STT fallback. C дозволений Юрієм, але Mac locked блокує фактичне підтвердження Groq Free/ZDR і контрольний Firebase-вхід. Деталі й докази: docs/evidence/morning-phone-ready-2026-10-23.json та MORNING-READY-01. UI розгортання пройшло незалежне рев’ю і 30 синтетичних failure-тестів; OLS/unit не змінені. G02–G11 pending, реальний телефон/пілот не прийняті. Main/PR8/16 не зливалися. Scale залишається окремим старим прототипом; чинний release з продуктового worktree.
