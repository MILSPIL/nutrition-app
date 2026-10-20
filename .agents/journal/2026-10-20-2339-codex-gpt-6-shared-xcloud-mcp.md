# Спільний xCloud MCP через Keychain

- Дата: 2026-10-20 23:39, Europe/Kiev.
- IDE / агент: Codex desktop; модель GPT-6; chat 01a1585d-ba1e-7da0-a174-903bee0573b3.
- Мета: перевірити збережений Юрієм токен і завершити спільне підключення Codex/Claude Code для подальшого деплою SciSense. Goal objective_e45aa8ac1aa3, G04/G07/G08.

## Результат

ms-web-xcloud/api-token знайдений і непорожній. Прямий macOS Keychain backend прочитав ключ тільки в пам’ять. REST user/servers/billing-plan і MCP initialize/tools-list повернули 200; компактний сервер надає п’ять tools. Установлений launcher для обох клієнтів виконав read-only servers.index і знайшов MS-WEB. Значення токена не виводилося і не записувалося в конфіги.

Нове спільне підключення xcloud записано у ~/.codex/config.toml і ~/.claude.json, включно з одним старим project override, який інакше перекривав би глобальне. Конфіги перечитані: лише шлях launcher, без secret env/headers. Codex mcp get підтвердив конфіг; Claude mcp get підтвердив з’єднання. Активні сесії мають бути відкриті заново. Старі OAuth credentials не видалялися й не відкликалися.

Реалізація поза репозиторієм застосунку: ~/.local/share/mcp-xcloud/1.0.0, локальний Git commit 32cd66e; ~/.local/bin/mcp-xcloud-keychain. SDK1.32.1 і lockfile фіксовані, Python -I + прямий macOS backend, фіксований HTTPS endpoint, OAuth fallback відсутній. Підготовлений mcp-remote не встановлювався глобально. Відкат попередніх xCloud config entries у ~/.local/state/mcp-xcloud/config-before-2026-10-20.json. Новий локальний infra repo без remote, remote не додавався.

Незалежний Codex xcloud_keychain_bridge_review знайшов незавершений порожній SSE та обробку помилки stdout; виправлено deadline до RPC-відповіді й обробник stream error. Backend Keychain явно зафіксовано. Повторне рев’ю K01–K05 пройдено; 8/8 tests установленої копії PASS. EOF/timeout/401/порожній SSE/network failure/stdout перевірені, автоматичного повтору write немає. Живі smoke для обох конфігурацій PASS, stderr порожній.

## Межі й наступний крок

Dry-run SciSense з новим токеном уже доходить до HTTP422: custom TLS потребує ssl_certificate і ssl_private_key. Сайту не створено, Node/служби/SSL/Firebase/production не змінено, платних AI викликів 0. Далі конкретний SSL/release пакет і погодження серверного доповнення/G04 до нового серверного коду.

Журнал2322 уже в main: PR11 merged eaca56c, обидві CI успішні. PROJECT-INFO, профілі/картка/фаза Code Indexer оновлені; Gxx лишаються pending.

## Джерела

Context7 не відповів через вичерпану квоту. Прочитано первинні xCloud MCP docs і офіційні README/docs/client.md/transport sources SDK1.32.1, SHA ff07b001194fe60ee9deb2121cf119057565796d. Взято схему compact MCP, custom Authorization у пам’яті, transport без authProvider, protocol/session propagation і правила close.
