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

## Бюджет і runtime

Реалізовано server main/runtime, LIVE=false manifest, окремий root-owned activation, systemd credential template, один SQLite ledger поза releases, стійкий anchor і lock. Synthetic prepare/stage transfer з permanent marker блокує локальні checkouts, не створює другого бюджету. Спочатку дві негативні перевірки FAIL на старому localBudget; після зміни server20/20 PASS. Незалежний budget_runtime_review виявив race із двома transfer receipts і помилковий expected503 замість401; виправлено. Свіжі12/12 і власні existing/fresh races, child SIGKILL, lock-before-marker-read PASS. Невдала або перервана передача лишає inference вимкненим. Код transfer приймає marker adapter; справжній Keychain/SSH adapter та активація входять до майбутнього погодженого production-пакета. Доказ docs/evidence/server-budget-preparation-2026-10-21.json. Справжніх ключів і витрат немає.

## Фактичний Linux-прогін

GitHub Actions39590783755 на c0c334b завершився failure за чесним критерієм performance. Збірка pinned Linux image/Whisper пройшла. Усі6 UA/RU fixtures5/30/90s повернули upstream_timeout за45017–45046ms, peak795369472–810352640bytes, OOM0. Для окремих abort/timeout/concurrency/OOM перевірок4/4 PASS, ownedProcesses0/temporaryFiles0/cleanupOk=true. Synthetic systemd255 encrypt/decrypt, wrong-name і tamper PASS, plaintextFile=false. Після тесту availableRAM15627165696bytes. MS-WEB не перевірявся. Доказ docs/evidence/linux-whisper-preparation-2026-10-21.json. Відповідно до плану модель/ресурси не змінюємо, performance залишається блокером.

## TLS та переносимий CI

CI39590783622 виявив Linux OpenSSL tls_generation_failed: Node stdio використовує socket, який OpenSSL не може повторно відкрити через /dev/fd. Перевірено офіційний OpenSSL3.0 source apps.c/req.c; native '-' працює для req output, але x509 CAkey сприймає '-' як шлях. Заміна: req PEM через stdout у пам’ять, signer отримує реальний pipe через фіксований shell і позиційні аргументи. Приватні ключі не записуються у файли/argv/логи. CI39611260978 на e22be6a SUCCESS: app99/Worker31/storage17/server20/rules29/phone-lab9, три browser flows, build.

Незалежний tls_portability_review відтворив TERM-resistant descendant, якому close скасовував SIGKILL. Окремий regression спочатку FAIL (childAlive=true), після cleanupPending/escalation PASS; node phone-lab10/10. Коміт8ea6f2e. Повторне незалежне review done: власні overflow1149ms/timeout21068ms, SAN/CA/key-match, privateKeyInFiles=false/privateKeyInArgs=false, залишків0. Linux CI cleanup-коміту очікується.

codeindexer 2026-10-21: solutions2 (budget race, Linux TLS), нова картка1 (Whisper CPU timeout), оновлено G04-картку, phase health, deployment і scope; exports обох проєктів оновлені. Питання про2CPU synthetic CI надіслано, відповіді ще немає; зміни ресурсів не зроблено.

## Інтегрований знімок та PR

Актуальний main a057bcf інтегровано тільки в робочу гілку: c2cfecf5cff7c1d128c26a5427f78ffba3e3e8af. Production build /meal-api, lab flags0, no sourcemaps PASS;27assets із SHA256, source archive11520133bytes перевірений по paths/10sourcehashes; manifest c33662524b9ccd4e9bcfe0196a0e2da224e89d907e924d327c63d3e03d1fbfc9. Артефакти tmp/server-preparation/c2cfecf; публічний manifest у docs/evidence/server-preparation-snapshot-2026-10-21.json. installApproved=false/liveEnabled=false. Створено й прикріплено PR16 draft; PR8 лишається open. CI39617071772 поки queued, попередній portable e22be6a PASS. Два superseded queued CI скасовано, жодні чужі jobs не чіпалися. Журнал підготовлено до окремого перенесення в main за погодженим CLOUD-PREP-01; продуктовий код не зливається.


## Погоджена проба двох CPU

2026-10-21: Юрій відповів «Так, перевір2CPU в CI». Це окремий synthetic benchmark тієї самої моделі/2GiB/45s; production1CPU, ключі та$5 без змін. Додано run.py --cpus {1,2} з default1, узгоджений threads і перевірку реального cgroup quota/RAM. Локальні3/3 limit-тести PASS. Linux workflow лишено тільки pull_request, щоб не дублювати один прогін через push. Незалежне рев’ю і фактичний2CPU результат очікуються.

Інтегрований CI39617071772 SUCCESS (99app/31Worker/17storage/20server/29rules/10phone-lab/3browser/build). Журнал попереднього стану перейшов у main через PR17, merge1e30499338ea2999428ecf8f7ef4f15cbbdc44a2, CI2/2SUCCESS; нові записи цього розділу ще лише в робочій гілці. Продуктовий PR16 лишається draft.


## Результат 2 CPU і діагностика

Погоджений прогін CI39620593130 на c60805d завершено: усі 6 UA/RU записів 5/30/90s завершились за таймером 45016–45027ms; фактичні threads2, cpu.max200000/100000, RAM2GiB підтверджені. Peak796684288–811618304bytes, без OOM. Чотири negative controls, cleanup та synthetic credential PASS. Доказ docs/evidence/linux-whisper-2cpu-preparation-2026-10-21.json. App CI39620593155 SUCCESS.

Незалежний linux_prep_review підтвердив 20 mock-команд, 6 CLI-відмов і незмінні production/model. Причина таймауту ще не доведена: таймер охоплює cold init, stdin та inference. Офіційний pinned CLI читає stdin через fread до EOF; build log підтвердив AVX2/F16C/FMA. Для зняття невизначеності готується одна synthetic UK5s діагностична проба за тими самими2CPU/2GiB/45s/model. Вона зберігає лише cpu.stat delta, кількість байтів і дозволені стани процесу. Сирих stderr/транскриптів/медіа в доказах немає. Окремий потенційний Linux stdout-reopen ризик поки не оголошено причиною таймауту.
