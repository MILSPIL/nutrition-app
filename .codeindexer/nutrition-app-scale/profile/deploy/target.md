---
project: nutrition-app-scale
domain: deploy
slot: target
confidence: 0.04558726
valid_at: "2026-10-21T19:57:47.413886+00:00"
provenance: Прямий запит підготувати варіант на погодження; STT-API-01 і journal2257. Ключі/$5/сервер не чіпати.
---

2026-10-21: SciSense на ntzg.pp.ua/MS-WEB; Firebase Auth/Firestore без міграції. CLOUD-PREP-01 локально у codex/scisense-server-prep, PR16 draft. API/G04/budget та app CI39662207602 PASS. STT-SMALL-01 погоджено і виконано: small-q5_1, codebf8e22d, CI39662207789,2CPU/2GiB/45s;0/6normal (2timeout,1empty,3 без підтверджених продукту/200г),4controls/cleanupPASS,peak493.9–531MiB,noOOM. Native stdout-дефект виправлений, Linux10/10 та independent review PASS. Пороги synthetic тесту не пройдено; TTS/auto-language/справжній голос не оцінені, нового погодженого STT-рішення немає. ProductionCPU1/live=false, keys/$5/paidcalls0, Sonnet незмінний. AdminSSH/backup/TLS/provisioning/writerfence/реальнийtransfer/phone pending. Канон docs/SCISENSE-SERVER-PREPARATION.md, PROJECT-INFO.md та journal2227. Не merge/deploy автоматично. Сусідня scale-гілка не є кандидатом до deployment. STT-API-01 підготовлено на погодження 2026-10-21: рекомендовано Groq whisper-large-v3 + чинний claude-sonnet-5-5, Node1CPU/до2GiB без GPU/ваг. Пропозиція:20Groq викликів(10lab STT-only+10phone), стеля$0.10 окремо від єдиних$5Anthropic; GroqZDR і реальне аудіо потребують дозволу. Користувач ще не погодив новий варіант. Жодного коду/inference/ключів/серверних дій; ST01–ST05 та G02–G11 pending. Канон docs/superpowers/plans/2026-10-21-scisense-stt-api.md, docs/evidence/stt-api-proposal-2026-10-21.json, journal2257.
