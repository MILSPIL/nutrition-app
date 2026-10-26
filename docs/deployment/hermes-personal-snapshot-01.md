# Повне відновлення canonical історії Hermes

HERMES-PERSONAL-01, Goal objective_e45aa8ac1aa3, G02/G04/G05/G06/G08/G11. Синтетичні39тестів і4системні перевірки ізоляції пройдені; свіже незалежне рев’ю personal_contract_review PASS. Це доказ компонента, фізичний drain і приватне перемикання належать B1/B2/B3. [Доказ](../evidence/hermes-personal-snapshot-2026-10-26.json).

`server/trainer/hermes_personal_snapshot.py` резервує повну native state.db, personal-context і збережені native-inputs. Auth/config/.env, hooks, Telegram credentials, raw staging, app ledgers та Firebase не входять. Native `_safe_copy_db` робить узгоджену SQLite-копію; native integrity та schema перевіряються до публікації. Навіть readonly Native SessionDB створює службовий schema cache: оператор спрямовує його у власний тимчасовий HOME, не в оригінал.

Архів потоковий, AES256GCM, GNU tar для довгих дозволених назв. AAD зв’язує UID, точний абсолютний canonical HOME та pin. Маніфест усередині шифру; дозволені шляхи/типи/розміри/хеші закриті. DB до400MiB, фото разом256MiB, кожне до5MiB, до50000файлів. Архівний запас для context JSON дорівнює400000+500000+32000bytes, до500000нафайл. Це лише метадані: rendered context має незмінний ліміт400000bytes.

Режим `snapshot` фіксованого `scripts/hermes-personal-migration-operator.py` приймає32rawbytes ключа через stdin. Наявний canonical source і DB перевіряються до maintenance reservation. Native fence тримається до JSON release з SHA; EOF не означає успішне перемикання. Output дозволений тільки поза source HOME, щоб архів не міг стати SQLite WAL/SHM чи файлом контексту.

`restore` вимагає SHA свіжої копії та minimum native epoch. Digest рахується з того самого фактично прочитаного encrypted stream, який дешифрується, тому заміна на стару валідну копію з тим самим epoch відхиляється. Повний GCM tag і SHA перевіряються до розбору tar; plaintext перебуває лише у приватному unlinked temporary file. Extraction відхиляє traversal, aliases, спеціальні файли, дублікати, невідомі поля, пропуски й невірні хеші.

Повний native `_safe_restore_db` пише у приватний stage. Після перевірки й fsync stage публікується атомарно лише в відсутній SAME canonical HOME, без overlay. Порожні службові каталоги відновлюються. Наступний native startup підвищує epoch; original IDs, tail, unknown admission і повтор із тим самим requestId зберігаються без replay. Ledger витрат, Firestore, квитанції Add та нові refresh grants не відновлюються зі старого стану.

Контролер перед snapshot/restore окремо припиняє ingress, доводить фізичний вихід усіх writer-ів і звіряє свіжий хвіст. Сам receipt компонента не доводить ці умови. Застаріла disaster-копія не є логічним cutback; її RPO вирішується окремо. Незалежна offsite адреса і щоденна політика перевіряються до B2.
