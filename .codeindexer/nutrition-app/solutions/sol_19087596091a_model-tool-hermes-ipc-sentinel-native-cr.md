---
id: sol_19087596091a
problem: "Після невдалого model/tool запиту особистий Hermes перестає запускатися: публічний IPC sentinel у native credential pool отримує exhausted та failure_reason, а строгий валідатор власного адаптера вважає ці службові метадані забороненими. API бачить лише execution_unknown перед hello."
created_at: "2026-10-26T21:46:58.186337+00:00"
project: nutrition-app
category: troubleshooting
tags: [hermes, ipc, restart, credential-metadata, single-writer]
---

У server/trainer/hermes_personal_owner.py приймати лише обмежені типізовані поля native error metadata після повної перевірки незмінного sentinel/source/fingerprint та порожніх providers. Після захоплення sole-owner fence атомарно прибрати лише локальний статус і cooldown публічного IPC запису. Не змінювати payer grant, request_count, admissions, історію або ledger. Реальні credential keys, чужі pools, невідомі поля, вкладені значення та секретоподібні error strings і далі відхиляти. Регресія: exhausted→повторний запуск, відмова injected grants без мутації та точна цілісність історії. Доведено commit fec3ac2, 16 native tests +12 IPC checks, контрольна серверна чернетка ready/2 complete items/0 saves; загальне приймання продукту pending.
