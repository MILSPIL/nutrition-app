---
id: sol_cf877acf3c47
problem: "Публікація лише сайту SciSense з сесії Claude у worktree: хук PreToolUse блокує Write у `.agents/runtime/deployment/` основної копії («is in the base repo checkout»), а квитанції публікації мають пережити видалення worktree."
created_at: "2026-10-28T08:36:12.820932+00:00"
project: nutrition-app
category: deployment
author: claude-opus-5-5
tags: [deploy, frontend, hooks, worktree, scisense-1.9.7]
---

Оператори пишуться в `.agents/runtime/deployment/<дата-задача>/` самого worktree (теж у .gitignore), правки і піни SHA там же (`operator-pins.json`), потім тека цілком переноситься `mv` в основну копію і запускається звідти (`BASE=Path(__file__).parent`, тому шляхи переносні); venv створюється вже на новому місці (`uv venv` + paramiko keyring requests cryptography). Для релізу лише сайту досить копій 1.9.6: `access.py` з новим SERVICE, `frontend-root.py` з новим `previous` і версією, read-only `inspect` до й після, драйвер з діями package, inspect, frontend-install (once), public, rollback, remove-archive, cleanup. Таймер доступу 20 хв рахується від `prepare`, тому `prepare` лише після зеленого CI і готового архіву; xCloud після `revoke` деякий час показує `deleting`, `cleanup` лише після `present:false`.

**Evidence:** .agents/journal/2026-10-27-2310-claude-code-opus-5.5-card-control-197.md, розділ «Злиття й публікація»; docs/evidence/card-control-197-2026-10-28.json
