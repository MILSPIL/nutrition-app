# HERMES-COACH-02: пакет розгортання

Дозвіл Юрія від 2026-10-24 охоплює локальне завершення, приватний контекст і необхідне розгортання на https://ntzg.pp.ua. Чинні моделі, ресурсні межі й загальний ліміт $5 збережені. Це операційна послідовність; виконання зовнішніх кроків фіксується окремими квитанціями, а не наявністю документа.

## Що входить

SciSense 1.9.0: плаваюча кнопка тренера, текст/голос/фото, окремий початок запису, прев’ю та одна «Додати», побутові порції з видимим припущенням, автоматичні літери й частки, київські відносні дати, свіжі підсумки дня для порад. Іконки вісім WebP 192 px, разом 49322 bytes; перші три 18350 bytes. HTML/API cache не змінюється.

- Groq `whisper-large-v3`, Anthropic `claude-sonnet-5-5`.
- Hermes `3f2afed3eb813cb00bd381d29b084d0e01de048f`, Node 24.22.1, Python/public runtime із перевіреного CI-артефакту.
- 2 CPU, 2 GiB, swap 0, один turn, 45 секунд, до 3 модельних запитів. Groq має власний незалежний timeout.
- До 8 живих turns/24 calls у межах залишку того самого $5. Старий ledger, reservations і receipts зберігаються. Новий бюджет не створюється.
- Telegram лишається доступним до перевірки власника. Вебпам’ять read-only. Поточна активність входить у контекст; окрема історія залу/басейну й абонементи залишаються наступним етапом.

## Докази перед встановленням

Фінальний SHA має пройти чотири групи CI. Ресурсний Linux turn запускає `scripts/hermes-gateway-test.mjs --resource-probe --capacity-probe` з 24 позиціями, 4 notes, 82 plan references, 8000-byte контекстом і 12 вхідними парами історії. Усі обов’язкові дані й остання пара збережені; більший cap не дозволений. Окремий native прогін перевіряє recovery/cancel/deadline. Actual host ізоляцію цим не підтверджено.

Публічні докази: `docs/evidence/coach-backend-2026-10-24.json`, `hermes-coach-ui-2026-10-24.json`, `coach-phone-lab-2026-10-24.json`, `coach-portions-2026-10-24.json`. Під час приймання звірити хеші, scope та дату кожного доказу; попередній PASS не закриває пізнішу зміну.

## Порядок встановлення

1. Відновити дозволений тимчасовий доступ `scisense-voice` лише на MS-WEB і лише на час цієї операції. Перевірити сервер, SSH host key, поточний release/unit, вільний диск/RAM, libc, bwrap, userns/AppArmor. Дані читати адресно; секретні значення не друкувати. Приватний adapter з фіксованими операціями зберігається поза Git.
2. Прочитати чинні ledger metadata, remaining/reservations і releaseCapabilities. Зафіксувати поточні файли/права/підключений release та зашифровану резервну копію. Копію старого ledger не підставляти поверх новіших витрат або записів.
3. Завантажити `hermes-public-runtime` саме перевіреного SHA. Виконати `npm run build:hermes-off`, `python3 scripts/hermes-package.py <runtime> <new-package>`. Звірити SHA256SUMS й обидва manifests. Обидва варіанти збирати через `scripts/hermes-build-release.mjs`: чистий `git archive` точного SHA, закріплений Node/npm, offline lockfile, мінімальне середовище. Для основного UI передати `enabled: true`, без local/phone lab. Не використовувати успадкований BUILD_PATH або локальні untracked public файли; записати точний SHA та хеші всіх assets. Перевірити fallback on/off до публікації.
4. Встановити новий вимкнений release в `/opt/scisense/releases/<SHA>`, runtime за шляхами з `server/trainer/runtime.mjs`. Перевірити public hashes, власника файлів і candidate unit. Виконати синтетичні позитивні та негативні canaries під справжнім systemd на MS-WEB. При несумісності host зупинитися; AppArmor/sysctl/capabilities й ресурси не послаблювати.
5. Створити native profile **рівно** з `server/trainer/profile-template.json`: SOUL.md, USER.md, MEMORY.md. Не копіювати приватний Hermes home чи його SOUL безпосередньо. Використати точний `hermes-config.json`. Кураторський приватний текст провізіонується лише у зашифрований API-owned contextStore після перевірки external approved registry hash, coverage й current source hashes. До Git, артефакту public runtime або Code Indexer він не потрапляє.
6. Завантажити необхідні credentials через stdin у чинний encrypted credential store. `groq`/`anthropic` лишаються чинними; новий `trainer-state` має окремий 32-byte platform key. Звірити реальний read-only privacy receipt з project/owner/provider binding. Його scope не означає закриття попереднього Firebase-інциденту чи виконану ротацію.
7. Опублікувати перевірені сумісні rules, новий UI та fallback, який показує notes. Лише після доступності UI встановити owner capability writer3/notes. Створити trainer activation з точними releaseId/configHash, owner/profile, чинним ledgerReceiptId, cap5000000 і погодженими тарифами. `memoryWriteEnabled=false`, single writer лише для нового вебпрофілю. Telegram home не змінюється.
8. Увімкнути owner-only trainer, перевірити read-only endpoints, тоді погоджений живий smoke. Перечитати records/receipts після Add/reload, перевірити duplicate, дату «вчора», фото, поради після збереження та відмову memory commit. Не створювати зайві тестові харчові записи у реальному щоденнику без адресного плану очищення. Телефон і роботу з вимкненим Mac приймає Юрій.
9. Відкликати тимчасового адміністратора, підтвердити його відсутність. Зафіксувати live SHA/стан, витрати, залишок, перевірки та невиконані критерії в журналі й PROJECT-INFO.

## Прив’язки конфігурації

`trainerConfigHash`: `103fdb15a289cc3de3591bb795d1d689deba1512040a7e392f34a6c627d3320d`.

- `hermes-config.json`: `13e6c679cb417cdfa56bfd10c920593835362cac77679190b3591a5590b7f073`.
- `profile-template.json`: `e24f3db595a8edc09bca03e9e80c07365ba80dccff4ecd50ef701986a42a8cce`.

Activation з попереднім hash, який не зв’язував ці файли та read-only policy, відхиляється. Фактичні SOUL/USER/MEMORY звіряються перед кожним native запуском; зайва пам’ять, symlink і hardlink відхиляються. Перед встановленням значення повторно обчислюються з кандидата; приватні owner/profile IDs зберігаються лише в операційній квитанції.

## Відкат

Закрити нові admission, завершити або позначити unknown поточний turn, зберегти актуальні ledger/receipts/notes/context revisions і deletion anchor. Перемкнути атомарно на сумісний перевірений release; після появи notes не повертати UI, який їх приховує. Підтверджені харчові записи й витрати не відновлювати зі старої резервної копії. Тимчасовий доступ відкликати також при зупинці або помилці. Подробиці попереднього перевіреного runtime: `docs/deployment/hermes-food-local.md`.
