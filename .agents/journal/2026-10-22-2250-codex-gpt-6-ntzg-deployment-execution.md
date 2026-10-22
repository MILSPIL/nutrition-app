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

## Результат

Етап0 завершено, A інвентар і backups перевірено, B створив порожній managed site; встановлення застосунку попереду, C не дозволений. G02–G11 pending. Живих модельних викликів0, читання модельних ключів0, витрати$5=0. Production-зміни: тимчасовий адміністративний доступ, Blank Site та збереження власної OLS-конфігурації у панелі. Застосунок, OLS, TLS і Firebase ще не опубліковані.

## Наступні кроки

Завершити перевірку підтримуваного xCloud scope і збереження OLS-конфігурації, потім scoped B з disabled API за планом. Попередній тимчасовий користувач уже відкликаний; для наступної операції потрібний новий облік власного тимчасового доступу, без повторного використання старого create-state.

## Ризики / нотатки

Новий журнал2250 потребує окремого «так» для main. B не дозволено до закриття передумов. Unbounded sudo/root SSH, зміна чужих сайтів, модельні keys/ledger/$5 та mergePR8/16 не дозволені. Context7 quota exhausted, використано офіційні документи й код. Remote preflight має затверджений незмінний hash; повне внутрішнє буферування фіксованих trusted команд є відомим обмеженням.

## Уточнення після перевірок, 2026-10-22

Шифровані копії OLS основної конфігурації та фактичних include, а також Firebase config/rules/indexes перечитані й перевірені відновленням локально. Firebase read-only COUNT обмежений101, індивідуальних документів0. Перший ширший варіант не виконувався через auto-review; виправлений COUNT-only пройшов незалежні15 синтетичних сценаріїв і дозволений запуск. HTTP400 параметра pageSize у metadata indexes усунено звіркою зі встановленим Firebase CLI, без розширення доступу. Cloudflare має0 cache rules і0 cache response rules; доменний scope підтверджено. HTTP baseline трьох сусідніх сайтів200. Новий архів SHA2563626acf4fe6556318ef061a7ca96297f788d724d03d7b0351cdbaa20287559b9. installAllowed=false до решти A.

## Поточний блокер форми

Чернетка Blank Site створюється панеллю вже після доменного кроку Next. Поточний стан migration_init/filling,0%; фінальне підтвердження не натискалося. Для продовження потрібний No Database, оскільки дані в Firebase. Auto-review відхилив screenshot через видимий згенерований пароль у формі. Значення не копіювалося й не використовувалося; запропоновану серверну БД не створювати. Користувачу передано точну дію у формі, без фінального створення. Власні дві вкладки Cloudflare/xCloud залишені лише для продовження; старі вкладки користувача не закривалися. Тимчасовий admin відкликано, повторний status підтвердив present=false. Журнал2250 у main не переносився.


## Продовження форми, 2026-10-22 23:39 Europe/Kyiv

Юрій підтвердив No Database. Поточний правильний Chrome-профіль перевірено; вибір видно на знімку налаштувань і у фінальному підсумку. Deploy Script залишено порожнім; Next лише зберіг налаштування чернетки. API повторно підтвердив правильний сервер, title SciSense і migration_init/filling,0%. Кнопка Start не натискалася. До створення site user через UI запитано підтвердження конкретної дії згідно з політикою browser tool щодо нового SSH/SFTP-доступу. Це не повторне погодження 0/A/B і не дозвіл на C. Знімок без секретів збережено лише приватно. Попередній screenshot-блокер усунутий вибором No Database. Офіційні документи xCloud звірено; Context7 у цій сесії недоступний через місячну квоту. Журнал2250 у main не переносився; на проді застосунок ще не встановлений.


## Створення сайту та доступ B, 2026-10-22

Юрій прямо погодив Start і повернув правильне вікно Chrome на передній план. Після двох безпечних зупинок через зміну активного вікна натискання виконано один раз; xCloud завершив provisioned/100%, terminal=true, failedSteps0. No Database та порожній deploy script збережені. Panel застосувала свою конфігурацію в межах підтвердження Start. Disable OpenLiteSpeed Config Regeneration ввімкнено тільки для ntzg, success toast і reread після refresh підтвердили стан. Три сусіди HTTP200. Новий тимчасовий scisense-deploy має окремий ключ/ID/state/lock; адаптер незалежно перевірений як тотожний A, крім ізоляційних імен. Fresh preflight підтвердив відсутність app user/unit/paths та вільний порт8787. Після provision створено дві шифровані копії OLS, разом11файлів, локальний restore PASS; remote writes collector0. Cloudflare MCP OAuth invalid_client; наявний scoped token читає OriginCA metadata, але SSL settings403. Зміни прав/новий токен не робилися. Далі вузький reviewed installer із exact bad8217, TLS/proxy та rules fence. Адміністратора B відкликати наприкінці; C/keys/$5 frozen.
