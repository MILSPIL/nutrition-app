"""Run the approved synthetic Hermes compatibility probe with OS isolation on macOS.
No inherited credentials, user HOME, live API, or installed profile is used.
The isolated pinned source/venv must have been prepared under .agents/runtime/hermes-lab.
"""
from pathlib import Path
import fcntl
import hashlib
import json
import os
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT / '.agents/runtime/hermes-lab'
SOURCE = LAB / 'source'
os.umask(0o077)
lock = (LAB / 'probe.lock').open('w')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
pin = json.loads((ROOT / 'server/trainer/hermes-pin.json').read_text())
manifest_bytes = (LAB / 'source-manifest.json').read_bytes()
if hashlib.sha256(manifest_bytes).hexdigest() != pin['manifestSha256']:
    raise SystemExit('Pinned source manifest mismatch')
manifest = json.loads(manifest_bytes)
for name, expected in manifest.items():
    candidate = SOURCE / name
    if not candidate.resolve().is_relative_to(SOURCE.resolve()):
        raise SystemExit('Pinned source path escaped')
    if hashlib.sha256(candidate.read_bytes()).hexdigest() != expected:
        raise SystemExit('Pinned source mismatch: ' + name)
mode = sys.argv[1] if len(sys.argv) > 1 else 'complete'
if mode not in ('complete', 'cancel'):
    raise SystemExit('Unknown synthetic probe mode')
profile = LAB / ('synthetic-profile-' + uuid.uuid4().hex[:10])
profile.mkdir(mode=0o700)
(LAB / 'tmp').mkdir(exist_ok=True, mode=0o700)
(LAB / 'latest-synthetic-profile.txt').write_text(str(profile))
(LAB / 'probe.py').write_bytes((ROOT / 'scripts/hermes-runtime-probe.py').read_bytes())
(LAB / 'hermes_privacy.py').write_bytes((ROOT / 'server/trainer/hermes_privacy.py').read_bytes())
policy = '''(version 1)
(allow default)
(deny file-read-data (require-all (subpath "/Users") (require-not (subpath "LAB"))))
(deny file-write* (require-not (subpath "LAB")))
(allow file-write* (literal "/dev/null"))
(deny network-outbound)
(allow network-outbound (remote ip "localhost:18741") (remote ip "localhost:18742"))
(deny network-inbound)
(allow network-inbound (local ip "localhost:18741") (local ip "localhost:18742"))
(deny mach-lookup (global-name "com.apple.securityd"))
'''.replace('LAB', str(LAB))
(LAB / 'probe-compat.sb').write_text(policy)
env = {
    'PATH':'/opt/homebrew/bin:/usr/bin:/bin', 'HOME':str(LAB / 'empty-home'),
    'HERMES_HOME':str(profile), 'SCISENSE_LAB':str(LAB),
    'SCISENSE_PROBE_MODE':mode,
    'SCISENSE_FAKE_PROVIDER_KEY':'synthetic-local-fixture-not-a-real-key',
    'XDG_CONFIG_HOME':str(LAB / 'empty-home/config'),
    'XDG_CACHE_HOME':str(LAB / 'empty-home/cache'),
    'TMPDIR':str(LAB / 'tmp'), 'PYTHONUNBUFFERED':'1',
}
if sys.platform != 'darwin':
    raise SystemExit('This launcher requires macOS; Linux must use the dedicated network-none CI container')
command = ['/usr/bin/sandbox-exec','-f',str(LAB/'probe-compat.sb'),str(SOURCE/'.venv/bin/python')]
canary = ROOT / 'package.json'
check = '''import pathlib,socket,json
results={}
try:
 pathlib.Path(CANARY).read_text();results['fileDenied']=False
except PermissionError:
 results['fileDenied']=True
s=socket.socket();s.settimeout(1)
try:
 s.connect(('203.0.113.1',443));results['networkDenied']=False
except PermissionError:
 results['networkDenied']=True
finally:
 s.close()
print(json.dumps(results));assert all(results.values())
'''.replace('CANARY',repr(str(canary)))
isolation = subprocess.run([*command,'-c',check],cwd=SOURCE,env=env,capture_output=True,text=True,timeout=10,check=True)
(LAB/'isolation-proof.json').write_text(isolation.stdout)
summary_file = LAB / ('probe-summary-' + mode + '.json')
summary_file.unlink(missing_ok=True)
logfile = LAB / ('runtime-probe-' + mode + '.log')
with logfile.open('w') as log:
    try:
        result = subprocess.run([*command,str(LAB/'probe.py')],cwd=SOURCE,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=60)
        code = result.returncode
    except subprocess.TimeoutExpired:
        code = 124
summary_file = LAB / ('probe-summary-' + mode + '.json')
summary = json.loads(summary_file.read_text()) if summary_file.exists() else {'completed':False}
print(json.dumps({'pin':pin['commit'],'verifiedSourceFiles':len(manifest),'isolation':json.loads(isolation.stdout),'exit':code,'result':summary},ensure_ascii=False,indent=2))
if code:
    print(logfile.read_text()[-3500:])
sys.exit(code)
