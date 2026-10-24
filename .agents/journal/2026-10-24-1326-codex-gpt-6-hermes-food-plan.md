# HERMES-FOOD-01: специфікація чату з наявним тренером

- Дата і час: 2026-10-24 13:26 EEST
- IDE / агент: Codex desktop
- Модель: GPT-6
- Chat ID: 01a1585d-ba1e-7da0-a174-903bee0573b3

## Ціль

Перенести погоджений журнал1640 у main, пояснити тупик домашньої страви та підготувати spec/plan для тексту/голосу/фото. Юрій прямо обрав одразу існуючого Hermes-тренера. Реалізацію, реальні API, Keychain, $5, сервер і production Firebase не дозволено.

## Що зроблено

- PR26 переніс тільки журнал1640; main17a460b, CI40085062567/40085119158 SUCCESS. Blob ffec2696801c94b00617f02f47d12db008c52815 однаковий у джерелі, локальній main та origin/main. Нові журнали цієї сесії не входили в цей дозвіл.
- Причина в поточному коді d9a57b0: один Sonnet analysis без lookup; null БЖВ і clarification блокують рядок; порожній ready не має текстового поля. SSR/function probe без мережі це підтвердив; повна синтетична оцінка приймається, несумісні одиниці відхиляються. Реальну вчорашню модельну відповідь не відтворювали.
- Рішення: фактичний Hermes API через owner-scoped SciSense gateway, pinned source; існуючий персональний профіль на майбутньому серверному етапі. Профіль фізично існує, його зміст/секрети не читалися. Модельне inference через єдиний чинний ledger, без reset/fallback.
- Рішення: локальний пошук зафіксованих USDA наборів + підтверджені особисті джерела; source=estimate явний, note без оцінки не є нульовим прийомом. Текст, голос і фото працюють з версійною чернеткою; підтвердження тільки користувачем.
- Специфікація H01–H11, план локальних0–7 та окремих зовнішніхB/C. Перша проба:10 суттєвих і2 редакційних уточнення, враховані. Друга проба: нових продуктових рішень не потрібно;1 технічне уточнення TTL внесене. Claude Fable 5.1 завершив рев’ю, 8 зауважень звірені нижче й враховані. Незалежний Codex повторно перевірив D01–D06:6/6, вердикт done для документів.
- PROJECT-INFO і PRODUCT-GOAL оновлені. G01 нової розширеної межі pending до погодження плану; старі пілотні пороги збережені. Код не змінений.

## Змінені файли

PROJECT-INFO.md; docs/PRODUCT-GOAL.md; docs/superpowers/specs/2026-10-24-hermes-food-chat.md; docs/superpowers/plans/2026-10-24-hermes-food-chat.md; docs/evidence/hermes-food-plan-2026-10-24.json; docs/evidence/hermes-food-baseline-2026-10-24.cjs (лише синтетичний діагностичний fixture); цей журнал; пошукова копія .codeindexer після синхронізації.

## Команди / перевірки / тести

- gh api user -> MILSPIL; gh pr view26; merge --squash --match-head-commit; git fetch/switch main/merge --ff-only у власному sync worktree; exact blob comparison.
- docs/evidence/hermes-food-baseline-2026-10-24.cjs із pinned Node24.22.1 (попередня ідентична копія в runtime): SSR ready textarea=false, explicitStart=true, unknown accepted=false, complete estimate230 synthetic kcal, incompatible units rejected=true.
- Читання власного коду, pinned Hermes README/API/toolset/profile code, офіційних API Hermes і USDA docs. Context7 quota exhausted, повторно не викликався.
- git diff --check; diff продуктового src/server/workers/scripts/rules/package/.github протиd9a57b0 порожній; JSON parses.

## Результат

Погоджений старий журнал у main. Специфікація й план готові на погодження, незалежне повторне документне приймання D01–D06 пройдене; продуктова реалізація/реліз не виконувалися. Без реальних модельних викликів застосунку, читання Keychain/приватного контексту й витрат. Зовнішній стан сайту в цій сесії не перевірявся.

## Наступні кроки

- Показати план0–7 і припущенняА1–А4 Юрію; дочекатися погодження перед кодом. B/C, приватне перенесення, API/бюджет/сервер окремо.
- Новий журнал цієї сесії переносити у main тільки після нового «так».

## Ризики / нотатки

Установлена доступність Hermes API не доводить потрібні runtime/privacy/budget властивості: локальний крок1 є обов’язковим гейтом. 2CPU/2GiB і45с це пропозиція перевірки, не замір. Медіа в Hermes transcripts, відкат видалень, профільний writer і сумісність notes потребують failure-тестів. Невдале локальне рішення не дозволяє витрат/ресурсів/заміни тренера.

codeindexer 2026-10-24: solutions0, картки1 (card_29bef280dd54); Goal revision4, G01 pending, G02–G11 pending. Прочитано назад, export --skip reports збережено. Особисті дані не індексувалися.

## Звірка Fable 5.1, 2026-10-24 13:32 EEST

Запит: суттєві прогалини плану локальних 0–7, приватність/бюджет/atomic/recovery. Фактична модель claude-fable-5-1; код виходу0, відмов0, токени517868 (вхід162, вихід17473, cache-create99789, cache-read400444), 419.1с. Через незмінений Claude CLI/Max, без модельних API застосунку. Сирий звіт лишається в ignored runtime. Підсумок: 8 суттєвих, 5 підтверджені, 3 частково, хибних0; усі враховані. Окрема редакційна помилка також виправлена.

| Claude знайшов | Що перевірив | Вердикт і зміна |
| --- | --- | --- |
| 1. 32000 байтів, 8000 символів і довга історія | Spec «Витрати та ресурси» вже обмежувала snapshot і відмовляла при переповненні, але не задавала вікно | Частково: не логічна суперечність, проте бракувало правила. Усе в UTF-8 байтах, user8000, history до12 messages/8000 bytes цілими парами після обов’язкової частини. 32000 гіпотеза до B, пам’ять не обрізається |
| 2. Старі 6/30 calls переривають діалог | workers/meal-parser/src/budget.js:21–26; scripts/phone-lab/sqlite.mjs:3,47–50; server/ledger.mjs:45 | Підтверджено: Node успадковує квоти. У плані вимкнена policy12/60с,80/год,120/UTC-добу, один upstream, усі старі/new rows, без зміни cap/schema/receipt. Увімкнення тільки C |
| 3. Старий writer буде заблокований | firestore.rules:87–94; src/services/writerFence.js:3; spec контракт notes і plan rollback | Частково: це не єдиний можливий механізм, але порядок був відсутній. Двофазні rules2/3 → UI3/fallback → per-owner capability/min3; інші UID лишаються2 |
| 4. Notes-only не проходить append/recovery | src/services/mealCommands.js:9–20,46–50; src/services/mealStore.js:23–27,75–79 | Підтверджено. Нові saveTrainerDraft/resolveFoodNote, commandId=submissionId, marker завжди в day doc, atomic items+notes+marker; append не послаблюється |
| 5. DELETE може передувати commit | Spec інтеграція session і recovery описувала обидві дії без порядку | Підтверджено. Durable SQLite commit/terminal перед cleanup job/DELETE; cancelled generation перед stop; unknown не видаляти до reconciliation |
| 6. Queued media після restart не визначені | Spec admission і media cleanup не задавала місце/строк очікування | Підтверджено. Приватний temp0700/0600, TTL≤5хв, admission тільки metadata/HMAC/tempRef; queued restart просить reattach без upstream; running відновлює той самий run |
| 7. Другий analyze поряд із Hermes | workers/meal-parser/src/providers.js:37–49; spec вже забороняла другий parser після Hermes, plan обіцяв legacy compatibility | Частково: не доказ подвійного виклику, але routing не уточнено. Chat ніколи не викликає analyze/fallback; legacy окремо через той самий ledger, H08 spy перевіряє це |
| 8. D02 script відсутній у Git | .gitignore:78; evidence JSON спершу не містив script/команду | Підтверджено. Ідентичний синтетичний probe додано в docs/evidence, JSON містить шлях/SHA256/Node/команду. Ніяких особистих даних |
| Редакційне: розірване речення про active turn | Spec контракт admission | Підтверджено й виправлено |

Публічні Groq Free квоти перечитані в офіційних docs24.10; акаунт/Keychain не відкривався. 45с та ресурси залишаються гіпотезами, live latency цим рев’ю не доведена. Fable не перевіряв Hermes source; його pinned код і README прочитав головний агент раніше, runtime feasibility лишається локальним кроком1.

CI40086091582 на fa5bc1066e5533f52f4a313510632864557c8cb5: 3/3 SUCCESS. Це чинні product tests/build/synthetic checks, не приймання майбутнього Hermes.

Незалежний spec-reviewer (свіжий Codex) повторно виконав D01–D06 після Fable:6/6 PASS, вердикт done; блокерів0. Перевірив новий probe/hash, продуктовий diff порожній, 10 дозволених файлів, 2 JSON і30 локальних посилань. Це приймання документації, H01–H11 не виконані. Картка card_29bef280dd54 оновлена й перечитана, лишається open.
