"""Actual native auth transaction; fake refresh endpoint and encrypted-store ACKs."""
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch
import hermes_personal_connection as module
from hermes_personal_connection import NativeCredentialBridge, assert_tmpfs_home, read_material

OLD = {"access_token": "synthetic-old-access", "refresh_token": "synthetic-old-refresh"}
NEW = {"access_token": "synthetic-new-access", "refresh_token": "synthetic-new-refresh"}


class NativeConnectionTests(unittest.TestCase):
    def setUp(self):
        from hermes_cli import auth, auth_codex
        self.auth, self.auth_codex = auth, auth_codex
        self.home = Path(os.environ["HERMES_HOME"])
        auth._save_auth_store({"providers": {"openai-codex": {"tokens": dict(OLD)}}})
        self.state = {"revision": 1, "phase": "ready", "files": read_material(self.home)}
        self.events = []
        self.mocks = []
        self.bridge = None

    def tearDown(self):
        if self.bridge:
            self.bridge.close()
        for current in reversed(self.mocks):
            current.stop()

    def start(self, refresh=None, checkpoint=None):
        def native_refresh(*_args, **_kwargs):
            self.events.append("fake-http")
            self.assertEqual(self.state["phase"], "refresh_pending")
            return dict(NEW)
        for current in [patch.object(module, "assert_tmpfs_home", return_value=self.home),
                        patch.object(self.auth, "refresh_codex_oauth_pure", side_effect=refresh or native_refresh),
                        patch.object(self.auth_codex, "refresh_codex_oauth_pure", side_effect=refresh or native_refresh)]:
            current.start(); self.mocks.append(current)
        def advance(options, phase):
            self.assertEqual(options["expectedRevision"], self.state["revision"])
            self.state.update(phase=phase, revision=self.state["revision"] + 1)
            return {"phase": phase, "revision": self.state["revision"]}
        def begin(ident, options):
            self.events.append("durable-pending"); self.state["refreshId"] = ident
            return advance(options, "refresh_pending")
        def save(files, options):
            self.events.append("durable-save")
            if self.state["phase"] == "refresh_pending":
                self.assertEqual(options["refreshId"], self.state["refreshId"])
                self.assertIs(options["rotationCommitted"], True)
            self.state["files"] = files
            return advance(options, "ready")
        def reauth(options):
            self.events.append("durable-reauth"); return advance(options, "reauth_required")
        self.bridge = NativeCredentialBridge(home=self.home, revision=1, begin_refresh=begin,
            checkpoint=checkpoint or save, require_reauth=reauth).install()
        return self.bridge

    def test_actual_native_refresh_transaction_persists_before_grant_can_be_used(self):
        bridge = self.start()
        updated = self.auth_codex._refresh_codex_auth_tokens(dict(OLD), 10)
        self.assertEqual(updated["access_token"], NEW["access_token"])
        self.assertEqual(self.events, ["durable-pending", "fake-http", "durable-save"])
        self.assertEqual(self.state["phase"], "ready")
        self.assertEqual(read_material(self.home), self.state["files"])
        bridge.ensure_ready()

    def test_metadata_write_cannot_claim_uncommitted_rotation_or_enable_inference(self):
        bridge = self.start()
        updated = self.auth.refresh_codex_oauth_pure("old", "old")
        with self.assertRaisesRegex(RuntimeError, "connection_auth_required"):
            bridge.ensure_ready()
        self.auth._save_auth_store({"providers": {"openai-codex": {"tokens": dict(OLD)}}})
        self.assertEqual(self.state["phase"], "refresh_pending")
        self.assertNotIn("durable-save", self.events)
        self.auth._save_auth_store({"providers": {"openai-codex": {"tokens": updated}}})
        self.assertEqual(self.state["phase"], "ready"); bridge.ensure_ready()

    def test_failed_or_uncertain_refresh_never_reuses_old_chain(self):
        def failed(*_a, **_k):
            raise RuntimeError("synthetic-timeout")
        bridge = self.start(refresh=failed)
        with self.assertRaisesRegex(RuntimeError, "synthetic-timeout"):
            self.auth.refresh_codex_oauth_pure("old", "old")
        self.assertEqual(self.events, ["durable-pending", "durable-reauth"])
        self.assertEqual(self.state["phase"], "reauth_required")
        with self.assertRaisesRegex(RuntimeError, "connection_auth_required"):
            bridge.ensure_ready()

    def test_checkpoint_failure_or_foreign_target_cannot_enable_model_use(self):
        def failed(*_a):
            raise RuntimeError("synthetic-checkpoint-failure")
        bridge = self.start(checkpoint=failed)
        with self.assertRaisesRegex(RuntimeError, "connection_home_mismatch"):
            self.auth._save_auth_store({"providers": {}}, target_path=self.home.parent / "outside-auth.json")
        self.assertFalse((self.home.parent / "outside-auth.json").exists())
        with self.assertRaisesRegex(RuntimeError, "synthetic-checkpoint-failure"):
            self.auth._save_auth_store({"providers": {}})
        with self.assertRaisesRegex(RuntimeError, "connection_auth_required"):
            bridge.ensure_ready()

    def test_guard_refuses_model_use_before_install_and_after_hook_close(self):
        bridge = self.start(); bridge.close()
        with self.assertRaisesRegex(RuntimeError, "connection_auth_required"):
            bridge.ensure_ready()
        uninstalled = NativeCredentialBridge(home=self.home, revision=1, begin_refresh=lambda *_a: None,
            checkpoint=lambda *_a: None, require_reauth=lambda *_a: None)
        with self.assertRaisesRegex(RuntimeError, "connection_auth_required"):
            uninstalled.ensure_ready()

    def test_runtime_mount_requires_private_tmpfs_and_refuses_nested_disk_mount(self):
        base = "1 0 0:1 / / rw - ext4 /dev/synthetic rw\n"
        mounted = base + "2 1 0:2 / " + str(self.home.parent) + " rw - tmpfs tmpfs rw\n"
        with patch.object(module.sys, "platform", "linux"), patch.object(module, "_mount_table", return_value=mounted):
            self.assertEqual(assert_tmpfs_home(self.home), self.home)
        duplicate = mounted + "3 2 0:3 / " + str(self.home.parent) + " rw - ext4 /dev/synthetic rw\n"
        with patch.object(module.sys, "platform", "linux"), patch.object(module, "_mount_table", return_value=duplicate):
            with self.assertRaisesRegex(RuntimeError, "connection_tmpfs_required"):
                assert_tmpfs_home(self.home)
        bound_file = mounted + "3 2 0:3 / " + str(self.home / "auth.json") + " rw - ext4 /dev/synthetic rw\n"
        with patch.object(module.sys, "platform", "linux"), patch.object(module, "_mount_table", return_value=bound_file):
            with self.assertRaisesRegex(RuntimeError, "connection_tmpfs_required"):
                assert_tmpfs_home(self.home)
        nested = mounted + "3 2 0:3 / " + str(self.home) + " rw - ext4 /dev/synthetic rw\n"
        with patch.object(module.sys, "platform", "linux"), patch.object(module, "_mount_table", return_value=nested):
            with self.assertRaisesRegex(RuntimeError, "connection_tmpfs_required"):
                assert_tmpfs_home(self.home)


if __name__ == "__main__":
    unittest.main()
