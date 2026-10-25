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

До приймання розширення C01/C02/C03/C10 pending, крок0 не passed. Публічний доказ містить лише синтетичні дані. A0 перевіряє лише штатне налаштоване Hermes-підключення; окрема комерційна інтеграція не створюється. Автоматичного API-перемикання немає.

## Уточнення після незалежного рев’ю

- Frozen policy не копіюється як виконувана конфігурація. Allowlist міграції: logical session/parent IDs, model identifier як очікування, source label як provenance, видимий title, дати, approved profile revision і nonsecret logical launch identity. Політика виконання перебудовується з дозволеної конфігурації призначення; config_json/terminal_json/MCP/environment/skills/hooks/endpoint/fallback/approval з bundle не активуються. Невідоме поле є refusal, не passthrough.
- Durable inputId/digest/admission/outcome та профільна ідентичність зберігаються через restore. Термінальний старий input повертає старий результат; інший digest є conflict. Unknown/running старої generation не стає not_received і не запускається повторно; спочатку явне відновлення/settlement. Втрата ACK→restore→lookup має0новихinference.
- Queued ACK може мати nativeMessageId=null; фактичний row ID додається лише після persisted event. Старі generation не отримують новий lease/tool capability.
- Режим provider resolution не є wire E2E. Перевірка import має йти через native owner session.mutate; storage-only API не замінює її. Повний executable Python source звіряється з gitpin, а ізоляція застосовується OS sandbox із негативними canary; declarations у JSON самі не є доказом.

Collision приймається лише за typed reason `import_content_conflict`; інші помилки не доводять перевірку semantic digest.

## Рішення після штатної поведінкової проби

Підтверджено native whole-store snapshot/restore: actual `_build_profile_authority` із profile_id=str(canonical HOME), native `_safe_copy_db`, відмова restore за активного owner, source fence, новий порожній volume за ТІЄЮ САМОЮ absolute HOME, `_safe_restore_db`, новий більший epoch, та сама сесія/повідомлення/хвіст. Started admission відновлюється unknown; повтор сталого input має ту саму admission, інший digest відхиляється.0provider/network. Таким чином попередню пропозицію нового restore/rebind контракту для canonical rollback замінює штатний механізм; sourceMac legacy import/adoption окремо не прийнятий.

| Шлях відкату | За | Проти |
|---|---|---|
| Native full-store за сталою canonical identity | Реальна проба пройшла; зберігає policy/lineage/ledger без fork | Потрібні restricted source policy, allowlist encrypted bundle й той самий path/principal; не переносити довільний Mac DB |
| Новий restore/rebind протокол | Міг би змінювати identity довільно | Зайвий ризиковий код; цей сценарій його не потребує |

Обрано native full-store. Не запускати загальний `hermes backup`, який включає auth/.env/інші профілі, чи blind `run_import` з автоматичним запуском gateway. Використовувати адресні pinned helpers та service fence. Lookup за inputId і remote facade лишаються потрібними.

Останнє уточнення Юрія скасувало зовнішній/комерційний A0: SciSense лише клієнт його Hermes, де він обирає модель/провайдера. Нічого OpenAI не надсилати, окрему OAuth-реєстрацію SciSense не створювати. Технічний A0 перевіряє саме налаштоване Hermes-підключення.


## Перша міграція GUI та оновлений Desktop

Фактичний source Desktop Юрія після оновлення є0.22.5/bf0203; окремий /Applications bootstrap helper не визначає його поточну збірку. На ізольованій копіїbf0203 додано вузький negotiated remote codec, наявний CanonicalDesktopProtocol використовується без переробки session engine. Auth лишається штатним remote; marker не дає local/native_bootstrap прав. Registry OAuth redial теж зберігає marker до profile/header scope.25socket/codec tests і Lightbuild пройдені; actualElectron/nativeE2E ще pending. Target readiness окремо вимагає конкретний bridge+pin, загальна legacy-сумісність helper цього не доводить.

Native проба довела sanitized GUI import: при першому перенесенні canonical source local нормалізується до legacy desktop тільки в імпортному transcript bundle, оригінальний source зберігається у приватному provenance manifest. Executable local policy не переноситься. Native session.create із title Bot Chat/source gui підхоплює той самий ID, повтор другого каналу відкриває його знову, текст/ролі/часи/tool identity збережені. Це не переслідування останньої сесії й не збережений Bot Chat ID: кожен новий input резолвить назву, outbox зберігає birth target лише свого input. Перед приватним cutover потрібні повні fingerprints, collision precheck та native repeat/adoption verification; поточна проба лише синтетична одна сесія.
