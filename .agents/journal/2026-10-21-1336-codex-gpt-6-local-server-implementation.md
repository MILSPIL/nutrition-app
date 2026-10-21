# Погоджена локальна реалізація серверного пакета SciSense

- Дата і час: 2026-10-21 13:36, Europe/Kiev.
- IDE / агент: Codex desktop; модель GPT-6.
- Chat ID: 01a1585d-ba1e-7da0-a174-903bee0573b3.
- Goal objective_e45aa8ac1aa3; G02–G11 pending.

## Ціль та дозволи

Юрій прямо погодив CLOUD-PREP-01, перенесення журналу та запуск у хмарі, з межею «ключі та $5 поки не чіпай». Codex Cloud повернув environment_repo_access_failed для MILSPIL/nutrition-app; керування вікном Codex через CUA недоступне. Після точного UI-кроку Юрій обрав продовження локальної розробки. Повторне погодження серверного API/G04 не потрібне; справжні ключі й $5 не використовуються. Production, merge продуктового коду та привілейоване встановлення не входять.

## Зроблено й докази

Журнал оцінки1212 перенесено окремим PR15, merge a057bcfce47590c6905d8f0b6f79a327751b6281. CI2/2; source/local main/remote main побайтово однакові, SHA256 61b1365be545cf4bd8511c32416d9ac7a73fbf60567f365e686569947caabc71. Локальний main fast-forward. Хмарна задача не створена; Mac потрібен локальному сеансу.

Гілка codex/scisense-server-prep від edf4ad8. Коміт2bd9da2 з погодженням у документах pushed. Перший API-блок: Node loopback transport, Firebase RS256 і обов’язкові claims, точний Origin, ліміти/скасування/timeout; Sonnet отримує signal через shared provider і локальний adapter. Тести на старому коді відтворили missing Origin та caller abort (0/2), після правки 2/2. Серверні тести6/6, Worker31/31, phone-lab8/8 пройшли локально. Тільки синтетичні ключі/підписані JWT/провайдери, зовнішніх inference0. Незалежне server_api_review завершено: done для transport/auth/provider. Виправлено дві знахідки: зависання chunked MAX_BODY+1 і зайнятий слот при незавершеному invalid JWT body. Повторно server8/8, Worker31/31, phone-lab8/8; власні проби рев’юера підтвердили JWKS/cache, multipart, abort і нуль залишкових listeners/timers. Runtime/ledger/G04/Linux/production ще не прийняті.

## Документація й перевірки

Прочитані офіційні Node24 HTTP/SQLite, Firebase ID-token/transactions/rules/unit-tests, jose jwtVerify. Context7 раніше вичерпав квоту, повторно не викликався. Code Indexer основного дерева не містить feature-гілки, відомі файли прочитані напряму. Objective autonomy_policy і constraint.scope оновлені прямими рішеннями Юрія; критерії не закривалися.

## Далі

API-блок 3c7c7bf і G04 red tests 0fde00d pushed. G04 rules/service реалізовані, 26/26 emulator PASS; незалежне g04_protocol_review триває. Далі UI очищення та решта A06/A08. Далі Linux Whisper/переносимі CI-перевірки й synthetic budget transfer/rollback. Фінал: перевірений PR та конкретний production-пакет, без його виконання. Поточний журнал створено в робочій гілці, до main ще не перенесений.

## G04, протокол і перевірки

На старих rules baseline 3/10 PASS і 7/10 FAIL. Нові canonical request, monotonic generation/revision, атомарні accept/revoke, приватність root/roster, fallback відсутнього каталогу, контроль повторів: 26/26 PASS у demo-scisense. Mutation на окремому demo-scisense-mutation підтвердив, що assertFails ловить дозвіл самопризначення. Немає тестів/записів у справжній Firebase. Спочатку повторне повне schema validation перевищувало 1000 expressions, тому proof перевіряє повну схему, а пов’язані правила вимагають фактичний узгоджений перехід цього proof. Missing trainer doc у SDK може дати permission-denied; fallback не послаблює rules. Listener deny у емуляторі підтверджений після target update, UI має незалежний roster signal. Детальні синтетичні logs у /private/tmp/scisense-g04-*.log, не публікуються.

Незалежний g04_protocol_review: спочатку3 findings (malformed roster блокував revoke, крайній counter, delete malformed canonical), усі відтворені та виправлені. Повторний вердикт done для протоколу; власний suite29/29 і ще10SDK-probes PASS. Хеші rules/service збережені у evidence. UI і кінцеве G04 не прийняті. CI на попередніх0fde00d і3c7c7bf success, але ще не містив нових G04 tests.

## G04, UI та браузер

Протокол committed/pushed1015846. Спільний consent/pending/accepted/legacy panel, operation lock між вікнами й після повторного відкриття, серверне підтвердження; trainer roster/health listeners очищають стан синхронно та відкидають старі callbacks. Незалежний trainer_ui_review знайшов metadata id у closed-schema validator, заблоковану звірку після timeout та stale callback; виправлено й перевірено. Остаточні Jest99/99 і незалежні lifecycle probes PASS, build PASS. Власний headless browser з demo Auth/Firestore і трьома синтетичними користувачами: request/accept/revoke з обох вікон, reconnect, outsider/revoked deny PASS. Початкова тестова фікстура дня мала лише один прийом і впала; виправлена до штатних чотирьох прийомів, повторний PASS. Відступи0/0/0 і shared16px на375/390/1024; browser cleanup_ok=true,removed=true. Результати без секретів у docs/evidence/trainer-ui-preparation-2026-10-21.json. Production і реальний телефон не перевірялися.

## Переносимий браузер і підготовка Linux

Playwright1.64.0 pinned. Mac використовує власний agent-test-browser; GitHub Actions Linux має окремий guard і браузер. Додані trainer browser script та CI для server/rules/phone-lab/трьох UI сценаріїв. Whisper thread test спочатку FAIL4!=1, після parameterization PASS; Mac default4 лишився, Linux1. Linux image pinned Ubuntu amd64 digest, Node24.11.1/SHA256, whisper.cpp SHA і model SHA1+SHA256; CPU1/RAM2GiB/45s, synthetic uk/ru5/30/90sec, abort/concurrency/timeout/OOM, stdin encrypted systemd credential rehearsal. Незалежний linux_prep_review знайшов timeout cleanup, хибний PASS ресурсів/OOM, missing preflight і неточний timeout metric. Виправлено;22 незалежні негативні проби PASS, verdict done для підготовчого коду. Реальний Linux-прогін ще очікується; MS-WEB не використовується.
