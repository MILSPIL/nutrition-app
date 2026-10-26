---
id: sol_4f95cde77041
problem: "Зашифрована адресна копія розшифровувалася, але tar закінчувався всередині файлу, хоча віддалена команда повернула 0."
created_at: "2026-10-26T10:17:50.961820+00:00"
project: nutrition-app
category: deployment
error_signature: "tarfile.ReadError: unexpected end of data"
author: Codex
tags: [paramiko, ssh, backup, eof, python]
---

Paramiko exit_status_ready() означає готовий статус, а recv_ready()==false означає порожній поточний буфер; це не EOF. Читати stdout і stderr до фактичного EOF із межею байтів і строком. Для обмеженого tar-продюсера ChannelFile.read(max+1) дочитує хвіст; для потокових фаз окремо читати recv/recv_stderr до b'' і лише потім перевіряти статус. Перевірка фактичного відновлення після виправлення отримала відсутній хвіст; незалежний тест відтворив стару гонку. Статус успіху проби записувати лише після перевірки фінальної змістовної квитанції.

**Evidence:** .agents/journal/2026-10-26-1215-codex-gpt-6.1-sol-hermes-host-b1.md
