#!/usr/bin/env python3
"""Actual Native/SDK fixture, only in the owned isolated CI container."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

if os.environ.get('container') != 'docker' or Path('/proc/1/comm').read_text().strip() != 'systemd' or os.getuid() != 0:
    raise RuntimeError('owned_synthetic_container_required')


def ctl(*args, check=True):
    result = subprocess.run(['systemctl', *args], text=True, capture_output=True, timeout=15)
    if check and result.returncode:
        raise RuntimeError('synthetic_unit_command_failed:' + result.stderr[-600:])
    return result.stdout.strip()


def wait_for(fn, seconds=100):
    deadline=time.monotonic()+seconds
    while time.monotonic()<deadline:
        value=fn()
        if value:
            return value
        time.sleep(0.1)
    raise RuntimeError('synthetic_wait_timeout')


init_scope=Path('/sys/fs/cgroup/init.scope/cgroup.procs')
# systemd may accept DBus before it creates init.scope on a cold CI runner.
# Keep the controller in that exact scope, without a fallback or resource change.
wait_for(lambda:init_scope.is_file(),seconds=15)
init_scope.write_text(str(os.getpid()))
root=Path('/etc/scisense/personal');root.mkdir(parents=True,exist_ok=True)
broker=Path('/run/scisense-broker');broker.mkdir(mode=0o710,exist_ok=True);os.chown(broker,0,10005);broker.chmod(0o710)
adapters=Path('/opt/scisense/personal/adapters')
source=Path('/opt/scisense/hermes/source')
bootstrap='''import os
from pathlib import Path
from hermes_state import SessionDB
from hermes_personal_context import ProfileContext
home=Path(os.environ['HERMES_HOME'])
db=SessionDB(home/'state.db');db.close()
ProfileContext(home,initialize=True)
'''
registry={'version':1,'fundingOwner':'owner','profiles':[]}
for role,uid,principal in [('y',10002,'owner'),('w',10003,'wife'),('payer',10004,None)]:
    home=Path('/var/lib/scisense-personal-'+role+'/profile')
    if role!='payer':
        (home/'cache/images').mkdir(parents=True,mode=0o700)
        for path in (home.parent,home,home/'cache',home/'cache/images'):
            os.chown(path,uid,uid);path.chmod(0o700)
        subprocess.run(['/usr/sbin/runuser','-u','scisense-'+role,'--',str(source/'.venv/bin/python'),'-c',bootstrap],check=True,
                       env={'PATH':'/usr/bin:/bin','HOME':str(home),'HERMES_HOME':str(home),'PYTHONPATH':str(source)+':'+str(adapters),'PYTHONDONTWRITEBYTECODE':'1'},capture_output=True,timeout=15)
        registry['profiles'].append({'uid':principal,'profileId':'native-'+principal,'home':str(home),'socket':'/run/scisense/desktop-'+role+'.sock','canonicalTitle':'Bot Chat'})
    cfg={'version':1,'role':role,'nodeUid':10001,'workerUid':uid,'source':str(source),'pythonRoot':'/opt/scisense/python',
         'adapters':str(adapters),'home':str(home),'ephemeral':'/run/scisense-'+('native-'+role if role!='payer' else 'payer'),
         'bpf':str(adapters/'worker-seccomp.bpf'),'bwrapSha256':hashlib.sha256(Path('/usr/bin/bwrap').read_bytes()).hexdigest(),
         'workerLockSha256':hashlib.sha256((adapters/'worker-lock.so').read_bytes()).hexdigest()}
    (root/(role+'.json')).write_text(json.dumps(cfg));(root/(role+'.json')).chmod(0o644)
(root/'native-fixture.json').write_text(json.dumps({'env':{'SCISENSE_FIXTURE_ROOT':'/var/lib/scisense'},'systemd':{'registry':registry,'lanes':{'owner':'y','wife':'w'}}}))
try:
    ctl('daemon-reload');ctl('start','scisense.slice','scisense-y.socket','scisense-w.socket','scisense-payer.socket')
    group=Path('/sys/fs/cgroup/scisense.slice')
    cpu=(group/'cpu.max').read_text().split();assert int(cpu[0])==2*int(cpu[1])
    assert (group/'memory.max').read_text().strip()=='2147483648'
    assert (group/'memory.swap.max').read_text().strip()=='0'
    ctl('start','scisense-api.service')
    def finished():
        state=ctl('show','scisense-api.service','-p','ActiveState','--value')
        return state if state in ('inactive','failed') else None
    assert wait_for(finished)=='inactive'
    assert ctl('show','scisense-api.service','-p','ExecMainStatus','--value')=='0'
    result=json.loads(Path('/var/lib/scisense/native-result.json').read_text());assert result['passed'] is True
    log=subprocess.run(['journalctl','--no-pager','-o','cat','-u','scisense-payer@*'],text=True,capture_output=True,timeout=3).stdout
    prefix='SCISENSE-PERSONAL-OBSERVATION '
    observations=[json.loads(line[len(prefix):]) for line in log.splitlines() if line.startswith(prefix)]
    assert len(observations)==7,observations
    assert sum(row['kind']=='oauth_refresh' for row in observations)==1
    infer=[row for row in observations if row['kind']=='inference']
    replay=[row for row in infer if row['phase']=='owner_after_restart']
    expected=json.loads(Path('/var/lib/scisense/native-expected.json').read_text())['imageDigests']
    assert len(set(expected))==3
    assert len(replay)==2 and len({row['turnHash'] for row in replay})==1,replay
    for row in replay:
        assert set(row['imageDigests'])==set(expected) and row['bodyBytes']>16*1024*1024,row
    events=dict(line.split() for line in (group/'memory.events').read_text().splitlines());assert events['oom_kill']=='0' and events['oom']=='0'
    peak=int((group/'memory.peak').read_text());assert peak<2147483648
    assert not list(Path('/run').glob('scisense-native-*'))
    assert not Path('/run/scisense-payer').exists()
    print(json.dumps({'passed':True,'actualNative':True,'nativeSourcePin':'3f2afed3eb813cb00bd381d29b084d0e01de048f','nativeChecks':result['checks'],
                      'actualLinuxTmpfsGuard':True,'separateUidProfiles':True,'nativeHistoryAfterPhysicalRestart':True,
                      'largePhotoReplay':True,'maxBodyBytes':max(row['bodyBytes'] for row in replay),'maxReplayPhotos':max(row['imageCount'] for row in replay),'threeDistinctExpectedPhotosAfterRestart':True,
                      'aggregateCpu':2,'memoryMax':2147483648,'memoryPeak':peak,'swapMax':0,'oomEvents':int(events['oom']),'oomKills':int(events['oom_kill']),'oomGroupKills':int(events['oom_group_kill']) if 'oom_group_kill' in events else None,
                      'physicalFakePosts':7,'expiredGrantRefreshes':1,'realApiRequests':0,'ephemeralDirsRemoved':True}))
except Exception:
    for role in ('api','y@*','w@*','payer@*'):
        result=subprocess.run(['journalctl','--no-pager','-o','cat','-n','25','-u','scisense-'+role],text=True,capture_output=True,timeout=3)
        print(result.stdout[-4500:])
    raise
finally:
    ctl('stop','scisense-api.service','scisense-y.socket','scisense-w.socket','scisense-payer.socket',check=False)
