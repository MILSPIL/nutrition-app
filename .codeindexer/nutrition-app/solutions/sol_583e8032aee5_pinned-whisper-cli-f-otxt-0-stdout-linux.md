---
id: sol_583e8032aee5
problem: "Pinned Whisper CLI з -f - -otxt може завершитися з кодом 0 та порожнім stdout у Linux Node pipe: ofstream повторно відкриває /dev/stdout без перевірки помилки."
created_at: "2026-10-21T19:35:49.206189+00:00"
project: nutrition-app
category: troubleshooting
author: Codex
tags: [whisper, linux, stdio, node, empty-transcript, javascript]
---

Для source d1be6fde11ac6e0407606b4e42fe72d34add8037 використано -f - -of scisense-stdout без output-format flags і -ls. Непорожнє ім'я, відмінне від '-', вмикає native segment callback printf/fflush; без export flags fout_factory.open не викликається й файли не створюються. -np callback не вимикає, -nt прибирає часові мітки. Node socket-backed pipe не можна повторно відкривати як файл. Негативний C++ probe у Linux відтворює exit0/empty для ofstream; direct stdout повертає маркер. Це виправлення виводу не доводить проходження 45s: швидкість та кількість треба перевіряти окремим повним model run.

**Dead end tried:** Саме -f - без окремого basename вимикає callback; -otxt повторно відкриває /dev/stdout. Код завершення 0 не доводить наявність тексту.

**Evidence:** bf8e22d; scripts/phone-lab/whisper.mjs:52; server/linux/stdio-probe.cpp; server/linux/stdio.test.mjs; CI39662207789 Verify CPU and memory limit checks SUCCESS. Офіційні Node24.11.1 stdio docs та pinned cli.cpp:1135,1158,1297,1342.
