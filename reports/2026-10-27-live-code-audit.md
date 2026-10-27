---
title: Аудит живого коду SciSense 1.9.5
date: 2026-10-27
project: nutrition-app
type: audit
---
# Аудит живого коду SciSense 1.9.5

Об'єкт: гілка `codex/hermes-personal-server`, коміт `8997d31` (у проді як 1.9.5), робоче дерево Codex.
Режим: лише читання. Інструменти: читання коду, grep, git, codeindexer (проєкт `nutrition-app-live`: find_dead_code, find_complex_functions, refactor_candidates, tech_debt_report, audit_project summary).
Прод іде персональним шляхом: `scripts/hermes-personal-package.py:142-145` записує `deployment-personal.json` (version 3) як `server/deployment.json`, тому `server/main.mjs:6-10` завжди бере `createPersonalServerRuntime`.
Не повторюю 4 пункти, які вже виправляє 1.9.6 (помилки інструментів, друге прев'ю на дату, фонове опитування з `network_unavailable`, статус і жирний текст у чаті). Де знахідка є продовженням виправлення 1.9.6, так і позначено.

Позначки: **підтверджено** = простежив шлях у коді від місця, де код помилки виникає, до тексту, який бачить користувач; **підозра** = код дозволяє таку поведінку, але частоту або тривалість треба підтвердити на сервері.

## Підсумок

Головна причина того, що «помилки вилазять знову»: одна й та сама річ (код помилки, стан чернетки, ліміт) описана в 5-10 незалежних списках у різних шарах (браузер, HTTP, Node, Python), і ці списки вже розійшлися. Кожне нове виправлення латає один шар.

Найважливіше:

1. **HTTP-шар переписує зрозумілі коди в `bad_request`.** `stale_preview` і `day_unavailable` мають готові тексти в клієнті, але `server/api.mjs:124` їх не пропускає. На «Додати» користувач бачить «Тренер не завершив повідомлення». Виправлення S.
2. **Після будь-якого невдалого ходу чат показує «Розпізнавання не відповіло вчасно».** Сервер вбиває Native-процес після помилки, а `/state` дає холодному старту лише 5 с. Виправлення S-M.
3. **Кнопка «Скасувати обробку» має межу 5 с на роботу, яка займає більше.** Користувач отримує той самий «Розпізнавання…», а незавершене скасування блокує нові повідомлення («Тренер ще завершує попереднє повідомлення»). Виправлення M.
4. **Справжня причина збою ходу губиться.** Вихід із ChatGPT, ліміт 429, перевищення контексту: усе стає «Тренер не завершив повідомлення». Виправлення M.
5. **Прев'ю можна редагувати й «Додати» під час роботи тренера.** Оновлення від тренера тоді мовчки відкидається. Виправлення S (заблокувати картку на час ходу).

Мертвого коду мало і він дрібний. Великий кандидат на видалення: старий шлях v2 (Anthropic, близько 1500 рядків JS + 2 Python-модулі). Він не мертвий формально (тести, гілка в `main.mjs`), тому потрібне рішення Юрія.

## Як перевірено

Аудит зробив фоновий агент Claude (лише читання, codeindexer `nutrition-app-live` плюс читання коду). Головні знахідки головна сесія перевірила сама в коді `8997d31` 2026-10-27:
- H1: у `server/api.mjs:124` немає `stale_preview`, `day_unavailable`, `stale_snapshot`, `trainer_queue_full`, `trainer_timeout`, `invalid_token` (grep: 0 збігів для кожного); `api.mjs:125` віддає `bad_request`; у `trainerApi.js:20-21` тексти для двох перших є, але недосяжні.
- M5 і H2: `trainerApi.js:52-53` для невідомого коду бере `voiceError`; `voiceApi.js:31` дає «Розпізнавання не відповіло вчасно» для `upstream_timeout`; `gateway.mjs:227` у `/state` чекає `contextValue`; `personal-coordinator.mjs:167` зупиняє обидва процеси на будь-яку помилку ходу.
- M2: `TrainerChat.js:976` `busy` не враховує активний хід; `result.drafts` у `src` не читається (grep: 0).
- M3: `server/personal-runtime.mjs:29` вимагає `maxConcurrent === 2`, `api.mjs:79` дає `429 rate_limited`.
- Мертвий код: `readPersonalProfiles` (0 імпортів), `clearError` (0 викликів), `curated-pack.mjs` (лише власний тест).
Решта пунктів позначені агентом як «підтверджено» або «підозра» і головною сесією окремо не перевірялись.

## Помилки

### Висока важливість

#### H1. Сервер перетворює `stale_preview`, `day_unavailable` та ще 5 кодів на `bad_request`; користувач бачить хибне «Тренер не завершив повідомлення»
- **Статус:** підтверджено.
- **Де:**
  - `server/api.mjs:124-125`: білий список `publicErrors`; усе, чого в ньому немає, віддається як `400 bad_request`.
  - Хто кидає коди, яких у списку немає: `server/trainer/gateway.mjs:328,331` (`stale_preview` на «Додати»), `server/trainer/day-snapshot.mjs:9,19,38` через `fresh()` у `gateway.mjs:60` (`day_unavailable` на надсиланні, `/days`, правці прев'ю, «Додати», нотатці), `server/trainer/firestore-reader.mjs:80-83` (`invalid_token`, який `day-snapshot.mjs:38` навмисно пропускає далі), `server/trainer/personal-queue.mjs:26,51` (`trainer_timeout`, `trainer_queue_full` для «Запам'ятати» і видалення фото через `queue.run`).
  - Клієнт: `src/services/trainerApi.js:20-21` уже має тексти для `day_unavailable` і `stale_preview`, але отримує `bad_request`; `trainerApi.js:52-53` падає в загальний текст `trainer_failed`.
  - `invalid_token` до клієнта не доходить, тому автоматичне перепідключення щоденника (`trainerApi.js:140-148` спрацьовує лише на `data_auth_required`) не запускається.
- **Чому важливо:** на головній дії («Додати» у прев'ю) людина бачить «Тренер не завершив повідомлення. Текст збережено; його можна повернути й уточнити». Текст і хибний (повідомлення ніхто не надсилав), і не каже, що робити (оновити прев'ю). Тести `server/trainer/coach-backend.test.mjs:84,89` перевіряють шлюз напряму, тому перетворення в HTTP-шарі тестами не покрите.
- **Побічний ефект:** `503` перетворюється на `400`. Для `POST /turns` це випадково правильно: `trainerSession.js:213` очищує «невідоме надсилання», а `fresh()` справді виконується до `store.admit`. Для інших маршрутів статус бреше.
- **Виправлення:** S. Мінімум: додати в `publicErrors` коди `stale_preview:409, day_unavailable:503, stale_snapshot:409, trainer_queue_full:409, trainer_timeout:504`, а `invalid_token` віддавати як `data_auth_required:401`. Краще: пропускати будь-який статичний код (`/^[a-z_]{1,60}$/` + `error.status`), як це вже робить `turn-store.mjs:17-18 safeError`. Додати контрактний тест: кожен `fail("...")` з HTTP-маршрутів `gateway.mjs` має бути або публічним, або свідомо прихованим.

#### H2. Після будь-якого невдалого ходу опитування чату показує «Розпізнавання не відповіло вчасно. Чернетка залишилась.»
- **Статус:** шлях підтверджено; тривалість холодного старту понад 5 с під підозрою.
- **Де:**
  - `server/trainer/personal-coordinator.mjs:162-168`: на будь-яку помилку ходу (`execute` catch) виконуються `payer.abortTurn()` і `retire(uid, record)`, тобто обидва Native-процеси зупиняються.
  - `server/trainer/gateway.mjs:226-227`: `GET /state` чекає `contextValue()`, хоча результат відкидає (потрібен лише побічний ефект для пропозицій пам'яті).
  - `gateway.mjs:73`: `contextValue` обмежений 5 с, усередині `core.context` → `ownerFor` → холодний старт payer + owner (`personal-coordinator.mjs:27-33,289-295`).
  - `server/trainer/personal-runtime.mjs:176-178`: коментар визнає «five-second browser read window», тому процеси прогріваються лише при старті сервера. Після `retire` прогріву немає.
  - `boundedOperation` повертає `upstream_timeout` (`deadline.mjs:6-8,24-36`). У `trainerApi.js` для нього тексту немає, тому спрацьовує текст голосового модуля `src/services/voiceApi.js:31`.
  - Виправлення 1.9.6 (`c1d85f5`) гасить у фоні лише `network_unavailable` і `client_timeout`, а `upstream_timeout` ні.
  - Друге джерело: `backend.history` → `core.history` → `owner.bot(channel)` (`personal-coordinator.mjs:267-269`) без `timeoutMs` і без signal. Діє внутрішній ліміт 90 с (`internal-process.mjs:19,84-90`). Клієнт здається на 15 с, а HTTP-слот тримається до 65-90 с (`api.mjs:88-92`, `finally` на 126-133 виконується лише після завершення `handle`).
- **Чому важливо:** після одного невдалого повідомлення людина бачить чужий, лякаючий текст про розпізнавання голосу, а чат не оновлюється, поки процес не прогріється.
- **Виправлення:**
  - S: у `/state` обгорнути `contextValue` у `try/catch`: стан чату не повинен залежати від читання пам'яті.
  - S: дати `history()` власний `timeoutMs: 5000` і signal.
  - S: окремий текст тренера для `upstream_timeout` («Тренер запускається, повторюю…») і додати його в тихі фонові коди.
  - M: після `retire` одразу прогрівати owner, як це вже робить `selectModel` (`personal-coordinator.mjs:360-376`).

#### H3. «Скасувати обробку» має межу 5 с; скасування не встигає, і нові повідомлення блокуються
- **Статус:** межу і ланцюжок підтверджено в коді; що реальна тривалість понад 5 с, лише підозра.
- **Де:**
  - `gateway.mjs:400-409`: `boundedOperation(signal => backend.stop(..., { explicit: true, signal }))` з межею 5 000 мс за замовчуванням (`deadline.mjs:24`).
  - `personal-backend.mjs:141-145`: `stop` спершу чекає `execution.done`, тобто повного завершення ходу.
  - Хід завершується лише після фізичного виходу двох процесів: `personal-coordinator.mjs:113-117,175` (`payer.abortTurn` + `retire`, а `retire` чекає `owner.close()` → `exitedPromise`, `internal-process.mjs:149-160`).
  - Потім `core.cancelInput` (`personal-coordinator.mjs:235-263`): `queue.run` → `ownerFor`, тобто холодний старт нового owner → `cancelNativeInput`.
  - Коли 5 с минають, signal скасовує задачу в черзі (`personal-queue.mjs:28-30,54`), і Native-скасування може не завершитися.
  - Далі: `store.cancel` уже записаний (`gateway.mjs:401`), задача прибирання лишається. `personal-backend.mjs:150-155` повертає `cleaned:false`, поки Native-рядок у стані `dispatching/admitted/unknown`, а `turn-store.mjs:375-383` відмовляє в новому надсиланні з `trainer_busy`, поки є будь-яка `cleanup_jobs`.
- **Чому важливо:** людина натискає «Скасувати», бачить «Розпізнавання не відповіло вчасно» (див. H2/M5), а далі довго бачить «Тренер ще завершує попереднє повідомлення». Вийти можна лише повторним «Скасувати». У `PROJECT-INFO.md` за 27.10 (1.9.3, 1.9.4) зафіксовано саме такий симптом: «Native FIFO, призупинений старою unknown-спробою».
- **Виправлення:** M. Відповідати на скасування одразу (стан `cancelling`), а Native-скасування доводити у фоновій задачі прибирання з власним дедлайном (30-90 с). Або щонайменше дати явному скасуванню окремий бюджет часу (не 5 с) і не скасовувати Native-скасування при обриві HTTP.

#### H4. Задача прибирання, яка ніколи не завершується, мовчки блокує всі нові повідомлення
- **Статус:** шлях підтверджено; частоту треба перевірити.
- **Де:**
  - `gateway.mjs:88-101`: `cleanupOnce` ковтає будь-яку помилку (`catch {}`) і пропускає `cleaned:false`.
  - `turn-store.mjs:660-664`: `cleanupAttempt` збільшує `attempts`, але це поле ніде не читається (див. «Мертвий код»).
  - `turn-store.mjs:375-383`: `admit` відмовляє з `trainer_busy`, поки існує хоч одна `cleanup_jobs`.
  - Клієнт показує лише «Завершую попередню обробку» (`TrainerChat.js:1167`).
- **Чому важливо:** тренер «вічно зайнятий» без пояснення і без діагностики на сервері.
- **Виправлення:** M. Після N спроб або T хвилин позначати задачу як `stuck`, показувати в UI окремий стан з дією «Скинути й перевірити щоденник», записувати код причини (без даних) у журнал сервісу.

### Середня важливість

#### M1. Причина збою Native-ходу губиться: усе стає `trainer_failed`
- **Статус:** підтверджено.
- **Де:**
  - `hermes_personal_payer.py:250-258`: 401/403 → `connection_auth_required`, 429 → `trainer_quota`.
  - `personal-model-context.mjs:92`: `context_too_large`.
  - `personal-store.mjs:163`: `trainer_quota`.
  - Ці коди йдуть у Python як відповідь на виклик моделі. `hermes_personal_ipc.py:96-100` → `BrokerRefusal`, а `hermes_personal_provider.py:12-13,22-24` пропускає лише 8 кодів (`context_too_large` серед них немає → `trainer_unavailable`).
  - Native завершує хід як `failed`, `personal-coordinator.mjs:151-160` повертається без помилки, `personal-backend.mjs:6-7 answer()` кидає `trainer_failed` для будь-якого не-completed.
  - Готові тексти в клієнті (`trainerApi.js:7,14,42` для `trainer_quota`, `connection_auth_required`, `context_too_large`) на цьому шляху недосяжні. Правильний текст буває лише тоді, коли збій стався до відправки (`personal-credentials.mjs:95`).
- **Чому важливо:** коли закінчився вхід у ChatGPT, людина бачить «Тренер не завершив повідомлення… можна повернути й уточнити» і повторює, замість того щоб перелогінитися в Hermes.
- **Виправлення:** M. У `onModel`/`onTool` координатора запам'ятовувати код останньої відмови (`active.lastRefusal`), а в `answer()` кидати його замість `trainer_failed` (з `knownNativeTerminal`).

#### M2. Прев'ю редагується і «Додати» працює під час активного ходу; оновлення від тренера мовчки зникає
- **Статус:** підтверджено.
- **Де:**
  - Клієнт: `TrainerChat.js:959` (`busy` не враховує `activeTurn`), `979` (`disabled={busy}`), `127` (`locked`), `309-318` (кнопка «Додати»).
  - Сервер: `drafts.mjs:473-487` (`beginSave` перевіряє лише `cleanup_jobs` для `d.turnId`, а не поточний хід); `drafts.mjs:406-416` (`publish` ставить `state:"conflict"`, якщо ревізія змінилась або чернетка вже `saving/saved/unknown`); `turn-store.mjs:590-598` (результат іде лише в `turn.result.drafts`).
  - Клієнт `result.drafts` не читає взагалі (grep по `src`: 0 звернень).
  - Друга гілка: якщо людина змінила кількість до виклику інструмента, `drafts.mjs:370-371` і `85-92` дають `draft_conflict`. Підказка `tool-errors.mjs` радить узяти ревізію зі snapshot, а вона вже застаріла, тож модель повторює ту саму помилку до `max_turns 8`.
  - Виправлення 1.9.6 закрило лише конфлікт дати під час пропозиції.
- **Чому важливо:** тренер відповідає «додав банан», а у збереженому записі банана немає.
- **Виправлення:** S: блокувати картку прев'ю (поля й «Додати») поки `activeTurn(turn)`. M: показувати `conflict` з `publish` у стрічці («Тренер пропонував зміну, але прев'ю вже змінене»).

#### M3. Лише 2 одночасні HTTP-запити на весь сервер; фонові 429 показуються як «Досягнуто ліміту спроб»
- **Статус:** ліміт і показ підтверджено; частоту треба перевірити.
- **Де:**
  - `server/personal-runtime.mjs:29` вимагає `maxConcurrent === 2`; `:115` передає це в API.
  - `server/api.mjs:79`: `active.size >= maxConcurrent` → `429 rate_limited`. Ліміт спільний для обох профілів і для STT `/transcribe`, а той триває до 45-65 с.
  - Клієнт: опитування кожні 2,5 с (`TrainerChat.js:477-479`), паралельні `api.day` на кожну дату прев'ю (`TrainerChat.js:553-567`), фото (`trainerApi.js:151-158`, коментар прямо розраховує на «другий HTTP-слот»).
  - Фонова помилка → `trainerSession.js:67-70 fault` → текст з `voiceApi.js:24`. 1.9.6 цей код не гасить і сам не прибирає.
  - Утримання слоту довгими `/state` описане в H2.
- **Чому важливо:** коли другий профіль диктує голосове, у чаті Юри може з'явитися «Досягнуто ліміту спроб. Зачекайте й повторіть пізніше.», і це повідомлення не зникає саме.
- **Виправлення:** S: у фоні вважати `rate_limited` тимчасовим (як мережу). M: винести дешеві GET (`/state`, `/days`, `/photos`) з глобального ліміту або підняти ліміт до 4 з обмеженням на одного користувача.

#### M4. Відповідь сервера не у форматі JSON (рестарт, деплой, 502/503 від проксі) перетворюється на «Тренер не завершив повідомлення»
- **Статус:** порядок розбору підтверджено; що OLS при падінні API віддає HTML, лише підозра.
- **Де:** `src/services/trainerApi.js:109` викликає `r.json()` до перевірки `r.ok`; `117-120` перетворює лише `AbortError` і `TypeError`. `SyntaxError` проходить як є, а `trainerApi.js:52-53` дає загальний текст. Сюди ж `api.mjs:78` (`503 unavailable` під час закриття): тексту немає.
- **Чому важливо:** під час кожного деплою або аварійного `onFatal` відкритий чат показує хибний текст про невдале повідомлення.
- **Виправлення:** S. Читати тіло безпечно: якщо не JSON, кидати `trainer_unavailable` зі статусом відповіді й додати його в тихі фонові коди.

#### M5. У чаті тренера показуються тексти голосового модуля
- **Статус:** підтверджено.
- **Де:** `trainerApi.js:52-53` для невідомого коду падає в `voiceError` (`voiceApi.js:2-34`). Результат:
  - `upstream_timeout`: «Розпізнавання не відповіло вчасно. Чернетка залишилась.»;
  - `client_timeout`: «Обробка триває надто довго. Чернетка залишилась.»;
  - `live_disabled`: «Сервіс розпізнавання ще не підключений…»;
  - `rate_limited`: «Досягнуто ліміту спроб…».
- **Чому важливо:** у чаті немає «чернетки» і «розпізнавання», тому людина не розуміє, що сталося.
- **Виправлення:** S. Власні тексти тренера для цих кодів у `trainerApi.js`; `voiceError` використовувати лише для голосу.

### Низька важливість

#### L1. Коди без тексту в клієнті: користувач бачить загальне «Тренер не завершив повідомлення»
- **Статус:** підтверджено.
- **Де:**
  - `note_conflict` (`gateway.mjs:303`, `drafts.mjs:274`; публічний, тексту немає);
  - `draft_too_large` (`drafts.mjs:234` при ручній правці; публічний, тексту немає);
  - `invalid_plan_choice` (`drafts.mjs:50,57`; не публічний → `bad_request`);
  - `media_reattach_required` (`turn-store.mjs:128-130`; `trainerSession.js:246`);
  - `interrupted_before_start` (`turn-store.mjs:130`);
  - `connection_model_changed` (`personal-payer.mjs:92`; `hermes_personal_payer.py:115,205-218`);
  - `trainer_cancelled` (`personal-queue.mjs:28,34,50,54`);
  - `turn_inactive`/`turn_expired` (`turn-store.mjs:455,466-467`);
  - `retention_cleanup` (`turn-store.mjs:436`).
- **Виправлення:** S, разом із каталогом помилок (див. «Що спростити»).

#### L2. Локальне блокування клієнта видається за «тренер зайнятий»
- **Статус:** підтверджено.
- **Де:** `trainerSession.js:160`: `operate` кидає `trainer_busy`, коли вже йде інша дія в цій самій вкладці. Текст `trainerApi.js:24-25` каже «Тренер ще завершує попереднє повідомлення», хоча тренер вільний.
- **Виправлення:** S. Окремий код, наприклад `action_in_progress`, з текстом «Зачекайте, попередня дія ще виконується».

#### L3. Після 1.9.6 деякі помилки інструментів усе ще обривають хід (продовження виправлення 1.9.6)
- **Статус:** підтверджено.
- **Де:** кодів немає ні в нових `hints` (`tool-errors.mjs` 1.9.6), ні в Python `TOOL_ERRORS`:
  - `invalid_request` з `tools.mjs:140,145` і `drafts.mjs:100,106,116` (зайві аргументи, `removeItemIds` з невідомим id);
  - `invalid_context_proposal` (`drafts.mjs:575`, пропозиція пам'яті понад 8000 байт або зі старою ревізією);
  - `stale_snapshot` з `turn-store.mjs:288` через `tools.mjs:158`. Його немає навіть у `internal-process.mjs:6-11`, тож він стає `trainer_unavailable`.
- **Виправлення:** S. Додати підказки для цих 3 кодів.

#### L4. Усередині ходу `day-snapshot.mjs` зводить будь-яку помилку читання до `day_unavailable`
- **Статус:** підтверджено.
- **Де:** `day-snapshot.mjs:35-39` (catch-all, крім `invalid_token` і `pilot_forbidden`). Туди потрапляють `data_auth_required` (`firestore-reader.mjs:113` через `getOwnerToken`), `profile_missing` (`firestore-reader.mjs:178`), `note_conflict` (`firestore-reader.mjs:172`).
- **Чому важливо:** на шляху ходу і в Desktop людина бачить «Не вдалося прочитати записи цього дня. Перечитайте прев'ю…» замість «перепідключіть щоденник». Якщо оновлення токена Firebase хоч раз не вдалося (`firebase-sessions.mjs:93-108` будь-яку помилку обміну, навіть мережеву за 5 с, перетворює на постійне `requireReauth`), ходи з Desktop падатимуть, доки людина не відкриє сайт (автоперепідключення є лише у вебклієнті, `trainerApi.js:140-148`). Останнє лише підозра, бо залежить від сценарію використання.
- **Виправлення:** S. Пропускати `data_auth_required` і `profile_missing` далі без перетворення. M: на мережевий збій оновлення токена не переводити сесію в `reauth_required` одразу.

#### L5. Одне й те саме обмеження 8000 байт дає різні коди
- **Статус:** підтверджено.
- **Де:** `gateway.mjs:25` (`invalid_request`), `personal-coordinator.mjs:197` (`invalid_request`), `turn-store.mjs:347` (`message_too_large`). Клієнт перевіряє першим (`trainerSession.js:186`), тому трапляється рідко.
- **Виправлення:** S. Скрізь `message_too_large`.

## Мертвий код

codeindexer знайшов 118 кандидатів. Приблизно 95% із них хибні: JSX-компоненти (`ToastItem`, `MacroField`), колбеки, передані через параметри (`spawnWorker`, `readContext`), обробники `onClick`. Кожного кандидата перевірив grep по `src/ server/ scripts/ workers/`; тести й скрипти рахував як використання. Підтверджено:

| Що | Де | Доказ | Зусилля |
|---|---|---|---|
| `readPersonalProfiles` | `server/trainer/personal-profiles.mjs:40` | експорт, 0 імпортів у всьому репо | S |
| `clearError` у сесії | `src/services/trainerSession.js:305` | 0 викликів | S |
| поле `cleanup_jobs.attempts` | `turn-store.mjs:84,660-664` | лише запис, жодного читання | S (або використати, див. H4) |
| гілки `draft.state === "saved"` у `DraftCard` | `TrainerChat.js:111,131,296,301-308` і `"saved"` у `frozen` на `100` | ранній `return` на `81-99` для `saved` | S |
| `statuses.failed`, `statuses.cancelled` | `TrainerChat.js:51-52` | читаються лише на `1167` усередині `activeTurn` (queued/running/unknown/cleanup_pending) | S |
| поле `compact` у стрічці | `src/services/trainerTimeline.js:12` | UI не читає, є лише в тесті | S |
| поле `nativeInputClaimed` | `personal-backend.mjs:130-134` | клієнт не читає (0), лише тести й фікстури; коштує одне читання outbox на кожен `/state` | S |
| `'request_failed'` у `trainerFeedback` | `trainerApi.js:57-58` | такого коду ніхто не кидає | S |
| `onSearch={() => {}}` | `TrainerChat.js:243` | порожній колбек | S |
| модуль `curated-pack.mjs` (63 рядки) | `server/trainer/curated-pack.mjs` | імпортується лише власним тестом `curated-pack.test.mjs` | S (видалити разом із тестом, якщо інструмент оператора не потрібен) |

Після релізу 1.9.6 стане зайвим: Python `TOOL_ERRORS` (`hermes_personal_ipc.py:11-12`) і 11 кодів інструментів у `internal-process.mjs:10-11`. Відтепер ці коди приходять як результат, а не як помилка; виняток лише `day_unavailable`.

Не мертві, але `export` зайвий (використовуються лише у своєму файлі): `kyivDate`, `shiftDate`, `verifyNativeSource`, `modelReservation`, `historyEnvelope`, `trainerPaths`, `PLAN_COLUMNS`, `verifyLauncherSocket`, `LOOKUP_COLUMNS`, `readPersonalProtected`, `validNullableQuantity`, `validKnownNutrients`, `activeFoodNotes`, `SOURCE_LABELS`, `SCALE_THRESHOLDS`, `MAX_CONNECTION_REVISION`.

### Старий шлях v2: не мертвий формально, але в проді не працює (потрібне рішення Юрія)
- Модулі, досяжні лише від `server/runtime.mjs` (граф імпортів): `server/ledger.mjs` (57), `server/runtime.mjs` (63), `trainer/context-store.mjs` (149), `trainer/hermes-native.mjs` (578), `trainer/linux-isolation.mjs` (93), `trainer/model-proxy.mjs` (328), `trainer/runtime.mjs` (207), разом близько 1500 рядків JS. До них додаються `hermes_worker.py` (320) і `hermes_privacy.py`, а в `turn-store.mjs` таблиці й методи `leases`, `call_receipts`, `issueLease`, `consumeLease`, `recordCall` (`turn-store.mjs:498-562`), які викликають лише `model-proxy.mjs` і `hermes-native.mjs`.
- Персональний режим передає в бекенд аргументи, які використовує лише v2: `gateway.mjs:144-149` (`onWorkerExit`, `issueLease`, `assertDraftCompletion`, `modelCall`) і заглушку `proxy: { cancel() {}, close() {} }` (`trainer/personal-runtime.mjs:170`).
- `tool-errors.mjs` до цього списку не входить: у 1.9.6 його підключено до `personal-backend.mjs`.
- Чому не мертвий: на нього посилається `main.mjs:13-15`, і його покривають тести. Можливо, це запасний шлях без Hermes.
- Зусилля: L. Видалення спростить `gateway.mjs` і `turn-store.mjs` приблизно на третину.

## Слабкий і складний код

### Найскладніші функції (codeindexer, когнітивна складність)
- Сервер: `createPersonalDesktopEndpoint` 340 (`personal-desktop-endpoint.mjs:21-342`), `createTrainerGateway` 218 (`gateway.mjs:33-454`), `openTurnStore` 218 (`turn-store.mjs:19-695`), `createPersonalCoordinator` 186 (`personal-coordinator.mjs:16-404`), `patchDraft` 118 (`drafts.mjs:68-236`), `openPersonalStore` 110, `createInternalProcess` 107, `createPersonalPayer` 97.
- Клієнт: `TrainerChat` 321 (`TrainerChat.js:327-1372`), `VoiceInputModal` 264, `ClientApp` 211, `commitMealDay` 208, `createTrainerSession` 107, `TrainerPhoto` 93, `DraftCard` 59.
- `refactor_candidates` і `tech_debt_report`: три «god-модулі» (`TrainerChat.js`, `VoiceInputModal.js`, `ClientApp.js`); найбільше виправлень (4 bug-fix коміти) зібрав `ClientApp.js`.
- `audit_project` (summary): оцінка F, але це евристика. Знахідки `sk-ant-` і `SG.` хибні: це regex-перевірки формату ключів і синтетичні значення в тестах, а не секрети.

### Конкретні слабкі місця
1. **Тайм-аут будь-якого IPC-запиту вбиває весь Native-процес.**
   - Статус: підтверджено в коді; що Python-цикл справді блокується понад 5 с під час ходу, лише підозра.
   - Де: `internal-process.mjs:90` (`setTimeout(fault, timeoutMs)`, де `fault` вбиває дочірній процес) і `52-53` для колбеків. Читання пам'яті й фото мають `timeoutMs: 5000` (`personal-coordinator.mjs:292,298`), а коментар на `290-291` («Abandoning a read must not kill an authority executing a model turn») правдивий лише для signal, але не для тайм-ауту. У Python `contextRead` і `photoRead` синхронні всередині asyncio (`hermes_personal_worker.py:55-60`).
   - Наслідок: якщо цикл owner зайнятий понад 5 с, фонове опитування `/state` обірве хід, що виконується, і хід стане `unknown`.
2. **`gateway.mjs:110-179` (`execute`).** Ознаку «невідомого» результату обчислено тричі (`161-170`); `store.complete` (`160`) у тому самому `try`, тому детермінована помилка запису (`invalid_response`, `history_conflict`, `turn-store.mjs:571-589`) перетворює вже відомий результат на `unknown`. «Перевірити результат» (`gateway.mjs:422-424`) повторює ту саму помилку, тож хід застрягає до «Зупинити й повернути текст». Підтверджено; дуже рідко.
3. **`gateway.mjs:216-435`:** маршрутизація одним ланцюжком `if` з регулярними виразами. Перевірка тіла (`Object.keys(body).some(...)`) повторюється 6 разів у різному вигляді.
4. **`TrainerChat.js`:** 1372 рядки, 16 `useState` і 23 `useRef`. Захисти `epoch`/`generation`/`alive` повторюються в кожній дії (`current(generation)` 28 разів). Будь-яка нова дія легко забуває одну з перевірок.
5. **`personal-coordinator.mjs:162-168`:** перезапуск обох процесів на будь-яку помилку, навіть на ту, що сталася до відправки (наприклад, `day_unavailable` у `prepare`). Це і є першопричина H2.

### Тайм-аути й ліміти між шарами

| Шар | Значення | Де |
|---|---|---|
| Клієнт: HTTP-запит | 15 000 мс | `trainerApi.js:69` |
| Клієнт: опитування `/state` | 2 500 мс | `TrainerChat.js:477-479` |
| Клієнт: термін тимчасового фото | 300 000 мс, у 3 місцях | `trainerSession.js:37`, `TrainerChat.js:881`, `limits.mjs:18` |
| HTTP API: дедлайн запиту | 65 000 мс | `api.mjs:34,88-92` |
| HTTP API: одночасні запити | 2 на весь сервер | `api.mjs:79`, `server/personal-runtime.mjs:29` |
| Читання, stop, status у шлюзі | 5 000 мс | `deadline.mjs:24`, `gateway.mjs:60,68,73,121,254,258,295,353,404,414` |
| Транзакція Firestore | 5 000 + rollback 2 000 мс | `firestore-reader.mjs:110-112,159-164` |
| Обмін токена Firebase | 5 000 мс | `firebase-sessions.mjs:43` |
| Хід (слот черги) | 90 000 мс | `personal-limits.mjs:8`, `personal-coordinator.mjs:188`, `personal-queue.mjs:26` |
| Вікно черги | 225 000 мс | `personal-limits.mjs:10`, `turn-store.mjs:361` |
| IPC-запит без `timeoutMs` | 90 000 мс, тайм-аут вбиває процес | `internal-process.mjs:19,84-95` |
| Python `peer.ask` | 90 с | `hermes_personal_ipc.py:79` |
| Native `max_turns` | 8 у Python і окремий літерал 8 для Desktop | `hermes_personal_owner.py:38`, `personal-desktop-endpoint.mjs:225` |
| POST на хід | 12 у Node і літерал 12 у Python | `personal-limits.mjs:7`, `hermes_personal_egress.py:234-235` |
| Черга очікування | 4, у трьох місцях | `personal-limits.mjs:9`, `personal-queue.mjs:8-10`, `server/personal-runtime.mjs:20` |

Суперечності:
- **Скасування:** 5 с на фізичний вихід двох процесів, холодний старт owner і Native-скасування (H3).
- **`/state`:** 5 с на холодний старт; `history` без межі (90 с) при клієнтських 15 с і серверних 65 с, а HTTP-слот тим часом зайнятий (H2, M3).
- **«Перевірити результат»:** `status` 5 с + `verifyTurn` (5 с на кожен доказ дня + 5 с контекст) може перевищити клієнтські 15 с (`gateway.mjs:61-71,414-424`). Підозра.
- **«Запам'ятати» і видалення фото:** ідуть через `queue.run` і чекають до 90 с за чужим ходом, а клієнт здається на 15 с (`personal-coordinator.mjs:302-318`). Людина бачить «Обробка триває надто довго. Чернетка залишилась.».
- **`max_turns 8` × затримка моделі проти 90 с:** підозра, треба подивитися реальні тривалості. `hermes-config.json` з `max_turns: 4` належить старому шляху v2, тому з персональним не суперечить.

## Що спростити

1. **Один каталог помилок.** M. Зараз існує 10 незалежних списків:
   - `api.mjs:124` `publicErrors`;
   - `trainerApi.js:3-51`;
   - `voiceApi.js:7-34`;
   - `internal-process.mjs:6-11`;
   - `hermes_personal_worker.py:14-17`;
   - `hermes_personal_provider.py:12-13`;
   - `hermes_personal_payer_worker.py:13`;
   - `personal-payer.mjs:5`;
   - `hermes_personal_ipc.py:11-12`;
   - `tool-errors.mjs` hints.

   Запропоновано один `server/trainer/error-codes.json` з полями `{code, httpStatus, public, uiText, modelHint}`. Node імпортує його, Python читає `json.load` при імпорті. Додати контрактний тест: кожен код із `fail()/Error()/RuntimeError()` має запис у каталозі, а кожен публічний код має український текст. Це прибирає H1, M5, L1, L3 як клас.
2. **HTTP-шар без білого списку.** S. Пропускати статичний код і статус (`/^[a-z_]{1,60}$/`), а сирі повідомлення від сторонніх бібліотек приховувати.
3. **`/state` не повинен падати через пам'ять або історію.** S-M. Помилку `contextValue` ловити, `history` обмежити 5 с і повертати останню відому історію з позначкою «оновлюється».
4. **Спільні константи для клієнта й сервера.** S.
   - `FROZEN_DRAFT_STATES = ["saving","unknown","saved"]` зараз є приблизно в 9 місцях: `drafts.mjs:28,332,409,476`; `turn-store.mjs:244,297`; `TrainerChat.js:100,930`; `trainerTimeline.js:12`.
   - Ключі свіжості дня (`day-snapshot.mjs:33` і копія в `TrainerChat.js:571`): винести `sameFreshness` у `src/services` і використовувати на обох боках. `day-snapshot.mjs` уже імпортує модулі з `src/services`.
   - Ліміти (8000, 300000, 12, 8, 90000, 4) тримати в одному JSON для Node і Python.
5. **SQL перевірки дати чернетки:** одна функція замість копій у `drafts.mjs:310,330,403` (у 1.9.6 додалась ще одна). S.
6. **Скасування як фонова задача** (H3): відповідь одразу, Native-скасування доводить задача прибирання. M.
7. **Блокувати прев'ю на час ходу** (M2): прибирає цілий клас конфліктів чернеток. S.
8. **Розбити `TrainerChat.js`:** `DraftCard.js`, хук `useTrainerVoice`, хук `usePreviewDays`, `TrainerComposer.js`. Захист `epoch/generation` загорнути в одну обгортку `guarded(fn)`. M-L.
9. **Таблиця маршрутів у `gateway.mjs`** з декларативною перевіркою тіла замість ланцюжка `if`. M.
10. **Старий шлях v2:** видалити або винести в окрему гілку після рішення Юрія. L.

## Що перевірити на живому сервері

Лише читання, без змін на сервері:

1. **Холодний старт owner.** Журнал сервісу: скільки часу минає між завершенням невдалого ходу (`retire`) і готовністю нового owner. Якщо понад 5 с, H2 підтверджено.
2. **Частота 504/429.** Журнал проксі або API: кількість `504 upstream_timeout` на `/meal-api/trainer/state` після невдалих ходів і кількість `429 rate_limited`.
3. **Тривалість скасування.** Скільки триває `POST /turns/:id/cancel` і чи повертає він 504 (H3).
4. **Застряглі записи (лише SELECT).** Таблиці `cleanup_jobs` (`attempts`, вік), `turns WHERE state='unknown'` і рядки outbox у стані `unknown/dispatching` (H3, H4).
5. **Приховані причини збоїв.** Файл `last-payer-failure.json` (лише коди й етапи): як часто були `connection_auth_required` і `trainer_quota`, які користувач бачив як `trainer_failed` (M1).
6. **Тривалість ходів і кількість POST** проти меж 90 с, 12 POST і `max_turns 8`.
7. **Що віддає OLS, коли API лежить:** тип вмісту й статус (M4).
8. **Затримка `contextRead` під час ходу:** чи блокується Python-цикл owner, поки працює модель (пункт 1 «Слабкого коду»).
