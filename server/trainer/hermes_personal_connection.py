"""Native Hermes auth-save/refresh boundary for a dedicated trusted payer.
Persistent secrets live in the Node encrypted store. Native auth/config files
are private volatile tmpfs material; profile processes never mount this HOME.
"""
import hashlib
import os
from pathlib import Path
import re
import stat
import sys
import threading
import uuid

_active_bridge = None
_active_lock = threading.Lock()


def _mount_table():
    return Path("/proc/self/mountinfo").read_text()


def assert_tmpfs_home(home):
    home = Path(home)
    info = home.lstat()
    if not home.is_absolute() or home.resolve() != home or not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise RuntimeError("connection_permissions")
    if sys.platform != "linux":
        raise RuntimeError("connection_tmpfs_required")
    matches = []
    for line in _mount_table().splitlines():
        left, separator, right = line.partition(" - ")
        if not separator:
            raise RuntimeError("connection_tmpfs_required")
        fields, filesystem = left.split(), right.split()
        mount = Path(re.sub(r"\\([0-7]{3})", lambda value: chr(int(value[1], 8)), fields[4]))
        if home in mount.parents and filesystem[0] != "tmpfs":
            raise RuntimeError("connection_tmpfs_required")
        if home == mount or mount in home.parents:
            matches.append((len(mount.parts), filesystem[0]))
    deepest = max((depth for depth, _ in matches), default=-1)
    if not matches or {kind for depth, kind in matches if depth == deepest} != {"tmpfs"}:
        raise RuntimeError("connection_tmpfs_required")
    configured = os.environ.get("HERMES_HOME")
    if not configured or Path(configured).resolve() != home:
        raise RuntimeError("connection_home_mismatch")
    return home


def read_material(home):
    result, size = {}, 0
    for name in ("auth.json", "config.yaml", ".env"):
        path = home / name
        if not os.path.lexists(path):
            continue
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, "rb") as source:
            info = os.fstat(source.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1 or info.st_mode & 0o077:
                raise RuntimeError("connection_permissions")
            result[name] = source.read(1024 * 1024 + 1)
            size += len(result[name])
            if size > 1024 * 1024:
                raise RuntimeError("connection_material_invalid")
    return result


def _tokens_fingerprint(tokens):
    if not isinstance(tokens, dict):
        return None
    values = [tokens.get("access_token"), tokens.get("refresh_token")]
    if not all(isinstance(value, str) and value and len(value) <= 65536 for value in values):
        return None
    return hashlib.sha256((values[0] + "\0" + values[1]).encode()).digest()


def _contains_rotation(store, expected):
    if expected is None:
        return False
    candidates = [store.get("providers", {}).get("openai-codex", {}).get("tokens")]
    candidates.extend(store.get("credential_pool", {}).get("openai-codex", []))
    return any(_tokens_fingerprint(value) == expected for value in candidates)


class NativeCredentialBridge:
    def __init__(self, *, home, revision, begin_refresh, checkpoint, require_reauth):
        self.home = assert_tmpfs_home(home)
        if type(revision) is not int or revision < 1:
            raise RuntimeError("connection_conflict")
        self.revision, self.begin_refresh = revision, begin_refresh
        self.checkpoint, self.require_reauth = checkpoint, require_reauth
        self.lock, self.pending, self.rotated, self.blocked = threading.RLock(), None, None, False
        self.installed = False

    def _revision(self, result):
        revision = result.get("revision") if isinstance(result, dict) else None
        if type(revision) is not int or revision != self.revision + 1:
            raise RuntimeError("connection_conflict")
        self.revision = revision

    def ensure_ready(self, *, oauth_refresh=False):
        with self.lock:
            if not self.installed or _active_bridge is not self or self.blocked or self.pending is not None and not oauth_refresh:
                raise RuntimeError("connection_auth_required")
            if oauth_refresh and (self.pending is None or self.rotated is not None):
                raise RuntimeError("connection_auth_required")

    def install(self):
        global _active_bridge
        with _active_lock:
            if _active_bridge is not None:
                raise RuntimeError("connection_busy")
            _active_bridge = self
        try:
            from hermes_cli import auth, auth_codex
            self.auth, self.auth_codex = auth, auth_codex
            self.original_save, self.original_refresh = auth._save_auth_store, auth.refresh_codex_oauth_pure
            self.original_codex_refresh = auth_codex.refresh_codex_oauth_pure
            def save(store, target_path=None):
                with self.lock:
                    if self.blocked:
                        raise RuntimeError("connection_auth_required")
                    target = (Path(target_path) if target_path is not None else auth._auth_file_path()).resolve()
                    if target != self.home / "auth.json":
                        raise RuntimeError("connection_home_mismatch")
                    result = self.original_save(store, target_path=target)
                    options = {"expectedRevision": self.revision}
                    if self.pending is not None:
                        if not _contains_rotation(store, self.rotated):
                            # Native metadata cannot declare a rotation committed.
                            return result
                        options.update(refreshId=self.pending, rotationCommitted=True)
                    try:
                        self._revision(self.checkpoint(read_material(self.home), options))
                        self.pending, self.rotated = None, None
                    except BaseException:
                        self.blocked = True
                        raise
                    return result
            def refresh(*args, **kwargs):
                with self.lock:
                    self.ensure_ready()
                    ident = uuid.uuid4().hex
                    try:
                        self._revision(self.begin_refresh(ident, {"expectedRevision": self.revision}))
                    except BaseException:
                        self.blocked = True
                        raise
                    self.pending, self.rotated = ident, None
                    try:
                        value = self.original_refresh(*args, **kwargs)
                        self.rotated = _tokens_fingerprint(value)
                        if self.rotated is None:
                            raise RuntimeError("connection_auth_required")
                        return value
                    except BaseException:
                        self.blocked = True
                        try:
                            self._revision(self.require_reauth({"expectedRevision": self.revision}))
                        except Exception:
                            pass  # Durable pending remains fail-closed on restart.
                        raise
            self.saved_hook, self.refresh_hook = save, refresh
            auth._save_auth_store = save
            auth.refresh_codex_oauth_pure = auth_codex.refresh_codex_oauth_pure = refresh
            self.installed = True
            return self
        except BaseException:
            with _active_lock:
                if _active_bridge is self:
                    _active_bridge = None
            raise

    def checkpoint_current(self):
        # An explicit owner selection changes only volatile native config.
        # Publish its complete native snapshot before acknowledging the change.
        with self.lock:
            self.ensure_ready()
            try:
                self._revision(self.checkpoint(read_material(self.home), {"expectedRevision": self.revision}))
            except BaseException:
                self.blocked = True
                raise
            return self.revision

    def close(self):
        global _active_bridge
        if not self.installed:
            return
        with self.lock, _active_lock:
            if self.auth._save_auth_store is self.saved_hook:
                self.auth._save_auth_store = self.original_save
            if self.auth.refresh_codex_oauth_pure is self.refresh_hook:
                self.auth.refresh_codex_oauth_pure = self.original_refresh
            if self.auth_codex.refresh_codex_oauth_pure is self.refresh_hook:
                self.auth_codex.refresh_codex_oauth_pure = self.original_codex_refresh
            self.installed = False
            if _active_bridge is self:
                _active_bridge = None
