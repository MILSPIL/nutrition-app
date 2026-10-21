---
id: sol_0799c017a3d9
problem: "Тестовий TLS працював на macOS, але Linux CI повертав tls_generation_failed: OpenSSL повторно відкривав /dev/fd для socket-backed stdio Node."
created_at: "2026-10-21T14:31:10.410533+00:00"
project: nutrition-app
category: troubleshooting
author: Codex
tags: [openssl, linux, tls, stdio, cleanup, javascript]
---

OpenSSL req пише key/cert до native '-' stdout, PEM розділяється у bounded memory. x509 -CAkey не трактує '-' як stdin: для signer фіксований shell 'cat | exec openssl "$@"' створює справжній OS pipe; key лише stdin, public CSR/cert у temp. Власна detached process group отримує TERM/KILL; cleanupPending не дозволяє close leader скасувати escalation до TERM-resistant descendant. Усі public temp files і key buffers очищаються. Source apps.c/req.c OpenSSL3.0 перевірений; Linux CI e22be6a PASS, cleanup regression8ea6f2e local10/10+незалежні timeout/overflow probes PASS.

**Dead end tried:** -CAkey '-' OpenSSL сприймає як ім'я файла. clearTimeout(killTimer) на close залишав TERM-resistant descendant живим.

**Evidence:** scripts/phone-lab/tls.mjs; scripts/phone-lab/tls.test.mjs; CI39611260978; TLS SHA256 a8420237bf2295ee9c4fd1860c0533648099f4f59e4446f8313d3e3d03eab230
