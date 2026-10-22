# Пакет розгортання ntzg на погодження

- Дата і час: 2026-10-22 21:46, Europe/Kyiv
- IDE / агент: Codex desktop
- Модель: GPT-6
- Chat ID: 01a1585d-ba1e-7da0-a174-903bee0573b3

## Ціль

Прямий запит: «Так, перенеси новий журнал у main і підготуй конкретний пакет розгортання SciSense на ntzg.pp.ua на погодження. Ключі, $5 і сервер поки не чіпай».

## Що зроблено

- Тільки журнал 1440 перенесений PR23 у main f31f061. Blobs збігаються, CI 2/2, main чиста. Перший локальний тест main не стартував через відсутні залежності; після npm ci успішні 26/26 тестів і build. Чужі untracked журнали не переносив.
- Підготовлено NTZG-DEPLOY-03: 0 Node → A доступ → B встановлення з вимкненим API → C окреме погодження ключів/бюджету. Архів f9, 163 файли, 11 359 507 байтів; SHA256 ba745ca25c52d6e41aadefca84ec0a41c3eeb49891e9cf3db69bcf2509a5e7ab. 32 вихідні runtime-файли звірені з Git; єдина згенерована правка manifest: releaseId. Приватний runbook, hashes та Node archives у runtime, поза Git.
- Знайдено Node security release 24.22.1 від 21.10.2026. Стару 24.11.1 не встановлювати. Офіційні архіви та SHA256 перевірено; ізольована проба на Mac: 8/8 API і 47/47 server. Pins не оновлені; повний Linux CI нового SHA ще потрібен.
- Receiver вимагає root, а send не підставляє sudo. Це окрема передумова C, звичайний admin SSH її не доводить. Серверні поля залишено null, нових підключень немає.
- Описані OLS URI/cache/reload, TLS scope, порядок Firestore rules → frontend, backup/restore/rollback без послаблення rules або скидання бюджету.
- Оновлено чотири актуальні профілі Code Indexer, відкриту картку голосу/фото і autonomy policy Goal. Критерії G02–G11 залишені pending.

## Змінені файли

- docs/superpowers/plans/2026-10-22-ntzg-deployment-approval.md
- docs/superpowers/plans/2026-10-22-ntzg-deployment-preparation.md, покажчик на новий план
- docs/evidence/ntzg-deployment-package-2026-10-22.json
- PROJECT-INFO.md, цей журнал, .codeindexer exports після readback
- Приватні артефакти: .agents/runtime/deployment/2026-10-22-ntzg-03/; handoff у primary runtime

## Команди / перевірки / тести

- gh api user = MILSPIL; PR23 checks 2/2; git diff до/після merge містить тільки журнал 1440. Git blob 61481bfd40183a5e8b12a5752578ca7c43ca2eb7 однаковий.
- Чиста frontend-збірка source f9 з REACT_APP_MEAL_API_URL=/meal-api. Успадковані REACT_APP_* вилучені. Runtime npm ci --omit=dev --ignore-scripts; audit 0 для runtime jose, це не аудит frontend або Node.
- Всі archive hashes збігаються; symlink/traversal 0, приватних ключів/ledger 0. Loopback перевірки 8/8 і закриття сервера підтверджено, зовнішніх fetch 0. Transfer CLI --help не читає Keychain.
- Окрема проба Node 24.22.1: 8/8 упакованого API, 47/47 server. Повний попередній CI39777222470 на f9 успішний; новий CI після pin потрібен.
- Context7 monthly quota вичерпана раніше, повторно не викликав. Офіційні Node/OLS/xCloud/Cloudflare/Firebase/Groq/Anthropic джерела прочитані й пов’язані у плані.

## Результат

Незалежний Codex ntzg_package_review підтвердив D01–D08: архів/джерела/8 loopback checks/межі дозволу перевірив сам. Два зауваження виправлено й перечитано: maintenance до writer fence і receiver inactive/check до незворотного local export. Пакет готовий на погодження, не на встановлення. Немає читання Keychain, модельних викликів, витрат або серверних/production дій. PR8/16 не злиті, LIVE false, G02–G11 pending.

## Наступні кроки

Рев’ю завершено, докази і Code Indexer перечитані; пакет зберігається окремим документним commit/push у codex/scisense-server-prep. Після погодження NTZG-DEPLOY-03 виконувати тільки погоджені етапи; C потребує окремої згоди. Цей новий журнал не переносити у main без «так».

## Ризики / нотатки

npm audit кореневих залежностей кандидата і legacy main показав 99 advisories: 5 low, 12 moderate, 79 high, 3 critical. Досяжність у browser/build/server ще класифікується в етапі 0; автоматичний audit fix не виконувався. Локальна Node-проба й npm audit не є production-аудитом або прийманням телефона. Реальні серверні шляхи, доступ, backup, TLS та активація не підтверджені. GitHub і публічна документація дозволені без розмороження сервера.
