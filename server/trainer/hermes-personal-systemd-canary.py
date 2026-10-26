"""Synthetic Linux-only worker, installed under worker names only in CI image."""
import ctypes
import errno
import json
import os
from pathlib import Path
import socket
import sys
import threading
import time
from hermes_worker_lock import lock_worker, arm_deadline, end_deadline

trigger, finished = threading.Event(), threading.Event()
results = {}

def preexisting_thread():
    trigger.wait()
    try:
        os.execve('/bin/true', ['true'], {})
    except PermissionError:
        results['execDeniedInOldThread'] = True
    try:
        pid = os.fork()
        if pid == 0:
            os._exit(7)
        os.waitpid(pid, 0)
        results['forkDeniedInOldThread'] = False
    except PermissionError:
        results['forkDeniedInOldThread'] = True
    finished.set()

thread = threading.Thread(target=preexisting_thread, daemon=True)
thread.start(); lock_worker(); trigger.set()
if not finished.wait(1):
    raise SystemExit(5)
thread.join()
new = threading.Thread(target=lambda: results.update(newThreadAllowed=True))
new.start(); new.join()
home = Path(os.environ['HERMES_HOME'])
payer = home.name == 'payer-home'
for label, path in [('foreignHomeDenied', '/var/lib/scisense-personal-w/profile/private-canary'),
                    ('nodeKeyDenied', '/var/lib/scisense/private-node-canary')]:
    try:
        Path(path).read_text(); results[label] = False
    except OSError:
        results[label] = True
try:
    with socket.create_connection(('127.0.0.1', 49152), timeout=0.2):
        results['networkDenied'] = False
except OSError:
    results['networkDenied'] = True
from hermes_service_guardian import tmpfs
tmpfs(Path('/tmp'))
if payer:
    tmpfs(home)
else:
    tmpfs(home / 'cache/images')
results['privateTmpfs'] = True
results['uid'] = os.getuid()
results['home'] = str(home)
for line in sys.stdin:
    value = json.loads(line)
    kind = value.get('type')
    if kind == 'close':
        break
    if kind == 'setup':
        result = results
    elif kind == 'timerCycle':
        arm_deadline('A', int(time.time()*1000)+150, 150); end_deadline('A')
        time.sleep(0.1)
        arm_deadline('B', int(time.time()*1000)+300, 300); time.sleep(0.12); end_deadline('B')
        time.sleep(0.2)
        result = {'oldDeadlineDidNotKillNewTurn': True}
    elif kind == 'killTimer':
        arm_deadline('C', int(time.time()*1000)+100, 100)
        time.sleep(30)
        raise SystemExit(4)
    elif kind == 'ttl':
        path = home / 'cache/images/scisense_expired.png'
        path.write_bytes(b'synthetic'); path.chmod(0o600)
        os.utime(path, (time.time()-300, time.time()-300))
        time.sleep(1.4)
        result = {'expiredRawRemovedWhileIdle': not path.exists()}
    elif kind == 'blocked':
        time.sleep(30)
        result = {}
    else:
        result = {'echo': True}
    print(json.dumps({'type': 'result', 'id': value['id'], 'result': result}), flush=True)
