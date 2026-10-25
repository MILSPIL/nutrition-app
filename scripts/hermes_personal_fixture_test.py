"""Executable-source boundary failures, without importing native Hermes."""
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from hermes_personal_fixture import verify_source


class SourceVerificationTests(unittest.TestCase):
    def test_exact_blob_and_installed_root_dependency_are_accepted(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); source = root / "source"; source.mkdir()
            content = b"answer = 'verified'\n"; (source / "module.py").write_bytes(content)
            oid = hashlib.sha1(b"blob " + str(len(content)).encode() + b"\0" + content).hexdigest()
            manifest = ("100644 blob " + oid + "\tmodule.py\0").encode()
            outside = root / "outside"; outside.mkdir(); (outside / "__init__.py").write_text("raise RuntimeError('must not execute')")
            (source / ".venv").symlink_to(outside, target_is_directory=True)
            with patch("hermes_personal_fixture.subprocess.check_output", return_value=manifest):
                self.assertEqual(verify_source(source, root)["verifiedFiles"], 1)
                (source / "module.py").write_text("changed = True")
                with self.assertRaisesRegex(RuntimeError, "source_pin_mismatch"):
                    verify_source(source, root)

    def test_discoverable_directory_alias_and_nested_dependency_alias_are_rejected(self):
        for name in ("linked", ".venv", "node_modules", "__pycache__"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as folder:
                root = Path(folder); source = root / "source"; plugins = source / "plugins/model-providers"; plugins.mkdir(parents=True)
                outside = root / "outside"; outside.mkdir(); (outside / "__init__.py").write_text("raise RuntimeError('must not execute')")
                (plugins / name).symlink_to(outside, target_is_directory=True)
                with patch("hermes_personal_fixture.subprocess.check_output", return_value=b""):
                    with self.assertRaisesRegex(RuntimeError, "source_directory_alias"):
                        verify_source(source, root)

    def test_sourceless_bytecode_and_native_extensions_are_rejected(self):
        for name in ("extra.pyc", "extra.pyo", "extra.so", "extra.cpython-314-darwin.so", "extra.pyd", "extra.dylib"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as folder:
                root = Path(folder); source = root / "source"; source.mkdir()
                (source / name).write_bytes(b"synthetic-never-execute")
                with patch("hermes_personal_fixture.subprocess.check_output", return_value=b""):
                    with self.assertRaisesRegex(RuntimeError, "source_extra_executable_module"):
                        verify_source(source, root)

    def test_untracked_python_and_file_alias_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); source = root / "source"; source.mkdir()
            (source / "unexpected.py").write_text("must_not_execute = True")
            with patch("hermes_personal_fixture.subprocess.check_output", return_value=b""):
                with self.assertRaisesRegex(RuntimeError, "source_executable_manifest_mismatch"):
                    verify_source(source, root)


if __name__ == "__main__":
    unittest.main()
