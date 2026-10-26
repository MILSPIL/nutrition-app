"""Canonical profile facts and explicitly confirmed memory additions.
Imported source material is data, never executable Hermes policy or credentials.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import time
import uuid

MAX_CONTEXT = 400000
MAX_REVISION = 9007199254740991


def _directory(path):
    info = path.lstat()
    if path.resolve() != path or not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise RuntimeError("context_unavailable")
    return path


def _read(path, limit=MAX_CONTEXT + 100000):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, "rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.getuid() or info.st_mode & 0o077 or info.st_size > limit:
            raise RuntimeError("context_unavailable")
        return stream.read(limit + 1)


def _atomic(path, value):
    _directory(path.parent)
    if path.exists() or path.is_symlink():
        _read(path)
    encoded = json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode()
    if len(encoded) > MAX_CONTEXT + 100000:
        raise RuntimeError("context_too_large")
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, "wb") as output:
            output.write(encoded); output.flush(); os.fsync(output.fileno())
        os.replace(temporary, path)
        descriptor = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    finally:
        temporary.unlink(missing_ok=True)


class ProfileContext:
    def __init__(self, home, *, now=time.time, initialize=False, read_only=False):
        home = _directory(Path(home))
        self.home = home
        self.read_only = read_only is True
        if self.read_only and initialize:
            raise RuntimeError("context_unavailable")
        self.root, self.now, self.initializing = home / "personal-context", now, initialize is True
        if not self.root.exists():
            if not self.initializing:
                raise RuntimeError("context_unavailable")
            self.root.mkdir(mode=0o700)
        _directory(self.root)
        self.sources = self.root / "sources"
        if not self.sources.exists():
            if not self.initializing:
                raise RuntimeError("context_unavailable")
            self.sources.mkdir(mode=0o700)
        _directory(self.sources)
        self.state = self.root / "memory.json"
        self.read()
        self.initializing = False

    def _sources(self):
        _directory(self.root); _directory(self.sources)
        manifest = self.root / "sources.json"
        if manifest.is_symlink():
            raise RuntimeError("context_unavailable")
        if not manifest.exists():
            if list(self.sources.iterdir()):
                raise RuntimeError("context_unavailable")
            return "", hashlib.sha256(b"").hexdigest()
        try:
            value = json.loads(_read(manifest, 32000))
            if not isinstance(value, dict) or set(value) != {"version", "profileHome", "files"} or type(value["version"]) is not int or value["version"] != 1 or value["profileHome"] != str(self.home) or not isinstance(value["files"], list) or len(value["files"]) > 32:
                raise ValueError()
            names, parts, total = set(), [], 0
            for entry in value["files"]:
                if not isinstance(entry, dict) or set(entry) != {"name", "sha256"} or not isinstance(entry["name"], str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,100}\.(md|txt)", entry["name"]) or entry["name"] in names or not isinstance(entry["sha256"], str) or not re.fullmatch(r"[a-f0-9]{64}", entry["sha256"]):
                    raise ValueError()
                names.add(entry["name"])
                data = _read(self.sources / entry["name"])
                total += len(data)
                if total > MAX_CONTEXT or hashlib.sha256(data).hexdigest() != entry["sha256"]:
                    raise ValueError()
                parts.append(data.decode("utf8"))
            if {path.name for path in self.sources.iterdir()} != names:
                raise ValueError()
            text = "\n\n".join(parts)
            return text, hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()
        except (ValueError, KeyError, TypeError, OSError):
            raise RuntimeError("context_unavailable") from None

    def _load(self):
        text, digest = self._sources()
        if self.state.exists() or self.state.is_symlink():
            try:
                value = json.loads(_read(self.state))
                if not isinstance(value, dict) or set(value) != {"version", "profileHome", "revision", "sourceDigest", "entries"} or type(value["version"]) is not int or value["version"] != 1 or value["profileHome"] != str(self.home) or type(value["revision"]) is not int or not 0 <= value["revision"] <= MAX_REVISION or not isinstance(value["sourceDigest"], str) or not re.fullmatch(r"[a-f0-9]{64}", value["sourceDigest"]) or not isinstance(value["entries"], list) or len(value["entries"]) > 10000:
                    raise ValueError()
                seen = set()
                for entry in value["entries"]:
                    try:
                        self._proposal(entry)
                    except RuntimeError:
                        raise ValueError() from None
                    if entry["proposalId"] in seen:
                        raise ValueError()
                    seen.add(entry["proposalId"])
            except (ValueError, KeyError, TypeError, OSError):
                raise RuntimeError("context_unavailable") from None
            if value["sourceDigest"] != digest:
                if self.read_only:
                    raise RuntimeError("context_conflict")
                if digest == hashlib.sha256(b"").hexdigest():
                    raise RuntimeError("context_unavailable")
                if value["revision"] >= MAX_REVISION:
                    raise RuntimeError("context_conflict")
                value = {**value, "sourceDigest": digest, "revision": value["revision"] + 1}
                _atomic(self.state, value)
        else:
            if not self.initializing:
                raise RuntimeError("context_unavailable")
            value = {"version": 1, "profileHome": str(self.home), "revision": 0, "sourceDigest": digest, "entries": []}
            _atomic(self.state, value)
        return text, value

    @staticmethod
    def _proposal(value):
        if not isinstance(value, dict) or set(value) != {"proposalId", "baseRevision", "text"} or not isinstance(value["proposalId"], str) or not re.fullmatch(r"[A-Za-z0-9-]{16,80}", value["proposalId"]) or type(value["baseRevision"]) is not int or not 0 <= value["baseRevision"] <= MAX_REVISION or not isinstance(value["text"], str) or not value["text"].strip() or len(value["text"].encode()) > 8000 or re.search(r"data:(image|audio)/", value["text"], re.I) or "\0" in value["text"]:
            raise RuntimeError("invalid_context_proposal")

    @staticmethod
    def _render(source, state):
        additions = "\n\n".join(entry["text"] for entry in state["entries"])
        text = source + ("\n\nПідтверджені доповнення, від давніших до новіших:\n" + additions if additions else "")
        if len(text.encode()) > MAX_CONTEXT:
            raise RuntimeError("context_too_large")
        return {"text": text, "revision": state["revision"], "mode": "append", "applied": {entry["proposalId"]: hashlib.sha256(json.dumps(entry, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest() for entry in state["entries"]}}

    def read(self):
        return self._render(*self._load())

    def commit(self, proposal):
        if self.read_only:
            raise RuntimeError("context_read_only")
        self._proposal(proposal)
        source, state = self._load()
        old = next((entry for entry in state["entries"] if entry["proposalId"] == proposal["proposalId"]), None)
        if old is not None:
            if old != proposal:
                raise RuntimeError("context_conflict")
            return {**self._render(source, state), "replayed": True}
        if proposal["baseRevision"] != state["revision"] or state["revision"] >= MAX_REVISION or len(state["entries"]) >= 10000:
            raise RuntimeError("context_conflict")
        value = {**state, "revision": state["revision"] + 1, "entries": [*state["entries"], dict(proposal)]}
        result = self._render(source, value)
        _atomic(self.state, value)
        return {**result, "replayed": False}
