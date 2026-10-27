# Залежності релізу ntzg.pp.ua

2026-10-22, NTZG-DEPLOY-03, етап 0. Goal `objective_e45aa8ac1aa3`, G07/G08. [Повний перелік усіх пакетів, установлених версій і GHSA](evidence/ntzg-stage0-dependencies-2026-10-22.json). Висновок стосується готового статичного frontend та окремо упакованого Node API.

## Виправлення

- Node 24.22.1 у `.nvmrc`, engines і трьох Linux fixtures; SHA256 офіційних x64/arm64 archives перевірено. [Security release](https://nodejs.org/en/blog/release/v24.22.1).
- React Router 7.18.4 у межах major 7; proxy-addr 2.0.8, shell-quote 1.12.0, websocket-driver 0.7.5 у поточних діапазонах залежностей. Останні три пакети прибрали всі critical entries. Нових маршрутів або Framework/RSC/SSR не додано. [React Router changelog](https://reactrouter.com/7.18.4/changelog).
- Активний PostCSS 8.5.31, source-map-js 1.2.2, browserslist 4.29.4. Сам `GENERATE_SOURCEMAP=false` був недостатнім: css-minimizer повторно запускає PostCSS без `map:false` і міг читати sourceMappingURL. Оновлено активну major 8; старий PostCSS 7 лишився лише в неактивному Sass loader.
- Замість непінованого виконуваного Tailwind CDN: exact `tailwindcss 3.4.19`, `tailwind.config.js`, локальна збірка CSS перед App. Це та сама major 3, без зміни дизайну. Повні рядки класів усіх динамічних станів є у `src` і входять у content scan. [Офіційний спосіб збірки](https://v3.tailwindcss.com/docs/installation), [правила content scan](https://v3.tailwindcss.com/docs/content-configuration).

## Досяжність решти

Початковий audit: 99 package entries, із них 3 critical. Після точкових оновлень: **90 entries: 5 low, 11 moderate, 74 high, 0 critical**. Це 31 пакет із власними advisory та 59 транзитивних meta entries. У JSON кожен із 90 прив’язаний до конкретних leaf advisory і категорії. Нерозібраних записів немає.

Фактичний production webpack build на Node 24.22.1 містить 162 module records, 18 назв пакетів, включно з loader/HTML child records. Перетин із залишковими audit packages порожній. Firebase browser exports використовують webchannel; Node gRPC/protobuf у браузер не потрапляють. Runtime API імпортує власні модулі, Node built-ins і окремий `jose`; кореневий `node_modules` на сервер не передається. Для фінального пакета це повторно перевіряється за manifest.

| Категорія | Пакети з власними advisory | Чому умови експлуатації відсутні в цьому релізі |
| --- | --- | --- |
| Активні інструменти збірки з фіксованим входом | `@babel/core`, `brace-expansion`, `braces`, `colord`, `fast-uri`, `js-yaml`, `postcss-selector-parser`, `serialize-javascript`, `sprintf-js`, `svgo`, `underscore`, `yaml` | Компілюють перевірені файли та сталі конфігурації/glob/схеми/параметри. До них не надходять їжа, фото, URL або завантажені користувачем CSS/SVG. SVG у CSS, sourceMappingURL та зовнішні конфігурації відсутні. Серіалізація мініфікатора отримує сталі опції, не чужі RegExp/Date objects. Це обґрунтування конкретних входів, а не загальне виключення build-залежностей з аудиту. |
| Неактивні build-функції | `@babel/plugin-transform-modules-systemjs`, `nth-check`, nested `postcss 7.0.39` | SystemJS transform не налаштований; SVG React-імпортів немає; Sass/resolve-url-loader не використовується. Workbox InjectManifest не створюється без src/service-worker. Залежні meta entries мають ті самі обмеження. |
| Лише Node SDK у локальних тестах | `@grpc/grpc-js`, `@protobufjs/utf8`, `protobufjs` | Локальні Firebase emulator tests. Browser export Firestore і серверний HTTP API цих пакетів не імпортують. |
| Dev server або тестове середовище | `@tootallnate/once`, `body-parser`, `compression`, `follow-redirects`, `form-data`, `http-proxy-middleware`, `launch-editor`, `node-forge`, `qs`, `uuid`, `webpack-dev-middleware`, `webpack-dev-server`, `ws` | CRA dev server/Jest/редактор/неімпортована Realtime Database. Production обслуговує готові файли через OLS та власний `node:http`, без Express, SockJS або запуску npm на сервері. |

`braces 3.0.3` не має виправленої версії в поточній major на дату перевірки. Його вхід обмежено перевіреними glob проєкту. `npm audit fix --force` і рекомендація видалити CRA через `react-scripts 0.0.0` не застосовувалися. Dev server не дозволено відкривати назовні. Якщо з’явиться компіляція користувацьких файлів, SSR/RSC, Sass, SVG import або нові залежності, відповідні висновки треба перевірити заново.

## Доказ і межа

Audit JSON отриманий npm registry; installed paths і versions звірені з lockfile. Склад webpack отримано з `stats.toJson`, а не лише пошуком рядків у minified JS. Локальні tests, Linux/systemd, browser flows, фінальний SHA/CI та SHA256 архіву записуються окремо. Попереднє незалежне рев’ю Codex підтвердило reachability і звернуло увагу на Tailwind CDN та повторний PostCSS pass; обидва зауваження враховано.

Context7 недоступний через вичерпану місячну квоту. Використано офіційні Node/Tailwind/React Router документи, npm registry advisories та встановлений код CRA/PostCSS/Firebase. Цей документ не означає ввімкнення API або приймання продукту.
