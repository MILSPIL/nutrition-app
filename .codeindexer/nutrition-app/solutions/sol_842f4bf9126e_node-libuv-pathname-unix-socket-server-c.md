---
id: sol_842f4bf9126e
problem: "Node/libuv видаляє pathname прив’язаного Unix socket під час server.close() ще до JavaScript inode-перевірки. Заміна public pathname на інший файл може бути знищена, хоча cleanup-код перевіряє inode після close."
created_at: "2026-10-26T05:19:26.894239+00:00"
project: nutrition-app
category: troubleshooting
updated_at: "2026-10-26T05:19:40.586641+00:00"
tags: [node, libuv, unix-socket, cleanup, HERMES-PERSONAL-01]
---

Прив’язувати socket до власного private generation directory0700, налаштувати inode0660/dedicatedGID до публікації, атомарно створити public hard link без overwrite. Libuv видаляє лише private bind. Public alias видаляти окремо лише при точному збігу inode/dev. EEXIST не чіпає попередній listener. Доведено realMac UDS і actualLinux/systemd; regression public replacement/EEXIST/half-open cleanup. Файли server/trainer/personal-desktop-endpoint.mjs/test; docs/deployment/hermes-personal-desktop-01.md. Goal objective_e45aa8ac1aa3, G04/G06/G08. Це локальна технічна властивість, не доказ production.
