from pathlib import Path
import subprocess
import tempfile
import shutil
import json

source = Path(__file__).resolve().parents[1] / "journal-scan.sh"
results = []
for with_existing in (False, True):
    root = Path(tempfile.mkdtemp(prefix="nutrition-journal-scan-"))
    def git(*args):
        return subprocess.run(["git", "-C", str(root), *args], check=True, text=True, capture_output=True)
    try:
        (root / ".agents/bin").mkdir(parents=True)
        (root / ".agents/journal").mkdir()
        shutil.copy2(source, root / ".agents/bin/journal-scan.sh")
        (root / "README.md").write_text("# Тест\n")
        git("init", "-b", "main")
        git("config", "user.name", "Local audit fixture")
        git("config", "user.email", "fixture@example.test")
        if with_existing:
            (root / ".agents/journal/shared.md").write_text("# Спільний журнал\n")
        git("add", ".")
        git("-c", "core.hooksPath=/dev/null", "commit", "-m", "fixture")
        git("switch", "-c", "task")
        (root / ".agents/journal/new-audit.md").write_text("# Новий журнал\n")
        git("add", ".agents/journal/new-audit.md")
        git("-c", "core.hooksPath=/dev/null", "commit", "-m", "fixture journal")
        result = subprocess.run(["bash", str(root / ".agents/bin/journal-scan.sh"), "--quiet"], text=True, capture_output=True)
        found = result.returncode == 1 and ".agents/journal/new-audit.md" in result.stdout
        false_positive = ".agents/journal/shared.md" in result.stdout
        results.append({"main_has_journals": with_existing, "exit": result.returncode, "new_journal_found": found, "shared_journal_false_positive": false_positive, "passed": found and not false_positive})
    finally:
        shutil.rmtree(root)

print(json.dumps(results, ensure_ascii=False, indent=2))
raise SystemExit(0 if all(item["passed"] for item in results) else 1)
