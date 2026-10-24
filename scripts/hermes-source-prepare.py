"""Public pinned source only. Does not read installed Hermes or any profile."""
import hashlib,json,pathlib,subprocess,tempfile,tarfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
pin=json.loads((ROOT/'server/trainer/hermes-pin.json').read_text())
lab=ROOT/'.agents/runtime/hermes-lab'
lab.mkdir(parents=True,exist_ok=True)
source=lab/'source'
if source.exists(): raise SystemExit('source_already_exists')
with tempfile.TemporaryDirectory(prefix='scisense-hermes-source-') as tmp:
    repo=pathlib.Path(tmp)/'repo'; archive=pathlib.Path(tmp)/'source.tar'
    subprocess.run(['git','init','-q',str(repo)],check=True)
    subprocess.run(['git','-C',str(repo),'fetch','--depth=1','https://github.com/NousResearch/hermes-agent.git',pin['commit']],check=True)
    subprocess.run(['git','-C',str(repo),'archive','--format=tar','--output='+str(archive),pin['commit']],check=True)
    if hashlib.sha256(archive.read_bytes()).hexdigest()!=pin['archiveSha256']: raise SystemExit('archive_checksum')
    source.mkdir()
    with tarfile.open(archive) as tf: tf.extractall(source,filter='data')
manifest={str(f.relative_to(source)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(source.rglob('*')) if f.is_file()}
encoded=json.dumps(manifest,sort_keys=True,separators=(',',':')).encode()
if len(manifest)!=pin['files'] or hashlib.sha256(encoded).hexdigest()!=pin['manifestSha256']: raise SystemExit('source_manifest_checksum')
if hashlib.sha256((source/'uv.lock').read_bytes()).hexdigest()!=pin['dependencyLockSha256']: raise SystemExit('dependency_lock_checksum')
(lab/'source-manifest.json').write_bytes(encoded)
print(json.dumps({'publicSource':True,'commit':pin['commit'],'files':len(manifest)}))
