# VOICE-LETTERS-01: локальні докази

2026-10-23: Юрій погодив кроки 0–6. Реальні API, ключі, $5 і сервер заборонені.

П’ять журналів перенесені через PR #25, squash 9bd8629; CI двічі PASS. Продуктова гілка почата від fd65fb9. Старий writer/handler збережено побайтово в scripts/fixtures/voice-letters-previous-writer.json для перевірки сумісності.

L10: реальні модельні проби і перевірка телефона залишаються pending до окремого дозволу на крок 7. Синтетичні відповіді не доводять точності Sonnet.

Початковий червоний прогін: planCatalog/planAllocation відсутні; L01 відкриття створює recorder замість очікуваного 0. Це очікувані функціональні прогалини, а не критерії приймання. Лог /private/tmp/scisense-letters-red.log.

## Незалежне рев’ю кроку 2

Codex voice_letters_api_review: 42/42 worker tests; V1 body побайтово тотожний fd65fb9; bounds 32768/32769 перевірені; reserve/provider/finish і cap без повторів. П’ять P2 підтверджено: mutable fingerprint snapshot, некоректна custom-назва зриває v2, конфліктні назви різних джерел, AI-match без надісланого каталогу, forced-tool refusal. Усі виправлені regression tests. P3 про зайві поля продукту також підтверджено і закрито whitelist v2. Консервативний додатковий резерв 9454 при прирості request6741 bytes не є недорезервуванням. Новий suite: 43/43.

Крок 0 writer gate: demo Firebase, фактичний заморожений commitMealDay і quantity, 200 мл/206 г → 300 мл/309 г; allocation не змінюється. Розширений прогін 43 перевірки також підтверджує atomic mixed groups, concurrent metadata/append, marker до fingerprint і незмінну історичну норму.
