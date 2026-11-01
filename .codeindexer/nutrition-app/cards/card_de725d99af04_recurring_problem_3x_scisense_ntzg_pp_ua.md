---
id: card_de725d99af04
card_type: gotcha
title: "⚠️ Recurring: Публікація SciSense на ntzg.pp.ua, коли реліз змінює Python-адаптери Hermes і worker-lock.so (а не лише .mjs): оператор 1.9.6 (root.py) …"
project: nutrition-app
status: open
importance: high
evidence: Auto-promoted from solution sol_ffe5a3da05b4
valid_from: "2026-11-01T17:23:07.933350+00:00"
created_at: "2026-11-01T17:23:07.933350+00:00"
updated_at: "2026-11-01T17:23:07.933350+00:00"
author: claude-opus-5.5
content_hash: "sha256:4ecd4fd2b525483c65fa18ba0674386f53d3e88716ed23bb52447aee6ecfb383"
---

⚠️ Recurring problem (3x): Публікація SciSense на ntzg.pp.ua, коли реліз змінює Python-адаптери Hermes і worker-lock.so (а не лише .mjs): оператор 1.9.6 (root.py) такого не вміє, worker-lock.so на Mac не зібрати, а живі файли можуть відрізнятися від Git.

**Fix that worked:** Взяти Codex `normal-root.py` (робоче дерево Codex `scisense-product-goal/nutrition-app/.agents/runtime/deployment/2026-10-27-normal-use-final/`): він копіює старі адаптери в `adapters-<RID>`, кладе нові .py і бінарник, переписує ролі `/etc/scisense/personal/{y,w,payer}.json` і `personal-activation.json`. Обовʼязкові правки: 1) адаптери живуть під ІНШИМ релізом, ніж код (на 01.11 код `576d7d1`, адаптери `adapters-16a7348`), тому окрема константа OLDAD замість `adapters-'+OLD`; 2) у адаптери копіювати лише .py, що там уже є; 3) `worker-lock.so` брати з артефакту CI `hermes-personal-linux` (`gh run download <run> -n hermes-personal-linux`): він експортує саме ту бібліотеку, яку канарка щойно прогнала, збірка відтворювана (дві збірки дали той самий sha); 4) перед stage прогнати read-only inspect, що віддає хеші живих файлів, і звірити з `git show OLD:file`: на сервері `package.json` інший, а `fixtures/contract-v1.json` і `hermes-personal-systemd-canary.py` відсутні, їх прибрати з набору; 5) `known-unknown.json` з inspect (id з outbox і turns однакові). Вікно доступу 20 хв від `prepare`: усе (злиття, CI релізу, збірка сайту Node 24.22.1, бібліотека) готувати ДО prepare; уся публікація 1.9.10 зайняла 6 хв вікна. Зняти архів сайту (`remove-archive`) ДО `revoke`, після нього SSH уже не пустить.

**Dead end tried:** zsh: `git fetch <path> $R:refs/heads/x` перетворюється на `$R:r` (модифікатор) + `efs/...`, писати `"${R}:refs/heads/x"`. `$U` з пробілами в zsh не розбивається на слова: обгортка `py.sh` замість змінної. Write-хук не пускає в основну копію з worktree: писати в …

**Source:** solution `sol_ffe5a3da05b4`, auto-promoted after 3 restatements of the same problem. `memory_cards(action="get", id=…)` resolves it into an `attached_solutions` block; `solutions(action="find", id="sol_ffe5a3da05b4")` returns the untruncated body.
