---
id: sol_5ff7fb8f0966
problem: "Персональний Hermes-тренер SciSense (1.9.5) пише користувачу «технічний збій: сервіс повернув trainer_unavailable, їжу не збережено, прев'ю не створено», хоча сайт і API здорові. Модель отримує trainer_unavailable як результат виклику інструмента propose_food_draft/food_lookup."
created_at: "2026-10-27T16:07:31.599217+00:00"
project: nutrition-app
category: troubleshooting
error_signature: trainer_unavailable
updated_at: "2026-10-27T16:38:12.051460+00:00"
author: claude-opus-5-5
tags: [scisense, hermes-personal, trainer-tools, error-allowlist, G06, G08, javascript]
---

Діагноз за кодом (гілка codex/hermes-personal-server @8997d31), спека docs/superpowers/specs/2026-10-27-chat-fix-196.md.
Причина 1 (trainer_unavailable у тексті тренера): у персональному режимі помилки інструментів проходять через три різні allowlist, і вони не збігаються.
- server/trainer/tool-errors.mjs: 17 кодів з підказками (hint); використовує лише старий Node-шлях hermes-native.mjs:413 (safeToolFailure повертає {error, hint} як результат).
- server/trainer/internal-process.mjs:6-12 і :59: код поза Set стає "trainer_unavailable".
- server/trainer/hermes_personal_ipc.py:11 TOOL_ERRORS (12) і :96: код поза списком стає BrokerRefusal → trainer_unavailable; навіть дозволені коди йдуть як {"error": code} БЕЗ hint.
Не доходять до моделі: estimate_reason_required, invalid_portion_origin, label_evidence_missing, density_not_confirmed, invalid_household_measure, draft_conflict, draft_frozen, invalid_quantity, draft_too_large, draft_already_proposed, memory_read_only. Який код був у конкретному випадку, сервер не записує.
Правильне місце виправлення: personal-backend.mjs колбек tools у prepare(): try/catch, код з MODEL_TOOL_ERRORS → повернути safeToolFailure(error) як РЕЗУЛЬТАТ. Результат проходить IPC без змін (Peer.ask повертає result dict; hermes_personal_owner.py:282-283 робить json.dumps), Python не чіпати.
Причина 2 (прев'ю тихо зникає): друга чернетка на ту саму дату НЕ кидає date_draft_conflict під час виклику propose_food_draft; drafts.mjs publish (~400-415) при завершенні ходу ставить їй state "conflict" і не записує, UI цей стан не показує. Виправлення: рання перевірка в drafts.mjs propose (без draftId + чернетка не saved на цю дату в розмові → date_draft_conflict) плюс підказка редагувати наявну чернетку (snapshot.draft з gateway.mjs:124 містить усі не saved чернетки розмови).
Пастка діагностики: перша версія цього запису називала date_draft_conflict з drafts.mjs:314 тригером trainer_unavailable; це хибно, write() з цією перевіркою викликається лише в publish/editDraft/save, а не під час виклику інструмента.

**Evidence:** server/trainer/internal-process.mjs:59; server/trainer/hermes_personal_ipc.py:96; server/trainer/tool-errors.mjs:22; server/trainer/drafts.mjs:358-415; server/trainer/hermes_personal_owner.py:282-283
