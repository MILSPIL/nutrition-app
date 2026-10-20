---
project: nutrition-app-scale
domain: constraint
slot: live_api_approval
valid_at: "2026-10-20T14:44:52.169582+00:00"
provenance: Пошуковий пойнтер на канон nutrition-app, без змін файлів feat/voice-input.
---

Канон і реалізація в nutrition-app / codex/voice-photo-entry, не у цьому старому дереві. 2026-10-20: Юрій просить використати $100–200 щомісячних Claude-кредитів і спершу погодити моделі/бюджет. Пакет docs/VOICE-PHOTO-LIVE-APPROVAL.md у codex/voice-photo-entry: рекомендовано B, local Whisper large-v3-turbo-q5_0 + claude-haiku-5-5, стеля $0.25 Claude-кредитів; Whisper ще не реалізований. A: pinned OpenAI STT+Haiku, $1 total, звук окремо від Claude-кредитів і без поповнень. Програма Max підтверджена офіційно, особистий баланс/organization/API key не перевірено. Реалізований локальний HTTPS/Auth/Firestore канал із pairing; 88Jest/3Node/10browserPASS, TLS у Keychain, CLI live=false. Codex review3P2 виправлено; фактичний телефон/TLS-довіра/провайдери pending, платних викликів0. G04 до приватного пілоту, Goal активний.
