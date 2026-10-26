import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from hermes_personal_context import ProfileContext


class ContextTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.home = Path(self.temp.name).resolve(); self.home.chmod(0o700)
        self.context = ProfileContext(self.home, initialize=True)

    def tearDown(self):
        self.temp.cleanup()

    def source(self, text):
        data = text.encode()
        path = self.home / "personal-context/sources/context.md"; path.write_bytes(data); path.chmod(0o600)
        manifest = self.home / "personal-context/sources.json"
        manifest.write_text(json.dumps({"version": 1, "profileHome": str(self.home), "files": [{"name": path.name, "sha256": hashlib.sha256(data).hexdigest()}]})); manifest.chmod(0o600)

    def proposal(self, text="Синтетичний підтверджений факт", revision=None):
        return {"proposalId": "synthetic-proposal-0001", "baseRevision": self.context.read()["revision"] if revision is None else revision, "text": text}

    def test_empty_profile_has_no_shared_facts_or_targets(self):
        value = self.context.read()
        self.assertEqual(value["text"], ""); self.assertEqual(value["applied"], {}); self.assertEqual(value["mode"], "append")

    def test_complete_large_source_is_kept_without_silent_trimming(self):
        text = "Синтетичний особистий контекст. " * 2000; self.source(text)
        value = self.context.read(); self.assertEqual(value["text"], text); self.assertGreater(len(value["text"].encode()), 80000)

    def test_confirmed_addition_keeps_source_and_is_idempotent_after_reopen(self):
        self.source("Початкові синтетичні факти"); p = self.proposal(); result = self.context.commit(p)
        self.assertIn("Початкові синтетичні факти", result["text"]); self.assertIn(p["text"], result["text"])
        self.assertEqual(ProfileContext(self.home).read()["text"], result["text"])
        again = self.context.commit(p); self.assertTrue(again["replayed"]); self.assertEqual(again["revision"], result["revision"])
        digest = hashlib.sha256(json.dumps(p, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
        self.assertEqual(again["applied"][p["proposalId"]], digest)
        with self.assertRaisesRegex(RuntimeError, "context_conflict"):
            self.context.commit({**p, "text": "Інший факт із тим самим id"})

    def test_changed_source_invalidates_a_pending_confirmation(self):
        self.source("Версія1"); p = self.proposal(); self.source("Версія2")
        with self.assertRaisesRegex(RuntimeError, "context_conflict"):
            self.context.commit(p)
        self.assertEqual(self.context.read()["text"], "Версія2")

    def test_unlisted_or_changed_source_is_not_silently_omitted(self):
        self.source("Перевірений текст")
        path = self.home / "personal-context/sources/context.md"; path.write_text("Змінений без нового manifest")
        with self.assertRaisesRegex(RuntimeError, "context_unavailable"):
            self.context.read()
        self.source("Знову перевірений")
        extra = path.with_name("extra.md"); extra.write_text("Новий непогоджений текст"); extra.chmod(0o600)
        with self.assertRaisesRegex(RuntimeError, "context_unavailable"):
            self.context.read()

    def test_atomic_commit_fault_cannot_report_success_or_corrupt_old_memory(self):
        before = self.context.read(); p = self.proposal()
        with patch("hermes_personal_context.os.replace", side_effect=OSError("synthetic_io_fault")):
            with self.assertRaises(OSError):
                self.context.commit(p)
        self.assertEqual(self.context.read(), before)
        self.assertEqual(list((self.home / "personal-context").glob("*.tmp")), [])

    def test_missing_memory_cannot_silently_initialize_an_empty_replacement(self):
        self.context.commit(self.proposal())
        (self.home / "personal-context/memory.json").unlink()
        with self.assertRaisesRegex(RuntimeError, "context_unavailable"):
            self.context.read()
        with self.assertRaisesRegex(RuntimeError, "context_unavailable"):
            ProfileContext(self.home)

    def test_lost_source_manifest_and_files_cannot_silently_remove_mandatory_facts(self):
        self.source("Обов’язкові особисті факти"); self.context.read()
        (self.home / "personal-context/sources/context.md").unlink()
        (self.home / "personal-context/sources.json").unlink()
        with self.assertRaisesRegex(RuntimeError, "context_unavailable"):
            self.context.read()

    def test_context_files_cannot_be_swapped_into_another_profile(self):
        import shutil
        self.source("Особистий синтетичний факт лише одного профілю"); self.context.read()
        other = self.home / "other-profile"; other.mkdir(mode=0o700)
        shutil.copytree(self.home / "personal-context", other / "personal-context")
        with self.assertRaisesRegex(RuntimeError, "context_unavailable"):
            ProfileContext(other)

    def test_sources_directory_alias_is_rejected_after_initialization(self):
        sources = self.home / "personal-context/sources"; sources.rmdir()
        foreign = self.home / "foreign"; foreign.mkdir(mode=0o700); sources.symlink_to(foreign)
        with self.assertRaisesRegex(RuntimeError, "context_unavailable"):
            self.context.read()


if __name__ == "__main__":
    unittest.main()
