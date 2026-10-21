# API голосу й фото

Актуалізація 2026-10-22: підготовлено Groq Free whisper-large-v3 і окремий stt_only, live-активація вимкнена. Чинні інструкції: [GROQ-FREE-SETUP.md](../../docs/GROQ-FREE-SETUP.md). Нижче збережено попередню конфігурацію для історії; команди локального Whisper не застосовувати для нового запуску.

Локальна реалізація, live вимкнено. Worker приймає Firebase ID token від клієнта; ключі провайдерів тільки у Cloudflare secret store. Він не приймає секрети відвідувача і не зберігає аудіо, фото або текст їжі.

## Контракти

- `POST /transcribe`: multipart `audio` (WAV PCM16, 16 kHz, mono, канонічний 44-byte header) та `duration`. Фактична тривалість перевіряється за PCM; до 90 с. Браузер перетворює підтримуваний MediaRecorder MIME перед надсиланням. Відповідь `{text}`.
- `POST /analyze`: `{text,images:[{type,data}]}`. `data` це base64 JPEG/PNG/WebP, до 2 фото по 5 MiB; текст до 8000 символів. Відповідь `{items,unparsed}` за схемою `src/schema.js`.
- Обидва маршрути: `Authorization: Bearer <Firebase ID token>`. Перевіряються підпис RS256, issuer/audience, час, UID allowlist. Origin/CORS не заміняє авторизацію.
- Усі провайдерні виклики мають окремі 45 с, без автоматичних повторів. Клієнт має 60 с на кожен маршрут.

## Локальні команди

```sh
npm ci
npm test
npm run check
npm run dev
```

`check` використовує лише `wrangler deploy --dry-run`, не публікує Worker. `dev` локальний, однак LIVE_ENABLED лишається false. Тести ін’єктують підставні відповіді й використовують локальну SQLite; не звертаються до платного API.

## Конфігурація перед окремо погодженим live-прогоном

| Параметр | Що зафіксувати |
| --- | --- |
| `ALLOWED_ORIGINS` | Точні origins клієнта через кому |
| `FIREBASE_PROJECT` | Проєкт, який видає перевірені токени |
| `ALLOWED_UIDS` | Тільки погоджені тестові облікові записи |
| `TRANSCRIBE_MODEL`, `PARSE_MODEL` | Підтримувані точні ID моделей і відповідні проєктні API-акаунти |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | Cloudflare secrets через stdin; локальний оригінал у Keychain, не `.dev.vars` і не Git |
| `PRICING_MODEL_PAIR` | Точний рядок `TRANSCRIBE_MODEL|PARSE_MODEL` |
| `PRICING_APPROVED_AT` | Дата погодженого перевіреного тарифу |
| `TRANSCRIBE_INPUT_MICROS_PER_MTOK`, `TRANSCRIBE_OUTPUT_MICROS_PER_MTOK` | Ціна мільйона вхідних аудіотокенів та вихідних текстових токенів транскрипції, у мільйонних частках долара |
| `INPUT_MICROS_PER_MTOK`, `OUTPUT_MICROS_PER_MTOK` | Ціна мільйона токенів у мільйонних частках долара |
| `PILOT_BUDGET_MICROS` | Погоджена абсолютна межа витрат у мільйонних частках долара |
| `LIVE_ENABLED` | `true` тільки після окремого дозволу на ці акаунти, матеріали, бюджет і політику провайдерів |

Один SQLite Durable Object резервує вартість перед upstream: 6 викликів на ковзну хвилину, 30 на UTC-добу та 2 одночасні на хешований UID. Повний резерв лишається витраченим після успіху, помилки або скасування, тому бюджет може вичерпатися раніше фактичного рахунку. Перезапуск не обнуляє ліміти. Без binding/тарифу/бюджету live закрито. Підвищення бюджету або створення live binding потребує окремого дозволу.

`wrangler.toml` містить тільки локальний каркас. Перед live треба заново перевірити верхні межі image/token тарифа обраних моделей, створення інфраструктури й політику зберігання в обох API. Ізольований синтетичний тест допускається після окремого погодження API; доступ G04 обов’язковий до приватного пілоту або production. Налаштування ліміту в коді не є дозволом витрачати кошти.

Для транскрипції резервується повна верхня межа 16000 вхідних і 2000 вихідних токенів. Підтримано лише snapshot-и gpt-4o-mini-transcribe-2025-12-15 та gpt-4o-mini-transcribe-2025-03-20; невідома модель блокується до перевірки її меж. Джерело меж: [офіційна документація моделі](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe), перевірено 2026-10-20. Середня ціна хвилини не використовується як гарантія бюджету. Жоден акаунт, тариф або live-модель цим документом не активовано.

Production JWT-перевірка відхиляє непідписані токени Firebase emulator. Телефонна лабораторія потребує окремого локального адаптера автентифікації з перевіркою demo issuer, без змін у production handler; локальний канал реалізовано в [PHONE-LAB.md](../../docs/PHONE-LAB.md) і перевірено з підставними моделями. CLI не вмикає реальні API; фізичний телефон і TLS-довіра власника ще pending. Multipart WAV → Worker parser → provider adapter перевірений на синтетичному звуці без мережевого API.

Пакет моделей і бюджету на погодження: [VOICE-PHOTO-LIVE-APPROVAL.md](../../docs/VOICE-PHOTO-LIVE-APPROVAL.md). `pilot-proposal.json` є несекретною пропозицією, не активною конфігурацією.

## Sonnet 5.5, 2026-10-20

Для `claude-sonnet-5-5` використовується JSON outputs (`output_config.format`), `thinking.type=between_tools`, effort=medium, без forced tool_choice. Результат зберігає `analysisSchema` і локальну валідацію; невідповідна модель/refusal/truncation відхиляються. Окремий ключ SciSense у Default зберігається в macOS Keychain; платні виклики залишаються вимкненими. Актуальні модель, резерв $3.039200 та непогоджена стеля $5: [пакет](../../docs/VOICE-PHOTO-LIVE-APPROVAL.md).
