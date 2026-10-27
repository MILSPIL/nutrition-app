---
id: card_4328bc646ca6
card_type: gotcha
title: Повторний повний snapshot у Native впливає на наступні розмови
project: nutrition-app
product: scisense
phase_id: phase_870a15952663
status: open
importance: high
evidence: .agents/journal/2026-10-27-1210-codex-chat-reliability.md
valid_from: "2026-10-27T10:11:24.461579+00:00"
created_at: "2026-10-27T10:11:24.461579+00:00"
updated_at: "2026-10-27T10:15:29.882716+00:00"
content_hash: "sha256:f427f33bc71b99db5c1888483d4ea32577594e6f1b64a3cdb08eab0f3e788452"
---

Goal objective_e45aa8ac1aa3; G06/G08. Пастка, автоматично піднята з sol_8ccb1b4e2622: api_content кожного Native user row повторюється в наступній інференції. Результат для користувача: розмова не сповільнюється після кількох повідомлень. Рішення: компактний підписаний admission і одна повна свіжа копія snapshot тільки на request copy; історичні слова/дата/фото/tool pairs зберігаються. Межа: без Native SQL rewrite, обрізання фактів або зміни фізичних лімітів. Виправлено в16a7348, дві реальні поради completed≈5/4с, кожна1POST; майбутні зміни перевіряти на довгій історії й точному pinned Native. Приймання G06/G08 залишається pending.
