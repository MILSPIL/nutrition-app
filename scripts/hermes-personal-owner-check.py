#!/usr/bin/env python3
"""Actual pinned owner: offline OS-isolated fixture and physical process restart."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from hermes_personal_fixture import PIN, verify_source


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--node", type=Path, required=True)
    parser.add_argument("--receipt", type=Path)
    parser.add_argument("--ipc", action="store_true")
    args = parser.parse_args()
    if sys.platform != "darwin" or not Path("/usr/bin/sandbox-exec").is_file():
        raise RuntimeError("requires_verified_macos_sandbox")
    project = Path(__file__).resolve().parent.parent
    source = args.source.resolve(strict=True)
    source_manifest = verify_source(source, args.repo)
    script = project / "server/trainer/hermes_personal_owner_test.py"
    root = Path(tempfile.mkdtemp(prefix="scisense-owner-test-")).resolve()
    try:
        home, profile = root / "home", root / "home/.hermes"
        profile.mkdir(parents=True, mode=0o700)
        for name in ("tmp", "bin", "codex", "config", "cache", "data"):
            (root / name).mkdir(mode=0o700)
        (root / "bin/gh").write_text("#!/bin/sh\nexit 1\n")
        (root / "bin/gh").chmod(0o700)
        node_version = subprocess.check_output([str(args.node), "--version"], text=True).strip().lstrip("v")
        if node_version != (project / ".nvmrc").read_text().strip().lstrip("v"):
            raise RuntimeError("node_version_mismatch")
        schemas = root / "schemas.json"
        tool_module = (project / "server/trainer/tools.mjs").as_uri()
        schemas.write_bytes(subprocess.check_output([str(args.node), "--input-type=module", "-e",
            'import {trainerToolSchemas} from "' + tool_module + '"; process.stdout.write(JSON.stringify(trainerToolSchemas));']))
        env = {"PATH": str(root / "bin") + ":/usr/bin:/bin", "HOME": str(home), "HERMES_HOME": str(profile),
            "CODEX_HOME": str(root / "codex"), "XDG_CONFIG_HOME": str(root / "config"),
            "XDG_CACHE_HOME": str(root / "cache"), "XDG_DATA_HOME": str(root / "data"), "TMPDIR": str(root / "tmp"),
            "PYTHONPATH": str(source) + ":" + str(script.parent) + ":" + str(project / "scripts"), "PYTHONNOUSERSITE": "1",
            "PYTHONDONTWRITEBYTECODE": "1", "PYTHONPYCACHEPREFIX": str(root / "cache/pyc"), "SCISENSE_IPC_KEY": "scisense-parent-ipc-not-a-provider-credential",
            "SCISENSE_TEST_SCHEMAS": str(schemas), "SCISENSE_TEST_EXPECTED": str(root / "expected.json"),
            "SCISENSE_FIXTURE_ROOT": str(root), "SCISENSE_FIXTURE_SCRIPT": str(script)}
        quote = lambda value: json.dumps(str(value))
        python = source / ".venv/bin/python"
        executables = [python, python.resolve(), Path(sys.executable), Path(sys.executable).resolve()]
        framework = Path(sys.base_prefix) / "Resources/Python.app/Contents/MacOS/Python"
        if framework.is_file():
            executables.append(framework.resolve())
        policy = '(version 1)(allow default)(deny network*)(deny process-exec)(allow process-exec ' + ''.join('(literal ' + quote(path) + ')' for path in executables) + ')'
        policy += '(deny file-write*)(allow file-write* (subpath ' + quote(root) + ')(literal "/dev/null"))'
        (root / "guarded-canary").write_text("synthetic-private-canary")
        policy += '(deny file-read* (subpath "/Users/user/.hermes")(subpath "/Users/user/Library/Keychains")(subpath "/Users/user/.config")(literal "/Users/user/.codex/auth.json")(literal ' + quote(root / "guarded-canary") + '))'
        bootstrap = '''import os,json,runpy,sys
from pathlib import Path
from hermes_personal_fixture import verify_sandbox
print(json.dumps({"fixtureGuards":verify_sandbox(Path(os.environ["SCISENSE_FIXTURE_ROOT"]))}),flush=True)
script=os.environ["SCISENSE_FIXTURE_SCRIPT"]
if os.environ["SCISENSE_OWNER_STAGE"]=="provider":
    script=str(Path(script).with_name("hermes_personal_provider_test.py"))
sys.argv=[script]+(["PersistentOwnerTests.test_z_two_channels_and_fresh_process_restart_preserve_native_messages"] if os.environ["SCISENSE_OWNER_STAGE"]=="reopen" else [])
runpy.run_path(script,run_name="__main__")'''
        stages = []
        for stage in ("provider", "first", "reopen"):
            result = subprocess.run(["/usr/bin/sandbox-exec", "-p", policy, str(python), "-c", bootstrap],
                env={**env, "SCISENSE_OWNER_STAGE": stage}, cwd=root, text=True, capture_output=True, timeout=60)
            guards = json.loads(result.stdout.splitlines()[0]).get("fixtureGuards") if result.stdout else None
            counts = re.findall(r"Ran (\d+) tests?", result.stderr)
            ok = result.returncode == 0 and guards and all(guards.values()) and counts
            stages.append({"stage": stage, "exit": result.returncode, "passed": bool(ok),
                           "tests": int(counts[-1]) if counts else 0, "osCanaries": guards})
            print((result.stdout + result.stderr)[-6500:])
            if not ok:
                for log in list(profile.rglob("*.log"))[:4]:
                    print("synthetic-log:", str(log.relative_to(profile)))
                    print(log.read_text(errors="replace")[-5500:])
                break
        passed = len(stages) == 3 and all(stage["passed"] for stage in stages)
        ipc = None
        if passed and args.ipc:
            ipc_profile = root / "ipc-profile"; ipc_profile.mkdir(mode=0o700)
            ipc_env = {**env, "HERMES_HOME": str(ipc_profile), "SCISENSE_IPC_WORKER": str(project / "server/trainer/hermes_personal_worker.py")}
            ipc_bootstrap = '''import os,json,runpy
from pathlib import Path
from hermes_personal_fixture import verify_sandbox
root=Path(os.environ["SCISENSE_FIXTURE_ROOT"])
(root/("ipc-guard-"+str(os.getpid())+".json")).write_text(json.dumps(verify_sandbox(root)))
runpy.run_path(os.environ["SCISENSE_IPC_WORKER"],run_name="__main__")'''
            config_file = root / "ipc-config.json"
            config_file.write_text(json.dumps({"command": "/usr/bin/sandbox-exec", "args": ["-p", policy, str(python), "-c", ipc_bootstrap],
                "env": ipc_env, "cwd": str(root), "toolSchemas": json.loads(schemas.read_text())}))
            result = subprocess.run([str(args.node), str(project / "scripts/hermes-personal-ipc-fixture.mjs"), str(config_file)], env=env, cwd=root, capture_output=True, text=True, timeout=60)
            print((result.stdout + result.stderr)[-5000:])
            if result.returncode == 0:
                ipc = json.loads(result.stdout.strip().splitlines()[-1])
                guards = [json.loads(path.read_text()) for path in root.glob("ipc-guard-*.json")]
                ipc["physicalProcessesWithOSCanaries"] = len(guards)
                passed = ipc.get("passed") is True and len(guards) == 2 and all(all(guard.values()) for guard in guards)
            else:
                passed = False
                for log in list(ipc_profile.rglob("*.log"))[:3]:
                    print("synthetic-ipc-log:", str(log.relative_to(ipc_profile)))
                    print(log.read_text(errors="replace")[-5500:])
        receipt = {"version": 1, "task": "HERMES-PERSONAL-01", "sourcePin": PIN, "sourceManifest": source_manifest,
            "syntheticOnly": True, "testExit": 0 if passed else 1, "testsPassed": sum(stage["tests"] for stage in stages if stage["passed"]),
            "stages": stages, "nativeIpc": ipc, "physicalProcessRestart": all(stage["passed"] for stage in stages), "realModelRequests": 0, "sourceSha256": {
                str(path.relative_to(project)): hashlib.sha256(path.read_bytes()).hexdigest()
                for path in [script, script.with_name("hermes_personal_provider_test.py"), Path(__file__).resolve(), project / "scripts/hermes_personal_fixture.py", project / "server/trainer/hermes_personal_owner.py", project / "server/trainer/hermes_personal_provider.py", project / "server/trainer/hermes_personal_ipc.py", project / "server/trainer/hermes_personal_worker.py", project / "server/trainer/personal-process.mjs", project / "scripts/hermes-personal-ipc-fixture.mjs"]}}
        print(json.dumps(receipt))
        if args.receipt:
            args.receipt.parent.mkdir(parents=True, exist_ok=True)
            args.receipt.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
        return 0 if passed else 1
    finally:
        shutil.rmtree(root)


if __name__ == "__main__":
    raise SystemExit(main())
