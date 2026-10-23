# VOICE-LETTERS-01: локальні докази

2026-10-23. Погоджені кроки 0–6, без реальних модельних API, Keychain, $5, production Firebase, сервера чи публікації. Продуктова гілка `codex/voice-plan-letters` від `fd65fb9`; кандидат `53248f70660c1c1b6fdf4cd6278a72f17928c6fd`.

## Журнали й точки відкату

П’ять погоджених журналів перенесено через [PR25](https://github.com/MILSPIL/nutrition-app/pull/25), main `9bd8629990b4ef0b1dd0c09be902c848631eb5d0`. Повторна побайтова звірка всіх 5 з fd65fb9 успішна. Продукт, PR8/16 та сусідні worktrees не злиті й не змінені.

Коміти: ac9a8a5 червоні fixtures; a4d8128 явний старт; a103450 каталог/API v2; 7d48b82 арифметика; 67b2e46 атомарний запис/прев’ю; 01fe032 денні підсумки; 82546d8 save/UI рев’ю; c53f3fc кандидат 1.8.0/fixtures; 968100b виправлення фінального рев’ю; 6bf43f8 cleanup збірки; 53248f7 відкладене перечитування плану після ACK. Кожний запушений окремо без force.

## Очікуване й отримане

| Критерій | Очікування | Локальний доказ |
|---|---|---|
| L01 | Відкриття без мікрофона/API/спроби; явний старт; double tap/late permission/close | Jest і фактичний MediaRecorder із синтетичним пристроєм у браузері, PASS |
| L02 | AI-match лише з надісланого каталогу; Б/Ж окремо; manual/Без літери | planCatalog/planAllocation, bad ID/null/ambiguity, PASS |
| L03 | Незалежна арифметика raw/cooked/мл/порцій, без зміни БЖВ/цілей | Маса 200 мл/206 г →300 мл/309 г; історична норма збережена; >100 не стає 100, PASS |
| L04 | Літера необов’язкова; фото зберігає itemId/масу/ручний вибір | UI-тести фото/identity/reset/manual, 200 г етикетки =106 ккал, PASS |
| L05 | Один commit; той самий ID після unknown; без залежності від revision для append |47 demo-store; stale fingerprint/marker first/конкурентні metadata, PASS. Закриття до ACK, вихід, refresh після logout, pending retry у Jest, PASS |
| L06 | Денна сума однакова, їжа лише у власному прийомі; невідоме видиме | MealSection/звіт, 75% у двох прийомах без дубля; рядкове «Норму не визначено», денний count, понад норму дозволено, PASS |
| L07 | Старт до дозволу; counts фінальні, без змісту їжі; unknown відновлюється | pilotLedger/Voice/PilotPanel/ClientApp, 6 браузерних спроб без назв/медіа у ledger, PASS |
| L08 |375/390/1366, фокус/клавіатура/44px, overflow0 |71 voice-browser перевірка на 53248f7 PASS; фізичний телефон pending |
| L09 | V1 сумісний; V2<=200/32768; одна модельна операція; чесні metadata/reserve |43 Worker,47 server,38 rules; незалежні probes32768/32769 і 20 рядків, PASS |
| L10 | Реальний Sonnet,12 позитивних/4 негативних/2 фото/20 рядків | НЕ запускався. Заморожено 6 inputs і expected; тільки після кроку 7 |

Node24.22.1. `npm run test:ci`: **223/223,24 suites**. `npm run test:voice-photo`: Worker43/43 і demo-store47/47 перевірені основним і незалежним агентом; старий writer/handler з fd65fb9 заморожені та порівняні побайтово. `npm run test:server`:47; `npm run test:rules`:38. Залежності та Firestore rules незмінені. Чиста production-збірка 1.8.0 PASS із `/meal-api`, lab=0, phone_lab=0, stt_only=0, pilot=1. Упакований API:10/10.

Браузер: `/Users/user/.local/bin/agent-test-browser run scisense-voice-photo`; evidence `tmp/voice-photo-qa/evidence.json`, синтетичні PNG. У всіх 3 ширинах: відступи рядка 20/20px, вкладених полів 15/15px; дельти країв footer/heading0; overflow0; мінімальні контроли 44px. Focus/Tab/ShiftTab/Enter та повернення фокуса перевірені. Session43cec9e17d124f27-2xvssj0l: cleanup_ok=true, removed=true. Робочий Chrome не використовувався. Точний CI53248f7 повторив 71 voice,50 full phone,34 STT-only і 7 trainer перевірок: разом 162. Помилок JS/неочікуваної мережі 0, cleanup успішний. Artifact12505366454 прив’язаний GitHub до цього SHA; свіжий preview390 переглянутий. [Збережений протокол CI](voice-letters-ci-2026-10-23.json) містить повні назви перевірок, геометрію та хеші джерел.

[CI кандидата](https://github.com/MILSPIL/nutrition-app/actions/runs/39962158744): 3/3 jobs SUCCESS. Runtime/resources/credentials перевірені синтетично, без мережі до моделей чи production. Попередні проміжні FAIL задокументовані й виправлені: test WebCrypto/React timing, old auto-start/browser новини, ESLint cleanup. Початкові червоні тести відтворили відсутність модулів/auto-start; review regression red → green, а не послаблення критеріїв.

## Незалежні перевірки

Codex `voice_letters_api_review`:5 P2+1 P3 підтверджено й виправлено (mutable snapshot, invalid custom name, ambiguous names, match без каталогу, forced-tool refusal, зайві поля). Повтор:43 Worker+6 catalog+6 незалежних probes, PASS.

Codex `voice_letters_save_review`:9 підтверджених дефектів виправлено (owner draft, pending retry/logout, manual empty, точні пороги, manualSearch, нормаВ, усі неповні літери, decimal comma). Повтор 205 Jest і 3 відхилені V snapshots без записів, PASS.

Свіжий Codex `voice_letters_final_acceptance`: власні 205 Jest/43Worker/47store/47server/38rules/build, bounds/20 рядків/old writer; повернув 2 прогалини S4 та close-before-ACK і EOF. Виправлені регресіями. На 53248f7 незалежно повторив 223 Jest і власний actual-hook probe: profile ACK перед meal ACK викликає рівно одне відкладене читання; повторний reload згортається; unknown і requiresReload переживають збій; marker відновлює pending; logout відкидає пізній ACK. Код-блокерів не залишилося. Звірив походження browser-evidence12505366454 і всі 3 успішні jobs CI39962158744 на 53248f7. Остаточний вердикт: локальні L01–L09 PASS, блокувальних дефектів немає; L08 фізичний телефон і L10 pending.

Claude Fable5.1 читав тільки публічні spec/plan/source; тестів не запускав. Модель фактично `claude-fable-5-1`; вхід 194, вихід 69627, cache-write257006, cache-read766631, разом**1093458 токенів**, **981.3 с**, exit0, permission denials0. Це рев’ю через встановлений Claude CLI/підписку Max, без ключів/API застосунку та його $5. Сирий звіт збережений локально поза Git.

| Знахідка Claude | Що звірив | Вердикт/дія |
|---|---|---|
|1 Застарілий план users |ClientApp передавав users; свіжий day.planContext був невикористаний |Підтверджено; snapshot дня, одноразовий await refresh, own settings reload |
|2 Custom дубль вимикає каталог |planCatalog однаковий refId давав collision |Підтверджено; тотожні записи дедупліковані, чесне повідомлення fallback |
|3 Незавершений ввід →NaN |DecimalInput порівнював NaN через !== |Підтверджено; Object.is, тест коми |
|4 Довгий десятковий надлишок |ProductModal виводив raw різницю |Підтверджено; percentText, тест 2.499999→2.5 |
|5 not_ready без recovery |useMealDay/Voice: not_ready не мав планового повтору |Підтверджено; явний текст, refresh, gate requiresReload; late logout regression |
|6 Маса перед кількістю →Infinity |PlanAllocationFields ділив на порожню базу |Підтверджено; поле доступне лише за додатної кількості, guard бази |
|7 Непомітні unresolved/voice |MealSection не показував row label/count |Підтверджено; один спільний helper, label/count |
|8 unknown після retry |Головний retry вже оновлював PilotPanel, який звіряє marker; modal retry цього не робив |Частково; ACK/modal retry оновлюють версію, явний відгук; існуюче відновлення доведене тестом |
|9 «Сервер» не перевіряє factor |mealStore є клієнтським адаптером; factor1 валідний для raw, маса підтверджується користувачем |Хибне як доведений дефект; без нового захисного контракту й припущень про cooked |
|10a Автоматично стирає масу/стан |select повертав{} |Підтверджено; прибирає лише ручний letter/reference, масу й стан зберігає |
|10b Default у profile маєcatalog |S3 дає пріоритет збереженому ключу профілю; рівність чисел не є походженням |Хибне як дефект; уточнений fallback, тест обох форм, без міграції |
|10c Мертвий canAdd код |Константиtrue/disabledfalse й unused argument |Підтверджено; вузька чистка, правило дозволяти факт понад норму незмінне |

Разом 12 пунктів:9 підтверджено/виправлено,1 частково підтверджено/виправлено,2 не підтверджено як дефекти. Усі висновки звірені основним агентом;9/10b додатково звірив незалежний reviewer. Context7 в цій сесії недоступний через квоту; для протоколу використано офіційні Anthropic structured-outputs/token-counting документи, нових SDK/залежностей немає.

## Межа готовності

[Пакет і наступний крок 7](../VOICE-LETTERS-RELEASE.md), [хеші](voice-letters-package-2026-10-23.json), [синтетичний резерв 6 запитів](voice-letters-l10-reserve-2026-10-23.json). Картка Code Indexer card_183b5e5eefe1 містить завершений локальний результат і докази, але лишається open: вбудований manual_approval не дозволяє агенту закрити її, потрібна дія людини в dashboard. Acceptance не послаблювався. Нові критерії внесені в PRODUCT-GOAL/Code Indexer; G02–G11 pending, продукт не прийнятий. Точність реальної моделі, фізичний телефон та публікація не підміняються mocks. Сервер, ключі, живі дані та гроші не зачіпалися.
