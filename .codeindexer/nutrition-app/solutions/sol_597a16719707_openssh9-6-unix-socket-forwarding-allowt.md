---
id: sol_597a16719707
problem: "OpenSSH9.6 відхиляє дозволений Unix-socket forwarding, якщо для окремого користувача AllowTcpForwarding=no, навіть коли AllowStreamLocalForwarding увімкнений."
created_at: "2026-10-26T17:10:58.462684+00:00"
project: nutrition-app
category: deployment
tags: [openssh, streamlocal, desktop, least-privilege]
---

У pinned OpenSSH session.c ssh_init_forwarding() викликає channel_disable_admin і блокує StreamLocal разом із TCP. Для конкретного forward-only principal використати AllowTcpForwarding local, залишивши і PermitOpen, і authorized-key permitopen точно на одному власному UDS; MaxSessions0/nologin та інші заборони зберегти. У9.6 шлях у PermitOpen потребує bracket-host синтаксису. Перевіряти sshd-t, effective config, позитивний UDS HTTP, а потім фактичну відмову TCP та session після успішної pinned автентифікації. Не розширювати глобальні правила.

**Evidence:** docs/evidence/hermes-personal-live-2026-10-26.json; .agents/journal/2026-10-26-1910-codex-hermes-personal-live-checkpoint.md
