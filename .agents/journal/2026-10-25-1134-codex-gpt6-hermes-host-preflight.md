# SciSense: перевірка сервера після розблокування Mac

_Дата: 2026-10-25 11:34 Europe/Kyiv | IDE: Codex desktop | Модель: GPT-6 | Chat: 01a1585d-ba1e-7da0-a174-903bee0573b3_

## Мета

Продовжити погоджений HERMES-COACH-02/I01 на ntzg.pp.ua після відповіді власника «Mac розблоковано». Зберегти сумарний$5, моделі, ресурси й приватний щоденник.

## Виконано

- CUA підтвердив розблокований Mac. `security` через length-only helper знов очікував5с; стандартна бібліотека keyring прочитала ms-web-xcloud/api-token, перевірена тільки довжина55 без значення.
- Дозволений тимчасовий scisense-voice створено, statusprovisioned, SSHhostpin звірений. Фіксована читальна інвентаризація пройшла; sudo використано лише для неї та перевірки синтаксису профілю.
- Чинний release9f2759b, служба активна, inferenceenabled. На сервері glibc2.39/systemd255.4, AppArmorenabled, restriction1, bwrap/python/Hermesruntime ще відсутні.
- Чинний ledger цілий, cap5000000, reserved531788, залишок4468212,13calls, unfinished0. Нових modelcalls0. Дані щоденника не читалися й не змінювалися.
- Проба user/mount/netnamespace від scisense відмовила на uid_map. Це нова несумісність host; вона не є фактичним запуском bwrap/Hermes.
- Підготовлено HERMES-HOST-01, профільscisense-bwrap та публічний доказ без особистих даних. Parser4.0.1 перевірив кандидат113bytes, SHA4cf4112db08b7a5b1bfd9101bfe11bb3353c3f408b99222c5b1b455c16fd9134 через skip-kernel-load/skip-cache:exit0, kernelprofilesunchangedtrue. Профіль не застосовано.

## Межа і наступний крок

Погоджений runbook забороняє автоматично послаблювати AppArmor/sysctl/capabilities після несумісності. Запропонований адресний дозвілuserns для exactbwrap із root:scisense0750 потребує рішення власника. Глобальний restriction1 зберігається. Незалежне Codex рев’ю HERMES-HOST-01: PASS, відкритих P1/P2 немає. Уточнено scope для всіх процесів scisense, які запускають binary, та окремі state/runtime каталоги синтетичної служби без production credential drop-in. Конкретний дозвіл готовий на рішення власника.

Тимчасового адміністратора відкликано: xCloud підтвердив presentfalse, окремий SSH-вхід відхилено AuthenticationException. Власний caffeinate53557 прибрано, відсутність перевірена. Запит конкретного дозволу HERMES-HOST-01 надіслано; відповіді поки немає. Застосування профілю не виконано.

## Файли

- docs/deployment/hermes-host-apparmor-01.md
- docs/deployment/scisense-bwrap.apparmor
- docs/evidence/hermes-host-preflight-2026-10-25.json
- Приватний adapter/inventory лише .agents/runtime/deployment/2026-10-24-coach/, позаGit/Indexer.

PROJECT-INFO.md оновлено через зняття блокера Mac і нову несумісність host.

codeindexer 2026-10-25: solutions0, картка1 та phase1 оновлені, експорт збережений. G02–G11 pending.

Зроблено читальну перевірку host і перевірений конкретний план; НЕ встановлено профіль чи новий реліз; на проді: старий застосунок працює.
