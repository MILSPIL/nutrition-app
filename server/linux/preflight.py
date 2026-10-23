import json, pathlib, shutil, os, platform, sys
out=pathlib.Path('tmp/linux-preparation');out.mkdir(parents=True,exist_ok=True)
with open('/proc/meminfo') as f: available=next(int(x.split()[1])*1024 for x in f if x.startswith('MemAvailable:'))
state={'cpuCount':os.cpu_count(),'availableBytes':available,'diskFreeBytes':shutil.disk_usage('.').free,'architecture':platform.machine()}
state['pass']=state['cpuCount']>=2 and available>=4*1024**3 and state['diskFreeBytes']>=8*1024**3 and state['architecture']=='x86_64'
(out/'preflight.json').write_text(json.dumps(state,indent=2)+'\n');print(json.dumps(state));sys.exit(0 if state['pass'] else 1)
