# Sonnet і окремий ключ SciSense в Default

- Дата і час: 2026-10-20T22:17:27+03:00
- Агент: Codex, модель GPT-6; Chat ID: 01a1585d-ba1e-7da0-a174-903bee0573b3
- Гілка: codex/voice-photo-entry, початковий HEAD9a23af6; код Sonnet f61e1ef

## Вимоги й результат
Юрій вибрав Sonnet замість Haiku, повідомив що створив окремий ключ застосунку в Default і попросив перевірити запис Keychain. `find.py scisense-anthropic` знайшов правильний service/account, `--len` підтвердив непорожність. Значення не виводили. Додаткова перевірка формату дала очікуваний префікс і відсутність whitespace. Читальний Models GET200 підтвердив claude-sonnet-5-5, image_input і structured_outputs. Inference0, кредит/організація ще не перевірені. Початкове Python keyring читання в sandbox дало помилку100001; той самий вузький read поза sandbox успішний, ACL не змінювали.

Адаптер Sonnet використовує JSON outputs, between_tools/medium/max4096, без forced tool_choice/fallback. Строго читає text block; refusal/truncation/інша модель відхиляються, числові та довжинні межі перевіряє чинний validateAnalysis. Старий явно налаштований протокол і WAV не змінено. Аудіо через локальний Whisper ще не реалізовано.

Конкретний бюджет перерахований чинним reservation:20analysis викликів резервують3039200microUSD. Пропонована стеля5USD замість попередніх0.25 для Haiku ще НЕ погоджена; LIVE_ENABLED=false, PRICING_APPROVED_AT порожня. Ключ у Default не створює окремого балансу; нових організацій/workspaces не створювали.

## Файли
workers/meal-parser/src/providers.js; test/providers.test.js; pilot-proposal.json; README.md; docs/VOICE-PHOTO-LIVE-APPROVAL.md; docs/PRODUCT-GOAL.md; docs/evidence/sonnet-preparation-2026-10-20.json; PROJECT-INFO; .codeindexer та цей журнал. Primary/scale код не чіпали, ignored handoff головного агента оновлено.

## Перевірка
- Worker npm test:25/25, включно з8новими контрактними/негативними сценаріями та realworkerdSQLite.
- Worker npm run check:dry-run PASS, live=false, публікації немає.
- Root CI=true npm run test:ci -- --runInBand:88/88.
- Root npm run build:PASS; git diff --check:PASS.
- Models API лише читання, без промптів чи медіа; доказ знеособлений у docs/evidence/sonnet-preparation-2026-10-20.json.
- Context7 quota exhausted. Прочитано official Sonnet5.5 model/migration, structured outputs, Models retrieve, Console workspaces/cost reporting. Параметри й schema limitations взяті звідти.

## Незалежне рев’ю
Codex sonnet_preparation_review, свіжий контекст, read-only за spec-reviewer, критеріїS01–S05. Вердикт done у межах S01–S05: підтверджених проблем немає. Незалежно повторено 25/25 Worker-тестів, dry-run і diff check; додаткові 27 порушень обмежень та 5 причин зупинки відхилені. Реальне розпізнавання, Whisper, телефон і бюджет цим рев’ю не прийняті.

## Стан і далі
Sonnet обраний, проєктний ключ збережений і автентифікує читальний API. Потрібні погодження5USD, підтвердження кредиту, Whisper/live binding, телефон/TLS trust. Goal активний, G05/G11 явно лишено pending. Дані продукту/production не змінені. Журнал у PR-гілці, main не змінювали.
