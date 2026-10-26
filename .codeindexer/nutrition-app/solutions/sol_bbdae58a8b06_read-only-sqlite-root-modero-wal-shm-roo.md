---
id: sol_bbdae58a8b06
problem: "Read-only перевірка SQLite під root може зламати службу іншого користувача: mode=ro створює WAL/SHM з власником root, а Python with connection не закриває connection."
created_at: "2026-10-26T23:28:46.949566+00:00"
project: nutrition-app
category: deployment
author: Codex
tags: [sqlite, wal, file-ownership, deployment, python]
---

Оператор розгортання перевіряє звичайний файл бази, nlink=1, канонічний шлях і власника. Перед connect тимчасово виставляє euid/egid власника та порожні supplementary groups; усі запити й close виконуються в цьому контексті. Вкладений finally відновлює початкові UID/GID/groups навіть при помилці close. Це лише для фіксованого однопотокового оператора. Не замінювати читання на immutable проти live WAL: воно може пропустити підтверджені транзакції. Перевірено окремими fault/UID-перевірками та пробою справжньої WAL-бази.

**Evidence:** docs/deployment/normal-use-01.md, section «Читання live SQLite під час розгортання»; reviewed operator SHA 093986cb9c23c2b5c0257987343457c81c04aab6d8ab7d3352414445cb859eb7; 11 fault probes and 8 UID probes.
