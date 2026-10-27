---
id: sol_91d0483fa9b9
problem: "Публікація SciSense на ntzg.pp.ua агентом не-Codex: де взяти процедуру, чим збирати сайт, як злити PR, чого бракує на Mac."
created_at: "2026-10-27T20:15:22.768831+00:00"
project: nutrition-app
category: deployment
updated_at: "2026-10-27T20:18:35.951991+00:00"
author: claude-opus-5.5
tags: [deploy, ntzg, xcloud, release, scisense]
---

Процедура живе лише в приватних операторах Codex: робоче дерево Codex `scisense-product-goal`, тека `.agents/runtime/deployment/<дата-задача>/` (не в Git) з файлами `access.py` (тимчасовий sudo-користувач через xCloud API, лізинг 1200 с від `prepare`), `root.py` (stage → backup_prepare → backup → install → verify, з rollback) і `frontend-root.py` (атомарна заміна симлінка `/opt/scisense/public`). Їх треба копіювати байт-у-байт і мінімально міняти під реліз: `OLD` = живий release (перевірити читанням `/opt/scisense/current`), `FILES` = лише змінені серверні файли, `knownUnknown` брати з перевірки на читання, а не зашивати. Якщо Python-адаптери й `worker-lock.so` не змінюються, ролі y/w/payer не чіпати: ADAPTERS = adapters-OLD.
Сайт: `buildHermesRelease({enabled:true})` з `scripts/hermes-build-release.mjs` у чистій detached-копії release SHA, Node з `.nvmrc` (24.22.1); 37 файлів, `scisense-build.json` з codeSha.
Злиття: у репозиторії merge-коміти заборонені (GraphQL «Merge commits are not allowed»), тому squash; release SHA = squash-коміт, дерево звірити з перевіреним PR-head через `git rev-parse <sha>^{tree}`. Перед злиттям вимкнути `auto_archive_on_close` у ccd_pr, інакше сесія архівується посеред публікації.
На Mac у системних Python немає paramiko: `uv venv` у теці публікації + `uv pip install paramiko keyring requests cryptography`; keyring з цього venv читає токен xCloud без вікна дозволу. Статус sudo-користувача в xCloud: updating → provisioned приблизно за 2 хв. Увесь цикл 1.9.6 зайняв 5 хв лізингу.
policyHash не змінюється, якщо `server/personal-runtime.mjs` незмінний між релізами: взяти з `/etc/scisense/personal-activation.json` (перевірка на читання), бо імпорт модуля локально тягне весь сервер.
Тека публікації з бекапом і ключем має жити в постійному дереві (основна копія), а не в тимчасовому worktree Claude, який прибирається.

**Dead end tried:** `gh pr merge --merge` (заборонено репозиторієм); обчислення policyHash імпортом personal-runtime.mjs у копії без node_modules і в дереві з node_modules (падає на `ws`/`jose`).

**Evidence:** release 576d7d1e62b32173f31cf541b89ef048a6f8e75a; docs/evidence/chat-fix-196-2026-10-27.json; журнал .agents/journal/2026-10-27-1901-claude-code-opus-5.5-chat-fix-196.md
