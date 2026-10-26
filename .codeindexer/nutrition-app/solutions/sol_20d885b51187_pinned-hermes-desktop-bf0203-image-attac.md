---
id: sol_20d885b51187
problem: "У pinned Hermes Desktop bf0203 вибір фото викликає image.attach_bytes, але prompt.submit може мати attachments[]. Сам chooser/RPC receipt помилково виглядає позитивним, хоча фото не надходить до моделі."
created_at: "2026-10-26T05:19:29.355613+00:00"
project: nutrition-app
category: troubleshooting
updated_at: "2026-10-26T05:19:42.371897+00:00"
tags: [hermes-desktop, mime, multimodal, acceptance, HERMES-PERSONAL-01]
---

Native image.attach_bytes повертає mime. uploadComposerAttachment не переносив його до image chip, а submit.ts додає лише attachments з MIME. У мінімальному pinned patch додати ImageAttachResponse.mime і mime:result.mime||attachment.mime. Перевірити actual UI submit attachment1, image у двох фактичних Native SDK body, exact replay після UI close без нового POST. 37checks/9guardedprocesses/7fakePOST/0real,3staging regressions;12-filepatch/freshapply/build/review PASS. Доказ docs/evidence/hermes-personal-desktop-wire-2026-10-26.json; Goal objective_e45aa8ac1aa3,G02/G05/G07/G08/G11. Chooser-only receipt не закриває photo-body.
