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
- Залежності pinned Hermes встановлені в окремій venv Python3.14.6 через uv sync --frozen; HOME/HERMES_HOME синтетичні, env очищений. aiohttp/anthropic/openai imports PASS; справжній runtime ще перевіряється.

- Крок0: 12 frozen H02 fixtures, synthetic turn/draft/note/contextProposal contracts, test:hermes і test:hermes-ui. Baseline фактичного коду: H01 textarea відсутня, H03 unknown nutrition відхиляється; команда --baseline має exit1. Арифметика230 та g/ml deny збережені. 4 контрактні перевірки PASS, 10 інтеграційних критеріїв явно TODO, не PASS. Негативний контроль підміни unknown нулем відхиляється.
- G01 нової задачі passed за явним рішенням Юрія; implementation card128eb6c248fb. Planning card29bef280dd54 технічно open через dashboard-only manual gate, це не блок реалізації. Знеособлений export оновлено.

## Змінені файли
Spec/plan, PROJECT-INFO.md, PRODUCT-GOAL.md, цей журнал, package scripts, server/trainer fixtures і contract checks, scripts/trainer-chat-*.mjs, docs/evidence/hermes-food-local-baseline-2026-10-24.json, .codeindexer export.

## Перевірки
GitHub account MILSPIL; Git status/worktrees; CI40086707530 на базі94ea293 SUCCESS; Code Indexer briefing обох дерев і roadmap next. Старі незакомічені файли primary не чіпалися.

## Результат
Робота триває. H01–H11 не прийняті; ранній runtime/privacy gate визначає можливість наступних блоків.

## Наступні кроки
Перевірити справжній pinned Hermes із mock provider, tool/network/privacy capabilities. Тільки після gate перейти до server/UI.

## Ризики / нотатки
Context7 quota exhausted у цій сесії; використовуємо офіційні документи, CLI help і pinned source. Наявний профіль заборонено читати. Новий журнал потребує окремого дозволу на main.
