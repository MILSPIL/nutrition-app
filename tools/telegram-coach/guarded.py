#!/usr/bin/env python3
"""Hard wall-time supervisor for a local, network-denied worker process group."""
import argparse, json, os, signal, subprocess, time
from pathlib import Path
from pipeline import put

def bounded(command,timeout,log,receipt,env=None):
    began=time.monotonic();timed_out=False
    with Path(log).open('w') as out:
        child=subprocess.Popen(command,stdout=out,stderr=subprocess.STDOUT,env=env,start_new_session=True)
        try:
            child.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out=True
            try:os.killpg(child.pid,signal.SIGTERM)
            except ProcessLookupError:pass
            try:child.wait(timeout=5)
            except subprocess.TimeoutExpired:pass
        finally:
            # A descendant can survive after the process-group leader has exited.
            try:os.killpg(child.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            child.wait()
    result=dict(exit_code=child.returncode,timed_out=timed_out,wall_seconds=time.monotonic()-began,limit_seconds=timeout)
    put(receipt,result);return result
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--run',required=True,type=Path);p.add_argument('--worker',required=True,choices=['stt.py','mlx_stt.py']);p.add_argument('--limit',type=int,default=1800);p.add_argument('--label',required=True);p.add_argument('args',nargs=argparse.REMAINDER);a=p.parse_args()
    if not a.label.replace('-','').replace('_','').isalnum():raise ValueError('invalid label')
    run=a.run.resolve();args=a.args[1:] if a.args[:1]==['--'] else a.args
    env=os.environ.copy();env.update(HF_HUB_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',TELEGRAM_NETWORK_GUARD='verified')
    cmd=['/usr/bin/sandbox-exec','-f',str(run/'network-deny.sb'),str(run/'.venv/bin/python'),str(Path(__file__).parent/a.worker),'--run',str(run),*args]
    result=bounded(cmd,a.limit,run/'reviews'/(a.label+'.log'),run/'reviews'/(a.label+'-supervisor.json'),env)
    print(json.dumps(result));raise SystemExit(124 if result['timed_out'] else result['exit_code'])
