---
id: sol_8ccb1b4e2622
problem: Hermes Native повторно надсилає всі історичні api_content з повними app snapshot; наступні розмови гальмують або лишаються unknown до фізичного deadline.
created_at: "2026-10-27T10:11:22.162823+00:00"
project: nutrition-app
category: troubleshooting
tags: [hermes, api-content, context-projection, canonical-history, HMAC, native-merge, timeout]
---

У HERMES-PERSONAL-01 api_text нової admission містить тільки SCISENSE-INPUT-V1,inputId,HMAC і чистий текст. Тільки на копії model request перевіряти account/input/HMAC, замінити історичні snapshot словами й sentAt/targetDate, а поточний input рівно один раз повним свіжим snapshot. Не переписувати Native DB і не обрізати обов'язкові факти. Native automatic compression вимкнена в перевіреному physical config, щоб auxiliary inference не передувала parent projection. У pinned3f2 Native робить trimEnd та зливає суміжні user rows: parser спершу споживає точний підписаний текст/цілий legacy JSON, тільки потім службові hints і наступний frame. Зберігати фото, toolcall/result pairs та fail-closed byte bound. Код: server/trainer/personal-model-context.mjs:1; personal-coordinator.mjs:54; hermes_personal_owner.py:39. Commit16a7348, docs/evidence/trainer-chat-reliability-2026-10-27.json. Реальні2поради completed за4967/4406мс,по1POST; sidecar компактні, повторів старих входів і food save немає. G06/G08 лишаються pending до повного приймання.
