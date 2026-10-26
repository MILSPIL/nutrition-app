# HERMES-PERSONAL-01: V3 activation

Статус: локальна підготовка. На ntzg.pp.ua ще V2; цей пакет не встановлений. Goal objective_e45aa8ac1aa3, G04/G05/G06/G08/G11 pending.

## Запуск

`server/deployment-personal.json` є вимкненим шаблоном. Пакувальник має явно вибрати його як `server/deployment.json`; звичайний V2 startup не змінений. V3 перевіряє root-owned `/etc/scisense/personal-activation.json`, конкретний release SHA, policyHash і закриті Linux/privacy/single-writer/backup/migration гейти. Ordinary startup не провізіонує відсутні durable stores.

Модельний канал використовує тільки native Hermes lane openai-codex. Модель/підключення належать funding owner, browser не отримує credentials. Два verified Firebase UID мають окремі dataProfiles, HOME і native authority. Для дружини немає вимоги ChatGPT-логіну. Її справжній Firebase UID ще треба верифікувати та включити до operator registry; його не вигадуємо.

Джерела secrets: systemd credentials `groq` і 32-byte `personal-state`; ключ стирається в caller після eager derivation perUID Firebase keys. V3 не читає `anthropic`, old trainer activation, валютний ledger чи старий $5. Groq whisper-large-v3 працює через `INFERENCE_MODE=stt_only` і незалежний zero-cost ledger. `/analyze` відхиляється до provider. Розбір їжі/фото проходить через той самий canonical chat і підтвердження «Додати».

B3 scope лишається8turn/24physicalPOST, ≤3POST/turn,45s після черги. Цей документ не збільшує cap і не є дозволом на fallback. HTTP має2слоти для незалежного status/thumbnail, model queue лишається1active/4waiting. Агентський реальний STT прогін обмежений1синтетичним записом≤10с.

## Тимчасові дані й відмова

Uploads лише `/run/scisense/personal-media/<verifiedUid>`, owned private directory на actual tmpfs. Після reboot можна відтворити лише ці порожні каталоги. Durable outbox/turns/native credentials/deletion anchors не створюються автоматично. Native retained photos розташовані в інших HOME/UID і цим очищенням не обходяться.

Idle sweeper прибирає також orphan bin і пошкоджений metadata файл:295s+5s interval≤300s. Відомі файли мають monotonic deadline, який не подовжується при поверненні системного годинника назад. Одна погана позиція не заважає очистити решту. Fault лочується: startup відмовляє, runtime блокує подальшу роботу й закриває watchdog до очікування Native drain. PID1 завершує API cgroup і прибирає RuntimeDirectory; `Restart=no` не приховує збій автоматичним перезапуском. Startup catch теж закриває helper.

## Локальні докази

16Node tests V3/component/ephemeral PASS; окремо13actual pinned Python tests PASS, включно з missing worker_receipts/runtime_epoch refusal без зміни bytes/відтворення таблиць. Actual Mac runtime regression25checks/6processes/7fakePOST PASS після begin/end turn. Усі дані синтетичні,0realAPI.

Незалежне personal_local_review:2P2 startup watchdog/ignored cleanup fault виправлені, фінальний PASS без новихP1/P2. Native schema guard використовує штатний readonly `schema_drift_reason`, не ручний native SQL repair. Linux deployment, retained migration, Desktop facade/model picker, server credentials/login і B1/B2/B3 ще pending.
