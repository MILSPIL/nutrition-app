# HERMES-COACH-02: план тренера та окрема дельта даних

- Дата і час: 2026-10-24 22:54 EEST
- IDE / агент: Codex desktop
- Модель: GPT-6
- Chat ID: 01a1585d-ba1e-7da0-a174-903bee0573b3

## Ціль

Підготувати наступний етап персонального вебтренера й окремо виконати прямо погоджене довантаження приватного щоденника. Продуктовий код, перенесення профілю, модельні API/$5 та розгортання цього етапу не погоджені.

## Що зроблено

- Журнал1420 перенесено в main через PR28/4bec897; звірено точний blob, CI успішні. Новий журнал потребує нового дозволу на main.
- Збережено рішення Юрія: прев’ю + одна «Додати»; автоматичні літери; веб замінює Telegram після приймання. Додано автоматичні історичні дати, майбутню історію залу/басейну та окремі абонементи.
- Read-only огляд наявного Hermes обмежено persona/config whitelist/метаданими. Повний профіль завеликий для чинних caps; запропоновано окремий curated packet з registry/coverage. Секрети/transcripts не читалися для цього плану, живу доставку Telegram не доведено.
- Pinned Node24.22.1 baseline без мережі: actual validators відхиляють unknown portion та несумісні одиниці, приймають повну явну estimate; snapshot відхиляє синтетичні80000bytes. JSON повторно byte-equal. Це structural evidence, не телефон/реальна модель.
- Публічна діагностика іконок: три1024px PNG2396262bytes,3748–4123мс,no-store, повтор із повним тілом. Власний ізольований браузер прибрано. I01 запропоновано, не реалізовано.
- Два незалежні spec-probe:12 первинних контрактних уточнень; у другому залишилися часовий anchor і пріоритет estimate/partial-source. Усі виправлено в документі. Єдина sentAt зберігається через replay; матриця джерел має явний порядок і negative cases.
- Окремий приватний імпорт: план і збереження додаткового існуючого запису прямо погоджені власником. Зашифровані backups, append-only/CAS/idempotency, atomic commit та native catalogue correction. Повне серверне перечитування й перевірка в застосунку пройдені. Попередні дні та старий імпорт не змінено. Деталі лише локально позаGit/Indexer. Тимчасовий normal-owner Firebase token видалено, login-helper і власну Chrome вкладку закрито. Це не усуває окремий старий Firebase security gate автоматично.
- Delta reviewer:31 синтетична перевірка; native Firestore type preservation defect виправлено, додаткові4 roundtrip checks PASS. Окреме catalogue review10checks PASS; helper hashes незмінні до apply. Реальних модельних викликів0.
- Goal revision6 і G01 нової межі pending; G02–G11 лишаються pending. Нові картки: card_752ed6d0d0f9 HERMES-COACH-02, card_2dbbe63c860c I01, card_776808bf905d майбутня активність/абонементи. Остання свідомо поза поточною фазою, щоб не розширити її непомітно.
- Claude Fable review запущено через незмінений claude-ask.py/Max над знеособленими docs і кодом; результат перевірено, D01–D06 пройдено; таблиця нижче.

## Змінені файли

- docs/superpowers/specs/2026-10-24-hermes-coach-next.md
- docs/superpowers/plans/2026-10-24-hermes-coach-next.md
- docs/evidence/hermes-coach-baseline-2026-10-24.cjs та .json
- docs/evidence/category-icons-network-2026-10-24.json
- docs/PRODUCT-GOAL.md, PROJECT-INFO.md, .codeindexer export
- Приватні helper/backup/receipt файли лише в ігнорованій теці food-log; не додавати до commit.

## Команди / перевірки / тести

Pinned Node24.22.1 виконав docs/evidence/hermes-coach-baseline-2026-10-24.cjs, результат byte-equal до збереженого JSON; git diff --check; JSON parse. gh api user підтвердив MILSPIL. JSON/relative links/git diff --check PASS; product diff для src/server/workers/public/package*.json/firestore.rules порожній. Goal export readback підтверджує revision6 і всі11 pending. Journal checker до commit знайшов лише очікувані uncommitted/unpushed; після push повторити.

## Результат

Приватні дані довантажено та перевірено. Специфікація та план нового тренера пройшли фінальне документне рев’ю D01–D06. Продуктовий код і deployment незмінні; технічний документ не є дозволом чи прийманням продукта.

## Наступні кроки

Документне рев’ю завершено; отримати явне погодження HERMES-COACH-02 локальних0–5 + I01/А1–А4 та окремо перенесення нового журналу. B1/B2/C тільки після свого конкретного пакета.

## Ризики / нотатки

Публічні docs не містять приватного контексту/харчування. Не повторювати імпорт. Не називати новий чат опублікованим. Context7 quota в цій сесії вичерпана; використані офіційні Hermes docs та локальний pinned source. Git branch codex/hermes-coach-next-plan, база86ad3be, кодce62052. Журнал поки лише тут, не в main.

## Звірка Claude Fable

Модельclaude-fable-5-1, код0,700.6с; вхід162, вихід32457, cache create167255/read570806, разом770680 токенів із кешем. Застосунок/$5 не використовувалися, transport Claude Code Max.

| Claude знайшов | Що перевірив | Вердикт і дія |
| --- | --- | --- |
| F01: Стан targetDate не відрізняє pin від старої вкладки | `gateway.mjs:26; TrainerChat.js:315,595,1079; ClientApp.js:602` | Підтвердилось: dateContext default/pinned; необов’язкове редагування дати прев’ю; C02 stale-tab |
| F02: ISO і multi-date policy нині делеговані моделі | `tools.mjs:48,65; drafts.mjs:86` | Підтвердилось: dayRef + серверний календар/валідація; policy red; fixed draft date; DST/replay |
| F03: API context і native profile мають різні storage/caps | `context-store.mjs:51,70,130; tools.mjs:62; hermes-food-local.md:61` | Підтвердилось: context.txt тільки contextStore, validator8000, native без особистих фактів |
| F04: Нові source поля відхиляються whitelist; план забороняє auth schema, не всю food schema | `food-resolver.mjs:81,145; firestore.rules:133,164` | Частково: Явні optional source.portionOrigin/estimateReason та emulator/legacy/deny gate у локальному кроці1 |
| F05: Прев’ю іншої дати бере empty, save читає реальний день | `TrainerChat.js:86,906; gateway.mjs:275` | Підтвердилось: Цільовий snapshot/агрегати preview і save; C04 непорожній yesterday |
| F06: refresh фокусує textarea | `TrainerChat.js:397` | Підтвердилось: C01 mobile activeElement не textarea при відкритті |
| F07: Нема позитивного повного fixture. Рекомендовані reviewer12pairs перевищують чинний cap12messages | `snapshot.mjs:40,50; limits.mjs:15,17; baseline.cjs:21` | Частково: Fixture24items/4notes/26refs/context8000;12вхіднихпар, максимум6 збережених; latest pair збережена; mandatory facts не губляться |
| F08: Чинний reference guard залежить від name/preparation, не source | `drafts.mjs:165; mealItems.js:82` | Підтвердилось: C04 same-name estimate→label/recordId reset reference; manual letter видима |
| F09: Нова назва clock field відрізняється від наявної | `gateway.mjs:219; snapshot.mjs:28` | Підтвердилось: Єдина sentAt, захоплена сервером до I/O й збережена при першому admission |
| F10: UI flag застосовується під час build | `hermes-food-local.md:68; ClientApp.js:602` | Підтвердилось: План явно вимагає on/off builds і сумісний rollback release |
| F11: Початок введення описано як зайвий model turn | `2026-10-24-hermes-coach-next.md:47` | Підтвердилось: Записати їжу лише відкриває/focus composer,0calls |
| F12: Memory case змінено навмисно через read-only етап, але негативну live-перевірку слід додати | `hermes-food-local.md:79; coach plan smoke` | Частково: 8-й turn synthetic memory request read-only; прямий commit deny без нового inference |

Незалежний D01–D06 reviewer підтвердив baseline, відсутність product diff/приватних даних, parse/link/diff checks. Остаточний readback уточнених після Fable документів PASS. Згадки timestamp синхронізовано до sentAt. Доказ: docs/evidence/hermes-coach-plan-review-2026-10-24.json.
