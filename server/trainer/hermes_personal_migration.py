"""Offline initial transcript migration. No credential/config/policy copying.
The operator fences source writers first and promotes a new empty HOME only
once. Native SessionDB owns all database writes. Encrypted bundles are bound to
one verified SciSense UID and destination HOME; never log their contents.
"""
import base64
import ctypes
import errno
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import tempfile

PIN = "3f2afed3eb813cb00bd381d29b084d0e01de048f"
MAX_CONTEXT = 400000
MAX_MEDIA = 256 * 1024 * 1024
MAX_BUNDLE = 400 * 1024 * 1024
MAX_ENCRYPTED_BUNDLE = 4 * ((MAX_BUNDLE + 16 + 2) // 3) + 512
SESSION_FIELDS = ("id", "parent_session_id", "model", "started_at", "ended_at", "end_reason", "archived", "auto_archived", "pinned", "hidden", "title")
MESSAGE_FIELDS = ("role", "content", "timestamp", "tool_call_id", "tool_calls", "tool_name", "message_uid", "active", "compacted", "effect_disposition", "finish_reason", "reasoning", "reasoning_content", "reasoning_details", "codex_reasoning_items", "codex_message_items", "absorbed_message_uids", "tool_call_uids", "display_kind", "display_metadata", "_compressed_summary")
SECRET = re.compile(r"(?:sk-(?:ant-)?[A-Za-z0-9_-]{24,}|gsk_[A-Za-z0-9_-]{24,}|(?:Bearer\s+)[A-Za-z0-9._-]{24,})")
ID = re.compile(r"[A-Za-z0-9_.:-]{1,200}")
NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,100}\.(?:md|txt)")


def encoded(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":")).encode()


def digest(value):
    return hashlib.sha256(encoded(value)).hexdigest()


def _fail():
    raise RuntimeError("migration_invalid")


def _home(value):
    if not isinstance(value, str) or not value.startswith("/") or str(Path(value)) != value or any(c in value for c in ("\0", "\r", "\n")) or ".." in Path(value).parts or value == "/":
        _fail()
    return value


def _uid(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value):
        _fail()
    return value


def semantic(session):
    """Identity/content, independent of fresh native ownership/config fields."""
    result = {k: session.get(k) for k in SESSION_FIELDS if k not in ("title",)}
    for key in ("archived", "auto_archived", "pinned", "hidden"):
        result[key] = int(bool(result[key]))
    for key in ("started_at", "ended_at"):
        if result[key] is not None:
            result[key] = float(result[key])
    result["messages"] = []
    for message in session["messages"]:
        row = {k: message.get(k) for k in MESSAGE_FIELDS}
        row["active"] = int(message.get("active", 1))
        row["compacted"] = int(message.get("compacted", 0))
        row["_compressed_summary"] = bool(message.get("_compressed_summary"))
        if row["timestamp"] is not None:
            row["timestamp"] = float(row["timestamp"])
        result["messages"].append(row)
    return result


def web_history(messages, *, uid, conversation_id):
    """Visible legacy rows become an archive, never executable old turn state."""
    _uid(uid)
    if not isinstance(conversation_id, str) or not conversation_id or not isinstance(messages, list):
        _fail()
    sid = "scisense-web-" + digest([uid, conversation_id])
    rows = []
    seen = set()
    for row in messages:
        if not isinstance(row, dict) or row.get("role") not in ("user", "assistant") or not isinstance(row.get("content"), str) or not isinstance(row.get("id"), str) or row["id"] in seen or type(row.get("created")) not in (int, float) or not math.isfinite(row["created"]):
            _fail()
        seen.add(row["id"])
        rows.append({"role": row["role"], "content": row["content"], "timestamp": row["created"] / 1000,
                     "message_uid": "scisense-web-" + digest([uid, conversation_id, row["id"]])})
    return {"id": sid, "source": "desktop", "title": "SciSense: архів веброзмови", "started_at": rows[0]["timestamp"] if rows else 0,
            "archived": 1, "hidden": 0, "messages": rows}


def prepare(*, uid, source_home, destination_home, primary_id, sessions, materials=(), media=(), source_pin=PIN):
    _uid(uid); _home(source_home); _home(destination_home)
    if source_pin != PIN or Path(source_home).is_relative_to(destination_home) or Path(destination_home).is_relative_to(source_home) or not isinstance(sessions, list) or not 1 <= len(sessions) <= 1000 or not isinstance(primary_id, str):
        _fail()
    clean, provenance, seen = [], [], set()
    for raw in sessions:
        if not isinstance(raw, dict) or not isinstance(raw.get("id"), str) or not ID.fullmatch(raw["id"]) or raw["id"] in seen or not isinstance(raw.get("messages"), list):
            _fail()
        seen.add(raw["id"])
        session = {k: raw[k] for k in SESSION_FIELDS if k in raw}
        session.update(source="desktop", cwd=destination_home, title="Bot Chat" if raw["id"] == primary_id else (raw.get("title") or "Історична розмова"))
        if raw["id"] != primary_id and session["title"] == "Bot Chat":
            session["title"] = "Історична розмова: Bot Chat"
        session["messages"] = []
        for index, message in enumerate(raw["messages"]):
            if not isinstance(message, dict) or message.get("role") not in ("user", "assistant", "tool") or not isinstance(message.get("content"), (str, list, type(None))):
                _fail()
            item = {k: message[k] for k in MESSAGE_FIELDS if k in message}
            if not item.get("message_uid"):
                item["message_uid"] = "scisense-migrate-" + digest([raw["id"], index, message])
            metadata = item.get("display_metadata")
            if metadata is not None:
                if not isinstance(metadata, dict) or set(metadata) - {"model_only"} or any(type(v) not in (bool, int) or v not in (0, 1) for v in metadata.values()):
                    raise RuntimeError("migration_display_metadata_unsupported")
                item["display_metadata"] = {k: bool(v) for k, v in metadata.items()}
            session["messages"].append(item)
        clean.append(session)
        provenance.append({"id": raw["id"], "source": raw.get("source"), "sourceFingerprint": digest(semantic(raw))})
    if primary_id not in seen or any(s.get("parent_session_id") and s["parent_session_id"] not in seen for s in clean):
        raise RuntimeError("migration_lineage_incomplete")
    if not isinstance(materials, (list, tuple)) or len(materials) > 32:
        _fail()
    context, names, total = [], set(), 0
    for row in materials:
        if not isinstance(row, dict) or set(row) != {"name", "text"} or not isinstance(row["name"], str) or not NAME.fullmatch(row["name"]) or row["name"] in names or not isinstance(row["text"], str):
            _fail()
        if any(x in row["name"].lower() for x in ("auth", "config", "secret", "token", "hook", "cron", "telegram")):
            _fail()
        names.add(row["name"]); total += len(row["text"].encode())
        context.append({**row, "sha256": hashlib.sha256(row["text"].encode()).hexdigest()})
    if total > MAX_CONTEXT:
        raise RuntimeError("migration_context_limit")
    photos, paths, total = [], {}, 0
    for row in media:
        if not isinstance(row, dict) or set(row) != {"sourcePath", "mime", "data"} or not isinstance(row["sourcePath"], str) or row["sourcePath"] in paths or not isinstance(row["data"], str):
            _fail()
        path = Path(row["sourcePath"])
        roots = [Path(source_home) / "cache/images", Path(source_home) / "cache/documents/native-inputs"]
        if str(path) != row["sourcePath"] or ".." in path.parts or not any(path.is_relative_to(r) for r in roots):
            _fail()
        try:
            data = base64.b64decode(row["data"], validate=True)
        except Exception:
            _fail()
        from hermes_personal_media import _image
        ext = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}.get(row["mime"])
        if not ext or not 0 < len(data) <= 5 * 1024 * 1024 or _image(data) != row["mime"]:
            _fail()
        total += len(data)
        if total > MAX_MEDIA:
            raise RuntimeError("migration_media_limit")
        sha = hashlib.sha256(data).hexdigest()
        relative = "cache/documents/native-inputs/" + sha + "/photo" + ext
        paths[row["sourcePath"]] = str(Path(destination_home) / relative)
        photos.append({"path": relative, "mime": row["mime"], "sha256": sha, "data": row["data"]})
    # Rewrite only exact explicit local image references, including multimodal
    # nested strings. An unmapped old HOME image is a blocker, never a silent loss.
    def rewrite(value):
        if isinstance(value, str):
            for old in sorted(paths, key=len, reverse=True):
                # Complete path tokens only; a.png is not a.png-extra.png.
                value = re.sub(r'(?<![^\s\["\(])' + re.escape(old) + r'(?=$|[\s\]\)"<>])', lambda _match: paths[old], value)
            if source_home + "/cache/images/" in value or source_home + "/cache/documents/native-inputs/" in value:
                raise RuntimeError("migration_media_missing")
            return value
        if isinstance(value, list):
            return [rewrite(item) for item in value]
        if isinstance(value, dict):
            return {k: rewrite(v) for k, v in value.items()}
        return value
    clean = rewrite(clean)
    bundle = {"version": 1, "pin": PIN, "uid": uid, "sourceHome": source_home, "destinationHome": destination_home,
              "primaryId": primary_id, "sessions": clean, "provenance": provenance, "materials": context, "media": photos,
              "mediaPathMap": paths, "fingerprints": {s["id"]: digest(semantic(s)) for s in clean}}
    body = encoded(bundle)
    if len(body) > MAX_BUNDLE or SECRET.search(body.decode()):
        raise RuntimeError("migration_secret_or_size")
    return bundle


def seal(bundle, key):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    if not isinstance(key, bytes) or len(key) != 32:
        _fail()
    preflight(bundle)
    nonce = os.urandom(12)
    aad = encoded(["scisense-personal-migration-v1", bundle["uid"], bundle["destinationHome"]])
    data = AESGCM(key).encrypt(nonce, encoded(bundle), aad)
    return encoded({"version": 1, "nonce": base64.b64encode(nonce).decode(), "data": base64.b64encode(data).decode()})


def unseal(data, key, *, uid, destination_home):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    _uid(uid); _home(destination_home)
    try:
        envelope = json.loads(data)
        if set(envelope) != {"version", "nonce", "data"} or envelope["version"] != 1 or len(data) > MAX_ENCRYPTED_BUNDLE:
            _fail()
        aad = encoded(["scisense-personal-migration-v1", uid, destination_home])
        bundle = json.loads(AESGCM(key).decrypt(base64.b64decode(envelope["nonce"], validate=True), base64.b64decode(envelope["data"], validate=True), aad))
        if bundle["uid"] != uid or bundle["destinationHome"] != destination_home or bundle["pin"] != PIN or bundle["version"] != 1:
            _fail()
        preflight(bundle)
        return bundle
    except Exception:
        raise RuntimeError("migration_authentication_failed") from None


def preflight(bundle, existing=()):
    """No writes, including on ID collision or changed existing content."""
    if bundle.get("pin") != PIN or bundle.get("version") != 1:
        _fail()
    _uid(bundle["uid"]); _home(bundle["sourceHome"]); _home(bundle["destinationHome"])
    if set(bundle) != {"version", "pin", "uid", "sourceHome", "destinationHome", "primaryId", "sessions", "provenance", "materials", "media", "mediaPathMap", "fingerprints"}:
        _fail()
    rows = bundle["sessions"]
    if not isinstance(rows, list) or not 1 <= len(rows) <= 1000:
        _fail()
    for row in rows:
        if not isinstance(row, dict) or set(row) - set(SESSION_FIELDS) - {"source", "cwd", "messages"} or row.get("source") != "desktop" or row.get("cwd") != bundle["destinationHome"] or not ID.fullmatch(row.get("id", "")) or not isinstance(row.get("messages"), list):
            _fail()
        if (row.get("title") == "Bot Chat") != (row["id"] == bundle["primaryId"]):
            _fail()
        for message in row["messages"]:
            if not isinstance(message, dict) or set(message) - set(MESSAGE_FIELDS) or message.get("role") not in ("user", "assistant", "tool"):
                _fail()
    if len({s["id"] for s in rows}) != len(rows) or bundle["primaryId"] not in {s["id"] for s in rows}:
        _fail()
    if bundle["fingerprints"] != {s["id"]: digest(semantic(s)) for s in rows}:
        raise RuntimeError("migration_fingerprint_mismatch")
    previous = {s["id"]: s for s in existing}
    for row in rows:
        if row["id"] in previous and digest(semantic(previous[row["id"]])) != bundle["fingerprints"][row["id"]]:
            raise RuntimeError("migration_id_collision")
    names = set(); total_context = 0
    for material in bundle["materials"]:
        if set(material) != {"name", "text", "sha256"} or not NAME.fullmatch(material["name"]) or material["name"] in names or not isinstance(material["text"], str) or hashlib.sha256(material["text"].encode()).hexdigest() != material["sha256"]:
            _fail()
        if any(x in material["name"].lower() for x in ("auth", "config", "secret", "token", "hook", "cron", "telegram")):
            _fail()
        names.add(material["name"]); total_context += len(material["text"].encode())
    if len(names) > 32 or total_context > MAX_CONTEXT:
        _fail()
    total_media = 0
    for photo in bundle["media"]:
        if set(photo) != {"path", "mime", "sha256", "data"} or not re.fullmatch(r"[a-f0-9]{64}", photo["sha256"]):
            _fail()
        ext = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}.get(photo["mime"])
        if not ext or photo["path"] != "cache/documents/native-inputs/" + photo["sha256"] + "/photo" + ext:
            _fail()
        data = base64.b64decode(photo["data"], validate=True)
        from hermes_personal_media import _image
        if not 0 < len(data) <= 5 * 1024 * 1024 or _image(data) != photo["mime"] or hashlib.sha256(data).hexdigest() != photo["sha256"]:
            raise RuntimeError("migration_media_corrupt")
        total_media += len(data)
    if total_media > MAX_MEDIA or len(encoded(bundle)) > MAX_BUNDLE or SECRET.search(encoded(bundle).decode()):
        _fail()
    return {"sessions": len(rows), "messages": sum(len(s["messages"]) for s in rows), "materials": len(bundle["materials"]),
            "photos": len(bundle["media"]), "skipped": sum(s["id"] in previous for s in rows)}


def _private(path, directory=False):
    path = Path(path)
    info = path.lstat()
    if path.resolve() != path or info.st_uid != os.getuid() or info.st_mode & 0o077 or not (stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode) and info.st_nlink == 1):
        raise RuntimeError("migration_permissions")
    return path


def _write(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(data); stream.flush(); os.fsync(stream.fileno())


def import_empty(bundle, *, failpoint=None):
    """All-or-nothing promotion. Never overlays a HOME or restores app ledgers.
    Interrupted staging stays a private abandoned sibling, never the live HOME.
    Existing target is refused even if a generic native importer would skip IDs.
    """
    receipt = preflight(bundle)
    home = Path(_home(bundle["destinationHome"])); _private(home.parent, directory=True)
    if home.exists() or home.is_symlink():
        raise RuntimeError("migration_destination_exists")
    stage = Path(tempfile.mkdtemp(prefix=".scisense-migration-", dir=home.parent))
    try:
        from hermes_state import SessionDB
        db = SessionDB(stage / "state.db")
        try:
            result = db.import_sessions(bundle["sessions"])
            if result.get("ok") is not True or result.get("imported") != receipt["sessions"] or result.get("skipped"):
                raise RuntimeError("migration_native_import_failed")
            after = db.export_all(include_inactive=True)
            if {s["id"]: digest(semantic(s)) for s in after} != bundle["fingerprints"]:
                raise RuntimeError("migration_native_roundtrip_failed")
        finally:
            db.close()
        context = stage / "personal-context"; context.mkdir(mode=0o700)
        sources = context / "sources"; sources.mkdir(mode=0o700)
        for material in bundle["materials"]:
            _write(sources / material["name"], material["text"].encode())
        _write(context / "sources.json", encoded({"version": 1, "profileHome": str(home), "files": [{"name": m["name"], "sha256": m["sha256"]} for m in bundle["materials"]]}))
        for photo in bundle["media"]:
            target = stage / photo["path"]; target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            if not target.exists():
                _write(target, base64.b64decode(photo["data"], validate=True))
        _write(stage / "migration-receipt.json", encoded({"version": 1, "uid": bundle["uid"], "bundleFingerprint": digest(bundle), "counts": receipt}))
        for root, directories, files in os.walk(stage):
            os.chmod(root, 0o700)
            for name in files:
                item = Path(root) / name
                os.chmod(item, 0o600)
                fd = os.open(item, os.O_RDONLY | os.O_NOFOLLOW)
                try:
                    os.fsync(fd)
                finally:
                    os.close(fd)
            fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
        if failpoint:
            failpoint("before_promote", stage)
        if home.exists() or home.is_symlink():
            raise RuntimeError("migration_destination_exists")
        publish_new(stage, home)
        fd = os.open(home.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
        return receipt
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def publish_new(stage, home):
    """Atomic no-replace directory publication on the two supported platforms."""
    libc = ctypes.CDLL(None, use_errno=True)
    if sys.platform == "darwin":
        rename = libc.renamex_np
        rename.argtypes = (ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint)
        result = rename(os.fsencode(stage), os.fsencode(home), 4)  # RENAME_EXCL
    elif sys.platform == "linux":
        rename = libc.renameat2
        rename.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint)
        result = rename(-100, os.fsencode(stage), -100, os.fsencode(home), 1)  # RENAME_NOREPLACE
    else:
        raise RuntimeError("migration_platform_unsupported")
    if result:
        code = ctypes.get_errno()
        if code in (errno.EEXIST, errno.ENOTEMPTY):
            raise RuntimeError("migration_destination_exists")
        raise OSError(code, "migration_publish_failed")
