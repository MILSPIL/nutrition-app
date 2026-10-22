---
project: nutrition-app-scale
domain: deploy
slot: target
confidence: 1
valid_at: "2026-10-22T10:18:46.671332+00:00"
provenance: NTZG-DEPLOY-02, прямі дозволи користувача; інвентар виключений з Git.
---

2026-10-22: ціль SciSense https://ntzg.pp.ua. Groq Free whisper-large-v3 + прямий Anthropic Sonnet 5.5; API 1 CPU / 2 GiB, той самий ліміт $5 та ledger, LIVE=false. PR21 переніс два погоджені журнали в main 96a1a5f; продуктові PR8/16 не злиті. План NTZG-DEPLOY-02 перевірений незалежним Codex, пакет встановлення ще не готовий. Потрібні безключовий systemd-старт, операційний transfer adapter, захист від несумісних старих Firestore writers і завершення приватної інвентаризації. Канон: PROJECT-INFO.md та docs/superpowers/plans/2026-10-22-ntzg-deployment-preparation.md. Повний операційний план і діагностика лише в ігнорованому .agents/runtime/deployment/2026-10-22-ntzg/; не експортувати інвентар сервера. G02–G11 pending. Scale є старим окремим прототипом, не кандидатом розгортання.
