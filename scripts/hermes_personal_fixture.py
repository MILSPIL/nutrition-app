"""Offline Hermes fixtures: prove pinned executable source and OS deny rules."""
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess

PIN = "3f2afed3eb813cb00bd381d29b084d0e01de048f"


def verify_source(source, repo):
    tree = subprocess.check_output(['git','-C',str(repo),'ls-tree','-rz',PIN])
    expected_python, expected_other = {}, {}
    for entry in tree.split(b'\0'):
        if not entry: continue
        info, path = entry.split(b'\t', 1)
        mode, kind, oid = info.decode().split()
        rel = os.fsdecode(path)
        if kind == 'blob' and rel.endswith('.py'):
            if mode == '120000': raise RuntimeError('source_python_symlink_unsupported')
            expected_python[rel] = oid
        elif kind == "blob" and rel.endswith((".pyc", ".pyo", ".so", ".pyd", ".dylib", ".dll")):
            expected_other[rel] = oid
    actual_python = set()
    for directory, names, files in os.walk(source):
        # Only the root's installed dependencies/git metadata are outside the
        # executable source proof. A nested alias can be a discoverable plugin.
        excluded = {".venv", "node_modules", ".git"} if Path(directory) == source else set()
        for name in names:
            if name not in excluded and (Path(directory) / name).is_symlink():
                raise RuntimeError("source_directory_alias")
        names[:] = [name for name in names if name not in excluded and name != "__pycache__"]
        for name in files:
            path = Path(directory) / name
            if name.endswith((".pyc", ".pyo", ".so", ".pyd", ".dylib", ".dll")) and path.relative_to(source).as_posix() not in expected_other:
                raise RuntimeError("source_extra_executable_module")
            if name.endswith('.py'): actual_python.add(path.relative_to(source).as_posix())
    if actual_python != set(expected_python):
        raise RuntimeError('source_executable_manifest_mismatch')
    for rel, oid in {**expected_python, **expected_other}.items():
        path = source / rel
        if path.is_symlink(): raise RuntimeError('source_python_alias')
        data = path.read_bytes()
        if hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() != oid:
            raise RuntimeError(f'source_pin_mismatch:{rel}')
    return {"scope": "all tracked Python source plus pinned importable suffixes, excluding installed dependencies", "verifiedFiles": len(expected_python),
            "verifiedOtherSuffixes": len(expected_other), "sha256": hashlib.sha256(json.dumps({"python":expected_python,"otherSuffixes":expected_other},sort_keys=True).encode()).hexdigest()}


def verify_sandbox(root):
    try:
        (root / "guarded-canary").read_bytes()
    except PermissionError:
        pass
    else:
        raise RuntimeError("sandbox_read_guard_missing")
    try:
        subprocess.run(["/usr/bin/true"], check=False)
    except PermissionError:
        pass
    else:
        raise RuntimeError("sandbox_process_guard_missing")
    for kind in (socket.SOCK_STREAM, socket.SOCK_DGRAM):
        with socket.socket(socket.AF_INET, kind) as probe:
            try:
                probe.connect(("127.0.0.1", 9)) if kind == socket.SOCK_STREAM else probe.sendto(b"synthetic", ("127.0.0.1", 9))
            except PermissionError:
                pass
            else:
                raise RuntimeError("sandbox_network_guard_missing")
    return {"privateReadDenied": True, "childProcessDenied": True, "tcpDenied": True, "udpDenied": True}
