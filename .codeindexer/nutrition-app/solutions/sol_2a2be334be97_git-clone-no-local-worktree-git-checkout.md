---
id: sol_2a2be334be97
problem: "Чиста копія для збірки релізу: `git clone --no-local <worktree>` і `git checkout <SHA злиття>` дають `fatal: unable to read tree`, хоча `git fetch origin` у worktree щойно виконано."
created_at: "2026-10-28T08:36:12.603850+00:00"
project: nutrition-app
category: deployment
author: claude-opus-5-5
tags: [release, git, build, scisense-1.9.7]
---

Причина: коміт злиття (squash у `codex/hermes-personal-server`) є в спільному репозиторії лише під `refs/remotes/origin/...`, а `git clone` бере тільки `refs/heads/*` і теги джерела. Обхід: у клоні `git fetch <шлях до worktree> refs/remotes/origin/codex/hermes-personal-server:refs/heads/rel-197`, потім `git checkout --detach <SHA>`; `git status --short` має бути порожнім. Далі `buildHermesRelease({enabled:true})` з `scripts/hermes-build-release.mjs` під Node з `.nvmrc`.
Перевірка рядків у зібраному бандлі CRA: кирилиця записана `\u`-кодами, тому `grep 'Прибрати' main.*.js` дає 0; шукати за ASCII-маркером (клас `trainer-add-reason`, поле `removeItemIds`) або за `Пр...`.

**Evidence:** .agents/journal/2026-10-27-2310-claude-code-opus-5.5-card-control-197.md, розділ «Злиття й публікація»; release 36a994f
