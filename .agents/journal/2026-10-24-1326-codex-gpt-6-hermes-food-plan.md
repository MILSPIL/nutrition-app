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
- Специфікація H01–H11, план локальних0–7 та окремих зовнішніхB/C. Перша проба:10 суттєвих і2 редакційних уточнення, враховані. Друга проба: нових продуктових рішень не потрібно;1 технічне уточнення TTL внесене. Claude Fable review триває; фінального документного verdict ще немає.
- PROJECT-INFO і PRODUCT-GOAL оновлені. G01 нової розширеної межі pending до погодження плану; старі пілотні пороги збережені. Код не змінений.

## Змінені файли

PROJECT-INFO.md; docs/PRODUCT-GOAL.md; docs/superpowers/specs/2026-10-24-hermes-food-chat.md; docs/superpowers/plans/2026-10-24-hermes-food-chat.md; docs/evidence/hermes-food-plan-2026-10-24.json; цей журнал; пошукова копія .codeindexer після синхронізації.

## Команди / перевірки / тести

- gh api user -> MILSPIL; gh pr view26; merge --squash --match-head-commit; git fetch/switch main/merge --ff-only у власному sync worktree; exact blob comparison.
- .agents/runtime/hermes-food-plan/baseline.cjs із pinned Node24.22.1: SSR ready textarea=false, explicitStart=true, unknown accepted=false, complete estimate230 synthetic kcal, incompatible units rejected=true.
- Читання власного коду, pinned Hermes README/API/toolset/profile code, офіційних API Hermes і USDA docs. Context7 quota exhausted, повторно не викликався.
- git diff --check; diff продуктового src/server/workers/scripts/rules/package/.github протиd9a57b0 порожній; JSON parses.

## Результат

Погоджений старий журнал у main. Документи на погодження готуються; продуктова реалізація/реліз не виконувалися. Без реальних модельних викликів застосунку, читання Keychain/приватного контексту й витрат. Зовнішній стан сайту в цій сесії не перевірявся.

## Наступні кроки

- Завершити незалежні рев’ю, звірити знахідки, закомітити й запушити лише документи.
- Показати план0–7 і припущенняА1–А4 Юрію; дочекатися погодження перед кодом. B/C, приватне перенесення, API/бюджет/сервер окремо.
- Новий журнал цієї сесії переносити у main тільки після нового «так».

## Ризики / нотатки

Установлена доступність Hermes API не доводить потрібні runtime/privacy/budget властивості: локальний крок1 є обов’язковим гейтом. 2CPU/2GiB і45с це пропозиція перевірки, не замір. Медіа в Hermes transcripts, відкат видалень, профільний writer і сумісність notes потребують failure-тестів. Невдале локальне рішення не дозволяє витрат/ресурсів/заміни тренера.

codeindexer 2026-10-24: solutions0, картки1 (card_29bef280dd54); Goal revision4, G01 pending, G02–G11 pending. Прочитано назад, export --skip reports збережено. Особисті дані не індексувалися.
