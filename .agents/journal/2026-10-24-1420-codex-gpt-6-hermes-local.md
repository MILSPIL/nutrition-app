# HERMES-FOOD-01: початок локальної реалізації

- Дата і час: 2026-10-24 14:20 EEST
- IDE / агент: Codex desktop
- Модель: GPT-6
- Chat ID: 01a1585d-ba1e-7da0-a174-903bee0573b3

## Ціль
Виконати погоджені локальні кроки0–7 і перенести журнал1326 у main. Приватний профіль, реальні API, Keychain, $5, сервер і production Firebase не чіпати.

## Що зроблено
- Дозвіл Юрія на 0–7/А1–А4 зафіксовано; feature codex/hermes-food-chat-local від94ea293.
- Журнал1326 у main через PR27, merge 2a71687. CI40089305389/40089308567 SUCCESS; source/main/origin blob c53fc31df7fbd1733b230307c246c71386dbc14d. Змінився лише журнал, продуктового merge немає.
- Installed Hermes HEAD bf0203a відрізняється від погодженого3f2afed. git archive створив окрему pinned копію в ignored runtime; встановлений source/profile не змінювався. Приватні файли не читались.
- Залежності pinned Hermes встановлені в окремій venv Python3.14.6 через uv sync --frozen; HOME/HERMES_HOME синтетичні, env очищений. aiohttp/anthropic/openai imports PASS; справжній runtime перевірено нижче.

- Крок0: 12 frozen H02 fixtures, synthetic turn/draft/note/contextProposal contracts, test:hermes і test:hermes-ui. Baseline фактичного коду: H01 textarea відсутня, H03 unknown nutrition відхиляється; команда --baseline має exit1. Арифметика230 та g/ml deny збережені. 4 контрактні перевірки PASS, 10 інтеграційних критеріїв явно TODO, не PASS. Негативний контроль підміни unknown нулем відхиляється.
- G01 нової задачі passed за явним рішенням Юрія; implementation card128eb6c248fb. Planning card29bef280dd54 технічно open через dashboard-only manual gate, це не блок реалізації. Знеособлений export оновлено.

- Крок1: standalone API спершу проходив, незалежне Codex review виявило неперевірений canonical admission. Пробу переведено на actual GatewayRunner/session authority/adapter та native agent. Pin20685 файлів перевіряється перед запуском, OS policy забороняє зовнішню мережу й читання user paths поза lab; synthetic canaries підтвердили deny.
- Canonical negative control: native DELETE200 лишав байти фото у staging cache та state.db-wal. Вузький wrapper нашого репо (без upstream patch) вмикає secure_delete на спільному writer перед admission; після native DELETE і завершення worker/закриття handles прибирає тільки staging-файл за відомим SHA, перевіряє quiescent checkpoint busy0. Той самий профіль, один worker на turn, без hosted-room/інших платформ.
- Native complete/cancel повторно PASS, незалежний reviewer повторив: 3/1 fake requests; 1.271/1.510 с; canonical admission terminal; всі5 curated markers+SOUL+authoritative history; native image; лише6 tools; terminal/memory deny; exact replay; DELETE; нуль raw/base64/fragments після stop. Окремий незалежний scan902 фрагментів, sessions/messages/admissions0, WAL/SHM немає, quick_check ok. Це не latency Sonnet і не Linux ресурсний benchmark.
- 12 failure-тестів wrapper PASS: live writer, ownership, native deletion missing, queued/started/unknown, changed bytes, symlinks, busy WAL, idempotency, secure_delete readback. Незалежний Codex hermes_runtime_gate_review: PASS, відкритих зауважень0. Додатковий P2 FIFO зависав до fstat; O_NONBLOCK і bounded subprocess test виправили це.

- Крок2 завершено: owner-only gateway, durable SQLite admissions/leases/HMAC call receipts, early exact replay, status/recovery/cancel, bounded full payload/history, без кешування промптів, no retry після будь-якого upstream failure, спільна вимкнена quota policy. Старий ledger format/receipt/anchor/cap збережені.
- Actual Node→pinned Hermes→fake provider: complete, native ACK + Node commit loss/recovery без нового inference, cancel,429, stuck-tool deadline, SIGKILL unknown та explicit cancel. 8 fake calls; останній власний набір21.041 с, незалежний повтор19.652 с. Перевірено114media fragments,0leaks, source/OSdeny. Реальних API/ключів/витрат0.
- Незалежне step2 review підтвердило виправлення owner cross-access,429 retry,latecontext replay,pre-admission hang,pre-upstream unknown,cleanup visibility/reload,cache reservation,actual history receipt,metadata crash handling,native deadline/unknown reconciliation. Кінцевий незалежний verdict PASS; metadata .tmp cleanup перевірено. Незалежний scan26 файлів/114фрагментів:0витоків,0cleanup jobs,0unfinished,8квитанцій. Один запуск перетнувся з іншим тестом на фіксованих портах; exclusive repeat PASS.
- Повний серверний набір98:88PASS/10TODO/0FAIL. TODO позначають ще не завершені інтеграційні H01–H10 наступних блоків; їх не зараховано як PASS. Prettier3.6.2 використано тільки для нових модулів, кеш у ignored runtime.

- Крок2 commit+push2eb2dc7; точний CI40092797054 усі3jobs SUCCESS.
- Крок3: manifest3USDA ZIP+SHA256+CC0, SQLite13588/53partial/32null source rows, серверний numeric snapshot із offeredID, label/estimate/unknown, без змішування г/мл. 13targeted PASS, незалежний hermes_food_lookup_review PASS. Повторний повний імпорт SHAa8e60fe05956869df3bc9d04371994c5ff8adf0d6014e474457f52191b591ad8,12079104bytes,0444,quick_checkok. Підтверджені2findings виправлено; runtimeархіви/індекс позаGit.

## Змінені файли
Spec/plan, PROJECT-INFO.md, PRODUCT-GOAL.md, цей журнал, package scripts, server/trainer fixtures і contract checks, scripts/trainer-chat-*.mjs, docs/evidence/hermes-food-local-baseline-2026-10-24.json, .codeindexer export.

## Перевірки
GitHub account MILSPIL; Git status/worktrees; CI40086707530 на базі94ea293 SUCCESS; Code Indexer briefing обох дерев і roadmap next. Старі незакомічені файли primary не чіпалися.

## Результат
Робота триває. H01–H11 не прийняті; ранній runtime/privacy gate визначає можливість наступних блоків.

## Наступні кроки
Кроки0/1 commit+push05054d4/57c76d8. Крок2/3 прийнято незалежними reviewers; далі4–7; runtime/keys/server лишаються заморожені.

## Ризики / нотатки
Context7 quota exhausted у цій сесії; використовуємо офіційні документи, CLI help і pinned source. Наявний профіль заборонено читати. Новий журнал потребує окремого дозволу на main.
