# SciSense: 4 журнали в main і серверний план

- Дата і час: 2026-10-21 00:36 Europe/Kyiv
- IDE / агент: Codex
- Модель: GPT-6
- Chat ID: 01a1585d-ba1e-7da0-a174-903bee0573b3

## Ціль

Перенести решту чотирьох журналів у main і підготувати на погодження план SciSense на https://ntzg.pp.ua з Whisper та Sonnet. Goal objective_e45aa8ac1aa3; G04/G05/G07/G08/G11. Новий код/production у цій підготовці не виконувати.

## Що зроблено

- PR13 merged 0834d48d1e650f4eceb5ac55088a2596127d6e1a, тільки журнали1600/1725/1747/2205. Усі4 remote bytes порівняно із джерелом, SHA256 збігаються; CI2/2. PR8 із кодом залишається draft/open.
- Зібрано поточний план docs/superpowers/plans/2026-10-21-scisense-server-rollout.md. Варіанти з за/проти; рекомендовано A: статика+Node+Whisper на MS-WEB, Sonnet зовнішній, Firebase незмінний.
- Новий dry_run native TLS422 DNS-check; customTLS422 certificate/key із попередньої перевірки. Створення не було. Read-only: Starter active, OLS/Ubuntu24.04.4, 4CPU/7935MiB, monitor21:03:33Z available5406MiB; snapshot не benchmark.
- Ураховано OLS regeneration/forced lifecycle rebuild, shared reload, server-wide Node major. Admin SSH і придатний backup не підтверджені. Рекомендовано OriginCA/Fullstrict; остаточні privilege commands/paths/TLS payload окремим пакетом.
- Погоджені Sonnet/Whisper/$5/domain збережено без повторного питання. G04 включено з наслідком: legacy-зв’язки без доказу згоди перепідключаються. Усі runtime критерії лишаються pending.
- Оновлено PROJECT-INFO та Code Indexer: autonomy_policy узгоджений з чинними дозволами, профілі обох project, card evidence, phase health. Критерії Goal і verdict не змінювалися.
- Актуальний runtime handoff збережено поза Git; приватні API-dumps не публікуються.

## Змінені файли

- docs/superpowers/plans/2026-10-21-scisense-server-rollout.md
- docs/evidence/scisense-server-plan-2026-10-21.json
- PROJECT-INFO.md; експорт .codeindexer/
- цей журнал; чотири історичні журнали перенесено в окремому PR13 без правок

## Команди / перевірки / тести

- gh pr view13: MERGED, exact SHA, CI2SUCCESS; gh contents на merge SHA + SHA256/byte compare:4/4.
- xCloud MCP через встановлений Keychain launcher: read inventory/billing/docs; native TLS dry_run=true без confirm:422, не creation.
- curl https://ntzg.pp.ua:200; /meal-api/health:404 text/html. Цей HTTP200 не є доказом готового API.
- Чернетка до рев’ю у feature-коміті a25fcc87a82d27a1b1d95bb36502051535d38101, запушений у PR8 draft; CI 2/2 успішні. Усі локальні посилання існують, JSON і зміст доказів перевірені, файли непорожні, шаблонів секретів немає; git diff --check PASS. План ще не в main; джерело: https://github.com/MILSPIL/nutrition-app/blob/a25fcc87a82d27a1b1d95bb36502051535d38101/docs/superpowers/plans/2026-10-21-scisense-server-rollout.md .
- Експорт codeindexer обох project успішний. Context7 monthly quota вичерпана, далі лише первинні docs, без повторних звернень.
- Поведінка застосунку не змінювалася: повторний широкий прогін старих тестів не є доказом нового сервера й не запускався.

## Незалежна перевірка

| Reviewer / знахідка | Що перевірив | Вердикт |
| --- | --- | --- |
| Codex spec probe: справжній transfer-marker описаний раніше production-гейта | Абзац перед кроком1 тепер явно обмежує кроки1–4 synthetic rehearsal; реальний key/marker/transfer тільки крок6 за пакетом5 | Підтвердилось, виправлено; друга проба R02–R04PASS |
| Claude H1: нібито немає виправлення межі transfer | Свіже читання плану: абзац перед кроком 1 є в a25fcc8; друга Codex-проба це підтвердила. Claude спирався на попереднє читання | Не підтвердилось для поточного файла; для ясності також уточнено дієслова кроків 3–4 |
| Claude M1: Whisper запускає 4 потоки | scripts/phone-lab/whisper.mjs:17,51, параметра немає, argv містить -t 4 | Підтвердилось; додано параметризацію і тест -t 1 до майбутнього плану |
| Claude M2: Sonnet не одержує signal клієнта | live.mjs:43, providers.js:16–17, index.js:93 | Підтвердилось; додано передавання AbortSignal і тест, резерв після надісланого запиту не повертається |
| Claude L1: handler дозволяє відсутній Origin | index.js:80 проти gateway.mjs:249–251 | Підтвердилось; новий inference transport має відхиляти відсутній Origin, тест 403 |
| Claude L2: JWKS/egress не названі | index.js:5,11–14; старий текст плану не містив сценарію недоступного JWKS | Підтвердилось; описано потрібний вихідний HTTPS та відмову без inference за відсутнього придатного ключа |
| Claude L3: demo proposal не можна переносити як є | pilot-proposal.json:3–7, live.mjs:12, .firebaserc:3 | Підтвердилось; серверний manifest nutrition-tracker-ua, окрема умова активації, той самий proposalId/$5 |
| Claude L4: немає legacy-інвентаризації | Canonical spec:85 уже вимагає її; новий план посилався на цю spec | Частково; явний пункт додано у production-пакет, без публікації приватного переліку |
| Claude L5: TLS-ключ отримує xCloud | План прямо передбачає custom TLS body; серверні права не виключають доступу платформи | Частково; названо отримувача і межу довіри. Строк зберігання xCloud не доведено, не повторюємо його як факт |
| Claude L6: погодження G04 має включати canonical request | Access plan:26; новий план уже просив G04 за посиланням і пояснював reconnect | Частково; модель canonical request тепер окремо названа в пункті погодження |
| Claude L7: Worker може стати другим шляхом витрат | wrangler.toml:5 лише local LIVE_ENABLED=false, не доказ хмарного стану | Частково; Worker не активується у варіанті A, перед серверною активацією потрібна інвентаризація інших шляхів |
| Незалежний Codex acceptance reviewer | R01–R05 перевірено свіжими gh/byte compare, читанням canonical docs і вихідного коду; R05 повторено після всіх уточнень | PASS, документних дефектів немає; R06 звіряється за remote після перенесення цього журналу |

Claude: модель claude-fable-5-1; 10 зауважень, 5 підтвердились, 4 часткові, 1 застаріле. Токени: вхід 194, вихід 35387, кеш створення 149739, кеш читання 609001, разом 794321; 724.4 секунди, exit 0, permission denials 0. Це CLI-рев’ю через підписку, не генерація з пілотного API-бюджету $5. Сирий результат лишився в ignored runtime. Остаточний перевірений план після уточнень: https://github.com/MILSPIL/nutrition-app/blob/3b776f9f681fbe757e1e40b23de15f723156c69b/docs/superpowers/plans/2026-10-21-scisense-server-rollout.md .

## Результат

Чотири журнали вже в main. Зауваження до плану звірені, уточнення внесені до документа, незалежний Codex підтвердив R01–R05 (SHA256 плану 71bc4afe81acc740c87b6784d07562744c82551654c8ef2895a09afebbe6f353); нового дозволу на server adapter/G04 ще немає. Серверних змін і платних генерацій0. Розгортання та телефонний тест не виконано.

## Наступні кроки

Фіксація та перенесення цього запису виконуються окремо від коду; перевірка після merge порівнює його з remote main. Показати Юрію план на погодження локальної реалізації server adapter/G04/Linux package. Після реалізації надати окремий конкретний пакет привілейованого встановлення та production-cutover.

## Ризики / нотатки

Не повторювати $5/model/domain approval, не обнуляти бюджет, не переносити живий marker завчасно. G04 до приватного пілоту. Native preview/TLS/admin/backup/Node compatibility ще pending. Не merge PR8 разом із журналами, не чіпати чужі primary/scale зміни. Публічні докази без IP/UUID, сусідніх доменів і секретів.
