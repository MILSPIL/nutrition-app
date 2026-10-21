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

Виправити знахідки незалежного API-рев’ю; commit/push першого блока. G04: спочатку emulator FAIL на старих rules, потім canonical consent і атомарні переходи, UI очищення та A01–A09. Далі Linux Whisper/переносимі CI-перевірки й synthetic budget transfer/rollback. Фінал: перевірений PR та конкретний production-пакет, без його виконання. Поточний журнал створено в робочій гілці, до main ще не перенесений.
