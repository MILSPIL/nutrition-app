# Початковий імпорт персональної історії

HERMES-PERSONAL-01, Goal objective_e45aa8ac1aa3, G02/G04/G05/G06/G08/G11. Компонент server/trainer/hermes_personal_migration.py синтетично перевірений на native pin3f2/schema32. Це ще не повний operator і не приватний cutover.

Дозволені transcript поля зберігають IDs, lineage, timestamps, tool зв’язки, active/compacted/summary і вузькі display flags. Frozen policy, config/auth, hooks/cron/Telegram credentials не переносяться. Невідомі display metadata блокуються до звірки. Primary ID задається явно; інші Bot Chat отримують історичну назву. Legacy web visible messages стають окремим архівом зі стабільними IDs без replay старих commands/Add.

Контекст до32 md/txt, разом400000bytes. Фото до5MiB, сукупна квота256MiB, path map лише власного source HOME; відсутній або prefix-схожий файл зупиняє імпорт. Bundle AES256GCM прив’язаний до UID й абсолютного destinationHOME. Ключ лише в пам’яті/через stdin майбутнього operator, не в repo/argv/UI.

Імпорт викликає native SessionDB.import_sessions в новому private stage; перевіряє semantic fingerprints після export. Повна перевірка перед записом, fsync файлів/каталогів, атомарний no-replace renamex_np/renameat2. Наявний HOME не накривається, повтор не створює дубля. Збій до promotion прибирає власний stage; SIGKILL лишає приватний orphan, який не є liveHOME.

Свіже personal_contract_review:2P2 знайдені й закриті, додаткова ліва path boundary теж закрита. Actual native9tests PASS із OS canaries privateRead/process/TCP/UDP deny;0realAPI. Доказ docs/evidence/hermes-personal-migration-2026-10-26.json. Оновлений Desktop bf0203 також має publicschema32, це не замінює приватну inventory.

Наступне: fixed inventory/export/verify/import operator зі source maintenance ownership fence; whitelist приватних матеріалів лише післяB1; повний canonical backup/restore на тому самому абсолютному HOME після physicalexit; exact runbook; Linux і package artifact. Поточний компонент не переносить критичні native receipts/runtime ownership і не є generic canonical rollback. Ledger/Firestore не відкотяться до старого стану.
