"""Export public Linux dependencies only, never the synthetic profile or state."""
import pathlib,json,hashlib,tarfile,subprocess,os,re,sys
sys.dont_write_bytecode=True
if pathlib.Path.cwd()!=pathlib.Path('/app') or not pathlib.Path('/app/server/trainer/hermes-pin.json').is_file():
 raise RuntimeError('public_image_required')
if sys.argv[1:] not in ([],['--normalize-source-only']):raise RuntimeError('export_arguments_invalid')
sys.path.insert(0,"/app/server/trainer")
# Native source bytecode is an optimization, never a second executable source.
# Strip only untracked cache artifacts in this disposable export container;
# dependencies in the separately pinned .venv remain unchanged.
native=pathlib.Path('/opt/scisense/hermes/source')
tracked=json.loads((native.parent/'source-manifest.json').read_text())
for directory,names,files in os.walk(native):
 excluded={'.venv','node_modules','.git'} if pathlib.Path(directory)==native else set()
 names[:]=[name for name in names if name not in excluded]
 for name in files:
  path=pathlib.Path(directory)/name
  if '__pycache__' in path.relative_to(native).parts and path.suffix in ('.pyc','.pyo') and path.relative_to(native).as_posix() not in tracked:
   if path.is_symlink():raise RuntimeError('source_cache_alias')
   path.unlink()
import importlib.util
spec=importlib.util.spec_from_file_location('public_migration_source_guard','/app/scripts/hermes-personal-migration-operator.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
module.verify_source_tree(native,json.loads(pathlib.Path('/app/server/trainer/hermes-pin.json').read_text()))
if sys.argv[1:]==['--normalize-source-only']:
 print(json.dumps({'publicSourceNormalized':True}));raise SystemExit(0)
code_sha=os.environ.get('SCISENSE_PUBLIC_CODE_SHA','')
if not re.fullmatch('[a-f0-9]{40}',code_sha):raise RuntimeError('public_code_sha_required')
root=pathlib.Path('/tmp/hermes-public-runtime');root.mkdir(exist_ok=False)
target=root/'runtime.tar.gz'
# Compile the production TSYNC/turn-timer guard from this exact committed C
# source, never from a CI-only diagnostic adapter. This file is public code.
lock=root/'personal-worker-lock.so'
subprocess.run(['gcc','-O2','-Wall','-Werror','-shared','-fPIC','/app/server/trainer/worker-lock.c','-lseccomp','-lrt','-o',str(lock)],check=True)
entries=[(str(lock),'isolation/personal-worker-lock.so'),('/opt/scisense/hermes','hermes'),('/opt/scisense/python','python'),('/usr/local/bin/node','node/bin/node'),('/usr/local/LICENSE','node/LICENSE'),('/opt/scisense/isolation/LICENSE.bubblewrap','isolation/LICENSE.bubblewrap'),('/usr/bin/bwrap','isolation/bwrap'),('/app/server/trainer/worker-seccomp.bpf','isolation/worker-seccomp.bpf'),('/app/.agents/runtime/food-data/foods-v1-reviewed.sqlite','data/foods-v1-reviewed.sqlite')]
manifest={'version':1,'syntheticStateIncluded':False,'credentialsIncluded':False,'platform':'linux-x64','os':'ubuntu-24.04','files':[],'packages':subprocess.check_output(['dpkg-query','-W','libc6','libcap2','libseccomp2'],text=True).strip().splitlines()}
manifest['components']={'node':subprocess.check_output(['/usr/local/bin/node','--version'],text=True).strip(),'python':subprocess.check_output(['/opt/scisense/python/bin/python3.14','--version'],text=True).strip(),'bubblewrap':subprocess.check_output(['/usr/bin/bwrap','--version'],text=True).strip()}
with tarfile.open(target,'w:gz') as tf:
 for src,dest in entries:
  source=pathlib.Path(src)
  paths=[source]+sorted(source.rglob('*')) if source.is_dir() else [source]
  for p in paths:
   arc=dest+('/'+str(p.relative_to(source)) if p!=source else '')
   if p.is_symlink():
    link=os.readlink(p)
    if not any(p.resolve().is_relative_to(pathlib.Path(srcroot)) for srcroot,_ in entries if pathlib.Path(srcroot).is_dir()): raise RuntimeError('external_symlink:'+arc)
    manifest['files'].append({'path':arc,'link':link})
   elif p.is_file():
    manifest['files'].append({'path':arc,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
   elif not p.is_dir(): raise RuntimeError('special_file:'+arc)
   info=tf.gettarinfo(p,arcname=arc);info.uid=info.gid=0;info.uname=info.gname='root'
   if info.isfile():
    with p.open('rb') as f:tf.addfile(info,f)
   else:tf.addfile(info)
manifest['personalGuard']={'codeSha':code_sha,'sourceSha256':hashlib.sha256(pathlib.Path('/app/server/trainer/worker-lock.c').read_bytes()).hexdigest(),'seccompSourceSha256':hashlib.sha256(pathlib.Path('/app/server/trainer/worker-seccomp.c').read_bytes()).hexdigest(),'seccompSha256':hashlib.sha256(pathlib.Path('/app/server/trainer/worker-seccomp.bpf').read_bytes()).hexdigest(),'sha256':hashlib.sha256(lock.read_bytes()).hexdigest(),'platform':'linux-x64','format':'ELF64-ET_DYN-x86_64'}
manifest['archiveSha256']=hashlib.sha256(target.read_bytes()).hexdigest();manifest['archiveBytes']=target.stat().st_size
(root/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps({'files':len(manifest['files']),'bytes':manifest['archiveBytes'],'sha256':manifest['archiveSha256'],'publicOnly':True}))
