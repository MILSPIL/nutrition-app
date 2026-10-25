# HERMES-PERSONAL-COMPAT-01

Дата2026-10-25. Точний додаток після поведінкового кроку0. Загальний дозвіл на необхідні кроки є; технічний red-run не пройдено, тому приватна міграція/активація призупинені. Поточний сайт не змінений.

## Доказ

`hermes-personal-contract-probe.py` запускає справжній Hermes3f2afed у порожніх HOME/HERMES_HOME/CODEX_HOME. Мережеві підключення й доступ до робочих профілів/Keychain заборонені; provider0. Named Responses і native resume до export працюють. Canonical export/import/resume повертає `not_found`; інший вміст із тим самим ID мовчки skipped; `prompt.lookup` відсутній. Наявний Desktop73162 не містить canonical adapter і не має guard реєстрації протоколу. bf0203 не усуває restore/import.

## Вибір

| Варіант | За | Проти |
|---|---|---|
| Вузьке розширення власника + окрема Desktop-збірка3f2 | Зберігає canonical session ID, single writer і перевірюваний відкат; не замінює робочий Hermes під час QA | Новий контракт збереження policy/lineage потребує окремих негативних тестів та свіжого рев’ю; готового стандартного маршруту немає |
| Старий Desktop і копіювання transcript у web | Використовує встановлений пакет і наявний API | Порушує погоджену спільну authoritative історію та не відновлює canonical ownership; неприйнятно як виконання плану |
| Чекати штатного upstream restore/remote | Мінімум підтримки власного native розширення | Блокує результат; у перевірених3f2/bf0203 такого fix немає |

Рекомендовано перший варіант. Не форкати весь Hermes і не оновлювати глобальну інсталяцію автоматично. Незалежні локальні норми/UI можна виконувати паралельно з розв’язанням цього контракту.

## Межа необхідного розширення

1. `prompt.lookup` у процесі native owner: principal/profile/session/inputId та digest, жодного Node-доступу до SQLite. Не створює admission і не запускає inference. Відповідь відрізняє not_received/committed/unknown й містить наявні admission/generation IDs.
2. Canonical remote facade: SSH до окремого профільного фасаду; host→профільний UDS→relay усередині netns→native loopback. Повторна валідація principal/методів, без доступу до сусіднього сокета й без відкриття host-loopback агенту. Обидва ingress проходять SciSense admission/outbox/dayProof.
3. Owner export/restore/rebind: окрім transcript переносити перевірені frozen policy й logical lineage. Не переносити active epoch/lease/ключі/source ownership. Новий owner атомарно видає нові epoch/прив’язку тільки для підтвердженого власника, зберігаючи logical IDs/хвіст/дати/row semantics. Наявний відмінний ID є conflict, не skip. Resume має працювати після компресії та рестарту; зовнішнє переписування state_meta заборонене.
4. Окрема Desktop-збірка на зафіксованому3f2: fake HOME/HERMES_HOME/CODEX_HOME, disposable userData, fake gh, `HERMES_DESKTOP_IGNORE_EXISTING=1`, `HERMES_DESKTOP_SKIP_PROTOCOL_REGISTRATION=1`. Installed73162 для QA не запускати. Remote без локального fallback, reconnect до того самого owner.

До приймання розширення C01/C02/C03/C10 pending, крок0 не passed. Публічний доказ містить лише синтетичні дані. A0 hosted/sharedpayer залишається окремим: офіційна документація підтверджує same-user self-hosted VM, але конкретне сімейне використання ще не підтверджене. Автоматичного API-перемикання немає.
