---
id: sol_8621cbfbc342
problem: "Поле повідомлення в чаті тренера показує прокрутку навіть на одному рядку, у кутку смугастий кут, а нижня панель стрибає на першій літері; з відкритою клавіатурою стрічка повідомлень стискається (Юра: «злипаються полоси, з'являються прокрутки»)."
created_at: "2026-10-30T22:45:42.841441+00:00"
project: nutrition-app
category: troubleshooting
author: Claude Opus 5.5
tags: [textarea, autosize, css, TrainerChat, mobile, 1.9.9, javascript]
---

Причини: (1) автовисота ставила `height = scrollHeight`, але scrollHeight не містить рамки, а `box-sizing: border-box` рахує рамку в height, тож поле завжди на 2 px нижче за текст (44/42/43) і прокручується; (2) `resize: vertical` малює смугастий кут; (3) кнопка «Зберегти текст як нотатку без оцінки» рендерилась при будь-якому тексті (+44 px панелі). Виправлення в src/components/TrainerChat.js `fitTextarea` (на рівні модуля, а не в хуку, щоб eslint не дав попередження і CI=true build не впав): `height = scrollHeight + offsetHeight - clientHeight`, стеля `min(120, visualViewport.height/4)`, `overflowY` auto лише на стелі, виклик і з обробника visualViewport resize; CSS `resize: none`, padding 9px 10px (один рядок 44 = кнопки); кнопка нотатки лише при `feedback` (збій відповіді). Як міряти без повного стенду: тестова сторінка з тим самим TrainerChat.css і розміткою composer у Playwright headless, порівняти offsetHeight/clientHeight/scrollHeight; у headless після setViewportSize знімок може задвоїти шапку, перезнімати на свіжо завантаженій сторінці. Пастка: min-height на .trainer-scroll при composer flex-shrink:0 обріже кнопку «Надіслати».

**Evidence:** 5a3bf75 (claude/simple-logging-199); спека docs/superpowers/specs/2026-10-30-simple-logging-199.md S8, K13
