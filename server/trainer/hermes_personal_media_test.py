import base64
import os
from pathlib import Path
import tempfile
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch
from hermes_personal_media import ProfilePhotos, PHOTO_QUOTA, retain_profile_photos

PNG = b"\x89PNG\r\n\x1a\n" + b"synthetic-image"
INPUT = "synthetic-input-0001"
IMAGE = {"type": "image/png", "data": base64.b64encode(PNG).decode()}


class PhotoTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.home = Path(self.temp.name).resolve(); self.home.chmod(0o700)
        self.staging, self.retained = self.home / "images", self.home / "native-inputs"
        self.staging.mkdir(mode=0o700); self.retained.mkdir(mode=0o700)
        self.photos = ProfilePhotos(self.staging, self.retained, now=lambda: 10000)

    def tearDown(self):
        self.temp.cleanup()

    def test_staging_is_private_and_retry_is_exact(self):
        staged = self.photos.stage(INPUT, [IMAGE])
        path = Path(staged[0]["path"])
        self.assertEqual(path.read_bytes(), PNG); self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(staged[0]["mime"], "image/png")
        self.assertEqual(self.photos.stage(INPUT, [IMAGE]), staged)
        other = {**IMAGE, "data": base64.b64encode(PNG + b"changed").decode()}
        with self.assertRaisesRegex(RuntimeError, "media_conflict"):
            self.photos.stage(INPUT, [other])
        self.photos.clear(INPUT); self.assertEqual(list(self.staging.iterdir()), [])

    def test_bad_second_image_leaves_no_partial_stage(self):
        with self.assertRaisesRegex(RuntimeError, "invalid_image"):
            self.photos.stage(INPUT, [IMAGE, {"type": "image/jpeg", "data": IMAGE["data"]}])
        self.assertEqual(list(self.staging.iterdir()), [])

    def test_quota_blocks_new_photo_without_deleting_existing_history(self):
        old = self.retained / "historical.png"
        with old.open("wb") as output:
            output.write(PNG); output.truncate(PHOTO_QUOTA)
        old.chmod(0o600)
        with self.assertRaisesRegex(RuntimeError, "media_quota"):
            self.photos.stage(INPUT, [IMAGE])
        self.assertEqual(old.stat().st_size, PHOTO_QUOTA); self.assertEqual(list(self.staging.iterdir()), [])

    def test_ttl_removes_only_new_ephemeral_staging_not_imported_photos(self):
        current = Path(self.photos.stage(INPUT, [IMAGE])[0]["path"])
        historical = self.staging / "imported.png"; historical.write_bytes(PNG); historical.chmod(0o600)
        for path in (current, historical): os.utime(path, (9000, 9000))
        self.photos.sweep(); self.assertFalse(current.exists()); self.assertTrue(historical.exists())

    def test_symlink_cannot_read_or_change_another_file(self):
        foreign = self.home / "private-key"; foreign.write_bytes(PNG); foreign.chmod(0o600)
        link = self.staging / f"scisense_{INPUT}_0.png"; link.symlink_to(foreign)
        with self.assertRaises((RuntimeError, OSError)):
            self.photos.stage(INPUT, [IMAGE])
        self.assertEqual(foreign.read_bytes(), PNG)

    def test_new_process_collects_only_uncommitted_capture_temporary_files(self):
        orphan = self.retained / ".capture-old"; orphan.write_bytes(PNG); orphan.chmod(0o600)
        retained = self.retained / "kept.png"; retained.write_bytes(PNG); retained.chmod(0o600)
        ProfilePhotos(self.staging, self.retained)
        self.assertFalse(orphan.exists()); self.assertTrue(retained.exists())

    def test_age_sweep_policy_is_scoped_to_exact_profile_home(self):
        gateway = ModuleType("gateway"); calls = []
        gateway.session_ingress_media = SimpleNamespace(sweep_settled_media=lambda db, **kw: calls.append(db.db_path) or 1)
        with patch.dict("sys.modules", {"gateway": gateway}):
            retain_profile_photos(self.home)
            own = SimpleNamespace(db_path=str(self.home / "state.db"))
            other = SimpleNamespace(db_path=str(self.home) + "-foreign/state.db")
            self.assertEqual(gateway.session_ingress_media.sweep_settled_media(own), 0)
            for path in (other.db_path, str(self.home / "nested/state.db"), str(self.home / "nested/../state.db")):
                with self.assertRaisesRegex(RuntimeError, "media_unavailable"):
                    gateway.session_ingress_media.sweep_settled_media(SimpleNamespace(db_path=path))
            foreign = self.home / "foreign.db"; foreign.touch(mode=0o600)
            (self.home / "state.db").symlink_to(foreign)
            with self.assertRaisesRegex(RuntimeError, "media_unavailable"):
                gateway.session_ingress_media.sweep_settled_media(own)
            self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
