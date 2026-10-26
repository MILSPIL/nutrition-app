---
id: sol_ebbf2ff9ea01
problem: Pinned Hermes SessionDB(read_only=True) може створити HERMES_HOME/cache/schema_columns.json під час _parse_schema_columns. У cold canonical restore це передчасно створює відсутній targetHOME і atomic no-replace publication відмовляє.
created_at: "2026-10-26T06:23:05.605802+00:00"
project: nutrition-app
category: troubleshooting
author: Codex
tags: [hermes, canonical-restore, sqlite, read-only, cold-start, python]
---

В offline snapshot/restore ізолювати HERMES_HOME у private temporary native-cache лише навколо native integrity/schema helpers; finally відновити env. Не прибирати випадково створений target і не послаблювати no-overlay gate. Native cache є reference-only, canonical HOME лишається відсутнім до publish_new. Перевіряти source bytes unchanged і actual cold CLI restore.

**Dead end tried:** Вважати readonly SessionDB повністю позбавленим filesystem side effects; початковий actual native test повернув migration_destination_exists через cache/schema_columns.json.

**Evidence:** db3330898cb763b97bac3b901ef2490599ca12a2; server/trainer/hermes_personal_snapshot.py:_native_cache; hermes_personal_snapshot_test.py:test_cold_operator_snapshot_fence_release_and_restore_without_secret_output
