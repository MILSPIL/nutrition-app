# Groq Free у SciSense

Стан 2026-10-22. Goal `objective_e45aa8ac1aa3`, G05/G07/G08/G11. Голос розпізнає Groq `whisper-large-v3`; продукти й фото обробляє прямий Anthropic `claude-sonnet-5-5`. У звичайному режимі збережено сценарій: мікрофон на головному екрані → голос → фото упаковки → прев’ю → одна «Додати».

## Межа цього етапу

Локальну реалізацію Юрій погодив. `server/deployment.json` має `liveEnabled=false`, порожній `allowedUids`; дати нового погодження порожні. Реальні Anthropic, $5 і сервер не використовувалися. Попередній синтетичний виклик Groq дав HTTP 200 за 0.622 с; нових живих викликів під час реалізації не було. Справжній телефон, шум, камера, ZDR і продуктовий пілот ще потребують перевірки.

## Облік та обмеження

- До Groq передається тільки WAV 16 kHz mono до 90 с, модель, температура 0, формат відповіді й вибрана мова. Для `auto` поле `language` відсутнє. Ім’я файлу завжди `recording.wav`; UID, Firebase token, фото та текстові підказки не передаються. На пристрої зберігається лише вибір `auto/uk/ru`.
- Адреса HTTPS фіксована, перенаправлення заборонені. Автоматичних повторів, іншої моделі або резервного платного сервісу немає. Межі: відповідь 64 KiB, текст 8000 символів, виклик провайдера 45 с, приймання тіла 15 с, увесь HTTP-запит 65 с.
- Залишаються чинні `proposalId`, SQLite, усі старі рядки та єдина стеля Anthropic 5 000 000 мікродоларів. Groq резервує 0, але спроба займає слот. Завершення або помилка не повертають слот чи стару грошову суму.
- Квота застосунку спільна для всіх UID і типів викликів: 6 за хвилину, 30 за UTC-добу, один активний запит. Це до 2700 с аудіо за UTC-добу; аналіз тексту й фото теж займає слоти. Квоти зберігаються після перезапуску та перенесення.
- Схема SQLite не змінюється. Manifest/receipt v2 прив’язані до `proposalRevision` і `configHash`; старий дозвіл не активує Groq. Anchor захищає від відкату навіть записи з нульовою сумою.
- Безкоштовність залежить від Free-плану Groq. API не повідомляє тариф/баланс і не забороняє власнику змінити план у консолі. Перед особистим голосом потрібні підтвердження Free та Zero Data Retention. За 429 чернетка зберігається, автоматичної покупки немає.

## Перевірка тільки голосу після дозволу на особистий тест

Наведені команди зараз не виконувалися. Потрібні Node 24.11.1, Firebase demo emulator, TLS-довіра телефона та приватна IPv4-адреса Mac. `prepare` створює локальний TLS-ключ у Keychain, а не модельні ключі.

1. Зафіксувати отримані підтвердження в `sttApproval.approvedAt/freeTierConfirmedAt/zeroDataRetentionConfirmedAt` у `workers/meal-parser/pilot-proposal.json`. Порожні або майбутні значення відхиляються. Sonnet-погодження лишається порожнім.
2. Підготувати збірку: `npm run lab:phone:prepare -- <приватна-IPv4-Mac> --stt-only`.
3. Ключ Groq зберігається тільки в Keychain `scisense-groq/api-key`. Скрипт читає його в пам’ять; ключ не переноситься в JSON, argv, env-файл або браузер.
4. Для чинного ledger: `node scripts/phone-lab.mjs enable-stt`. Лише за підтвердженої відсутності SQLite та маркера: `node scripts/phone-lab.mjs enable-stt --initialize`. Не видаляти marker, SQLite або lock, щоб обійти відмову.
5. `npm run lab:phone` друкує повну HTTPS-адресу та `/lab/setup` для одноразового сполучення. Телефон і Mac мають бути в одній мережі. Видно тільки розшифровку; `/analyze` відхиляється до читання ключа Anthropic, резервування й мережі. Фото та «Додати» відсутні. Mac має працювати.

Повний режим вимагає окремої збірки та нового `fullApproval`: дата, поточні revision/hash і відповідні `approvedAt`/`candidateC.PRICING_APPROVED_AT`. Історичний дозвіл на локальний Whisper не підходить. Використовується залишок того самого бюджету $5. Режими збірки та runtime повинні збігатися.

## Майбутнє серверне розгортання

Поточний план і незакриті передумови: [NTZG-DEPLOY-02](superpowers/plans/2026-10-22-ntzg-deployment-preparation.md). Шаблон service ще потребує окремого безключового старту; операційний transfer adapter і fence старих writers не завершені. Пакет не встановлювати до їх перевірки.

Підготовлено Node API з лімітом 1 CPU / 2 GiB та одним запитом, без GPU і локальних ваг Whisper. Пакет визначають `server/deployment.json`, `deploy/scisense-api.service` та `pilot-proposal.json`. Service читає два systemd encrypted credentials: `groq` і `anthropic`.

До встановлення потрібно перевірити серверні шляхи, backup, TLS/OLS, G04 rules та UID Юрія, потім отримати дозвіл на конкретний пакет. `prepareTransfer` має отримати актуальний `proposal` для receipt v2. Активація окремо задає `active`, `approvedReleases`, `allowedUids`, `pricingConfirmedAt`, `sttApprovedAt`; усі значення мають відповідати погодженню. Відкат вимикає обробку, зберігаючи ledger/anchor та витрати. Продуктові PR8/16 залишаються чернетками.

Перевірена локальна збірка фронтенду: `CI=true REACT_APP_MEAL_API_URL=/meal-api npm run build`. Це команда збірки, не розгортання.

## Перевірки

`npm run test:ci -- --runInBand`, `npm --prefix workers/meal-parser test`, `npm run test:server`, `npm run test:phone-lab`, `npm run test:meal-store`, `npm run test:rules`.

На macOS браузерні сценарії запускаються тільки через `/Users/user/.local/bin/agent-test-browser run scisense-phone-lab` та `/Users/user/.local/bin/agent-test-browser run scisense-phone-lab -- --stt-only`. Вони використовують синтетичні дані, demo Firebase і підставний транспорт Groq. Linux CI запускає `server/groq-linux-check.mjs` у контейнері 1 CPU / 2 GiB без мережі або ключів. Старий експеримент локального Whisper переведено на ручний `workflow_dispatch`; нових прогонів без окремого дозволу не робити.

Відомий успадкований дефект: три файли `category-{carbs,dairy,treats}-v4.png` відсутні, браузер отримує 404. Нових помилок JavaScript або API в локальних сценаріях немає. Результати з доказами збережено в `docs/evidence/groq-free-implementation-2026-10-22.json`; вони не заміняють приймання справжнього телефона.

Джерела: [Groq STT](https://console.groq.com/docs/speech-to-text), [квоти](https://console.groq.com/docs/rate-limits), [тарифи акаунта](https://console.groq.com/docs/billing-faqs), [зберігання даних](https://console.groq.com/docs/your-data). Context7 вичерпав місячну квоту; контракт звірений з офіційною документацією Groq.
