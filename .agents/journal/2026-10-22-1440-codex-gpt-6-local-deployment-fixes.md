# SciSense: три локальні доробки розгортання

- Дата і час: 2026-10-22T14:40+03:00
- IDE / агент: Codex Desktop / Codex; модель GPT-6
- Chat ID: 01a1585d-ba1e-7da0-a174-903bee0573b3
- Дозвіл: «Так, перенеси журнал у main і заверши три локальні доробки для розгортання. Ключі, $5 і сервер поки не чіпай.»

## Перенесення журналу

PR22 переніс лише журнал 2026-10-22-1308. Main merge 8e57aea00da4a6c11964e1829b8342d52e3299d8, CI39769728978/39769714301 SUCCESS. Blob f85ab7a9e18a6099eeb985faab4e9856fd89a5c2 однаковий у джерелі/main. Продукт PR8/16 не зливався.

## Захист даних від старих вкладок

Інвентар старих/current writers перевірений незалежним Codex. Обрано новий writerNonce UUID v4 на кожну звичайну мутацію, обов’язкову зміну nonce в rules; G04 link-only лишається окремим. Немає міграції всіх даних, timestamp і commandHash незмінні. Документ docs/WRITER-TRANSITION.md містить порядок deploy/rollback.

До правки 8 нових сценаріїв падали. Після: 38/38 rules, 26 service/storage, 123 app, build PASS. Незалежний reviewer знайшов дві неоднозначні негативні перевірки та прогалину service-level legacy fixture; виправлено, фінальний PASS. Код змінився у firestore.rules, writerFence/mealStore, ClientApp/MeasurementsModal і тестах. Серверні rules не публікувалися.

## Операційне перенесення

CLI export/send/receive/status реалізований без виконання реальної передачі. Не створює новий бюджет, відмовляє за відсутнього ledger/marker, переносить усі paid/free rows, не активує inference. Секрети тільки stdin; на приймачі лише encrypted credentials. Fsync перед підтвердженням, частковий запис не видаляє ledger, повторний імпорт заборонений. Незалежне рев’ю знайшло пропуск заборони нового бюджету та fsync; виправлено з T13/T16. 17/17 цільових і 44/44 серверних тестів PASS, остаточний вердикт Codex PASS. Інструкція містить відновлення після обриву та read-only status.

## Systemd та справжній Linux-приймач

Базовий unit не читає credentials до встановлення окремого live drop-in; весь sandbox збережений. Справжній systemd255 створює root-owned 0440 ACL credentials, тому runtime виправлений для цієї read-only моделі, з фіксованою канонічною директорією. Справжній systemd-creds вимагав umask0077 у CLI для приватного ciphertext. Вісім наскрізних Linux ARM64 сценаріїв PASS, paid123456/free0 та 2 рядки збережені після restart разом із receipt/anchor. Інференсу0, networknone, 1CPU/2GiB, cleanuptrue.

Рев’ю виявило ризик застарілого evidence при cleanup failure та успадкованого remote Docker context. Launcher тепер прив’язаний до локального unix endpoint, записує ownership до запуску, обробляє SIGINT/SIGTERM та не позначає непідтверджене прибирання успішним. Три негативні runner-тести й усі 47 серверних тестів PASS. Незалежний Codex завершив рев’ю всього systemd/runtime/runner/CLI блоку з PASS; останні resource assertions перевірені статично, x86 CI наступний.

## Продовження

Локальні три доробки виконані. Наступний крок: синтетичний Linux-доказ, негативні transfer-тести, незалежне рев’ю, коміти/push і CI кінцевого SHA. Поточна сесія не читала Keychain, не викликала моделі, не витрачала $5 і не зверталася до сервера. Новий журнал поки лише в продуктовій гілці.
