---
id: sol_b9239d749310
problem: Вибір номера дня в SciSense не давав очистити поле та замість перегляду іншої дати записував programDay у метадані поточного дня.
created_at: "2026-10-26T20:16:50.551477+00:00"
project: nutrition-app
category: troubleshooting
tags: [day-selector, controlled-input, date-navigation, writer-fence]
---

DaySelectorModal зберігає введення як локальний рядок, включно з порожнім, і підтверджує лише валідне ціле число на Готово/Enter. У ClientApp цей вибір конвертується startDate+(day-1) календарних днів і проходить через chooseDate з чинним busy/pending/dirty fence, без changeMetadata. Поточний maxDay обчислюється від kyivDateKey, а не часової зони браузера. 323React tests і79browser checks на375/390/1366, actual7→empty→6 та правильна дата без metadata-write.

**Evidence:** b26fbd57961d0af9df5e972d9ad9243ebcfc990a; src/components/DaySelectorModal.js; src/pages/ClientApp.js; docs/evidence/day-selector-2026-10-26.json
