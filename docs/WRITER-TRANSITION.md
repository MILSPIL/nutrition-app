# Перехід записів Firestore

2026-10-22, NTZG-DEPLOY-02, Goal `objective_e45aa8ac1aa3`, G04/G05/G07/G11.

Звичайні записи профілю, їжі й замірів вимагають `writerVersion: 2` та нового UUID v4 `writerNonce`. На update rules перевіряють також зміну nonce через `affectedKeys`. Старий merge бачить у результуючому документі вже наявну версію, тому однієї версії недостатньо. Бар’єр стосується перевірених старих клієнтів; довільний код авторизованого власника може створити nonce сам.

| Варіант | За | Проти |
| --- | --- | --- |
| Лише версія | Мінімальні зміни | Старий merge успадковує версію |
| Час запиту зі зміною timestamp | Відсікає старі payload | Можлива відмова двох оновлень в одну мілісекунду |
| Новий nonce | Немає залежності від часу або міграції | Треба позначати кожен writer; це не захист від довільного коду власника |

Обрано nonce: старі клієнти формують явний payload і не змінюють цей маркер. Позначку генерують перед callback транзакції, вона не входить у hash команди або submissionMarkers. Підтверджений повтор не виконує новий запис. `updatedAt` та порядок списків не змінюються.

Охоплено створення/відновлення профілю в ClientApp, транзакції дня і налаштувань у mealStore, збереження замірів. G04 request/accept/disconnect/legacyClear лишаються окремим протоколом. Display roster тренера не є дозволом на читання, його старі записи цей бар’єр не блокує. Невикористовуваний `AuthContext.updateUserRole` як і раніше відхиляється rules; права на роль не розширюються.

## Перевірений перехід

| Rules | Старий звичайний запис | Новий запис |
| --- | --- | --- |
| Історичні 96a1a5f | Проходить, може стерти markers дня | Проходить |
| Перед бар’єром 1df0f4f | Проходить | Новий root nonce відхиляється whitelist |
| Новий бар’єр | Відхиляється без серверної зміни | Проходить, legacy-дані оновлюються поступово |

Fixtures `scripts/fixtures/writer-transition/*.rules` є точними копіями цих двох Git-ревізій. Відкат залишає новий бар’єр і ledger/дані. Припустимий сумісний frontend або тимчасово недоступний запис. Повернення старих rules знову дозволяє стирання markers і не є безпечним відкатом.

Після окремого дозволу на production: нові rules, перевірка бар’єра старим клієнтом, потім новий frontend. До оновлення frontend його старі вкладки матимуть відмову збереження. Поширення rules і активні listeners перевіряються окремо; успішний deploy сам по собі цього не доводить. Старі документи не переписуються масово та залишаються читабельними за G04.

## Докази

- `npm run test:rules`: 38/38, включно з 29 чинними G04 та 9 новими сценаріями. Перевірено старий merge після нового stamp, повний set дня, malformed/reused/deleted nonce, batch без stamp на одному документі, listeners, історичні rules й дві навмисні мутації правил.
- До виправлення 8 із 9 нових сценаріїв падали. Відмови root create тепер перевіряються під власним UID, malformed stamp не підмінюється відмовою через trainer fields.
- `npm run test:meal-store`: 26 перевірок реальних сервісів. Конкурентні append, duplicate без нового запису, conflict, паралельні налаштування, безstamp legacy root/day, збереження їжі/metadata.
- Застосунок: 123 тести; production-збірка `/meal-api` успішна.
- Незалежний Codex writer_transition_review: PASS після двох виправлень тестів і додавання справжніх legacy fixtures. Production не змінено.

Context7 недоступний через місячну квоту. Семантику звірено з офіційними [rules fields](https://firebase.google.com/docs/firestore/security/rules-fields), [listeners](https://firebase.google.com/docs/firestore/query-data/listen), [REQUEST_TIME](https://firebase.google.com/docs/firestore/reference/rest/v1/Write#ServerValue) та [поширенням rules](https://firebase.google.com/docs/firestore/security/get-started).
