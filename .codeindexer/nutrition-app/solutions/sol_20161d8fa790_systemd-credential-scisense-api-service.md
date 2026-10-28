---
id: sol_20161d8fa790
problem: "Новий systemd credential для scisense-api.service (напр. ops-reader у COACH-PROBLEMS-01): як додати LoadCredentialEncrypted у drop-in так, щоб служба не впала, якщо файлу credential ще немає або його прибрали при відкаті."
created_at: "2026-10-28T21:39:29.941498+00:00"
project: nutrition-app
category: deployment
author: claude-code
tags: [systemd, credentials, deploy, scisense, COACH-PROBLEMS-01]
---

systemd.exec (розділ Credentials, freedesktop latest): «if the path is not specified or a valid credential identifier is given ... a missing credential is not considered fatal». Тобто `LoadCredentialEncrypted=ops-reader` БЕЗ шляху шукає файл у /run/credstore.encrypted/, /etc/credstore.encrypted/, /usr/lib/credstore.encrypted/ і при відсутності служба стартує. З абсолютним шляхом до відсутнього файлу виняток не діє, отже старт юніта падає. Порядок публікації: файл від `systemd-creds encrypt` (значення через stdin) у /etc/credstore.encrypted/ops-reader, drop-in з `LoadCredentialEncrypted=ops-reader` без шляху, daemon-reload, рестарт. Відкат: прибрати файл або drop-in, служба стартує в обох випадках; Node-код має сам переносити відсутній /run/credentials/.../ops-reader (S4 спеки: маршрут тоді 401).

**Dead end tried:** `man systemd.exec` на Mac недоступний; WebFetch сторінки обрізав розділ Credentials, тому текст узято curl зі сторінки і пошуком фрази.

**Evidence:** https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html, розділ LoadCredential=; спека docs/superpowers/specs/2026-10-28-coach-problem-reports.md S4
