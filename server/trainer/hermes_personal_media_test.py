import base64
import hashlib
import io
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

    def test_ten_images_stage_and_eleven_are_refused(self):
        # 1.9.10 K9: the trainer path and Native both allow ten photos per message.
        images = [{"type": "image/png", "data": base64.b64encode(PNG + bytes([n])).decode()} for n in range(11)]
        self.assertEqual(len(self.photos.stage(INPUT, images[:10])), 10)
        self.photos.clear(INPUT)
        with self.assertRaisesRegex(RuntimeError, "invalid_image"):
            self.photos.stage("synthetic-input-0002", images)
        self.assertEqual(list(self.staging.iterdir()), [])

    def test_ten_real_size_images_stage(self):
        # 1.9.10 K19b: ten ~1.3 MB photos fit the per-image limit and the profile quota.
        images = [{"type": "image/png", "data": base64.b64encode(PNG + bytes([n]) * (1300 * 1024)).decode()} for n in range(10)]
        self.assertEqual(len(self.photos.stage(INPUT, images)), 10)

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

    def retained_photo(self):
        from PIL import Image
        output = io.BytesIO()
        Image.new("RGB", (800, 600), "green").save(output, format="PNG")
        data = output.getvalue()
        directory = self.retained / hashlib.sha256(data).hexdigest()
        directory.mkdir(mode=0o700)
        path = directory / "label.png"
        path.write_bytes(data); path.chmod(0o600)
        reference = base64.urlsafe_b64encode(f"{directory.name}/label.png".encode()).decode().rstrip("=")
        return path, data, reference

    def test_authenticated_reference_returns_small_thumbnail_and_exact_original(self):
        from PIL import Image
        path, data, reference = self.retained_photo()
        original = self.photos.read(reference, "original")
        self.assertEqual(original["type"], "image/png")
        self.assertEqual(base64.b64decode(original["data"]), data)
        thumbnail = self.photos.read(reference)
        self.assertEqual(thumbnail["type"], "image/webp")
        with Image.open(io.BytesIO(base64.b64decode(thumbnail["data"]))) as image:
            self.assertEqual(image.size, (360, 270))
        self.assertEqual(path.read_bytes(), data)

    def test_photo_delete_is_idempotent_and_missing_is_explicit(self):
        path, data, reference = self.retained_photo()
        self.assertGreater(self.photos._usage(), 0)
        self.assertEqual(self.photos.delete(reference), {"deleted": True})
        self.assertFalse(path.exists()); self.assertEqual(self.photos._usage(), 0)
        self.assertEqual(self.photos.delete(reference), {"deleted": True})
        with self.assertRaisesRegex(RuntimeError, "media_missing"):
            self.photos.read(reference)

    def test_photo_reference_cannot_escape_or_follow_alias_or_changed_bytes(self):
        path, data, reference = self.retained_photo()
        for raw in ("../private-key", str(path), "a" * 64 + "/../label.png"):
            ref = base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")
            with self.assertRaisesRegex(RuntimeError, "invalid_image"):
                self.photos.read(ref)
        with self.assertRaisesRegex(RuntimeError, "invalid_image"):
            self.photos.read(reference + "=")
        path.write_bytes(data + b"changed")
        with self.assertRaisesRegex(RuntimeError, "media_unavailable"):
            self.photos.delete(reference)
        path.unlink(); foreign = self.home / "secret.png"; foreign.write_bytes(data); foreign.chmod(0o600); path.symlink_to(foreign)
        with self.assertRaisesRegex(RuntimeError, "media_unavailable"):
            self.photos.read(reference)
        self.assertEqual(foreign.read_bytes(), data)

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
