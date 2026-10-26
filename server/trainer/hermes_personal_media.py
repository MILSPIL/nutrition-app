"""Profile-local photo staging and the approved retained-photo policy.
No caller paths, remote URLs, model keys or arbitrary filesystem operations.
"""
import base64
import hashlib
import io
import os
from pathlib import Path
import re
import stat
import time

PHOTO_QUOTA = 256 * 1024 * 1024
IMAGE_MAX = 5 * 1024 * 1024
_EXT = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def _image(data):
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return None


def _dir(path):
    path = Path(path)
    info = path.lstat()
    if path.resolve() != path or not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise RuntimeError("media_unavailable")
    return path


def _read(path, maximum=IMAGE_MAX):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, "rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_size > maximum:
            raise RuntimeError("media_unavailable")
        return stream.read(maximum + 1)


def _sync(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


class ProfilePhotos:
    def __init__(self, staging, retained, *, now=time.time):
        self.staging, self.retained, self.now = _dir(staging), _dir(retained), now
        if self.staging == self.retained or self.staging.is_relative_to(self.retained) or self.retained.is_relative_to(self.staging):
            raise RuntimeError("media_unavailable")
        # Only a new, exclusively owned process calls construction. A .capture
        # file is never a committed reference, so an interrupted old capture is
        # safe to remove before the replacement writer starts.
        for path in self.retained.glob(".capture-*"):
            _read(path, maximum=10 * 1024 * 1024)
            path.unlink()
        self.sweep()

    def _usage(self):
        total, count = 0, 0
        for root in (self.staging, self.retained):
            for parent, directories, names in os.walk(root, followlinks=False):
                count += len(directories) + len(names)
                if count > 50000:
                    raise RuntimeError("media_unavailable")
                for name in directories:
                    _dir(Path(parent) / name)
                for name in names:
                    path = Path(parent) / name
                    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
                    with os.fdopen(descriptor, "rb") as stream:
                        info = os.fstat(stream.fileno())
                        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1 or info.st_mode & 0o077:
                            raise RuntimeError("media_unavailable")
                        if _image(stream.read(16)):
                            total += info.st_size
        return total

    def sweep(self):
        changed = False
        for path in self.staging.glob("scisense_*"):
            info = path.lstat()
            if info.st_mtime <= self.now() - 300:
                _read(path)
                path.unlink(); changed = True
        if changed:
            _sync(self.staging)

    def stage(self, input_id, images):
        if not isinstance(input_id, str) or not re.fullmatch(r"[A-Za-z0-9-]{16,80}", input_id) or not isinstance(images, list) or len(images) > 2:
            raise RuntimeError("invalid_image")
        decoded = []
        for index, image in enumerate(images):
            if not isinstance(image, dict) or set(image) != {"type", "data"} or image.get("type") not in _EXT or not isinstance(image.get("data"), str) or len(image["data"]) > ((IMAGE_MAX + 2) // 3) * 4:
                raise RuntimeError("invalid_image")
            try:
                data = base64.b64decode(image["data"], validate=True)
            except ValueError:
                raise RuntimeError("invalid_image") from None
            if not data or len(data) > IMAGE_MAX or _image(data) != image["type"]:
                raise RuntimeError("invalid_image")
            path = self.staging / f"scisense_{input_id}_{index}{_EXT[image['type']]}"
            if path.exists() or path.is_symlink():
                if _read(path) != data:
                    raise RuntimeError("media_conflict")
            decoded.append((path, image["type"], data))
        self.sweep()
        extra = sum(len(data) for path, _mime, data in decoded if not path.exists())
        if self._usage() + extra > PHOTO_QUOTA:
            raise RuntimeError("media_quota")
        created = []
        try:
            for path, _mime, data in decoded:
                if not path.exists():
                    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
                    created.append(path)
                    with os.fdopen(descriptor, "wb") as output:
                        output.write(data); output.flush(); os.fsync(output.fileno())
            _sync(self.staging)
            return [{"path": str(path), "mime": mime} for path, mime, _data in decoded]
        except BaseException:
            for path in created:
                path.unlink(missing_ok=True)
            raise

    def _reference(self, reference):
        if not isinstance(reference, str) or len(reference) > 512 or not re.fullmatch(r"[A-Za-z0-9_-]+", reference):
            raise RuntimeError("invalid_image")
        try:
            relative = base64.urlsafe_b64decode(reference + "=" * (-len(reference) % 4)).decode("ascii")
        except (ValueError, UnicodeError):
            raise RuntimeError("invalid_image") from None
        if base64.urlsafe_b64encode(relative.encode()).decode().rstrip("=") != reference or not re.fullmatch(r"[a-f0-9]{64}/[A-Za-z0-9_.-]{1,160}\.(png|jpe?g|webp|gif)", relative):
            raise RuntimeError("invalid_image")
        path = self.retained / relative
        if path.resolve() != path:
            raise RuntimeError("media_unavailable")
        if path.parent.exists():
            _dir(path.parent)
        return path

    def read(self, reference, variant="thumbnail"):
        if variant not in {"thumbnail", "original"}:
            raise RuntimeError("invalid_image")
        path = self._reference(reference)
        try:
            data = _read(path, maximum=16 * 1024 * 1024)
        except FileNotFoundError:
            raise RuntimeError("media_missing") from None
        mime = _image(data)
        if not mime or hashlib.sha256(data).hexdigest() != path.parent.name:
            raise RuntimeError("media_unavailable")
        if variant == "thumbnail":
            from PIL import Image, ImageOps
            try:
                with Image.open(io.BytesIO(data)) as image:
                    if image.width * image.height > 25_000_000:
                        raise ValueError()
                    image = ImageOps.exif_transpose(image)
                    image.thumbnail((360, 360))
                    image = image.convert("RGB")
                    output = io.BytesIO()
                    image.save(output, format="WEBP", quality=78)
                    data, mime = output.getvalue(), "image/webp"
            except Exception:
                raise RuntimeError("media_unavailable") from None
        return {"type": mime, "data": base64.b64encode(data).decode("ascii")}

    def delete(self, reference):
        path = self._reference(reference)
        if not path.exists():
            return {"deleted": True}
        data = _read(path, maximum=16 * 1024 * 1024)
        if not _image(data) or hashlib.sha256(data).hexdigest() != path.parent.name:
            raise RuntimeError("media_unavailable")
        path.unlink()
        _sync(path.parent)
        return {"deleted": True}

    def clear(self, input_id):
        if not isinstance(input_id, str) or not re.fullmatch(r"[A-Za-z0-9-]{16,80}", input_id):
            raise RuntimeError("invalid_image")
        for path in self.staging.glob(f"scisense_{input_id}_*"):
            _read(path); path.unlink()
        _sync(self.staging)
        return {"cleared": True}


def retain_profile_photos(home):
    # Native3f2 applies a 24h age sweep to retained prompt images. The personal
    # product explicitly retains them until deletion, within the quota above.
    # Adapt only that profile's age sweep; native admission/history ownership,
    # explicit deletion and unheld-media collection continue unchanged.
    from gateway import session_ingress_media as media
    expected = _dir(home) / "state.db"
    def sweep(db, *, now=None):
        candidate = Path(db.db_path)
        if candidate != expected or candidate.resolve() != expected:
            raise RuntimeError("media_unavailable")
        return 0
    media.sweep_settled_media = sweep


def clean_photo_transcripts(owner):
    # Native's persistence contract preserves multimodal blocks and therefore
    # intentionally ignores a string-only persist override. Supply its supported
    # CLEAN multimodal override, while leaving the live API message unchanged.
    from functools import wraps
    from run_agent import AIAgent
    original = AIAgent.run_conversation
    @wraps(original)
    def run(agent, user_message, *args, **kwargs):
        override = kwargs.get("persist_user_message")
        if isinstance(user_message, list) and isinstance(override, str):
            images = [part for part in user_message if isinstance(part, dict) and part.get("type") in {"image_url", "image", "input_image"}]
            if images:
                binding = owner.execution_binding()
                from hermes_state_runtime import get_session_admission
                from gateway.session_ingress_media import restore_native_media
                row = get_session_admission(owner.authority.db, admission_id=binding["admissionId"])
                references = row["payload"].get("attachments_v1", {}).get("media", []) if row else []
                paths = restore_native_media(references)
                if len(paths) != len(images):
                    raise RuntimeError("media_unavailable")
                clean = override + "\n\n" + "\n".join(f"[Image attached at: {path}]" for path in paths)
                kwargs["persist_user_message"] = [{"type": "text", "text": clean}, *images]
        return original(agent, user_message, *args, **kwargs)
    AIAgent.run_conversation = run
