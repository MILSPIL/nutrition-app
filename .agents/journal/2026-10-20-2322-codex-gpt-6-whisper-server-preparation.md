# Whisper, погоджений бюджет і підготовка MS-WEB

- Дата: 2026-10-20 23:22, Europe/Kiev.
- IDE / агент: Codex desktop; модель GPT-6; chat 01a1585d-ba1e-7da0-a174-903bee0573b3.
- Goal: objective_e45aa8ac1aa3, G05/G07/G08/G11; усі ці verdict pending.
- Мета: Whisper + Sonnet у погодженій стелі $5, доступ із телефона. Юрій уточнив ціль ntzg.pp.ua на MS-WEB Server.

## Виконано

Журнал про окремий Sonnet-ключ перенесено в main через PR #10, merge b6c0579, дві CI-перевірки успішні. Код PR #8 не переносився. Власник підтвердив наявність API-кредитів; точний баланс не записується в Git.

Реалізовано локальний Whisper через stdin/stdout, timeout/abort, одну одночасну транскрипцію та перевірку тиші. Фіксовані source/model hashes перевірені. Ключі читаються тільки в пам’ять з Keychain. Локальний голос має нульову API-ціну, але проходить ті самі квоти. SQLite та окремий Keychain-маркер не дозволяють тихо відновити новий бюджет після втрати файла. Enable-live не запускали, платних викликів 0.

Свіжий Codex whisper_live_review знайшов P1: pinned CLI зі stdin не повертає текст без -otxt. Виправлено, регресійний тест додано; повторне рев’ю підтвердило виправлення. Реальний синтетичний український WAV 2.63 с дав правильну фразу про 200 г кефіру за 2872 мс. Це доказ Mac, не Ubuntu/телефона.

Read-only xCloud підтвердив MS-WEB, 4 ядра/8 ГБ RAM, Node не встановлений; окремого SciSense-сайту немає. Репозиторій CRA доступний і сумісний з native static deployment. Dry-run створення повернув HTTP 403; читання прав токенів теж 403. Cloudflare DNS веде на потрібний сервер, edge HTTPS 200, режим full; origin strict не встановлено. Три сусідні сайти мають HTTPS 200 до змін; змін не було. Адреси, UUID й діагностика доступу лишаються в локальному runtime.

## Файли й перевірки

scripts/phone-lab/{whisper,keychain,live}.mjs та whisper.test.mjs; gateway.mjs/phone-lab.mjs; Worker index/budget/tests; package.json; pilot-proposal.json; PHONE-LAB.md; VOICE-PHOTO-LIVE-APPROVAL.md; PROJECT-INFO.md; docs/evidence/whisper-local-2026-10-20.json.

- npm run test:phone-lab: 8/8.
- npm test у workers/meal-parser: 27/27; npm run check: успішно, live false.
- node scripts/phone-lab.mjs prepare: build успішний; сервер не запускався.
- pinned whisper-cli на синтетичному WAV: непорожній правильний текст.
- git diff --check: успішно.

## Далі й межі

Підготувати серверний пакет: точний runtime/API/Whisper, G04, HTTPS, секрети, постійний бюджет, версійний реліз і відкат. Власний xCloud-токен читає сервер; dry-run створення блокується 403, потрібен deployment-доступ. Не позичати клієнтські ключі. Не публікувати demo gateway, не переносити Mac-бінарник на Ubuntu. Не скидати $5 між локальними й серверними перевірками. Реальний Sonnet, фізичний телефон, G04 та розгортання не виконані.
