# SciSense: готовність голосу на телефоні та виправлення першого екрана

Дата: 2026-10-23. ID `MORNING-READY-01`. Goal `objective_e45aa8ac1aa3`, G02/G04/G05/G06/G07/G08/G11.

## Погоджена межа

Юрій спочатку погодив специфікацію й план, потім прямо доручив самостійно виконати необхідні експерименти й довести голосове введення до придатного для ранкової проби стану. Це дозволяє реалізацію, потрібні серверні зміни та активацію C без повторних проміжних погоджень. Поповнення балансу не збільшує стелю застосунку: зберігається один спільний ліміт Anthropic $5, усі попередні витрати й резерви. Groq Free без платного перемикання, Sonnet залишається прямим Anthropic API. Публікація на ntzg у межах цього виправлення дозволена; main та злиття PR8/16 не потрібні.

## Специфікація

Проблема: перший телефонний екран показує квітневий v1.6.0 і старий домен, технічний SHA замість версії, порожні іконки. Голосова інфраструктура встановлена, але inference вимкнений. Поточний звіт готує Telegram-повідомлення старому тренеру; Юрій обрав майбутнього тренера в Hermes.

Мета: на ntzg доступні актуальний перший екран, справні іконки, звіт із прев’ю/копіюванням та авторизований голос + фото → редаговане прев’ю → одна «Додати», з API на сервері незалежно від Mac.

Зміст цієї ітерації (повний перелік):

1. Одна людська версія й відповідний опис реально доступних змін. Build SHA лишається технічним ідентифікатором, не заголовком для користувача. Показ новин прив’язаний до зміни release notes; повторний вхід не показує вже закриту версію. Помилка localStorage не ламає вхід.
2. Усі категорії використовують наявні локальні зображення. Відсутня картинка не псує рядок; автоматизована перевірка більше не дозволяє успадковані помилки іконок.
3. «Переглянути звіт», нейтральний заголовок і копіювання. Прибрати Telegram-поле/кнопку зі сценарію звіту. Копіювання має підтверджувати фактичний успіх, показувати відмову. Збережені trainer metadata та чинні права не видаляються; дата, порції й підсумки звіту незмінні. Hermes ще не підключений, жодних зовнішніх адрес/ботів не вигадувати.
4. Новий перевірений release із тим самим runtime/бюджетним контрактом, HTTPS, вузькими правами й одним UID власника. Перед зміною свіжі хеші/backup; атомарний власний docroot, без глобального OLS flush/reload, якщо конфігурація не змінюється.
5. Звірити Free/ZDR, поточні моделі/ціни. Чинний ledger переноситься без reset. Якщо ключова позначка або ledger відсутні, спочатку довести відсутність/історію; не створювати другий бюджет або підставляти синтетичний ledger. Дозволене первинне створення того самого пілоту лише після доведення, що він не існував і витрат не було.
6. Підтвердити receiver root transport до локального export. Використати точний вузький адміністративний адаптер через тимчасовий власний доступ; не додавати загальний root SSH, sudoers або нові IAM-права. Ключі тільки Keychain → пам’ять/stdin → systemd encrypted credentials.
7. Активація лише після збігу proposal/configHash/receipt/UID/release. Контрольні API-проби використовують синтетичні українське аудіо та етикетку. Кожна платна спроба в тому самому ledger, автоматичних повторів немає. Достатньо кількох обмежених проб; при квоті очікування, не купівля тарифу.
8. Відкликати лише власний тимчасовий admin, видалити контрольний Auth token, закрити лише власні вкладки/браузерні профілі. Зберегти шифровані backups і журнал. Особисті записи/медіа та секрети не публікувати.

Не входить (повний перелік): створення Hermes-агента або автоматична передача звітів йому; зміна норм/персональної історії; видалення зв’язків тренера без встановленої потреби; глобальні серверні зміни; нові тарифи/поповнення; збільшення $5; автоматичне приймання пілоту; відновлення старих небезпечних Firestore rules.

Припущення (повний перелік): існуючий Google UID власника є дозволеним користувачем; звіт до появи Hermes передається вручну через копіювання; короткі синтетичні приклади достатні для технічної готовності, реальний телефон і 7-денний пілот приймає Юрій. Проєктний Goal не позначається завершеним. Попередній приватний інцидент Firebase не приховується й не оголошується усуненим.

## Критерії приймання й перевірки

| Код | Результат | Перевірка та очікування |
| --- | --- | --- |
| M01 | Актуальні новини й людська версія | Jest WelcomeModal і browser upgrade: перший показ, повторне відкриття, перехід із попереднього release зі збереженими даними та закритими новинами, перевірка service worker, зміна release, помилка storage; SHA не показаний як версія, текст збігається з release metadata |
| M02 | Усі іконки доступні | Перевірка кожного CATEGORY_ICONS локально та HTTP content-type/image decode; у браузері naturalWidth>0 для всіх категорій, failed images0 |
| M03 | Нейтральний звіт без Telegram | Jest/браузер: прев’ю тієї самої дати/порцій, clipboard resolve/reject, немає t.me/window.open або передачі Hermes |
| M04 | Придатний телефонний екран | Ізольований browser375/390/1366: немає overflow/JSerrors, числові межі іконок/рядків/кнопок узгоджені, screenshot і cleanup |
| M05 | Чинний бюджет і secrets незмінні за змістом | Синтетичні transfer/server suites; live receipt/hash/counts і всі попередні paid/free rows, consumedMicros та незакриті reservations збігаються, рівно один ledger cap5000000 мікродоларів ($5); конкурентний reserve, over-cap та невідомий upstream result зберігають cap; encrypted credentials, немає plaintext у Git/argv/logs |
| M06 | Авторизований live голос і фото | Опублікований UI записує синтетичний український звук через MediaRecorder (реальний браузерний MIME), викликає справжній API та поєднує фото в одній редагованій чернетці; продукт/кількість правильні; етикетка 53ккал/100г ×200г=106ккал, Б5.8/Ж5/В8; API health live, чужий/відсутній token відхилено, ключів у browser0 |
| M07 | Збереження не дублюється | Наявний browser full-flow/rules/meal-store на синтетичних даних: одна «Додати», reload дає один запис; live особисту історію не змінювати для тесту |
| M08 | Перевірена публікація й cleanup | Публічні release/index/assets hashes та всі encoding збігаються, сусіди200, контрольний health/auth запит після відкликання admin й зупинки локальних допоміжних процесів; own admin absent, transient secrets/tabs cleaned, статус/журнал/profiles запушені |

Перед кодом: /private/tmp/scisense-morning-baseline.json підтвердив 8 відсутніх -v4 файлів; live повертає HTTP200 із HTML замість зображень, stale welcome=true, Telegram transport=true. Початковий health inferenceEnabled=false. Це червоний базис M01/M02/M03/M06. M05/M07 є інваріантами з існуючими негативними transfer/правилами/конкурентними тестами; їх негативні сценарії повторити, не ламати production.

## План виконання

1. Спека і план, незалежна проба неоднозначностей та конкретний огляд C. Модель: Codex; ризик у межах дозволу, бюджету й секретів. Зміни продуктового коду лише після технічного рев’ю; рамкове доручення Юрія дозволяє самостійно усувати зауваження.
2. Окремий логічний коміт UI: version/release notes, іконки, звіт, вузькі регресійні тести й документація. Модель: Codex; локальна оборотна зміна без серверних дій. Незалежна перевірка дифа до публікації.
3. Коміт/CI точного SHA, fresh production bundle, hash inventory, мобільний QA та позначка версії окремо від SHA. Модель: Codex; фактичні артефакти й зовнішні перевірки.
4. Підготувати адресні C helpers після читання реального стану; синтетичні failure tests + незалежний review. Модель: Codex; дорогий ризик втрат бюджету/секретів. Новий власний тимчасовий доступ, жодного повтору завершених одноразових installer.
5. Встановити exact release, receiver-check → export/send або доведене перше створення → звірка → activation. Модель: Codex; кожна мутація має attempt state, backup, readback, невідомий результат тільки reconcile.
6. Live synthetic голос/фото та auth checks, сума витрат/резервів із ledger; браузерні помилки виправити локально й перевірити новий SHA перед повторною публікацією. Модель: Codex; не робити повтори без причини.
7. Cleanup, свіжий незалежний reviewer-rubric, статус/Goal/profiles/журнал, push; передати URL та чесні межі реального телефона/пілоту. Модель: Codex.

Відкат: UI на останній безпечний release; нові rules не відкочувати. Після C вимкнути тільки own API/live drop-in, не повертати старий ledger і не знімати локальну transfer-позначку. Документний коміт не змінює runtime SHA. Непідтверджений scope/платіж/невідновлюваний стан зупиняє лише залежну операцію, незалежна робота продовжується.

## Карта виконання та доказів

- URL https://ntzg.pp.ua, API https://ntzg.pp.ua/meal-api/health; сервіс scisense-api.service, loopback 127.0.0.1:8787. Дозволені серверні цілі: нова власна /opt/scisense/releases/<verified-SHA>, current/public symlinks, /var/lib/scisense, /var/lib/scisense-transfer, /etc/credstore.encrypted/scisense-{groq,anthropic}, /etc/scisense/activation.json, власний 50-live.conf. OLS/Firebase конфігурацію не змінювати для цієї ітерації.
- M01–M03: npm run test:ci; точні браузерні assertions у scripts/phone-lab-browser.mjs та scripts/voice-photo-browser.mjs. M04: ізольований scripts/browser-test.mjs і свіжий public-browser сценарій. M05: node --test server/*.test.mjs scripts/phone-lab/*.test.mjs, snapshot/counts/readback transfer. M06: окремий синтетичний public UI runner із справжнім Auth/API та ізольованим записом. M07: npm run test:rules і наявні browser meal-store assertions. M08: public HTTP hash/content-type/encodings, readback активного сервісу та cleanup receipt.
- Артефакти: публічний безсекретний docs/evidence/morning-phone-ready-2026-10-23.json; приватні операційні receipts у .agents/runtime/deployment/2026-10-23-morning/. Нові helpers мають точний SHA й свіжий review до запуску. Секрети та UID не записуються у публічні докази.
- Якщо чинний ledger не знайдений: перевірити marker canonical Keychain, tmp/phone-lab/pilot-budget.sqlite в усіх git worktrees, попередні transfer manifests/receipts, власну серверну state-теку, журнали фактичних Anthropic запусків та активні writers/lock. Лише узгоджена відсутність цих слідів дозволяє первинне створення бюджету; неоднозначність зупиняє тільки платну активацію.

Незалежна проба morning_spec_probe: 0 червоних і 4 жовті прогалини; усі внесено: реальний UI/MIME, повний бюджет, upgrade старого клієнта, конкретні цілі/після-cleanup перевірка. activation_readiness: 14/14 чистих validator checks, root receiver transport потрібен до export, stale workDirectory/import.lock перевіряється окремо. Наступне рев’ю Claude перевіряє уточнений план. Результати виконання заносити в evidence та журнал, не підмінювати їх цим планом.

## Уточнення активації після перевірки Claude

Це точний порядок C, не виконана активація. UI 1.7.0 можна випустити окремо з disabled API, якщо перевірка кабінету провайдера недоступна.

1. Перевірити фактичні Groq Free/ZDR, UID і чинні ціни. Заповнити source proposal status=approved_local_pilot, sttApproval approvedAt/freeTierConfirmedAt/zeroDataRetentionConfirmedAt, approvedAt=fullApproval.approvedAt=candidateC.PRICING_APPROVED_AT; full дата не раніше STT. Без справжніх підтверджень дати не ставити. Revision2/configHash і cap незмінні. Перед C ці metadata потрапляють в окремий перевірений source commit/release, якщо UI вже опублікований.
2. Пакувальник підставляє точний releaseId у disabled server/deployment.json до архівування; hash inventory містить саме упаковані байти. Git placeholder не розгортається. Майбутній приватний live overlay додає allowedUids і liveEnabled, має окремі before/after hashes, UID ніколи не комітиться.
3. До незворотного export підготувати й синтетично перевірити повний activation helper: approved proposal, копію receipt з active/approvedReleases/allowedUids/pricingConfirmedAt/sttApprovedAt, root:scisense0640 activation.json, точний 50-live.conf, validateActivation на фінальних трьох JSON, daemon-reload/start/readback. Receipt pending, ledger та anchor не перезаписуються активним receipt. Неправильні UID/SHA/hash/дати й частковий запис відхиляються.
4. Транспорт C: власний тимчасовий admin через pinned Paramiko SSH, фіксований sudo до Node receive-check/receive-status/receive. Пароль і transfer packet лише stdin, без TTY/agent forwarding. Новий root SSH/authorized_keys/ssh-agent/sudoers не потрібні. Спочатку перевірити root UID та status, зупинити лише scisense-api.service, довести loaded/inactive. Якщо failed, спочатку діагностика власної служби й явний reset-failed лише для неї після усунення причини. Отримати ready на exact installed SHA, status без lock/staging, тільки потім export/send.
5. Єдиний canonical sourceFile для доведеного первинного створення: /Users/user/.codex/worktrees/scisense-product-goal/nutrition-app/tmp/phone-lab/pilot-budget.sqlite. При наявному marker шлях береться з marker, а не з припущення. Звичайний CLI export не створює бюджет. Перший ledger готує окремий перевірений helper через prepareTransfer з явним дозволом fresh після повного доказу відсутності, під спільним lock. Не підставляти QA SQLite. Якщо будь-який слід історії суперечить нулю, цей шлях зупиняється.
6. Постійна transfer-позначка вимикає локальний live назавжди. До неї receiver і всі activation-артефакти мають бути готові. При втраті ack використовувати status і той самий receipt/bundle; не повторювати export/initialize, не очищати marker. Навіть failed activation не повертає локальний fallback.
7. Після ack звірити всі paid/free rows, cap5000000, consumed/reserved/receipt/anchor; activation manifest ставиться live останнім, потім daemon-reload/start. Відкат вимикає own live конфігурацію, але зберігає всі резерви й витрати, ciphertext та permanent marker. Звірити credentials owner/mode/path реального systemd, не покладатися лише на Docker.

Claude Fable5.1: 562423 tokens,620.5s,exit2 через одну відмову читання private baseline. Текст рев’ю доступний, але не є повним PASS. Root звірив кожну знахідку: 7 підтверджених (proposal, activation helper, stop, fresh init, permanent fence, білок5.8, durable baseline), 3 частково (пакувальник уже підставляєSHA; roottransport будеsudo, неrootSSH; історичні freeze потребують актуального покажчика). Вихідний baseline збережений у tracked evidence. Фактична активація pending; authenticated browser Maclocked.
