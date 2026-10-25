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
    # The outer Seatbelt denies all networking and child execution. Verify it before native imports.
    guarded = root / "guarded-canary"
    try:
        guarded.read_bytes()
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
    for kind in [socket.SOCK_STREAM, socket.SOCK_DGRAM]:
        with socket.socket(socket.AF_INET, kind) as probe:
            try:
                probe.connect(("127.0.0.1", 9)) if kind == socket.SOCK_STREAM else probe.sendto(b"synthetic", ("127.0.0.1", 9))
            except PermissionError:
                pass
            else:
                raise RuntimeError("sandbox_network_guard_missing")
    def denied(sock, address):
        requests.append("blocked")
        raise RuntimeError("synthetic_network_forbidden")
    socket.socket.connect = denied
    socket.socket.connect_ex = denied
    protected = [Path('/Users/user/.hermes'), Path('/Users/user/.codex/auth.json'),
                 Path('/Users/user/.config'), Path('/Users/user/Library/Keychains')]
    def audit(event, args):
        if event in ('subprocess.Popen', 'os.system', 'os.posix_spawn', 'os.exec', 'os.fork'):
            raise PermissionError('synthetic_child_process_forbidden')
        if event == 'socket.sendto':
            requests.append('blocked_sendto')
            raise PermissionError('synthetic_network_forbidden')
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
    run._load_gateway_config = lambda *args, **kwargs: config
    provider = _resolve_named_custom_runtime(
        requested_provider="scisense-subscription", config=config,
        explicit_api_key="synthetic-ipc-not-a-provider-token", target_model="gpt-6.1-sol")
    cases = [{"case": "named_responses_provider", "passed": provider["api_mode"] == "codex_responses",
              "actual": {k: provider.get(k) for k in ("api_mode", "base_url", "provider")}}]

    async def authority(name, *, canonical=False, instance=None):
        home = root / name
        home.mkdir(exist_ok=True)
        (home / "config.yaml").write_text(json.dumps(config))
        os.environ["HERMES_HOME"] = str(home)
        ownership = None
        if canonical:
            from gateway.runtime_ownership import ProfileOwnership
            ownership = ProfileOwnership()
            ownership.reserve([home])
        store = SessionStore(home / "sessions", GatewayConfig())
        db = store._db
        store._db = db
        runner = SimpleNamespace(session_store=store, _session_db=db, adapters={},
                                 _draining=False, _cached_agent_for=lambda route: None)
        runner._adapter_for_source = lambda source: runner.adapters.get(source.platform)
        if canonical:
            from gateway.session_authorities import SessionAuthorities
            from gateway.run_runtime import _build_profile_authority
            runner.session_authorities = SessionAuthorities(home)
            runner.session_runtime_descriptor = {'instance_id': instance or name}
            result = await _build_profile_authority(runner, 'default', home, register=True)
            result.synthetic_ownership = ownership
            return result
        return await initialize_session_authority(runner, profile_id="synthetic-profile", instance_id=instance or name)

    def connection(owner):
        return AuthorityConnection(owner, object(), {
            "provider": "local", "user_id": "synthetic-owner", "profile_id": owner.profile_id,
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
        dc = connection(destination)
        imported = await dc.dispatch({"id": 21, "method": "session.mutate", "params": {
            "session_id": ref.session_id, "request_id": "synthetic-owner-import", "expected_revision": 0,
            "operation": "import", "payload": {"sessions": payload}}})
        assert "result" in imported and destination.db.get_session(ref.session_id), imported
        cases.append({"case":"native_owner_import", "passed":True, "actual":"session.mutate_import"})
        after = await connection(destination).dispatch({"id": 2, "method": "session.resume",
                                                       "params": {"session_id": ref.session_id}})
        cases.append({"case": "canonical_import_resume_same_session", "passed": "result" in after,
                      "actual": "resumed" if "result" in after else after.get("error")})
        changed = json.loads(json.dumps(payload))
        changed[0]["messages"][0]["content"] = "OTHER_SYNTHETIC_CONTENT"
        collision = await dc.dispatch({"id": 22, "method": "session.mutate", "params": {
            "session_id":ref.session_id, "request_id":"synthetic-changed-import",
            "expected_revision":imported["result"]["revision"], "operation":"import", "payload":{"sessions":changed}}})
        cases.append({"case": "import_rejects_different_existing_content", "passed":collision.get("error",{}).get("data",{}).get("reason")=="import_content_conflict",
                      "actual":collision.get("error") or {k:collision["result"].get(k) for k in ("ok","imported","skipped")}})
        lookup = await connection(origin).dispatch({"id": 3, "method": "prompt.lookup", "params": {
            "session_id": ref.session_id, "submission_id": "stable-synthetic-input"}})
        cases.append({"case": "owner_input_lookup_without_resubmit", "passed": "result" in lookup,
                      "actual": "supported" if "result" in lookup else lookup.get("error")})
        # Canonical rollback candidate: native full-store snapshot into a NEW empty
        # volume mounted at the SAME canonical home, after releasing the only writer.
        # No generic transcript import, raw SQL, external SQLite reader or service restart.
        from hermes_cli.backup_sqlite import _safe_copy_db
        from hermes_cli.backup_restore import _safe_restore_db
        from hermes_state_registry import close_all_under
        from hermes_state_runtime import admit_session_input, claim_session_input, find_session_admission, RuntimeStoreError
        full = await authority('canonical-home', canonical=True)
        home = Path(full.profile_id)
        assert home == (root / 'canonical-home').resolve()
        principal = Principal('synthetic-owner', full.profile_id,
                              frozenset({'session:create','session:read','session:control'}), 'socket')
        canonical = create_local_session(full, principal, {
            'request_id':'canonical-stable-create', 'source':'gui', 'cwd':str(home),
            'model':'gpt-6.1-sol','toolsets':[]})
        full.db.append_message(canonical.session_id,'user','BEFORE_BACKUP',timestamp=1700000000,message_uid='synthetic-first')
        full.db.append_message(canonical.session_id,'assistant','LATEST_CONFIRMED_TAIL',timestamp=1700000060,message_uid='synthetic-tail')
        expected_messages = full.db.get_messages(canonical.session_id)
        payload = {'text':'Synthetic interrupted input'}
        admitted = admit_session_input(full.db,epoch=full.epoch,principal_id=principal.subject,
            session_id=canonical.session_id,request_id='stable-interrupted-input',payload=payload)
        claimed = claim_session_input(full.db,epoch=full.epoch,session_id=canonical.session_id)
        assert claimed and claimed['status']=='started'
        snapshot = root / 'canonical-snapshot.db'
        assert _safe_copy_db(home / 'state.db',snapshot)
        source_hash = hashlib.sha256(snapshot.read_bytes()).hexdigest()
        assert _safe_restore_db(snapshot,home / 'state.db') is False, 'must_refuse_live_owner'
        epoch = full.epoch
        full.synthetic_ownership.close()
        close_all_under(home)
        home.rename(root / 'canonical-retained-source')
        home.mkdir(mode=0o700)
        os.environ['HERMES_HOME']=str(home)
        assert _safe_restore_db(snapshot,home / 'state.db'), 'native_full_restore_failed'
        restored = await authority('canonical-home',canonical=True,instance='after-restore')
        assert restored.epoch > epoch, 'restored_epoch_must_advance'
        resumed = await connection(restored).dispatch({'id':31,'method':'session.resume',
                                                       'params':{'session_id':canonical.session_id}})
        assert 'result' in resumed and resumed['result']['session_id']==canonical.session_id,resumed
        assert restored.db.get_messages(canonical.session_id)==expected_messages,'message_identity_or_tail_changed'
        receipt=find_session_admission(restored.db,principal_id=principal.subject,session_id=canonical.session_id,
                                       request_id='stable-interrupted-input')
        assert receipt and receipt['admission_id']==admitted['admission_id'] and receipt['status']=='unknown',receipt
        replay=admit_session_input(restored.db,epoch=restored.epoch,principal_id=principal.subject,
            session_id=canonical.session_id,request_id='stable-interrupted-input',payload=payload)
        assert replay['admission_id']==receipt['admission_id'] and replay['status']=='unknown'
        try:
            admit_session_input(restored.db,epoch=restored.epoch,principal_id=principal.subject,
                session_id=canonical.session_id,request_id='stable-interrupted-input',payload={'text':'CHANGED'})
        except RuntimeStoreError as error:
            assert error.reason=='admission_conflict'
        else:
            raise RuntimeError('restored_input_digest_conflict_missing')
        assert hashlib.sha256(snapshot.read_bytes()).hexdigest()==source_hash,'source_snapshot_changed'
        cases.append({'case':'native_whole_store_restore_same_canonical_identity','passed':True,
                      'actual':{'messagesPreserved':len(expected_messages),'sameLogicalSession':True,
                                'epochAdvanced':True,'interruptedInput':'unknown','inputReplay':'same_admission',
                                'changedDigest':'admission_conflict','liveRestore':'refused',
                                'snapshotUnchanged':True,'sourceWriterReleased':True},
                      'scope':'Native runtime authority/store and same canonical path; not Desktop/host/migration acceptance.'})
        restored.synthetic_ownership.close()
        close_all_under(home)
        assert not requests, "unexpected_network_attempt"
        return {"cases": cases, "providerRequests": 0, "networkAttempts": len(requests),
                "realProfileOpened": False, "sourceWrites": False,
                "isolation":{"osSandbox":"macos-seatbelt","networkDenied":True,"childExecutionDenied":True,"privateReadCanaryDenied":True},
                "scope":"Provider mode resolution and actual native session/owner-import/resume only; no inference wire, broker, admission or Desktop E2E."}
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
    if sys.platform != 'darwin' or not Path('/usr/bin/sandbox-exec').exists():
        raise RuntimeError('requires_verified_macos_sandbox')
    tree = subprocess.check_output(['git','-C',str(args.repo),'ls-tree','-rz',PIN])
    expected_python = {}
    for entry in tree.split(b'\0'):
        if not entry: continue
        info, path = entry.split(b'\t', 1)
        mode, kind, oid = info.decode().split()
        rel = os.fsdecode(path)
        if kind == 'blob' and rel.endswith('.py'):
            if mode == '120000': raise RuntimeError('source_python_symlink_unsupported')
            expected_python[rel] = oid
    actual_python = set()
    for directory, names, files in os.walk(source):
        names[:] = [name for name in names if name not in ('.venv','node_modules','.git','__pycache__')]
        for name in files:
            path = Path(directory) / name
            if name.endswith('.py'): actual_python.add(path.relative_to(source).as_posix())
    if actual_python != set(expected_python):
        raise RuntimeError('source_executable_manifest_mismatch')
    for rel, oid in expected_python.items():
        path = source / rel
        if path.is_symlink(): raise RuntimeError('source_python_alias')
        data = path.read_bytes()
        if hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() != oid:
            raise RuntimeError(f'source_pin_mismatch:{rel}')
    manifest_digest = hashlib.sha256(json.dumps(expected_python,sort_keys=True).encode()).hexdigest()
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
        (root / 'guarded-canary').write_text('synthetic-private-canary')
        quote = lambda value: json.dumps(str(value))
        framework = Path(sys.base_prefix) / 'Resources/Python.app/Contents/MacOS/Python'
        executables = [Path(sys.executable), Path(sys.executable).resolve()]
        if framework.is_file(): executables.append(framework.resolve())
        policy = '(version 1)(allow default)(deny network*)(deny process-exec)(allow process-exec ' + ''.join('(literal ' + quote(path) + ')' for path in executables) + ')'
        policy += '(deny file-write*)(allow file-write* (subpath ' + quote(root) + ')(literal "/dev/null"))'
        policy += '(deny file-read* (subpath "/Users/user/.hermes")(subpath "/Users/user/Library/Keychains")(subpath "/Users/user/.config")(literal "/Users/user/.codex/auth.json")(literal ' + quote(root / 'guarded-canary') + '))'
        proc = subprocess.run(['/usr/bin/sandbox-exec','-p',policy,sys.executable, str(Path(__file__).resolve()), "--source", str(source),
                               "--child-root", str(root)], cwd=root, env=env, text=True,
                              capture_output=True, timeout=50)
        if proc.returncode:
            # Only synthetic output; no inherited secrets/authentication environment.
            sys.stderr.write(proc.stderr[-7000:])
            raise RuntimeError("synthetic_contract_harness_failed")
        data = json.loads(proc.stdout.strip().splitlines()[-1])
        data.update({"sourcePin": PIN, "sourceHashes": hashes, "synthetic": True,
                     "sourceManifest":{"scope":"all tracked Python source, excluding installed dependencies","verifiedFiles":len(expected_python),"sha256":manifest_digest},
                     "cleanup": "complete_after_child_exit", "criterionAcceptance": False})
    data["verdict"] = "passed" if all(c["passed"] for c in data["cases"]) else "blocked"
    if args.receipt:
        args.receipt.parent.mkdir(parents=True, exist_ok=True)
        args.receipt.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(data, ensure_ascii=False))
    sys.exit(0 if data["verdict"] == "passed" else 2)


if __name__ == "__main__":
    main()
