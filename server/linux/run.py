"""Run bounded Linux fixtures; preserve measurements even on timeout or OOM."""
import argparse, json, os, pathlib, subprocess, sys, uuid
from types import SimpleNamespace
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--cpus', type=int, choices=(1,2), default=1)
cpu_count=parser.parse_args().cpus
out=pathlib.Path('tmp/linux-preparation').resolve();out.mkdir(parents=True,exist_ok=True)
base=['docker','run','--rm','--network=none',f'--cpus={cpu_count}','--pids-limit=64','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=128m']
results=[]
def owned_run(args, timeout):
    name='scisense-fixture-'+uuid.uuid4().hex
    command=['docker','run','--name',name]+args
    try:
        result=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
    except (subprocess.TimeoutExpired,OSError):
        result=SimpleNamespace(returncode=124,stdout=b'',stderr=b'bounded_fixture_timeout')
    cleanup=False
    try:
        subprocess.run(['docker','rm','--force',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15)
        gone=subprocess.run(['docker','container','inspect',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10)
        daemon=subprocess.run(['docker','info','--format','{{.ID}}'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=10)
        cleanup=gone.returncode==1 and daemon.returncode==0 and bool(daemon.stdout.strip())
    except (subprocess.TimeoutExpired,OSError):
        cleanup=False
    result.cleanup_ok=cleanup
    if not cleanup:
        result.returncode=125
        result.stderr=b'owned_container_cleanup_unconfirmed'
    return result
for language,duration,mode,memory in [(l,d,'normal','2g') for l in ['uk','ru'] for d in [5,30,90]]+ [('uk',5,'abort','2g'),('uk',5,'timeout','2g'),('uk',5,'concurrency','2g'),('uk',5,'oom','256m')]:
    dest=out/f'{language}-{duration}-{mode}';dest.mkdir(exist_ok=True);dest.chmod(0o777)
    command=base[2:]+['--memory='+memory,'--memory-swap='+memory,'-v',str(dest)+':/out','scisense-linux-prep',language,str(duration),mode,str(cpu_count)]
    result=owned_run(command,100)
    file=dest/'result.json';data=json.loads(file.read_text()) if file.exists() else {'result':'no_report','pass':False}
    data['containerExit']=result.returncode;data['cleanupOk']=result.cleanup_ok;data['mode']=mode;data['language']=language;data['durationSeconds']=duration;results.append(data)
    # Logs contain no transcript because the adapter pipes stderr to /dev/null.
    if result.returncode: (dest/'failure.log').write_bytes(result.stderr[-4096:])
credential=owned_run(['--rm','--network=none','--memory=256m','--cpus=1','--read-only','--user=0','--tmpfs','/tmp:rw,nosuid,size=16m','--tmpfs','/var/lib/systemd:rw,nosuid,size=1m','--entrypoint','node','scisense-linux-prep','server/linux/credential-rehearsal.mjs'],30)
cred=json.loads(credential.stdout) if credential.returncode==0 else {'pass':False,'error':'credential_rehearsal_failed'}
(out/'credential.json').write_text(json.dumps(cred,indent=2)+'\n')
with open('/proc/meminfo') as f: available=next(int(x.split()[1])*1024 for x in f if x.startswith('MemAvailable:'))
summary={'syntheticOnly':True,'requestedCpus':cpu_count,'paidCalls':0,'fixtures':results,'credential':cred,'hostAvailableBytesAfter':available,'targetServerVerified':False,'pass':all(x.get('pass') and x['containerExit']==0 for x in results) and credential.returncode==0 and available>=2*1024**3}
(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({'report':str(out/'summary.json'),'pass':summary['pass'],'fixtures':len(results)}))
sys.exit(0 if summary['pass'] else 1)
