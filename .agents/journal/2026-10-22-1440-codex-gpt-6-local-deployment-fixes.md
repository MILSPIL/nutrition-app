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

Рев’ю виявило ризик застарілого evidence при cleanup failure та успадкованого remote Docker context. Launcher тепер прив’язаний до локального unix endpoint, записує ownership до запуску, обробляє SIGINT/SIGTERM та не позначає непідтверджене прибирання успішним. Три негативні runner-тести й усі 47 серверних тестів PASS. Незалежний Codex завершив рев’ю всього systemd/runtime/runner/CLI блоку з PASS; resource assertions підтверджені також справжнім x86 CI.

## Фінальна перевірка та виправлення браузерного тесту

Продуктовий код `02bf771807b6e563fd6ee3e3df6575ee3dcc9af1` пройшов CI39775149334, attempt2: усі три jobs, чотири браузерні сценарії та build. Справжній systemd на x86_64 пройшов ті самі 8/8 сценаріїв з 1CPU/2GiB, без мережі/host binds/портів і з cleanup=true. Перша спроба image build завершилась за таймаутом під час повільного завантаження пакетів Ubuntu до початку тесту. Повторено тільки невдалий job, без зміни коду, ресурсів або таймаутів.

Паралельний CI39775157297 пройшов systemd і resource-check, але STT-only network guard зафіксував origin https://www.google.com. Старий evidence не містив path, тому точну причину цього запиту не встановлено. У прочитаному встановленому Firebase WebChannel SDK знайдений діагностичний cleardot.gif із одним непорожнім zx. Тест продовжує route.abort для цієї точної форми GET/image, рахує її окремо, а всі інші сторонні запити блокуються та провалюють перевірку з origin/path/method/type без query або headers. Позитивний синтетичний контроль підтвердив блокування, а не причину першої CI-відмови. Незалежний Codex виявив занадто широкий query predicate; виправлено на один непорожній zx, фінальний вердикт PASS. Повторний локальний STT-only: 26/26, paidCalls=0, reservedMicros=0, unexpectedNetwork=[], cleanup підтверджений. Продуктовий код цією QA-правкою не змінювався.

Команди відтворення: `npm run test:server`, `npm run test:rules`, `npm run test:voice-photo`, `node server/linux/run-systemd.mjs`; локальний браузер: `/Users/user/.local/bin/agent-test-browser run scisense-phone-lab -- --stt-only`. Context7 у цій сесії повернув вичерпану місячну квоту; використано офіційну документацію systemd/Docker та встановлений код Firebase SDK. Приватний серверний інвентар не потрапив у Git.

## Статус і наступний крок

Локальні три доробки виконані та перевірені. PROJECT-INFO.md, публічний JSON доказів і документація оновлені; Code Indexer відображає поточну межу дозволу. Goal objective_e45aa8ac1aa3 лишається active, G01 passed, G02–G11 pending; картка card_a0a505e98d94 відкрита до реального приймання. Критерії та revision3 не змінені.

codeindexer 2026-10-22: solutions 0, картки 1, профілі 4, автономна межа Goal оновлена; критерії незмінені. Експорт nutrition-app і nutrition-app-scale синхронізовано з Git.

Наступний крок: конкретні серверні передумови та погодження встановлення; потім реальний телефон і пілот. Ця сесія не читала Keychain, не викликала моделі, не витрачала $5 і не зверталася до сервера. PR8/16 лишаються чернетками без merge. Новий журнал 1440 поки лише в codex/scisense-server-prep; перенесення в main після окремого дозволу. Погоджений журнал 1308 уже перенесений, повторного дозволу на нього не потрібно.
