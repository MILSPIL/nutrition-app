# Початковий імпорт персональної історії

HERMES-PERSONAL-01, Goal objective_e45aa8ac1aa3, G02/G04/G05/G06/G08/G11. Компонент server/trainer/hermes_personal_migration.py синтетично перевірений на native pin3f2/schema32. Це компонент початкового імпорту; приватний cutover ще попереду.

Дозволені transcript поля зберігають IDs, lineage, timestamps, tool зв’язки, active/compacted/summary і вузькі display flags. Frozen policy, config/auth, hooks/cron/Telegram credentials не переносяться. Невідомі display metadata блокуються до звірки. Primary ID задається явно; інші Bot Chat отримують історичну назву. Legacy web visible messages стають окремим архівом зі стабільними IDs без replay старих commands/Add.

Контекст до32 md/txt, разом400000bytes. Фото до5MiB, сукупна квота256MiB, path map лише власного source HOME; відсутній або prefix-схожий файл зупиняє імпорт. Bundle AES256GCM прив’язаний до UID й абсолютного destinationHOME. Ключ лише в пам’яті/через stdin operator, не в repo/argv/UI.

Імпорт викликає native SessionDB.import_sessions в новому private stage; перевіряє semantic fingerprints після export. Повна перевірка перед записом, fsync файлів/каталогів, атомарний no-replace renamex_np/renameat2. Наявний HOME не накривається, повтор не створює дубля. Збій до promotion прибирає власний stage; SIGKILL лишає приватний orphan, який не є liveHOME.

Свіже personal_contract_review:2P2 знайдені й закриті, додаткова ліва path boundary теж закрита. Actual native9tests PASS із OS canaries privateRead/process/TCP/UDP deny;0realAPI. Доказ docs/evidence/hermes-personal-migration-2026-10-26.json. Оновлений Desktop bf0203 також має publicschema32, це не замінює приватну inventory.

Наступне: fixed inventory/export/verify/import operator зі source maintenance ownership fence; whitelist приватних матеріалів лише післяB1; повний canonical backup/restore на тому самому абсолютному HOME після physicalexit; exact runbook; Linux і package artifact. Поточний компонент не переносить критичні native receipts/runtime ownership і не є generic canonical rollback. Ledger/Firestore не відкотяться до старого стану.

## Фіксований оператор

scripts/hermes-personal-migration-operator.py запускається pinned Python із прапорцями `-I -B`. Перед Native imports він створює порожні HOME/HERMES/CODEX/XDG, прибирає успадковані змінні провайдерів і вмикає окремий pycache. Audit відмовляє process/network, credential-файлам і config.yaml поза власним порожнім HOME. Native source звіряється з pinned manifest20685files; зайві importable modules/bytecode та directory aliases відхиляються. Root .venv є окремо перевіреною залежністю runtime.

Режими inventory/export/verify/import. Inventory пише приватний файл з IDs/лічильниками, не вибирає неоднозначну основну сесію. Export приймає явний selection і повну ancestry, лише погоджені md/txt та власні фото. До native читання перевіряються identity, canonical path, owner і single-link DB/WAL/SHM, після читання identity звіряється знову. Другий source owner не допускається.

Export тримає native maintenance ownership до керувального release, прив’язаного до SHA encrypted bundle. Ключ, рівно32 rawbytes, тільки stdin. EOF є незавершеним cutover, а не успіхом. Оператор не зупиняє source служби й не перемикає Desktop: це наступний адресний runbook. Після physicalexit lock знімає ОС, тому стале вимкнення старих каналів обов’язкове до release. Повний canonical snapshot/restore тепер реалізовано окремим компонентом, [контракт](hermes-personal-snapshot-01.md); фізичний drain і cutover лишаються гейтами контролера.

Fresh personal_contract_review PASS:3P2 закриті, останній environment/config witness теж PASS. Actual native/CLI15tests і4OScanaries,0realAPI; cold CLI перевірений справжнім subprocess `-I -B`. Доказ docs/evidence/hermes-personal-migration-operator-2026-10-26.json. Малий boundary test перевіряє encrypted envelope, більший за plaintext cap, без виділення256MiB. Plaintext/photo квоти незмінні.

Public image нормалізує лише власний untracked Native source cache до тестів і перед export; pinned blobs незмінні. Так CI та встановлюваний runtime перевірятимуть однакове холодне дерево. Ця Linux-дельта пройшла exact CI40275442033 на2fc0cbf. Новий snapshot потребує наступного exact CI.

Режими оператора тепер також включають `snapshot` і `restore`. Сукупний suite міграції, повного backup і регресій контексту:39PASS,4OSguards,0realAPI. Свіже незалежне рев’ю PASS. [Доказ повного відновлення](../evidence/hermes-personal-snapshot-2026-10-26.json).
