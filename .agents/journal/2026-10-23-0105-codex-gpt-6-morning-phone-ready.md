# Підготовка ранкової проби голосу й фото

- Дата і час: 2026-10-23 01:05 Europe/Kyiv
- IDE / агент: Codex desktop
- Модель: GPT-6
- Chat ID: 01a1585d-ba1e-7da0-a174-903bee0573b3

## Ціль

Довести SciSense на https://ntzg.pp.ua до максимально готової ранкової проби голосом і фото. Юрій прямо дозволив автономну реалізацію, потрібне розгортання й експерименти. Старе замороження C скасовано; стеля Anthropic лишається одна, $5. Groq Free, Sonnet direct, майбутній Hermes не підключати.

## Що зроблено

- MORNING-READY-01 і чотири уточнення незалежної проби: реальний UI/MIME, повний бюджет, оновлення старого клієнта, адресні серверні цілі та перевірка після cleanup. Claude plan review ще працює.
- Goal autonomy policy і constraint scope/live_api_approval обох індексів оновлені; приймання G02–G11 не змінювали.
- Baseline: вісім відсутніх -v4 PNG, HTTP200 із HTML замість картинки; старі новини/SHA та Telegram transport. UI виправлення пройшли 137 Jest і build, браузер та незалежний review ще попереду.
- Історія бюджету: canonical ledger відсутній у всіх чотирьох worktrees, marker не знайдений; попередні грошові цифри були офлайн-розрахунками/синтетичними fixtures. Сервер підтвердив порожній state, disabled inference і відсутність credentials/activation/import lock. Жодного платного model call цього пілоту не підтверджено.
- Окремий тимчасовий admin створений для scoped deployment. Адаптер пройшов незалежний review і selftest; pinned SSH/root read-only inventory PASS. Власний доступ треба відкликати після роботи.

## Змінені файли

- docs/superpowers/plans/2026-10-23-morning-phone-ready.md
- docs/evidence/morning-phone-ready-2026-10-23.json
- PROJECT-INFO.md
- UI-файли перелічені в окремому продуктовому коміті після перевірки.

## Команди / перевірки / тести

- Node 24.22.1: Jest15 suites/137 tests PASS, production build PASS.
- Node server + phone-lab: 64/64 PASS, включно з переносом, reserved rows, fsync failure, interrupted credentials, stale/partial/lost-ack.
- Read-only server receipt: inferenceEnabled=false, phase=not_installed, stateEmpty=true, дві credentials=false.
- Official Groq Free/ZDR і Sonnet5.5 pricing docs прочитані. Context7 недоступний через місячну квоту, повторних спроб не було.

## Результат

Робота триває. Це checkpoint, не підтвердження нового production release або готового голосу.

## Наступні кроки

Завершити незалежне рев’ю та мобільні перевірки, exact SHA/CI/package і scoped upgrade. Після фактичного Free/ZDR та контрольного Google-входу підготувати/активувати один справжній бюджет без reset, пройти реальні синтетичні voice/photo API через UI.

## Ризики / нотатки

Mac заблокований, CUA не бачить авторизований Chrome. Запит на розблокування pending; незалежна робота продовжується. Ключі моделей і inference поки не використані. Попередній приватний Firebase configuration incident лишається відкритим; значення не повторюються й не переносяться в Git. Main/PR8/16 не змінювали; журнал2250 і цей журнал поки лише в продуктовій гілці.
