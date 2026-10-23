# Виконання NTZG-DEPLOY-03: етапи 0+A+B

- Дата і час: 2026-10-22 22:50 Europe/Kyiv
- IDE / агент: Codex desktop
- Модель: GPT-6
- Chat ID: 01a1585d-ba1e-7da0-a174-903bee0573b3

## Ціль

Виконати прямо погоджені Юрієм етапи 0+A+B NTZG-DEPLOY-03 і перенести журнал 2146 у main. Модельні ключі, $5 та етап C лишаються замороженими. Goal objective_e45aa8ac1aa3, G04/G05/G07/G08/G11.

## Що зроблено

- Exact journal2146 перенесено PR24, main5a6f335ab7e92dd038b00bf0ff4e557034ed8e5a. Єдиний файл, source/main blob6c30dcf19596586029c25c927173e5be712419bc; CI39841087154/39841073997 успішні. Продукт PR8/16 не злитий.
- Node24.22.1: pins/engines/три Linux fixtures та чинні операційні інструкції. Офіційні SHA x64/arm64 перевірено. Системний Node Mac не змінено.
- Точкові dependency patches у поточних major; TailwindCDN замінено локальним exactv3 CSS. Audit99→90 entries, critical3→0; усі залишки класифіковано у docs/DEPENDENCY-AUDIT.md та повному JSON. Browser bundle intersection із залишками0.
- Незалежний Codex перевірив фінальний код етапу 0; зауваження про CDN, повторний PostCSS pass та приватний інвентар враховано. Обидва CI нового SHA bad8217 пройдено, новий пакет перевірено незалежно.
- ACCESS-01 adapter перевірений незалежним Codex; виправлено конкурентний POST, HTTP body limit і загальний timeout. Криптографічний selftest пройдено без секретів/мережі. Тимчасовий окремий адміністратор створений і provisioned; його ID/ключі/інвентар лише приватно, секрети в Keychain. Погоджений read-only preflight пройдено; результати інвентаризації збережено лише в приватному runtime. Встановлення ще не виконано.

- Інцидент локального Firebase CLI: команда перевірки облікового запису помилково вивела OAuth-токени в результат інструмента. Значення не копіювалися у файли чи Git. Авторизацію відкликано через logout; видалення активних CLI credentials перевірено. Юрія повідомлено та запрошено повторно увійти. Після повторного входу під правильним акаунтом доступ до цільового проєкту підтверджено. Відфільтровані перевірки не виводять credentials. Модельні ключі не використовувалися.

## Змінені файли

.nvmrc, package.json/lock, README.md, server/*Dockerfile, server/linux/*Dockerfile, src/index.js, src/tailwind.css, tailwind.config.js, public/index.html, операційні docs, PROJECT-INFO.md, dependency evidence. Private access adapter/state/host pins не входять у Git.

## Команди / перевірки / тести

Node24.22.1: app123, Worker39, server47, phone-lab17, meal-store26, rules38 успішні. Actual Linux ARM systemd8/8, networknone, hostbinds0, cleanuptrue. Browser: voice-photo25, trainer7, phone-lab29; own runner/context/browser cleanuptrue. STT-only26/26, reservedMicros0, cleanuptrue; CI39844327152/39844316893 по3/3 PASS на exactbad8217. Новий пакет162файли, API8/8, externalfetch0, runtimeaudit0.

## Результат станом на 2026-10-23

0/A завершені; B опублікував https://ntzg.pp.ua з вимкненими модельними викликами. Вхід на справжньому телефоні та C ще не перевірені/не виконані. Production змінений лише у погодженому обсязі. G02–G11 pending; журнал2250 не перенесений у main. Нижчі датовані записи зберігають перебіг роботи, поточний стан визначає завершальний розділ.

## Наступні кроки

Юрій перевіряє Google-вхід на https://ntzg.pp.ua з телефона. Для голосу/фото окремо погоджується C: актуальні Free/ZDR, точний UID, безпечний receiver transport, перенесення чинного ledger і ключів без скидання витрат, контрольний сценарій. Усунення приватного інциденту конфігурації лишається відкритим. Журнал2250 переноситься в main лише після нового «так».

## Ризики / нотатки

Модельні ключі, $5, C та merge PR8/16 не дозволені цим виконанням. Тимчасовий admin B відкликаний і відсутній. API має Restart=no. Context7 був недоступний через місячну квоту; використані офіційні документи і код OLS/Firebase/Cloudflare. У публічних доказах немає приватного інвентарю або секретів.

## Уточнення після перевірок, 2026-10-22

Шифровані копії OLS основної конфігурації та фактичних include, а також Firebase config/rules/indexes перечитані й перевірені відновленням локально. Firebase read-only COUNT обмежений101, індивідуальних документів0. Перший ширший варіант не виконувався через auto-review; виправлений COUNT-only пройшов незалежні15 синтетичних сценаріїв і дозволений запуск. HTTP400 параметра pageSize у metadata indexes усунено звіркою зі встановленим Firebase CLI, без розширення доступу. Cloudflare має0 cache rules і0 cache response rules; доменний scope підтверджено. HTTP baseline трьох сусідніх сайтів200. Новий архів SHA2563626acf4fe6556318ef061a7ca96297f788d724d03d7b0351cdbaa20287559b9. installAllowed=false до решти A.

## Поточний блокер форми

Чернетка Blank Site створюється панеллю вже після доменного кроку Next. Поточний стан migration_init/filling,0%; фінальне підтвердження не натискалося. Для продовження потрібний No Database, оскільки дані в Firebase. Auto-review відхилив screenshot через видимий згенерований пароль у формі. Значення не копіювалося й не використовувалося; запропоновану серверну БД не створювати. Користувачу передано точну дію у формі, без фінального створення. Власні дві вкладки Cloudflare/xCloud залишені лише для продовження; старі вкладки користувача не закривалися. Тимчасовий admin відкликано, повторний status підтвердив present=false. Журнал2250 у main не переносився.


## Продовження форми, 2026-10-22 23:39 Europe/Kyiv

Юрій підтвердив No Database. Поточний правильний Chrome-профіль перевірено; вибір видно на знімку налаштувань і у фінальному підсумку. Deploy Script залишено порожнім; Next лише зберіг налаштування чернетки. API повторно підтвердив правильний сервер, title SciSense і migration_init/filling,0%. Кнопка Start не натискалася. До створення site user через UI запитано підтвердження конкретної дії згідно з політикою browser tool щодо нового SSH/SFTP-доступу. Це не повторне погодження 0/A/B і не дозвіл на C. Знімок без секретів збережено лише приватно. Попередній screenshot-блокер усунутий вибором No Database. Офіційні документи xCloud звірено; Context7 у цій сесії недоступний через місячну квоту. Журнал2250 у main не переносився; на проді застосунок ще не встановлений.


## Створення сайту та доступ B, 2026-10-22

Юрій прямо погодив Start і повернув правильне вікно Chrome на передній план. Після двох безпечних зупинок через зміну активного вікна натискання виконано один раз; xCloud завершив provisioned/100%, terminal=true, failedSteps0. No Database та порожній deploy script збережені. Panel застосувала свою конфігурацію в межах підтвердження Start. Disable OpenLiteSpeed Config Regeneration ввімкнено тільки для ntzg, success toast і reread після refresh підтвердили стан. Три сусіди HTTP200. Новий тимчасовий scisense-deploy має окремий ключ/ID/state/lock; адаптер незалежно перевірений як тотожний A, крім ізоляційних імен. Fresh preflight підтвердив відсутність app user/unit/paths та вільний порт8787. Після provision створено дві шифровані копії OLS, разом11файлів, локальний restore PASS; remote writes collector0. Cloudflare MCP OAuth invalid_client; наявний scoped token читає OriginCA metadata, але SSL settings403. Зміни прав/новий токен не робилися. Далі вузький reviewed installer із exact bad8217, TLS/proxy та rules fence. Адміністратора B відкликати наприкінці; C/keys/$5 frozen.


## Runtime, HTTPS і Firebase domain, 2026-10-23

2026-10-23: ізольований Node 24.22.1 та точний реліз bad8217 встановлені, усі 162 payload-хеші звірені. Базовий API працює лише на loopback, inferenceEnabled:false, сховище порожнє. Власний OLS proxy/TLS встановлений після перевірки конфігурації; виконано один reload, глобальний конфіг незмінний, три сусідні сайти HTTP200. Cloudflare Full (Strict) збережений і перечитаний після refresh, HTML/API no-store та DYNAMIC; невідомий API path повертає JSON404. Домен ntzg доданий у Firebase зі збереженням попередніх доменів. Публічно ще maintenance: для перевірки writer fence потрібна звичайна Google-сесія власника; rules і frontend ще не переключені. Ключі моделей, $5 і C залишаються заморожені. Докази: docs/evidence/ntzg-execution-2026-10-22.json та приватні квитанції операцій.

Перша конфігураційна проба OLS завершилася до reload і відновила обидва свої файли. Причина підтверджена офіційним httpvhost.cpp: root-owned vhRoot без явного user/group порушував UID/GID policy. Виправлено тільки власний vhost: user/group xcloud, root-owned payload залишився. Незалежний Codex перевірив completion helper, 19 синтетичних перевірок PASS; configtest і один reload успішні. Firebase domain helper пройшов незалежні 22 перевірки. Проба існуючого CLI OAuth для signInWithIdp повернула INVALID_IDP_RESPONSE; токен не збережено, права IAM не розширено. Готується локальний Google popup для реального користувацького токена. Context7 недоступний через місячну квоту, використані офіційні документи OLS/Firebase/Cloudflare. Тимчасовий доступ B ще активний і буде відкликаний наприкінці. Журнал2250 не перенесений у main.


## Публікація Firebase та frontend, завершення 2026-10-23

- Контрольний Google-вхід наявного власника виконаний через тимчасовий localhost bridge, без створення користувача, розширення IAM або читання особистих документів. Firebase SDK використовував in-memory persistence; власні auth-вкладки закриті, сервер bridge завершений, ID token видалений із Keychain і відсутність підтверджена.
- Нові Firestore rules опубліковані один раз, source SHA256 `5754a9bc9b410eae1355550821bd48029c4512152b801953167bc8c6e7ee8130`, release `cbb3e160-c0ed-4392-80f7-456e71023217`. Перша перевірка legacy full-set не пройшла; maintenance залишився, синтетичний документ прибраний. Повторна перевірка без записів rules пройшла два повні послідовні раунди з паузою 10 с: новий create/update дозволений, legacy merge/full-set HTTP403, дані після відмов незмінні. Остаточний cleanup підтверджений HTTP404. Причина першого відхилення не оголошується доведеною.
- Після fence public atomically переключений на build точного bad8217. Звірені всі 27 build-файлів. Браузер спершу отримував старий maintenance лише через Brotli: maintenance і build/index.html мали однакову секунду mtime. Офіційний код OLS v1.9.2 підтвердив перевірку стисненої копії за mtime. Змінено тільки mtime власного index.html, SHA256/owner/mode/inode збережені; identity/gzip/br тепер мають однаковий SHA256 `54e45d54ca601bba730e656a4eab9ff33b39f9b3160f32e9cecc3a6d97c5ad09`. Додаткових reload і global cache flush немає.
- Публічна перевірка HTTPS успішна: HTML/asset-manifest/CSS/JS точні, HTML/API no-store, static immutable, unknown API JSON404, службові шляхи HTTP403, HTTP перенаправляється на HTTPS. Мобільний headless 390×844: екран входу видимий, pageErrors0, failedOwnResources0, scrollWidth=viewportWidth=390, горизонтальна різниця0 px. Це не перевірка Google-входу з реального телефона. Власний профіль браузера прибраний.
- Незалежні рев’ю Codex: auth bridge (SDK transport, 23 transport guards, 20 HTTP guards та storage cases), rules publisher18, recheck9, frontend48, mtime29 синтетичних сценаріїв. Зауваження щодо невизначеного результату файлової операції і fsync враховані до запуску.
- Фінальні три сусідні сайти HTTP200. Admin B відкликаний; окремий fresh status підтвердив present:false. Власні Cloudflare/xCloud/auth-вкладки закриті, вкладки Юрія збережені. Зашифровані rollback backups залишені придатними до відновлення.
- Під час операційної перевірки стався окремий інцидент розкриття службової конфігурації в результаті інструмента. Юрія повідомлено, значення не копіювалися у файли чи Git; приватний опис збережений поза репозиторієм. Усунення/ротація не підтверджені, інцидент не закритий. Це відрізняється від попереднього OAuth-інциденту, для якого відкликання виконано.

PROJECT-INFO та evidence оновлені. Модельних ключів прочитано0, викликів0, витрат$5=0. Новий журнал2250 лише в codex/scisense-server-prep; main потребує окремого «так».

codeindexer 2026-10-23: оновлено 2 profile/constraint/live_api_approval, перечитано й експортовано; solutions0, картки0. Goal G02–G11 лишаються pending. У Git перенесено лише два відповідні profile-файли, без сторонніх змін бази.
