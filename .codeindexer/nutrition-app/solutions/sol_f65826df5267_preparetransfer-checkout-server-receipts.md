---
id: sol_f65826df5267
problem: Одночасні prepareTransfer із двох checkout створювали два server receipts і дозволяли розділити той самий pilot budget.
created_at: "2026-10-21T13:47:14.755578+00:00"
project: nutrition-app
category: architecture
author: Codex
tags: [budget, race, transfer, lock, javascript]
---

Спільний pilot-lock поза checkout утримується протягом усього liveRuntime. Перед transfer спершу stopLocal, потім acquire того самого lock і свіже читання marker. Permanent transfer-marker записується й перечитується до snapshot. Server ledger має окремий durable anchor/receipt/lock поза releases; crash не видаляє lock автоматично. Два receipts не можуть виникнути через read/write race.

**Evidence:** 7aee2ce; server/transfer.mjs:12; scripts/phone-lab/pilot-lock.mjs; docs/evidence/server-budget-preparation-2026-10-21.json
