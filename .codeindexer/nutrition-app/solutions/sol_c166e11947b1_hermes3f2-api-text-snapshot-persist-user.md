---
id: sol_c166e11947b1
problem: "Hermes3f2: api_text із приватним snapshot потрапляє у видиму історію при фото, хоча текстовий сценарій з persist_user_message працює. Просте перетворення string override на [clean text,image_url] прибирає snapshot, але після settlement фото зникає і не replay-иться після restart."
created_at: "2026-10-25T23:58:12.294546+00:00"
project: nutrition-app
category: architecture
updated_at: "2026-10-26T00:03:14.163125+00:00"
author: Codex
tags: [HERMES-PERSONAL-01, native-hermes, multimodal, canonical-history, retention, replay, python]
---

Native agent.session_persistence._override_replaces_content навмисно не замінює multimodal list звичайним string override. Out-of-tree personal adapter має передати підтриманий native list persist_user_message, зберігши imageparts та ЧИСТИЙ caption. До caption додати тільки paths із фактичного started admission attachments_v1.media, перевірені restore_native_media. Самі imageparts перетворяться в durable [screenshot], тому потрібні парні [Image attached at: <retained path>] hints: без них release_unheld_media не знаходить history owner і видаляє байти. Вебпроєкція маскує лише парні власні hints + службовий trailing screenshot suffix, буквальний user marker не чіпає. Оригінальну Native DB/source не патчити. Native age-sweep24h окремо адаптується лише для exact canonical home/state.db під продуктове retain-until-delete +256MiB quota. Replay3 означає3–5останніх фото: узгоджений48MiB IPC/provider/egress envelope потрібний для5MiB images;16MiB не вистачає.

**Dead end tried:** Text-only13checks і tiny1px photo не доводять near-limit replay; clean text+imageparts без admission path hints не зберігають фото.

**Evidence:** server/trainer/hermes_personal_media.py; server/trainer/personal-backend.mjs; .agents/runtime/hermes-personal-media-joint-2026-10-26.json:21actualchecks, retained bytes, physical restart,3near-limit PNG у Responses wire>16MiB,7OS-guarded processes,0realAPI. Блок ще до коміту/остаточного рев’ю.

**Evidence:** a7e1779; docs/evidence/hermes-personal-media-2026-10-26.json.21actual checks,7OS-guarded processes,29nativePython+7mediaPython+53Node+26React PASS. Final personal_contract_review PASS,1P1/4P2 resolved. Linux runtime/photo history UI/live explicitly pending.
