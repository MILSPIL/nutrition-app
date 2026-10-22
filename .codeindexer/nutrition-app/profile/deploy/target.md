---
project: nutrition-app
domain: deploy
slot: target
confidence: 1
valid_at: "2026-10-22T12:03:51.994176+00:00"
provenance: Прямий дозвіл 2026-10-22; writer d08e433, transfer35f0976, systemd02bf771; лише локальна підготовка.
---

2026-10-22: SciSense готується до https://ntzg.pp.ua. Groq Free whisper-large-v3 + прямий Anthropic Sonnet 5.5; API 1 CPU / 2 GiB, той самий ledger і ліміт $5, LIVE=false. Три погоджені локальні доробки реалізовані в codex/scisense-server-prep: writerNonce/version fence, операційний transfer CLI та безключовий systemd з окремим live drop-in. Докази: rules38, storage26, server47, actual Linux ARM64 8/8 з незмінними paid/free rows, receipt/anchor після restart; незалежний Codex PASS. CI конкретного коду та актуальний стан: docs/evidence/local-deployment-fixes-2026-10-22.json і PROJECT-INFO.md. PR22 переніс журнал1308 в main8e57aea; продукт PR8/16 не злитий. Встановлення, серверні передумови, особистий голос/фото й телефон не перевірені цим етапом. Приватний інвентар лише в ігнорованому runtime, не експортувати. G02–G11 pending.
