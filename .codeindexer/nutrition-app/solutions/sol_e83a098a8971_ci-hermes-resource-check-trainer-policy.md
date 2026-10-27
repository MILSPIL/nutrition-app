---
id: sol_e83a098a8971
problem: "CI hermes-resource-check падає після зміни TRAINER_POLICY: scripts/hermes-gateway-test.mjs:539 AssertionError assert.ok(JSON.stringify(payload).includes(msg.content)) у кроці «Actual Hermes plus Node in a shared 2 CPU / 2 GiB cgroup» (--capacity-probe)."
created_at: "2026-10-27T18:37:29.143142+00:00"
project: nutrition-app
category: troubleshooting
error_signature: assert.ok(JSON.stringify(payload).includes(msg.content))
author: claude-opus-5-5
tags: [ci, trainer-policy, capacity, hermes, javascript]
---

Причина: capacity probe старого шляху (server/trainer/model-proxy.mjs, LIMITS.payloadBytes 32000) викидає пари історії від найстаріших, поки запит більший за 32000 байт, і тест вимагає, щоб остання пара лишалась. На 8997d31 (1.9.5) запас був лише 96 байт: modelTextBytes [31904,31524,31599], systemBytes 24971. TRAINER_POLICY (server/trainer/tools.mjs) входить у system, тому будь-який приріст правил понад ~96 байт ламає перевірку (1.9.6 перша версія +409 байт, systemBytes 25380). Виправлення 9974f53: правила стиснуто до +53 байт (1478 байт), інструкції для виправлення несуть підказки tool-errors.mjs, які модель отримує лише при помилці; тест «policy fits the coach capacity budget» у tools.test.mjs тримає TRAINER_POLICY <= 1500 байт. Персональний шлях (прод) має межу min(1048576, contextWindow*3) у personal-model-context.mjs і цим не обмежений. Як перевірити запас: лог job hermes-resource-check зеленого прогону, рядки modelTextBytes і systemBytes.

**Evidence:** 9974f53, server/trainer/tools.test.mjs, CI run 40560467943 job 122387795572
