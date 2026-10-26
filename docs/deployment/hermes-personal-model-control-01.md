# HERMES-PERSONAL-01: вибір моделі в Hermes

Внутрішній control викликається лише приватним Desktop facade після встановлення UID транспортом. Право зміни має fundingOwner з operator registry. Дружина використовує вибране ним підключення, але не змінює його. Публічні website endpoints цього control не відкривають.

Глобальна черга завершує поточний turn, перекриває нові openings, дочікується startup і фізичного drain кожного профілю. Лише тоді payer змінює модель. Він використовує native apply_model_selection та atomic_config_replace; capability override і native route публікуються одним config commit. Encrypted checkpoint підтверджується перед ACK. Producer після зміни фізично завершується; нова native identity має точно збігтися з вибором. Відхилена нова identity також фізично закривається.

Каталог доступності береться з pinned native get_codex_model_ids(access_token=None) і доповнюється тільки вже вибраною моделлю. Catalog OpenAI API й інші declared metadata не є доказом доступності. Відображаються лише моделі з підтвердженими tools/vision і достатнім контекстом. Інші provider lanes не активуються й автоматичного fallback немає.

Кожен свіжий tmpfs HOME отримує public capability cache з models.dev, точний SHA в коді та provenance поруч. Це не auth, оплата чи entitlement. Відкриття picker не робить HTTP, refresh, usage/pricing warmup або фоновий запит. Effective window обмежується native Codex offline context resolver без токена: базовий gpt-6-sol має 272000; збільшення лише через окремо явний native variant. Власний менший override зберігає меншу межу. Невідомий alias має консервативну межу 64000.

Після перемикання моделі координатор готує обидва native чати перед підтвердженням. Читання весь цей час перекрите тим самим бар’єром зміни моделі. Це повторює підготовку початкового запуску: наступне п’ятисекундне читання контексту отримує вже готову authority. Підготовка не виконує модельних запитів і не змінює межі часу чи ресурсів. Відмова одного профілю спочатку чекає завершення підготовки другого, потім фізично закриває обидва. Закриття координатора не дозволяє запізнілому запуску відкрити чат.

Профільний config переписується тільки якщо попередній документ точно збігається з обмеженим generated template для попередньої моделі. Будь-яка зміна tools, memory, telemetry чи executable policy відхиляється. Native Bot Chat follow_profile_config застосовує новий route без правок SQLite. Ні native ID, ні контекст, ні історія, ні food records не переносяться в інше місце.

Доказ: ../evidence/hermes-personal-model-selection-2026-10-26.json. 7 native payer, 29 actual runtime checks, 9 OS-guarded процесів, 36 Node. Сім POST є підставним HTTP, не реальними API. Реальний Desktop facade/UI, actual-host Linux, міграція й B1–B3 ще попереду.

Context7 у цій сесії недоступний через monthly quota. Прочитані pinned native джерела: hermes_cli/codex_models.py, agent/models_dev.py, agent/model_metadata.py, hermes_cli/model_switch.py, hermes_cli/config.py, gateway/session_policy.py. Взято native catalog, route cap, atomic selection і follow_profile_config; окремий OpenAI API не реалізований.
