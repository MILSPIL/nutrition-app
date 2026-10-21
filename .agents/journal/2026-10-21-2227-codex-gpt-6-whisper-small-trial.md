# Погоджена синтетична проба Whisper small-q5_1

Дата: 2026-10-21 22:27 EEST. IDE: Codex desktop. Агент: Codex, GPT-6. Chat: 01a1585d-ba1e-7da0-a174-903bee0573b3.

## Мета та межа
Goal objective_e45aa8ac1aa3, G05/G07/G08/G11. Юрій явно погодив STT-SMALL-01: small-q5_1, ті самі2CPU/2GiB/45s. Ключі, $5 і сервер не чіпати. Production-модель не перемикається; лише synthetic Linux CI.

## Виконання
Попередній журнал1336 довезено через PR18, merge5dcd96dd564a475b9393deb420ccd73fba710e38,2CI PASS. Source/local main/origin main SHA25617ddbdaccd7c8120eeb70019c3133dc9a2b0de8a8ea69f7d6bd8381b00e1b85e однакові.
Готується вузьке виправлення native stdout callback без файлів, негативна Linux regression попереднього ofstream, окремий synthetic model allowlist ізSHA256 та оцінка продукту і200г. Модель/ресурси/production-конфіги поза пробою не змінюються. Фактичний результат CI і незалежне рев’ю ще очікуються.
Context7 quota вичерпана раніше; перевірені pinned CLI d1be6fde та офіційні Node24.11.1 docs про stdio.

## Перевірки та наступний крок
Локальні adapter/model/recognition tests, незалежне рев’ю, повні UA/RU5/30/90s і4 захисні сценарії. Після CI записати фактичні метрики й висновок. Жодного платного виклику чи розгортання.

## Перевірки перед CI
Локально15 тестів PASS,1 Linux-only SKIP; server/gateway/TLS24/24 PASS; Python syntax і git diff --check PASS. Непогоджений model name відхиляється argparse зкодом2 до Docker. Незалежний reviewer підтвердив pinned native callback і знайшов P2: «1 200», «тисяча двісті», «0,200» помилково проходили оцінку200г. Відтворено й виправлено перевіркою числового контексту;7/7 adapter+recognition tests PASS, остаточне рев’ю триває.
