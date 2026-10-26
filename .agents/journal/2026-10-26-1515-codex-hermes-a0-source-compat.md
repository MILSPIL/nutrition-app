# HERMES-PERSONAL-01: A0 і сумісність джерела

- Дата: 2026-10-26T13:15:43.496708+00:00. IDE/агент: Codex desktop, основна сесія.
- Модель: поточний ідентифікатор агента не перевірявся.
- Chat ID: 01a1585d-ba1e-7da0-a174-903bee0573b3.
- Мета: окремий native серверний вхід і підготовка приватного B2 без змішування акаунтів.
- Дозвіл: погоджені всі кроки HERMES-PERSONAL-01; Юрій виконав новий device-code вхід і надав адресу дружини.

## Зроблено й докази

A0 завершено фактично: native OpenAI login отримав власний server grant; AES-GCM SQLite revision1, перевірений plaintext readback лише в пам’яті. Тимчасовий HOME прибраний, login-service inactive/PID0. Mac grant не копіювали,0модельних/STTзапитів. Новий ключ шифрування зберігається тільки в macOS Keychain і PID1 encrypted credential.

Фактичний B2 bootstrap пройшов: дві окремі UID binding-карти, постійні шифровані сховища/Firebase-session domains, чистий HOME дружини без вигаданих параметрів, grant A0 перенесений з порівнянням bytes у пам’яті. Public APP287 SHA звірені, старий current/API без змін. Справжня історія Юрія ще не імпортована.

Fresh api_approval_review закрив P1 umask у A0 та P2 фізичного завершення двох B2 transient units. A0 lifecycle6offline cases, B2 AES-GCM/SQLite4cases і lifecycle9cases PASS. Обидві B2 служби мають власний RuntimeMax45s/TimeoutStop5s/KillModecontrol-group, finally stop і kernel populated0/MainPID0.

Firebase: після read-only перевірки двох уже авторизованих Google акаунтів знайдено правильний доступ. Підготовлено лише окремий акаунт дружини за адресою власника: без пароля/листів, emailVerified=false, Google proof потрібен під час її входу. Дані Юрія не змінені. Адреса/UID лишаються тільки в приватних операторських файлах.

Інвентаризація одного Mac профілю:3розмови/85Native записів, однозначний Bot Chat,2curated файли/82010bytes,0retained photos. Native розміщує state.db у корені профілю, контекст окремо в home/yura-context.md. Уточнено тільки exact allowed path, сусіди/.. відхиляються.

Код pinned Native підтвердив, що gateway_input_owner є правом повторного приймання старого gateway, а порожній session_meta містить setup/tools/model bookkeeping. Export виключає лише ці службові дані, raw provenance fingerprint збережений. Інші тексти/IDs/дати та model_only незмінні; невідомий metadata або текст у session_meta відхиляються.40Native/4OSguards і fresh personal_contract_review PASS. Фактичний приватний payload пройшов також frozen9c preflight, формат host import не змінений.

## Файли й контроль версій

- scripts/hermes-personal-migration-operator.py, server/trainer/hermes_personal_migration.py і його тест.
- docs/deployment/hermes-personal-migration-01.md, docs/evidence/hermes-personal-source-compat-2026-10-26.json, PROJECT-INFO.md.
- Commit745bf7b у codex/hermes-personal-server; public runtime/package лишається9c218d1, не перетегований.
- Повні приватні квитанції тільки в gitignored runtime.

## Поточний стан і далі

Admin03 відкликано/presentfalse. Admin04 тимчасово активний для B2, після робіт або паузи його треба відкликати й підтвердити відсутність. На Mac shared gateway обслуговує також інші профілі; перевірений Native control підтвердив active_agents0 для тренера. Треба штатно park/unserve лише його, не зупиняти shared host.

Далі: фінальний source fence/encrypted export і web archive, перевірений import/backup, Desktop remote-only, B3≤8turn/24physicalPOST+1syntheticUA STT≤10s. Поки source writers не зупинені, приватний import/публікація НЕ зроблені; old21b0cd3/API діє. Старий$5, Anthropic і реальні модельні ключі не використовувалися. G02–G11/C01–C10 pending, owner acceptance лише Юрій.

Зроблено A0, source compatibility і B2 bootstrap; НЕ зроблено приватний cutover/Desktop/B3; на проді новий реліз: ні.
