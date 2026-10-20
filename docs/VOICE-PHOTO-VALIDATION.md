# Голос і фото: локальні докази

Дата: 2026-10-20. Goal objective_e45aa8ac1aa3. Гілка codex/voice-photo-entry, перевірений код c9f3ab3. Node24.11.1, npm11.6.2, Firebase CLI15.2.1, Wrangler4.151.3; lockfiles у Git. Жодного платного API-виклику чи розгортання.

## Що пройдено

| Перевірка | Результат | Межа доказу |
| --- | --- | --- |
| npm run test:voice-photo | 88 Jest, 17 Worker, 17 Firestore checks | Підставні providers, demo-scisense |
| npm run build | Успішно, без lint warnings | Звичайна клієнтська збірка, endpoint не налаштований |
| Worker npm run check | Успішний dry-run | Worker не публікувався |
| Ізольований браузер 375/390/1366 | 25 перевірок; WAV, два JPEG, запис, reload, звіт | API fixtures; реальні MediaRecorder, IndexedDB, Firestore emulators |
| Відступи getBoundingClientRect | 20/20 px; дельти заголовка/кнопки 0; overflow0 | Файли у evidence/voice-photo-2026-10-20 |
| Незалежний Codex | Відкритих P1/P2 немає | Весь локальний код і повтор вузьких виправлень |
| Claude Fable5.1 | 4 підтверджені P2 виправлено, 1 частково | Телефонний Auth adapter лишається відкритим; WAV contract додано |
| Worker npm audit | 0 | Новий toolchain оновлено вузько |

Синтетичний еталон: 200 г продукту з етикеткою53 ккал/100 г зберігає106 ккал, Б5.8/Ж5/В8 в прев’ю, списку, підсумку, після reload і в звіті. Тести також перевіряють незалежний еталон120 ккал, перерахунок250 г→150 ккал, г/мл/порцію/упаковку, raw/cooked, відсутні й нульові значення.

Сховище перевірено проти справжніх demo Auth/Firestore: однаковий ID не дублюється, різні чернетки додаються незалежно, старий snapshot не затирає нове, markers/revision лишаються, профіль не повертає старі meals. Невизначене збереження → явне закриття → той самий retry дає один рядок і оновлює облік пілоту. Атомарні квоти й бюджет додатково пройшли справжній workerd SQLite з перезапуском та прибиранням ресурсів.

## Що лишається відкритим

- V01–V03/V09: реальні UA/RU записи, фото та камера телефона, дозволений API, виміряна якість і час. Моки не доводять розпізнавання.
- Телефонна лабораторія: HTTPS, явна довіра власника і окремий Auth-emulator adapter. Production JWT-перевірка не послаблюється.
- Конкретні проєктні акаунти/ключі, модель Anthropic, перевірені ціни/бюджет і політика передачі медіа. SciSense-ключів у Keychain discovery не знайдено; чужі не використовувалися.
- G04 доступу, сумісність зі старими відкритими writers, розгортання/відкат, один release SHA й CI. GitHub CI запускає unit/Worker/Firestore/build; браузерний launcher виконується лише локально.
- G09: 7 днів, ≥10 спроб, ≥5 фото, ≥80% усіх спроб без ручного пошуку/БЖВ; фінальне приймання лише Юрієм.

Наявний root audit: 98 findings (5 low,13 moderate,77 high,3 critical). proxy-addr і shell-quote йдуть через CRA/dev-server; websocket-driver також є в Firebase database dependency; react-router-dom є runtime-залежністю. Повної оцінки досяжності браузерного bundle ще немає. Це відкрита картка card_085fe3191ff9/G08; кількість findings не дорівнює кількості досяжних продуктових вразливостей.

## Відтворення

```sh
npm ci
npm ci --prefix workers/meal-parser
npm run test:voice-photo
npm run build
npm --prefix workers/meal-parser run check
```

Java21 і Firebase CLI15.2.1 потрібні для локального сховища. Власний браузер на машині Юрія: `/Users/user/.local/bin/agent-test-browser run scisense-voice-photo` поза пісочницею. Повтор запускати після звільнення портів емуляторів. Скриншоти й JSON містять лише синтетичні приклади.
