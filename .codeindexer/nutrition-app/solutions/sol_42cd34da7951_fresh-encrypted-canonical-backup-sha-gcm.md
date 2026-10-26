---
id: sol_42cd34da7951
problem: "Fresh encrypted canonical backup SHA і GCM/minimumEpoch окремо не запобігають відкату хвоста, якщо SHA перевіряється за pathname, FD закривається, а для decrypt файл відкривається вдруге. Валідний старий архів sameUID/HOME/epoch може бути атомарно підмінений після SHA check."
created_at: "2026-10-26T06:27:21.768040+00:00"
project: nutrition-app
category: troubleshooting
author: Codex
tags: [snapshot, restore, TOCTOU, freshness, canonical-hermes, python]
---

Читати encrypted snapshot через один O_NOFOLLOW descriptor із regular/private/owner перевіркою. Рахувати SHA фактично дешифрованого stream у порядку MAGIC+nonce+ciphertext+tag, звіряти expected freshSHA до tar parse/publish. AEAD прив’язувати UID+canonicalHOME+pin, але не вважати це перевіркою freshness. Restore тільки в absent SAMEHOME; native epoch advances після startup. Regression latest→older sameepoch replacement має лишити target absent.

**Evidence:** db3330898cb763b97bac3b901ef2490599ca12a2; server/trainer/hermes_personal_snapshot.py:restore; hermes_personal_snapshot_test.py:test_latest_digest_binds_the_actual_decrypted_stream_after_atomic_replacement
