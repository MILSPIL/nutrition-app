# Локальна перевірка systemd

2026-10-22. NTZG-DEPLOY-02, Goal `objective_e45aa8ac1aa3`, G07/G08/G11. Команда `node server/linux/run-systemd.mjs` запускає одноразовий Linux-контейнер. Це не встановлення на MS-WEB і не перевірка справжніх модельних ключів.

## Пакет служби

Базовий `deploy/scisense-api.service` запускає API з `liveEnabled=false` без credentials. Після окремо погодженого перенесення й активації `deploy/scisense-api.live.conf` встановлюється як `/etc/systemd/system/scisense-api.service.d/50-live.conf`. Тільки цей drop-in задає обидва `LoadCredentialEncrypted`. Сам імпорт його не встановлює.

Збережено весь sandbox служби: непривілейований користувач, приватні tmp/devices, файлову систему лише для читання поза StateDirectory, порожні capabilities, 1 CPU / 2 GiB, один активний запит. Runtime дозволяє лише канонічну директорію `/run/credentials/scisense-api.service`. Systemd може залишити credentials у власності root і дати користувачу служби read-only ACL, що відображається як режим 0440. Runtime приймає такого власника або власника служби, забороняє запис, execute й доступ інших користувачів. Читання файлів використовує O_NOFOLLOW.

CLI-приймач перед `systemd-creds encrypt` установлює umask 0077, тому ciphertext одразу має приватні права. Справжній інтеграційний тест перевіряє це через операційний CLI, не через підставний encrypt callback.

## Вісім сценаріїв

1. Справжній unit стартує без ключів; health показує вимкнені моделі, inference відхиляється.
2. Операційні export/send та CLI receive шифрують синтетичні ключі й переносять paid/free rows, залишаючи активацію вимкненою.
3. Повторний імпорт відхиляється; staged credentials не вмикають базовий unit.
4. Live manifest без drop-in відхиляється runtime.
5. Відсутній credential відхиляється systemd з кодом 243.
6. Пошкоджений ciphertext відхиляється systemd з кодом 243.
7. Два encrypted credentials запускають live runtime без викликів моделей.
8. Перезапуск зберігає обидва рядки, суму синтетичного бюджету, receipt та anchor.

## Ізоляція та прибирання

Перед першим зверненням до Docker daemon launcher перевіряє локальний unix endpoint і прив’язує до нього всі команди. Віддалені TCP/SSH contexts відхиляються. Контейнер має `--network=none`, без host binds і published ports; ці параметри перечитуються через inspect. Privileged потрібен лише всередині локальної Docker VM або одноразової CI VM для PID 1/systemd, cgroups і mount namespaces. На Mac sudo не використовується.

Boot-скрипт спочатку від’єднує propagation від батьківського namespace через rprivate, потім установлює rshared усередині контейнера для systemd credential helpers. Він не змінює mount namespace Mac. Образ Ubuntu24.04 і Node24.11.1 закріплені SHA256, архітектура відповідає Docker host: ARM локально, x86_64 у CI.

До запуску записуються новий UUID контейнера та незавершений `tmp/systemd-check/evidence.json`, щоб попередній успіх не маскував збій. SIGINT/SIGTERM прибирають тільки власний контейнер. Якщо rm/перевірка зникнення не вдалася, результат має cleanup=false і зберігає UUID для ручного прибирання. SIGKILL не перехоплюється: незавершений файл лишається доказом непідтвердженого прибирання. Підставні тести перевіряють ці відмови без daemon.

CI job `systemd-credential-check` зберігає evidence як artifact. Підтверджений результат поточного SHA дивитися у `docs/evidence/local-deployment-fixes-2026-10-22.json`; локальний успіх не заміняє перевірку цільового сервера чи телефона.

Context7 недоступний через місячну квоту. Контракт звірено з офіційними [systemd.exec255](https://www.freedesktop.org/software/systemd/man/255/systemd.exec.html), [systemd-creds](https://www.freedesktop.org/software/systemd/man/255/systemd-creds.html) та [Container Interface](https://systemd.io/CONTAINER_INTERFACE/).
