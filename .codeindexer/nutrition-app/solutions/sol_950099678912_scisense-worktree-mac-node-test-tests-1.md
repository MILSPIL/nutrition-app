---
id: sol_950099678912
problem: "Серверні тести SciSense у свіжому worktree на Mac: `node --test` нових файлів показує «tests 1, fail 1» без деталей, grep `# pass` нічого не знаходить, `test:hermes-native` падає ENOENT, а `npm run test:server` має 7 падінь, які незрозуміло чиї."
created_at: "2026-10-28T23:10:58.169487+00:00"
project: nutrition-app
category: troubleshooting
error_signature: "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'jose' imported from workers/meal-parser/src/auth.js"
author: claude-code
tags: [tests, macos, node, toolchain, worktree, COACH-PROBLEMS-01, javascript]
---

Причини і обходи (перевірено 29.10.2026 на гілці claude/coach-problem-reports):
1. Node: `.nvmrc` = 24.22.1, системний 24.11.1, nvm немає. Закріплений toolchain Codex: `~/.codex/worktrees/scisense-product-goal/nutrition-app/.agents/runtime/toolchain/node-v24.22.1-darwin-arm64/bin` у PATH.
2. «tests 1, fail 1» = файл впав на імпорті: серверні модулі тягнуть `workers/meal-parser/src/auth.js` (пакет `jose`), у воркера свої залежності. Потрібно `npm ci --prefix workers/meal-parser` (так робить CI, `.github/workflows/ci.yml:28`).
3. Node 24 test runner за замовчуванням пише spec, не TAP: підсумки `# tests/# pass/# fail` лише з `--test-reporter=tap`.
4. `test:hermes-native` (`scripts/hermes-gateway-test.mjs:30`) робить realpath `.agents/runtime/hermes-lab`: без лабораторії локально не йде; його покриває CI `hermes-resource-check` у Docker.
5. 7 падінь `test:server` на Mac базові (disabled package archives, native cleanup, deadline/watchdog/coordinator/replacement): ті самі 7 на базі 47ac923. Перевіряти так: прогнати базу в окремому worktree з симлінками node_modules і порівняти відсортовані рядки `not ok` (номери тестів прибрати sed).

**Dead end tried:** шукати Node 24.22.1 через `find ~` (висить понад 2 хв); grep TAP-рядків без `--test-reporter=tap`.

**Evidence:** журнал хабу sessions/scisense-coach-problem-reports.md; .github/workflows/ci.yml:28
