#!/usr/bin/env python3
"""Root orchestrator restricted to a disposable, networkless systemd container."""
import hashlib
import json
import os
from pathlib import Path
import signal
import socket
import sqlite3
import subprocess
import threading
import time

if os.environ.get('container') != 'docker' or Path('/proc/1/comm').read_text().strip() != 'systemd' or os.getuid() != 0:
    raise RuntimeError('owned_synthetic_container_required')


def ctl(*args, check=True):
    result = subprocess.run(['systemctl', *args], text=True, capture_output=True, timeout=15)
    if check and result.returncode:
        raise RuntimeError('synthetic_unit_command_failed:' + result.stderr[-600:])
    return result.stdout.strip()


def wait_for(fn, seconds=8):
    deadline = time.monotonic()+seconds
    while time.monotonic() < deadline:
        value = fn()
        if value:
            return value
        time.sleep(0.05)
    raise RuntimeError('synthetic_wait_timeout')


def stage():
    try:
        return json.loads(Path('/var/lib/scisense/stage.json').read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def active_native():
    units = json.loads(ctl('list-units', '--all', '--plain', '--output=json', 'scisense-y@*.service'))
    running = [item['unit'] for item in units if item['active'] == 'active']
    if len(running) != 1:
        return None
    unit = running[0]
    pid = int(ctl('show', unit, '-p', 'MainPID', '--value'))
    cgroup = ctl('show', unit, '-p', 'ControlGroup', '--value')
    return unit, pid, Path('/sys/fs/cgroup') / cgroup.lstrip('/')


def empty_all():
    groups = list(Path('/sys/fs/cgroup/scisense.slice').glob('scisense-*@*.service'))
    return all('populated 0' in (group/'cgroup.events').read_text() for group in groups)


def kill_owned(pid, signum):
    descriptor = os.pidfd_open(pid)
    try:
        signal.pidfd_send_signal(descriptor, signum)
    finally:
        os.close(descriptor)


root = Path('/etc/scisense/personal')
root.mkdir(parents=True, exist_ok=True)
broker = Path('/run/scisense-broker'); broker.mkdir(mode=0o710, exist_ok=True); os.chown(broker, 0, 10005); broker.chmod(0o710)
adapters = Path('/opt/scisense/personal/adapters')
for role, uid in [('y',10002),('w',10003),('payer',10004)]:
    home = Path('/var/lib/scisense-personal-'+role+'/profile')
    if role != 'payer':
        (home/'cache/images').mkdir(parents=True, mode=0o700)
        (home/'private-canary').write_text('synthetic-'+role)
        with sqlite3.connect(home/'state.db') as db:
            db.execute('CREATE TABLE canary (value INTEGER)')
        for path in [home.parent, home, home/'cache', home/'cache/images',home/'private-canary',home/'state.db']:
            os.chown(path, uid, uid); path.chmod(0o600 if path.is_file() else 0o700)
    cfg = {'version':1,'role':role,'nodeUid':10001,'workerUid':uid,'source':'/opt/scisense/native-dummy','pythonRoot':'/usr',
           'adapters':str(adapters),'home':str(home),'ephemeral':'/run/scisense-'+('native-'+role if role!='payer' else 'payer'),
           'bpf':str(adapters/'worker-seccomp.bpf'),'bwrapSha256':hashlib.sha256(Path('/usr/bin/bwrap').read_bytes()).hexdigest(),
           'workerLockSha256':hashlib.sha256((adapters/'worker-lock.so').read_bytes()).hexdigest()}
    (root/(role+'.json')).write_text(json.dumps(cfg)); (root/(role+'.json')).chmod(0o644)
Path('/var/lib/scisense/private-node-canary').write_text('synthetic-node-secret')
os.chown('/var/lib/scisense/private-node-canary',10001,10001); Path('/var/lib/scisense/private-node-canary').chmod(0o600)
listener = socket.socket();listener.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);listener.bind(('127.0.0.1',49152));listener.listen()
stop_listener = threading.Event()
def accept_loop():
    listener.settimeout(0.2)
    while not stop_listener.is_set():
        try:
            connection,_=listener.accept();connection.close()
        except socket.timeout:
            pass
thread=threading.Thread(target=accept_loop);thread.start()
proof=[]
# docker exec joins the namespace root cgroup. Move only this owned synthetic
# driver to PID1's init.scope so the cgroup-v2 no-internal-process rule permits
# enabling resource controllers on the manager's root. Never a host operation.
Path('/sys/fs/cgroup/init.scope/cgroup.procs').write_text(str(os.getpid()))
try:
    ctl('daemon-reload');ctl('start','scisense.slice','scisense-y.socket','scisense-w.socket','scisense-payer.socket')
    slice_dir=Path('/sys/fs/cgroup/scisense.slice')
    cpu=(slice_dir/'cpu.max').read_text().split();assert int(cpu[0])==2*int(cpu[1])
    assert (slice_dir/'memory.max').read_text().strip()=='2147483648'
    assert (slice_dir/'memory.swap.max').read_text().strip()=='0'
    for scenario in ['happy','wrapper-kill','guardian-kill','guardian-stop','node-kill','node-stop','backpressure']:
        ctl('stop','scisense-api.service',check=False);wait_for(empty_all)
        Path('/var/lib/scisense/stage.json').unlink(missing_ok=True)
        (root/'scenario.json').write_text(json.dumps({'scenario':scenario,'brokerGid':10005}))
        ctl('reset-failed',check=False);ctl('start','scisense-api.service')
        if scenario=='happy':
            result=wait_for(lambda: stage() if stage().get('stage') in ('complete','failed') else None)
            assert result.get('passed') is True, result
            wait_for(empty_all)
        else:
            ready=wait_for(lambda: stage() if stage().get('stage') in ('ready','failed') else None)
            assert ready.get('passed') is True,ready
            unit,guardian,cgroup=wait_for(active_native)
            if scenario=='wrapper-kill':
                pids=[int(value) for value in (cgroup/'cgroup.procs').read_text().split()]
                targets=[pid for pid in pids if Path('/proc/'+str(pid)+'/cmdline').read_bytes().split(b'\0')[0]==b'/usr/bin/bwrap']
                assert targets
                kill_owned(targets[0],signal.SIGKILL)
            elif scenario.startswith('guardian-'):
                kill_owned(guardian,signal.SIGSTOP if scenario.endswith('stop') else signal.SIGKILL)
            else:
                if scenario=='backpressure':
                    # Worker command is already queued before severing ingress.
                    time.sleep(0.05)
                node=int(ctl('show','scisense-api.service','-p','MainPID','--value'))
                kill_owned(node,signal.SIGSTOP if scenario=='node-stop' else signal.SIGKILL)
            wait_for(empty_all)
            if scenario.startswith('guardian-') or scenario=='wrapper-kill':
                result=wait_for(lambda: stage() if stage().get('stage') in ('drained','failed') else None)
                assert result.get('passed') is True,result
        proof.append(scenario)
    events=dict(line.split() for line in (slice_dir/'memory.events').read_text().splitlines())
    assert events['oom_kill']=='0' and events['oom']=='0'
    print(json.dumps({'passed':True,'actualSystemd':True,'aggregateCpu':2,'memoryBytes':2147483648,'swapBytes':0,
                      'defaultRootBrokerSocket0660':True,'nativeUidSeparation':True,'oldThreadSeccomp':True,'kernelTimer':True,
                      'rawTtlIdle':True,'physicalDrainCases':proof,'oomEvents':int(events['oom']),'oomKills':int(events['oom_kill']),'oomGroupKills':int(events['oom_group_kill']) if 'oom_group_kill' in events else None,'realApiRequests':0}))
except Exception:
    print(json.dumps({'clientStage':stage()}))
    result = subprocess.run(['journalctl','--no-pager','-o','cat','-n','30','-u','scisense-y@*','-u','scisense-w@*','-u','scisense-payer@*'],text=True,capture_output=True,timeout=3)
    print(result.stdout[-5000:])
    raise
finally:
    ctl('stop','scisense-api.service','scisense-y.socket','scisense-w.socket','scisense-payer.socket',check=False)
    stop_listener.set();thread.join(timeout=1);listener.close()
