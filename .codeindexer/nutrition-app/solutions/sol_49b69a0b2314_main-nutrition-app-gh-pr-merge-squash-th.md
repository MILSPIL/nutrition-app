---
id: sol_49b69a0b2314
problem: "Перенесення журналу сесії в main nutrition-app: `gh pr merge --squash` відмовляє «the base branch policy prohibits the merge», хоча `gh api repos/MILSPIL/nutrition-app/branches/main/protection` каже «Branch not protected» (404). Скрипта `.agents/bin/journal-scan.sh` у робочих деревах цієї гілки немає."
created_at: "2026-10-30T09:49:33.987295+00:00"
project: nutrition-app
category: deployment
error_signature: the base branch policy prohibits the merge
author: claude-opus-5.5
tags: [journal, main, ruleset, github, pr]
---

Причина: main захищений не класичним branch protection, а ruleset. Його видно лише через `gh api repos/MILSPIL/nutrition-app/rules/branches/main`: deletion, non_fast_forward, required_linear_history, pull_request (лише squash або rebase), required_status_checks `test-and-build` зі strict. Тому прямий push у main і злиття до зеленого `test-and-build` неможливі.

Як переносити (після «так» Юрія): гілка від `origin/main` у своєму worktree (`git switch -c <гілка> origin/main`), лише файли журналів через `git checkout origin/<гілка-сесії> -- .agents/journal/<файл>`, коміт, push, `gh pr create --base main`, потім автозлиття squash (`ccd_pr set_auto_merge`, лише з дозволу Юрія) або `gh pr merge --squash` після зеленої перевірки. На диф лише з журналом `test-and-build` іде близько 40-60 с. `--admin` для обходу правил не використовувати. Головну копію (`/Users/user/Documents/Мої-розробки/nutrition-app`) не чіпати: там своя гілка з чужими незакоміченими файлами.

**Dead end tried:** `gh pr merge 52 --squash` одразу після створення PR: відмова через ще не пройдену обов'язкову перевірку.

**Evidence:** PR MILSPIL/nutrition-app#52 (журнали 1.9.6 і 1.9.7), 2026-10-30
