"""Assemble a disabled release from tracked app code and verified public Linux payload.
Usage: python3 scripts/hermes-package.py RUNTIME_DIR OUTPUT_DIR
No installation, private profile access, credential loading or network operations.
"""
import pathlib,sys,subprocess,json,hashlib,tarfile,shutil,tempfile,datetime,re,os
from hermes_runtime_validation import validate_runtime
repo=pathlib.Path(__file__).resolve().parents[1]
runtime=pathlib.Path(sys.argv[1]).resolve(); output=pathlib.Path(sys.argv[2]).resolve()
if output.exists():raise SystemExit('output_already_exists')
def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
code_sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
if subprocess.check_output(['git','diff','HEAD','--name-only','--','src','server','workers','scripts','deploy','package.json','package-lock.json','firestore.rules','.github'],cwd=repo,text=True).strip():raise SystemExit('uncommitted_code')
manifest=validate_runtime(runtime,json.loads((repo/'server/trainer/hermes-pin.json').read_text()))
expected={f['path']:f for f in manifest['files']}
build=repo/'build'
if not (build/'index.html').is_file() or not (build/'asset-manifest.json').is_file():raise SystemExit('build_missing')
# The caller must build with the exact feature-off command recorded below.
compiled=json.loads((build/'scisense-build.json').read_text())
if compiled!={'codeSha':code_sha,'trainerChatEnabled':False,'localLabEnabled':False}:raise SystemExit('build_receipt_invalid')
output.mkdir(parents=True)
with tempfile.TemporaryDirectory(prefix='scisense-off-package-') as tmp:
 stage=pathlib.Path(tmp)
 tracked=subprocess.check_output(['git','ls-files','-z'],cwd=repo).decode().split('\0')
 for name in tracked:
  if not name:continue
  include=name in ['package.json','firestore.rules'] or name.startswith(('server/','src/services/','src/data/','workers/meal-parser/src/','scripts/phone-lab/','deploy/')) or name in ['workers/meal-parser/package.json','workers/meal-parser/package-lock.json','workers/meal-parser/pilot-proposal.json']
  if not include or any(x in name for x in ['.test.','/fixtures/','/linux/','Dockerfile','_test.py','systemd-test','systemd-ci']):continue
  src=repo/name
  if src.is_symlink() or not src.is_file():raise SystemExit('source_not_regular')
  dest=stage/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dest)
 shutil.copytree(build,stage/'public')
 # Rehydrate only locked production dependencies from the local npm cache.
 # No inherited .npmrc, network, install scripts or Mac-only dev binaries.
 env={k:os.environ[k] for k in ['PATH','HOME','TMPDIR'] if k in os.environ}
 env.update({'NPM_CONFIG_USERCONFIG':'/dev/null','NPM_CONFIG_GLOBALCONFIG':str(stage/'absent-npm-global-config')})
 installed=subprocess.run(['npm','ci','--offline','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],cwd=stage/'workers/meal-parser',env=env,capture_output=True,text=True)
 if installed.returncode:raise SystemExit('locked_offline_dependencies_failed')
 settings=json.loads((stage/'server/deployment.json').read_text());settings['releaseId']=code_sha
 if settings['liveEnabled'] or settings['trainer']['enabled'] or settings['allowedUids']:raise SystemExit('inference_not_off')
 (stage/'server/deployment.json').write_text(json.dumps(settings,indent=2)+'\n')
 rows=[]
 for p in sorted(stage.rglob('*')):
  if p.is_symlink():
   if not p.resolve().is_relative_to(stage):raise SystemExit('app_link_escape')
  elif p.is_file():
   if '/node_modules/' not in str(p):
    body=p.read_bytes()
    if re.search(rb'(?:sk-ant-[A-Za-z0-9_-]{24,}|gsk_[A-Za-z0-9_-]{24,})',body):raise SystemExit('credential_pattern_in_package')
   rows.append({'path':str(p.relative_to(stage)),'sha256':digest(p),'bytes':p.stat().st_size})
 with tarfile.open(output/'app.tar.gz','w:gz') as tf:
  for p in sorted(stage.iterdir()):tf.add(p,arcname=p.name)
 (output/'app-manifest.json').write_text(json.dumps({'files':rows},separators=(',',':'))+'\n')
shutil.copy2(runtime/'runtime.tar.gz',output/'runtime.tar.gz');shutil.copy2(runtime/'manifest.json',output/'runtime-manifest.json')
files={name:{'sha256':digest(output/name),'bytes':(output/name).stat().st_size} for name in ['app.tar.gz','app-manifest.json','runtime.tar.gz','runtime-manifest.json']}
summary={'version':1,'codeSha':code_sha,'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'featureOff':True,'activationApproved':False,'privateDataIncluded':False,'keysIncluded':False,'cpu':2,'memoryBytes':2147483648,'turnDeadlineMs':45000,'files':files,'gate':'B/C require separate approval and exact host isolation rehearsal'}
(output/'manifest.json').write_text(json.dumps(summary,indent=2)+'\n')
(output/'SHA256SUMS').write_text(''.join(f'{v["sha256"]}  {n}\n' for n,v in files.items())+f'{digest(output/"manifest.json")}  manifest.json\n')
print(json.dumps({'codeSha':code_sha,'featureOff':True,'appFiles':len(rows),'runtimeFiles':len(expected),'output':str(output),'manifestSha256':digest(output/'manifest.json')}))
