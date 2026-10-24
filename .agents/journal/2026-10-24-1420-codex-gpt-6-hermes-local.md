# HERMES-FOOD-01: локальна реалізація 0–7 перевірена

- Дата і час: 2026-10-24 14:20 EEST
- IDE / агент: Codex desktop
- Модель: GPT-6
- Chat ID: 01a1585d-ba1e-7da0-a174-903bee0573b3

## Ціль
Виконати погоджені локальні кроки0–7 і перенести журнал1326 у main. Приватний профіль, реальні API, Keychain, $5, сервер і production Firebase не чіпати.

## Що зроблено
- Дозвіл Юрія на 0–7/А1–А4 зафіксовано; feature codex/hermes-food-chat-local від94ea293.
- Журнал1326 у main через PR27, merge 2a71687. CI40089305389/40089308567 SUCCESS; source/main/origin blob c53fc31df7fbd1733b230307c246c71386dbc14d. Змінився лише журнал, продуктового merge немає.
- Installed Hermes HEAD bf0203a відрізняється від погодженого3f2afed. git archive створив окрему pinned копію в ignored runtime; встановлений source/profile не змінювався. Приватні файли не читались.
- Залежності pinned Hermes встановлені в окремій venv Python3.14.6 через uv sync --frozen; HOME/HERMES_HOME синтетичні, env очищений. aiohttp/anthropic/openai imports PASS; справжній runtime перевірено нижче.

- Крок0: 12 frozen H02 fixtures, synthetic turn/draft/note/contextProposal contracts, test:hermes і test:hermes-ui. Baseline фактичного коду: H01 textarea відсутня, H03 unknown nutrition відхиляється; команда --baseline має exit1. Арифметика230 та g/ml deny збережені. 4 контрактні перевірки PASS, 10 інтеграційних критеріїв явно TODO, не PASS. Негативний контроль підміни unknown нулем відхиляється.
- G01 нової задачі passed за явним рішенням Юрія; implementation card128eb6c248fb. Planning card29bef280dd54 технічно open через dashboard-only manual gate, це не блок реалізації. Знеособлений export оновлено.

- Крок1: standalone API спершу проходив, незалежне Codex review виявило неперевірений canonical admission. Пробу переведено на actual GatewayRunner/session authority/adapter та native agent. Pin20685 файлів перевіряється перед запуском, OS policy забороняє зовнішню мережу й читання user paths поза lab; synthetic canaries підтвердили deny.
- Canonical negative control: native DELETE200 лишав байти фото у staging cache та state.db-wal. Вузький wrapper нашого репо (без upstream patch) вмикає secure_delete на спільному writer перед admission; після native DELETE і завершення worker/закриття handles прибирає тільки staging-файл за відомим SHA, перевіряє quiescent checkpoint busy0. Той самий профіль, один worker на turn, без hosted-room/інших платформ.
- Native complete/cancel повторно PASS, незалежний reviewer повторив: 3/1 fake requests; 1.271/1.510 с; canonical admission terminal; всі5 curated markers+SOUL+authoritative history; native image; лише6 tools; terminal/memory deny; exact replay; DELETE; нуль raw/base64/fragments після stop. Окремий незалежний scan902 фрагментів, sessions/messages/admissions0, WAL/SHM немає, quick_check ok. Це не latency Sonnet і не Linux ресурсний benchmark.
- 12 failure-тестів wrapper PASS: live writer, ownership, native deletion missing, queued/started/unknown, changed bytes, symlinks, busy WAL, idempotency, secure_delete readback. Незалежний Codex hermes_runtime_gate_review: PASS, відкритих зауважень0. Додатковий P2 FIFO зависав до fstat; O_NONBLOCK і bounded subprocess test виправили це.

- Крок2 завершено: owner-only gateway, durable SQLite admissions/leases/HMAC call receipts, early exact replay, status/recovery/cancel, bounded full payload/history, без кешування промптів, no retry після будь-якого upstream failure, спільна вимкнена quota policy. Старий ledger format/receipt/anchor/cap збережені.
- Actual Node→pinned Hermes→fake provider: complete, native ACK + Node commit loss/recovery без нового inference, cancel,429, stuck-tool deadline, SIGKILL unknown та explicit cancel. 8 fake calls; останній власний набір21.041 с, незалежний повтор19.652 с. Перевірено114media fragments,0leaks, source/OSdeny. Реальних API/ключів/витрат0.
- Незалежне step2 review підтвердило виправлення owner cross-access,429 retry,latecontext replay,pre-admission hang,pre-upstream unknown,cleanup visibility/reload,cache reservation,actual history receipt,metadata crash handling,native deadline/unknown reconciliation. Кінцевий незалежний verdict PASS; metadata .tmp cleanup перевірено. Незалежний scan26 файлів/114фрагментів:0витоків,0cleanup jobs,0unfinished,8квитанцій. Один запуск перетнувся з іншим тестом на фіксованих портах; exclusive repeat PASS.
- Повний серверний набір98:88PASS/10TODO/0FAIL. TODO позначають ще не завершені інтеграційні H01–H10 наступних блоків; їх не зараховано як PASS. Prettier3.6.2 використано тільки для нових модулів, кеш у ignored runtime.

- Крок2 commit+push2eb2dc7; точний CI40092797054 усі3jobs SUCCESS.
- Крок3: manifest3USDA ZIP+SHA256+CC0, SQLite13588/53partial/32null source rows, серверний numeric snapshot із offeredID, label/estimate/unknown, без змішування г/мл. 13targeted PASS, незалежний hermes_food_lookup_review PASS. Повторний повний імпорт SHAa8e60fe05956869df3bc9d04371994c5ff8adf0d6014e474457f52191b591ad8,12079104bytes,0444,quick_checkok. Підтверджені2findings виправлено; runtimeархіви/індекс позаGit.

- Крок4 WIP: нові foodNotes і атомарні mixed/notes-only/resolve команди, exact previous-v2 writer, trusted per-owner v3 gate; read transaction повертає day+notes одним snapshot. День/звіт/тренер показують неповний підсумок і відомі значення на названу основу. Notes reviewer знайшов split read/pending/підпис основи/rules marker/legacy nonce; усе виправлено, FINALPASS. Emulator mixed+20 notes+concurrent resolve і5negative/access tests PASS.
- SQLite draft/CAS/save freeze/replay, explicit context commit з encrypted predecessor/readback, 30-day TTL/startup/hourly/read + separate deletion manifest/anchor, tools integration написані, ще проходять review. Server123=113PASS10TODO;15нових targeted tests PASS. Storage reviewer відтворив3race/TTL defects, виправлено з regressiontests, перевірка триває. Це не завершення step4 чи прийманняH01–H10.

## Змінені файли
server/trainer/* і server runtime/API/ledger; src/components/TrainerChat*, FoodNotesPanel, src/services/trainer*, mealStore/mealCommands/foodNotes, показ дня/звіту/тренера; firestore.rules; scripts/hermes*, food importer, browser/emulator runners; deploy/hermes unit; package scripts/CI; spec/plan/Goal, docs/evidence/* і docs/deployment/hermes-food-local.md, PROJECT-INFO.md, цей журнал та .codeindexer export. Точний diff:94ea293..ce62052,128 файлів, включно з публічними fixtures й тестами.

## Перевірки
GitHub account MILSPIL; Git status/worktrees; CI40086707530 на базі94ea293 SUCCESS; Code Indexer briefing обох дерев і roadmap next. Старі незакомічені файли primary не чіпалися.

## Результат
Кроки 0–7 локально завершено на ce62052. Точний CI40099514295 attempt2 SUCCESS4/4, незалежний Codex hermes_final_local_review: done для H01–H10, відкритих блокерів0. Пакет release-ce62052 має manifestSHA50209c011c545a3868aa4838d31610bb93bcf6e1d0a3822c415820d77cd06c97, всі209app/31726runtime файли перевірені,5API requests/external0/keys0/cleanuptrue. H11 і продуктові G02–G11 не прийняті; живі дані й інфраструктура не використовувалися.

## Наступні кроки
Новий журнал1420 у main лише після окремого дозволу. Наступний можливий етап B1: конкретно погоджене читання приватного профілю/сервера/ledger; потім окремі B2 перенесення і C активація/телефон. Пакет та інструкція готові, виконання B/C і продуктовий merge не дозволені.

## Ризики / нотатки
Context7 quota exhausted у цій сесії; використовуємо офіційні документи, CLI help і pinned source. Наявний профіль заборонено читати. Новий журнал потребує окремого дозволу на main.

- Крок4 перевірки після виправлень: 228Jest/25suites,47old-writer,5rules+actual notes store PASS; actual native8calls/21.521s/0leaks. Додатково виправлено labelquantity, originalText кожного item і його видалення з повних confirmed meals; final review reread очікується.

- Крок4 завершено: два незалежні reviewers PASS. Storage reviewer відтворив7дефектів, усі виправлено; фінально19/19 PASS незалежно. Походження тексту дедупліковане у приватній чернетці; notes зберігають його, knownmeals не отримують. Доказ docs/evidence/hermes-drafts-local-2026-10-24.json. Далі крок5UI.

- Крок5 завершено локально: TrainerChat/Session/Api, feature flag off, textarea/explicit recording, STT→Hermes, bound photos, canonical Add, notes/memory. Reviewer відтворив composer/draft CAS, bfcache async revival, metrics attribution, multi-date partial, same-origin GET та plan-conflict freeze; виправлено. Додатковий TTL/late404 race виправлено; незалежно4/4 TTL,20UI,30server PASS, відкритих findings0.
- Save rejection має атомарний незмінний content-free hash marker у Firestore; rules виключають success/rejection та стирання старих markers, trusted receipt розморожує з CAS і новимID.7rules і actual emulator storePASS.
- Браузер31checksPASS: текст→голос→фото→reload→Add, unknownnote, contextconfirmation, question nofood;375/390/1366 overflow0/edges0/gutter16/control44+.7fake model turns,1fakeSTT,0analyze. Власні браузер/контексти/емулятори прибрані launcher cleanup_ok/removed.
- Повний Jest249PASS, додатковаSessionTTL10PASS; server123PASS10TODO. Доказ docs/evidence/hermes-chat-local-2026-10-24.json. Кроки6–7 тривають. Context7 quota раніше вичерпана; React/MDN/Firestore офіційні docs, локальний pinned source використані.

- Крок6/7: runtime factory, authenticated owner-only Firestore REST snapshot, activation receipt+shared ledger та lazy disabled import реалізовано. Виправлено double-close, marker FieldPath concurrency і неправильний W09 test selector. 12 H02 contracts виконують actual resolver/draft; TODO прибрано, не замінено вигаданим live-verdict.
- Public pinned Linux build Node24.22.1/Python3.14.6/Hermes3f2afed, bwrap0.11.0+BPF+USDA. CI40097626035 b415653: child isolation/negativecontrols та realtools/fullindex turn PASS9.288s/274219008B/OOM0 у2CPU2GiBswap0; rootapp/Groq/systemdcredential jobsPASS. Linux failure-suite виявив лишений300s canonical lease післяSIGKILL. CI40098033548 e0260d3 coarse diagnostic підтвердила native_delete AssertionError.
- e42a8e4: вузький native recovery вимагає exactNodeexit→run/session/pidns, explicitunknownresolve, oldepoch/currentownership, canonical exactholderrelease/readback. Після Noderestart без exitproof залишається pending доTTL. Не змінює upstream чи300sTTL.18Pythonprivacy testsPASS, включно activeepoch/foreignnamespace/CASreplacement.
- Незалежний final reviewer знайшов4issues: empty/escaping package, remoteDocker/SIGTERM, contextbackupбезTTL. Усе виправлено: requiredsource/index/version pin/safelinks; localUnix і8runnerstubs; authenticated30daybackupexpiry startup/read/idle.32targetedNode+10package+18privacy independentPASS. Поточний fullserver150PASS0TODO, nativeMac22.72s/8fakecalls/0leaks. CI40098346913 pending; candidateunit/export/package ще не зараховано.

- 617c0e7/CI40098641722 підтвердив systemd procfs conflict; A/B лише ProtectKernelTunablesfalse PASS9.459с/310693888B/OOM0, початковий CI лишився FAIL. a598afc candidate-only false+/sysRO, actual parent canaries, A/B fallback прибрано. Source reviewer без блокувальних code findings; уточнено, що лише зовнішній systemd-CI container privileged, unit непривілейований. Точний CI40098997723 триває. Buildoff a598afc PASS; остаточна упаковка ще pending.

- ce62052: exact systemd canary через fdinfo mnt_id довів /sysRO після BindReadOnlyPaths; actual Linux resource9.428с/274898944B і systemd9.370с/311238656B, CPU2/RAM2GiB/swap0/OOM0. Full failure-suite55.507с/7fakecalls, cancel/429/deadline/SIGKILL/recovery PASS,0media leaks. Source review звірив systemd255/Linux/pinnedNode; діагностичний A/B не лишився автоматичним fallback.
- CI40099514295 attempt1: Hermes/resource/systemd/Groq PASS; strict browser HTTP check зупинився на batchGet502, точна причина не встановлена. Локальний повтор exactSHA50PASS/0HTTP/cleanuptrue; жодної speculative правки чи послаблення assertion. Attempt2 лише failedjob триває.
- Goal синхронізовано з наданим дозволом0–7/А1–А4; G01passed, G02–G11pending. Пороги пілоту й межі B/C незмінні. Publicruntime artifact12561769831 завантажується частинами через gh із повною перевіркою GitHub SHA256; payload не містить приватного профілю. Остаточний пакет і verdict ще pending.

- CI40099514295 attempt2 на незмінному ce62052 SUCCESS4/4. 250Jest/28suites,43Worker,47oldwriter, server149PASS+1full-index skip (локально150PASS; окремий LinuxfullindexPASS),38legacyrules,17gateway,7notesrules. Браузер7access/71voice-photo/50phone/34STT/31Hermes, усі buildPASS; HTTP0, відповідні cleanuptrue. Перший502 збережено в доказах як невстановлену одноразову причину, не як виправлений дефект.

- Крок7 завершено: повний GitHub ZIP digest f0eff953334e3d417c6fbc7cad41d907291cdae19c65f8fbb5ea276049d5e018 звірено двома перевіряльниками; actual runtime validator31726filesPASS, app209files+hashesPASS, exact offreceipt, jose6.1.0 безwrangler. Незалежно77source/28build byte-equal. Упакований API5HTTP/external0/keys0, тимчасовий каталог видалено. Публічний архів і вимкнений пакет лишаються локально позаGit; зайві частини завантаження прибрані.
- Фінальний reviewer hermes_final_local_review: done локальних0–7/H01–H10 наce62052,0відкритихблокерів. Кандидат unit потребує нового host-specific probe під час B; жодного автоматичного послаблення чи збільшенняресурсів. Runbook має B1/B2/C, сумісний writer fence/rollback,8майбутніх turns/24calls/max$3.47904 тільки після нового дозволу й перевірки залишку$5.

- codeindexer 2026-10-24: solutions 3, картки 1; card_128eb6c248fb закрито з незалежним verdict, Goal і стан фази синхронізовані, export збережено у Git. G01passed/G02–G11pending. PROJECT-INFO.md оновлено, бо завершено локальні0–7; продуктовий main не змінено.
