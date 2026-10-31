# План 1.9.10: зависле повідомлення не блокує тренера, межа 180 с, до 10 фото

Спека: `docs/superpowers/specs/2026-10-31-trainer-unblock-photos.md`. Гілка `claude/trainer-inactive-image-limit-ecb2b1` (база 1.9.9 `0ca1e96`). Червоне до коду: `f7a02b0`, `645f8ce`.
PR: у `claude/simple-logging-199` (над PR #53, щоб діф показував лише 1.9.10); після злиття 1.9.9 перенацілити на `codex/hermes-personal-server`.

## Кроки (1 крок = 1 коміт = точка відкату)

1. **Межа 10 фото на сервері** (S4): `LIMITS.images` у `limits.mjs`; `media.mjs:26`, `personal-desktop-endpoint.mjs:140,150`, `personal-desktop-adapter.mjs:46`, `model-proxy.mjs:83`, `hermes-native.mjs:192`; Python `MAX_IMAGES` у `hermes_personal_media.py:99`. Доказ: PH, PY (K8, K9, K19).
   Модель: Opus (головний цикл), бо механічна заміна однієї межі.
2. **Межа 180 с** (S10): `personal-limits.mjs`, `gateway.mjs:57`, `turn-store.mjs:25,361`, `internal-process.mjs:19,21`, `personal-desktop-adapter.mjs:85`, `hermes-personal-joint-fixture.mjs:96`, `hermes_personal_payer.py:174`, `hermes_worker_lock.py:37`, `worker-lock.c:33`, `hermes-personal-systemd-canary.py:69,71`, `hermes-personal-package.py:165`; тести з 90000 як межею. Доказ: DL, PY (K18, K9).
   Модель: Opus (головний цикл), бо механічно, але зачіпає політику і C; перевіряю кожне місце grep-ом до і після.
3. **Сервер знімає завислі** (S1, S2): `gateway.mjs` (`settleStalled`, `settleTask`, `applyNativeStatus`, `unknownGraceMs`, `settleStopMs`, `retryAt`, лічильник `native_missing`, таймер `maintain` → `settleStalled`, тестовий доступ `g.settleStalled`), `personal-backend.mjs:143-144` (`native_missing`). Доказ: GW (K1-K7); інсценування K7 (виклик з `recover()` → FAIL) і K2b (без try/catch → FAIL), вивід у спеку.
   Модель: Opus (головний цикл), бо нова логіка поверх готового дизайну Fable; після кроку обов'язкова друга думка Codex (`codex-review`) над серверним дифом кроків 1-3.
4. **Клієнт, API** (S3, S6): `trainerApi.js` тексти `trainer_no_reply`, `trainer_stop_retrying`; тайм-аут `send` з фото `15000 + 6000 × N`. Доказ: UI (K11, K12c).
   Модель: Opus, бо дрібна зміна.
5. **Браузерна перевірка** (S7): `scripts/trainer-chat-browser.mjs`, випадок «10 photos» на 375 px (прокрутка сторінки й панелі, один рядок, 80 px). Доказ: K13 у CI Linux; коміт цього кроку йде до кроку 6, тож CI на ньому показує червоне ✖, а після кроку 6 ✔.
   Модель: Opus.
6. **Клієнт, чат** (S3, S5, S6, S7, S8): `TrainerChat.js` (`MAX_TRAINER_PHOTOS`, `MAX_PHOTO_BASE64_TOTAL`, `addPhotos` з послідовною нормалізацією і функціональним `setPhotos`, порядок повідомлень, `multiple` у галереї, прив'язка до рядка для всього вибору, текст без підпису, `alt`, кнопка «Повернути текст» з підрядком, підказки під блоком завислого і `cleanupPending`); `TrainerChat.css` (`.trainer-photos` nowrap + прокрутка, `flex: 0 0 auto`). Доказ: UI (K10, K12, K14).
   Модель: Opus, бо UI-логіка з гонками (два швидкі вибори).
7. **Версія** (S9): `package.json`, `package-lock.json` 1.9.10; `releases.js` з датою-заглушкою; дата публікації окремим комітом у день публікації (як 1.9.7). Доказ: K15.
8. **Повні прогони** (K16): `npm run test:server` (лише 7 базових падінь), `npm run test:ci`, `CI=true npm run build`, Python-тести; push; PR; CI усі перевірки, зокрема канарка `hermes-personal-linux` (180000/180001) і `trainer-chat-browser` (K13).
9. **Ревʼю**: `spec-reviewer` по K1-K19 (без K17) свіжими командами; 🔴/🟡 виправляються, повтор.
10. **Документи**: журнал `.agents/journal/`, `PROJECT-INFO.md`, solutions у codeindexer, задача «автоочищення фото» в черзі (Р2).
11. **Публікація** лише після окремого «так» Юрія. Процедура 1.9.7 (збірка з чистої копії, SHA 37 файлів, тимчасовий адміністратор xCloud ≤ 20 хв, `/meal-api/health` 200) плюс: бекап поточного `/etc/scisense/activation.json`, перезапис `policyHash` новим `personalPolicyHash`, перевірка старту сервісу; читання `state`/`error` завислого ходу Юрія до і після першого тіку (K17а). Потім K17б з телефона Юрія.

## Бекап і точки відкату

- Код: коміт на кожен крок, push після кожного (зовнішній бекап).
- Публікація: попередній реліз лишається в `/opt/scisense/releases/<sha>`; копія старого `activation.json` поруч; відкат = symlink на попередній реліз + старий `activation.json` + перезапуск сервісу.
- Дані: цей реліз схему SQLite не змінює (нові стани лише в пам'яті), міграції немає.

## Як перевірю ззовні

- Тести GW, PH, PY, UI, DL з виводом ✔; CI PR зелений.
- Після публікації: бандл містить `"1.9.10"`; SHA 37 файлів = збірка; `/meal-api/health` 200 `ok:true`; сервіс стартував з новим хешем політики; завислий хід Юрія `failed`/`trainer_no_reply` або знятий; телефон Юрія (K17).
- `exit 0` сам по собі доказом не є.
