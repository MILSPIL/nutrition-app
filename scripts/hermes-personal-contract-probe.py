#!/usr/bin/env python3
# Synthetic, offline contract probe. Never opens a working Hermes profile.
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

PIN = "3f2afed3eb813cb00bd381d29b084d0e01de048f"
FILES = ["gateway/session_local.py", "gateway/session_controls.py",
         "gateway/session_local_migration.py", "hermes_state_portability.py",
         "hermes_cli/runtime_provider_custom.py", "hermes_state_runtime.py"]


def child(source, root):
    import asyncio
    import socket
    from types import SimpleNamespace
    requests = []
    def denied(sock, address):
        requests.append("blocked")
        raise RuntimeError("synthetic_network_forbidden")
    socket.socket.connect = denied
    socket.socket.connect_ex = denied
    protected = [Path('/Users/user/.hermes/profiles'), Path('/Users/user/.codex/auth.json'),
                 Path('/Users/user/.hermes/auth.json'), Path('/Users/user/Library/Keychains')]
    def audit(event, args):
        if event == 'subprocess.Popen':
            executable = str(args[0])
            if Path(executable).name in ('security', 'osascript'):
                raise RuntimeError('synthetic_secret_transport_forbidden')
        if event != 'open' or not isinstance(args[0], (str, bytes, os.PathLike)):
            return
        path = Path(os.fsdecode(args[0])).resolve()
        if any(path == item or item in path.parents for item in protected):
            raise RuntimeError('synthetic_private_path_forbidden')
        mode, flags = args[1], args[2]
        writing = isinstance(mode, str) and any(ch in mode for ch in 'wax+') or (
            isinstance(flags, int) and flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC))
        if writing and not (path == root or root in path.parents):
            if str(path) != '/dev/null':
                raise RuntimeError('synthetic_write_outside_fixture_forbidden')
    sys.addaudithook(audit)
    sys.path.insert(0, str(source))
    from gateway.config import GatewayConfig
    from gateway.session import SessionStore
    from gateway import run
    from gateway.session_authority import initialize_session_authority
    from gateway.session_controls import AuthorityConnection
    from gateway.session_contract import Principal
    from gateway.session_local import create_local_session
    from hermes_cli.runtime_provider_custom import _resolve_named_custom_runtime
    config = {
        "model": {"default": "gpt-6.1-sol", "provider": "scisense-subscription"},
        "providers": {"scisense-subscription": {
            "api": "http://127.0.0.1:19999/v1", "api_mode": "codex_responses",
            "key_env": "SCISENSE_SYNTHETIC_IPC_KEY"}},
        "platform_toolsets": {"cli": [], "gui": []},
        "auth": {"adopt_external_logins": False},
        "memory": {"memory_enabled": False, "user_profile_enabled": False},
    }
    run._load_gateway_config = lambda: config
    provider = _resolve_named_custom_runtime(
        requested_provider="scisense-subscription", config=config,
        explicit_api_key="synthetic-ipc-not-a-provider-token", target_model="gpt-6.1-sol")
    cases = [{"case": "named_responses_provider", "passed": provider["api_mode"] == "codex_responses",
              "actual": {k: provider.get(k) for k in ("api_mode", "base_url", "provider")}}]

    async def authority(name):
        home = root / name
        home.mkdir()
        (home / "config.yaml").write_text(json.dumps(config))
        os.environ["HERMES_HOME"] = str(home)
        store = SessionStore(home / "sessions", GatewayConfig())
        db = store._db
        store._db = db
        runner = SimpleNamespace(session_store=store, _session_db=db, adapters={},
                                 _draining=False, _cached_agent_for=lambda route: None)
        runner._adapter_for_source = lambda source: runner.adapters.get(source.platform)
        return await initialize_session_authority(runner, profile_id="synthetic-profile", instance_id=name)

    def connection(owner):
        return AuthorityConnection(owner, object(), {
            "provider": "local", "user_id": "synthetic-owner", "profile_id": "synthetic-profile",
            "instance_id": owner.instance_id,
            "capabilities": ["session:create", "session:read", "session:control"]})

    async def checks():
        origin = await authority("origin")
        actor = Principal("synthetic-owner", "synthetic-profile",
                          frozenset({"session:create", "session:read", "session:control"}), "socket")
        params = {"request_id": "stable-synthetic-input", "source": "gui", "cwd": str(root),
                  "model": "gpt-6.1-sol", "toolsets": []}
        ref = create_local_session(origin, actor, params)
        c = connection(origin)
        before = await c.dispatch({"id": 1, "method": "session.resume", "params": {"session_id": ref.session_id}})
        cases.append({"case": "native_resume_before_export", "passed": "result" in before,
                      "actual": "resumed" if "result" in before else before.get("error")})
        # The real gateway turn stamps a canonical local source. No SQL or foreign DB handle.
        live = origin.sessions[ref.session_id]
        origin.runner.session_store._record_gateway_session_peer(ref.session_id, live.route, live.source)
        origin.db.append_message(ref.session_id, "user", "Синтетичний незмінний текст")
        payload = origin.db.export_all(include_inactive=True)
        assert len(payload) == 1 and payload[0]["source"] == "local", "fixture_must_be_canonical"
        destination = await authority("destination")
        imported = destination.db.import_sessions(payload)
        assert imported["ok"] and imported["imported"] == 1, "fixture_import_failed"
        after = await connection(destination).dispatch({"id": 2, "method": "session.resume",
                                                       "params": {"session_id": ref.session_id}})
        cases.append({"case": "canonical_import_resume_same_session", "passed": "result" in after,
                      "actual": "resumed" if "result" in after else after.get("error")})
        changed = json.loads(json.dumps(payload))
        changed[0]["messages"][0]["content"] = "OTHER_SYNTHETIC_CONTENT"
        collision = destination.db.import_sessions(changed)
        cases.append({"case": "import_rejects_different_existing_content",
                      "passed": collision.get("ok") is False,
                      "actual": {k: collision.get(k) for k in ("ok", "imported", "skipped")}})
        lookup = await connection(origin).dispatch({"id": 3, "method": "prompt.lookup", "params": {
            "session_id": ref.session_id, "submission_id": "stable-synthetic-input"}})
        cases.append({"case": "owner_input_lookup_without_resubmit", "passed": "result" in lookup,
                      "actual": "supported" if "result" in lookup else lookup.get("error")})
        assert not requests, "unexpected_network_attempt"
        return {"cases": cases, "providerRequests": 0, "networkAttempts": len(requests),
                "realProfileOpened": False, "sourceWrites": False}
    print(json.dumps(asyncio.run(checks()), ensure_ascii=False))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--source", required=True, type=Path)
    p.add_argument("--repo", type=Path)
    p.add_argument("--receipt", type=Path)
    p.add_argument("--child-root", type=Path)
    args = p.parse_args()
    source = args.source.resolve(strict=True)
    if args.child_root:
        child(source, args.child_root)
        return
    if not args.repo:
        p.error("--repo is required for pinned source verification")
    hashes = {}
    for rel in FILES:
        expected = subprocess.check_output(["git", "-C", str(args.repo), "show", f"{PIN}:{rel}"])
        actual = (source / rel).read_bytes()
        if actual != expected:
            raise RuntimeError(f"source_pin_mismatch:{rel}")
        hashes[rel] = hashlib.sha256(actual).hexdigest()
    with tempfile.TemporaryDirectory(prefix="scisense-personal-contract-") as tmp:
        root = Path(tmp).resolve()
        for rel in ["home", "hermes", "codex", "config", "cache", "data", "tmp", "bin"]:
            (root / rel).mkdir(mode=0o700)
        (root / "bin/gh").write_text("#!/bin/sh\nexit 1\n")
        (root / "bin/gh").chmod(0o700)
        env = {"PATH": f"{root / 'bin'}:/usr/bin:/bin", "HOME": str(root / "home"),
               "HERMES_HOME": str(root / "hermes"), "CODEX_HOME": str(root / "codex"),
               "XDG_CONFIG_HOME": str(root / "config"), "XDG_CACHE_HOME": str(root / "cache"),
               "XDG_DATA_HOME": str(root / "data"), "TMPDIR": str(root / "tmp"),
               "PYTHONNOUSERSITE": "1", "PYTHONDONTWRITEBYTECODE": "1", "LANG": "en_US.UTF-8",
               "SCISENSE_SYNTHETIC_IPC_KEY": "synthetic-ipc-not-a-provider-token"}
        proc = subprocess.run([sys.executable, str(Path(__file__).resolve()), "--source", str(source),
                               "--child-root", str(root)], cwd=root, env=env, text=True,
                              capture_output=True, timeout=50)
        if proc.returncode:
            # Only synthetic output; no inherited secrets/authentication environment.
            sys.stderr.write(proc.stderr[-7000:])
            raise RuntimeError("synthetic_contract_harness_failed")
        data = json.loads(proc.stdout.strip().splitlines()[-1])
        data.update({"sourcePin": PIN, "sourceHashes": hashes, "synthetic": True,
                     "cleanup": "complete_after_child_exit", "criterionAcceptance": False})
    data["verdict"] = "passed" if all(c["passed"] for c in data["cases"]) else "blocked"
    if args.receipt:
        args.receipt.parent.mkdir(parents=True, exist_ok=True)
        args.receipt.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(data, ensure_ascii=False))
    sys.exit(0 if data["verdict"] == "passed" else 2)


if __name__ == "__main__":
    main()
