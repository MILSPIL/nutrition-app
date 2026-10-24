"""Export public Linux dependencies only, never the synthetic profile or state."""
import pathlib,json,hashlib,tarfile,subprocess,os
root=pathlib.Path('/tmp/hermes-public-runtime');root.mkdir(exist_ok=False)
target=root/'runtime.tar.gz'
entries=[('/opt/scisense/hermes','hermes'),('/opt/scisense/python','python'),('/usr/local/bin/node','node/bin/node'),('/usr/local/LICENSE','node/LICENSE'),('/opt/scisense/isolation/LICENSE.bubblewrap','isolation/LICENSE.bubblewrap'),('/usr/bin/bwrap','isolation/bwrap'),('/app/server/trainer/worker-seccomp.bpf','isolation/worker-seccomp.bpf'),('/app/.agents/runtime/food-data/foods-v1-reviewed.sqlite','data/foods-v1-reviewed.sqlite')]
manifest={'version':1,'syntheticStateIncluded':False,'credentialsIncluded':False,'platform':'linux-x64','os':'ubuntu-24.04','files':[],'packages':subprocess.check_output(['dpkg-query','-W','libc6','libcap2','libseccomp2'],text=True).strip().splitlines()}
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
manifest['archiveSha256']=hashlib.sha256(target.read_bytes()).hexdigest();manifest['archiveBytes']=target.stat().st_size
(root/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps({'files':len(manifest['files']),'bytes':manifest['archiveBytes'],'sha256':manifest['archiveSha256'],'publicOnly':True}))
