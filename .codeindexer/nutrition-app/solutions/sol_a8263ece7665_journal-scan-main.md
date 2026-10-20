---
id: sol_a8263ece7665
problem: "journal-scan не показує закомічений журнал у гілці, коли main ще не має жодного журналу; повертає хибний успіх."
created_at: "2026-10-20T08:33:58.880076+00:00"
project: nutrition-app
category: troubleshooting
author: Codex
tags: [journal-scan, awk, empty-input, bash]
---

У scan_repo умова awk NR == FNR вважала рядки другого файла першим файлом, якщо перший порожній. У локальній копії замінено її на FILENAME == ARGV[1]. Інтеграційний тест створює два тимчасові Git-репозиторії: main без журналів і main зі спільним журналом; в обох новий журнал у гілці має бути знайдений, спільний не повинен бути хибною знахідкою. Глобальний канон сканера не змінено.

**Evidence:** .agents/bin/journal-scan.sh:159; .agents/bin/tests/test-journal-scan.py; .agents/journal/2026-10-20-1130-codex-gpt-6-codeindexer-audit.md
