# Персональний Desktop transport SciSense

Дата: 2026-10-26. HERMES-PERSONAL-01, Goal objective_e45aa8ac1aa3, G02/G04/G05/G06/G07/G08/G11. Компонент не активований у production. Actual Electron text acceptance пройдено зі справжнім Native; UI photo chooser та exact replay після закриття клієнта теж пройдені. Endpoint unit тести й незалежне рев’ю не замінюють ці сценарії.

## Маршрут

Окремий UID-bound Unix endpoint за SSH forwarding. Дві фіксовані WS lanes і одна serialized REST lane на UID; закриття viewer не завершує admitted turn. Body/profile/path не можуть вибрати іншого користувача. Власний Bot Chat, історія й limited info читаються з єдиної native authority. Усі нові повідомлення проходять звичайний App Gateway: durable admission, початкова дата, свіжа добова звірка, preview та одна «Додати». Повтор сталого input читає квитанцію без повторного inference.

Native profile/session IDs лишаються справжніми. Назва для Desktop є advertised default, внутрішній HOME не представляється Git-проєктом. Необов’язкові відсутні HTTP маршрути повертають штатний404, native RPC повертає method-not-found; файли/термінал/cron/relay не відкриваються. Вибір фінансованої моделі доступний лише funding owner через вже перевірений native model control.

## Межі

- HTTP token у header, WS у secret subprotocol; URL token/ticket відхиляються. Окремі credentials desktop-y/w, клієнтська реальна конфігурація лише через зашифроване native сховище.
- WS frame ≤8MiB, ≤32 незавершених RPC на socket, ≤16MiB aggregate RPC bytes на endpoint. REST serialized≤16. Модельні обмеження1 active /4 waiting /45s /3POST не змінені.
- До двох raw фото по5MiB. RAM staging має монотонний deadline295s та sweep5s; переведення годинника не подовжує TTL. Після admission видаляється лише exact upload entry.
- Читання фото дозволяє лише own retained native prefix й валідний відносний ref через core.photo. Немає Node filesystem read за клієнтським path. Видалене фото повертає явний placeholder «Фото недоступне» й missing=true.
- Rejected/malformed/half-open upgrades не займають viewer і не блокують close. Усі власні raw sockets прибираються.

## Очищення pathname

Node/libuv сам видаляє bind pathname на close раніше за JavaScript inode check. Перевірено regression зі заміною public socket на файл.

| Варіант | За | Проти |
|---|---|---|
| Перевіряти inode після звичайного bind | Мало коду | Запізно: libuv уже видалив replacement |
| Переданий systemd socket FD | Не має auto-unlink Node; стандартний Linux маршрут | Додаткові FD units/протокол, окрема реалізація для Mac QA |
| Private generation bind + public hard link | Та сама реалізація Mac/Linux, public alias видаляється лише за exact inode/dev | Потрібна перевірка AF_UNIX hard link на платформі й cleanup приватного каталогу |

Обрано private generation bind. Каталог має0700, inode socket0660 з dedicated GID. Public link створюється атомарно без overwrite. libuv видаляє лише private bind; public replacement лишається. У разі EEXIST новий listener не чіпає попередній. Mac real UDS connect та regression пройшли; Linux actual Native/systemd на b1b4d09 пройшов CI доB1.

## Доказ і межа

Endpoint / runtime / V3:29 targeted Node tests PASS. Свіжий desktop_wire_review: три findings (1P1/2P2) закриті після відтворень; додаткові регресії та diff-check PASS. Actual Native WS до фінальних UI уточнень:35 checks,9 guarded processes,7 fake POST,0 real API. Actual Electron показав спільну історію, власне повідомлення, відповідь та terminal event без unhandled errors:36 checks/9 guarded processes/7 fake POST, runner6f77ae4aa81d4769-mgwnst_j cleaned. [Доказ](../evidence/hermes-personal-desktop-wire-2026-10-26.json). Photo chooser, image.attach_bytes та exact повтор після закриття UI пройдені у run2a80bfb90b924016-ln2hjx02, cleanup_ok/removed=true;0 page errors,7 fake POST без дубля.

Поточна окрема Desktop збірка базується на bf0203/0.22.5, native authority на3f2afed. Патч на12 файлів і manifest у server/trainer/desktop.21 codec tests,3 MIME staging tests і clean isolated build PASS. Робочий Desktop та приватний профіль не змінені. B1/B2/B3, SSH cutover, міграція, телефон/Mac-off та owner acceptance ще не виконані.

Уточнення після повного photo-body тесту: первинний chooser receipt не доводив зображення в model body. Знайдено пропуск MIME у Desktop chip, виправлено за pinned native image.attach_bytes контрактом. Runner02e393d7592f44d6-3j4dfv_q:37 checks,1 image attachment у submit, image у двох POST фактичного Native SDK,7 fake POST загалом, повтор без дубля,0 real API; cleanup_ok/removed=true.
