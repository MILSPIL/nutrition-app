#!/usr/bin/env python3
"""Create a disabled V3 package from a clean committed build and public runtime.
No source profiles, keys, model calls, host installation or network access.
"""
import argparse
import base64
import datetime
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tarfile
import tempfile
import sys
sys.dont_write_bytecode = True
from hermes_runtime_validation import validate_runtime, digest

REPO = Path(__file__).resolve().parents[1]
REQUIRED_RUNTIME = 'isolation/personal-worker-lock.so'


def fail(code):
    raise RuntimeError(code)


def clean_git():
    sha = subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip()
    paths = ['src','public','server','workers','scripts','deploy','package.json','package-lock.json','.nvmrc','.github','firestore.rules']
    if subprocess.check_output(['git','status','--porcelain','--untracked-files=normal','--',*paths],cwd=REPO,text=True).strip():
        fail('package_uncommitted_code')
    return sha


def verify_build(build, sha):
    if build.is_symlink() or not build.is_dir():fail('package_build_type')
    manifest=build/'scisense-build-files.json'
    if manifest.is_symlink() or not manifest.is_file():fail('package_build_inventory')
    expected=json.loads(manifest.read_text())
    if set(expected)!={'version','codeSha','files'} or expected['version']!=1 or expected['codeSha']!=sha:
        fail('package_build_inventory')
    files=[]
    for root, directories, names in os.walk(build,followlinks=False):
        for name in directories+names:
            path=Path(root)/name
            if path.is_symlink() or not (path.is_dir() or path.is_file()):fail('package_build_type')
        for name in names:
            path=Path(root)/name
            if path==manifest:continue
            files.append({'path':str(path.relative_to(build)),'bytes':path.stat().st_size,'sha256':digest(path)})
    if sorted(files,key=lambda row:row['path'])!=sorted(expected['files'],key=lambda row:row['path']):
        fail('package_build_inventory')
    return digest(manifest)


def ws_dependency(stage, node, env):
    """Only ws runs in Node; download-free npm pack verifies the root lock SRI."""
    lock=json.loads((stage/'package-lock.json').read_text())['packages']['node_modules/ws']
    if lock['version']!='8.22.0' or lock.get('dependencies'):
        fail('package_ws_lock_changed')
    npm = node.parent.parent/'lib/node_modules/npm/bin/npm-cli.js'
    result=subprocess.run([str(node),str(npm),'pack','ws@8.22.0','--offline','--ignore-scripts','--json'],cwd=stage,env=env,capture_output=True,text=True)
    if result.returncode:
        fail('package_ws_cache_missing')
    rows=json.loads(result.stdout)
    if len(rows)!=1 or rows[0]['filename']!='ws-8.22.0.tgz':
        fail('package_ws_archive_invalid')
    archive=stage/rows[0]['filename']
    sri='sha512-'+base64.b64encode(hashlib.sha512(archive.read_bytes()).digest()).decode()
    if sri!=lock['integrity']:
        fail('package_ws_integrity')
    root=stage/'node_modules/ws';root.mkdir(parents=True)
    with tarfile.open(archive) as tf:
        seen=set()
        for member in tf:
            name=PurePosixPath(member.name)
            if name.parts[0]!='package' or name.is_absolute() or '..' in name.parts or member.name in seen or member.mode&0o6000 or not (member.isfile() or member.isdir()):
                fail('package_ws_member')
            seen.add(member.name); target=root.joinpath(*name.parts[1:])
            if member.isdir():target.mkdir(parents=True,exist_ok=True)
            else:
                target.parent.mkdir(parents=True,exist_ok=True)
                with tf.extractfile(member) as source, target.open('xb') as output:
                    shutil.copyfileobj(source,output)
    archive.unlink()
    if json.loads((root/'package.json').read_text())['version']!=lock['version']:
        fail('package_ws_version')
    return {'version':lock['version'],'integrity':sri}


def package(runtime, output, node):
    if output.exists() or output.is_symlink():fail('package_output_exists')
    runtime, output, node = runtime.resolve(), output.absolute(), node.resolve()
    if output.parent.resolve() != output.parent:fail('package_output_parent_alias')
    sha=clean_git()
    blob=lambda name: subprocess.check_output(['git','show',sha+':'+name],cwd=REPO)
    pin=json.loads(blob('server/trainer/hermes-pin.json'))
    expected_node=blob('.nvmrc').decode().strip().lstrip('v')
    if subprocess.check_output([str(node),'--version'],text=True).strip()!='v'+expected_node:
        fail('package_node_pin')
    payload=validate_runtime(runtime,pin)
    rows={row['path']:row for row in payload['files']}
    guard=payload.get('personalGuard')
    if (not isinstance(guard,dict) or set(guard)!={'codeSha','sourceSha256','seccompSourceSha256','seccompSha256','sha256','platform','format'} or guard['codeSha']!=sha or guard['sourceSha256']!=hashlib.sha256(blob('server/trainer/worker-lock.c')).hexdigest() or guard['seccompSourceSha256']!=hashlib.sha256(blob('server/trainer/worker-seccomp.c')).hexdigest() or guard['seccompSha256']!=rows.get('isolation/worker-seccomp.bpf',{}).get('sha256') or guard['platform']!='linux-x64' or guard['format']!='ELF64-ET_DYN-x86_64' or REQUIRED_RUNTIME not in rows or rows[REQUIRED_RUNTIME].get('bytes',0)<1000 or rows[REQUIRED_RUNTIME].get('sha256')!=guard['sha256']):
        fail('package_personal_lock_pin')
    with tarfile.open(runtime/'runtime.tar.gz') as tf:
        member=tf.getmember(REQUIRED_RUNTIME)
        if not member.isfile():fail('package_personal_lock_type')
        with tf.extractfile(member) as stream:header=stream.read(64)
        if header[:6]!=b'\x7fELF\x02\x01' or int.from_bytes(header[16:18],'little')!=3 or int.from_bytes(header[18:20],'little')!=62:
            fail('package_personal_lock_type')
    build=REPO/'build'
    build_digest=verify_build(build,sha)
    expected={'codeSha':sha,'trainerChatEnabled':True,'localLabEnabled':False,'phoneLabEnabled':False,'pilotModeEnabled':False}
    if json.loads((build/'scisense-build.json').read_text())!=expected:
        fail('package_build_receipt')
    env={key:os.environ[key] for key in ['HOME','TMPDIR'] if key in os.environ}
    env.update(PATH=str(node.parent)+':/usr/bin:/bin',NPM_CONFIG_USERCONFIG='/dev/null',NPM_CONFIG_GLOBALCONFIG=str(output.parent/'absent-personal-npm-global-config'))
    temporary=Path(tempfile.mkdtemp(prefix='scisense-v3-package-'))
    try:
        stage=temporary/'app';stage.mkdir()
        tracked=subprocess.check_output(['git','ls-tree','-r','--name-only','-z',sha],cwd=REPO).decode().split('\0')
        for name in filter(None,tracked):
            include=name in ('package.json','package-lock.json','firestore.rules') or name.startswith(('server/','src/services/','src/data/','workers/meal-parser/src/','deploy/personal/')) or name in ('workers/meal-parser/package.json','workers/meal-parser/package-lock.json','workers/meal-parser/pilot-proposal.json','scripts/phone-lab/approval.mjs','scripts/phone-lab/sqlite.mjs','scripts/hermes-personal-migration-operator.py')
            if not include or any(x in name for x in ['.test.','_test.py','/fixtures/','/linux/','Dockerfile','systemd-ci','-test.mjs','-canary.py']):continue
            tree_entry=subprocess.check_output(['git','ls-tree',sha,'--',name],cwd=REPO,text=True)
            if not tree_entry.startswith(('100644 blob ','100755 blob ')):fail('package_source_type')
            destination=stage/name;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(blob(name))
        shutil.copytree(build,stage/'public',symlinks=True)
        if verify_build(stage/'public',sha)!=build_digest:fail('package_build_copy_changed')
        ws=ws_dependency(stage,node,env)
        worker=stage/'workers/meal-parser'
        npm=node.parent.parent/'lib/node_modules/npm/bin/npm-cli.js'
        installed=subprocess.run([str(node),str(npm),'ci','--offline','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],cwd=worker,env=env,capture_output=True,text=True)
        if installed.returncode:fail('package_worker_cache_missing')
        smoke_env={**env,'HOME':str(temporary/'empty-home')}
        (temporary/'empty-home').mkdir(mode=0o700)
        smoke=subprocess.run([str(node),'--input-type=module','-e','await import("./server/runtime.mjs"); await import("./server/personal-runtime.mjs");'],cwd=stage,env=smoke_env,capture_output=True,text=True,timeout=30)
        if smoke.returncode:fail('package_entrypoint_import_failed')
        settings=json.loads((stage/'server/deployment-personal.json').read_text())
        if settings['version']!=3 or settings['liveEnabled'] is not False or settings['allowedUids']!=[]:fail('package_activation_not_off')
        settings['releaseId']=sha
        (stage/'server/deployment.json').write_text(json.dumps(settings,indent=2)+'\n')
        files=[]
        for path in sorted(stage.rglob('*')):
            if path.is_symlink():fail('package_symlink')
            if path.is_file():
                if '/node_modules/' not in str(path) and re.search(rb'(?:sk-(?:ant-)?[A-Za-z0-9_-]{24,}|gsk_[A-Za-z0-9_-]{24,})',path.read_bytes()):fail('package_secret_pattern')
                files.append({'path':str(path.relative_to(stage)),'sha256':digest(path),'bytes':path.stat().st_size})
            elif not path.is_dir():fail('package_special_file')
        required=['server/main.mjs','server/personal-runtime.mjs','server/trainer/personal-desktop-endpoint.mjs','server/trainer/codex-model-metadata.json','server/trainer/hermes_service_guardian.py','deploy/personal/scisense-api.service','node_modules/ws/package.json','public/index.html','scripts/phone-lab/approval.mjs','scripts/phone-lab/sqlite.mjs']
        if not set(required).issubset({row['path'] for row in files}):fail('package_app_incomplete')
        assembled=temporary/'output';assembled.mkdir()
        with tarfile.open(assembled/'app.tar.gz','w:gz') as tf:
            for path in sorted(stage.iterdir()):tf.add(path,arcname=path.name)
        (assembled/'app-manifest.json').write_text(json.dumps({'files':files},separators=(',',':'))+'\n')
        checked_runtime=temporary/'copied-runtime';checked_runtime.mkdir()
        shutil.copy2(runtime/'runtime.tar.gz',checked_runtime/'runtime.tar.gz');shutil.copy2(runtime/'manifest.json',checked_runtime/'manifest.json')
        if validate_runtime(checked_runtime,pin)!=payload:
            fail('package_runtime_copy_changed')
        (checked_runtime/'runtime.tar.gz').rename(assembled/'runtime.tar.gz');(checked_runtime/'manifest.json').rename(assembled/'runtime-manifest.json')
        archives={name:{'sha256':digest(assembled/name),'bytes':(assembled/name).stat().st_size} for name in ['app.tar.gz','app-manifest.json','runtime.tar.gz','runtime-manifest.json']}
        manifest={'version':3,'codeSha':sha,'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'liveEnabled':False,'trainerChatUiEnabled':True,'privateDataIncluded':False,'keysIncluded':False,'cpu':2,'memoryBytes':2147483648,'swapBytes':0,'deadlineMs':45000,'nativePostCap':3,'b3Turns':8,'b3Posts':24,'ws':ws,'buildInventorySha256':build_digest,'personalWorkerLock':rows[REQUIRED_RUNTIME],'files':archives,'stages':'B1/A0/B2/B3 sequential technical gates; no installation by this command'}
        (assembled/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
        (assembled/'SHA256SUMS').write_text(''.join(f'{row["sha256"]}  {name}\n' for name,row in archives.items())+f'{digest(assembled/"manifest.json")}  manifest.json\n')
        output.parent.mkdir(parents=True,exist_ok=True)
        # Destination publication must never remove an existing review package.
        # The publication helper is also loaded from the committed snapshot,
        # never an uncommitted worktree module after the initial clean check.
        publish_scope={'__name__':'scisense_package_publication'}
        exec(compile(blob('server/trainer/hermes_personal_migration.py'),'committed-migration.py','exec'),publish_scope)
        publish_scope['publish_new'](assembled,output)
        return {'codeSha':sha,'liveEnabled':False,'appFiles':len(files),'runtimeFiles':len(rows),'manifestSha256':digest(output/'manifest.json')}
    finally:
        shutil.rmtree(temporary)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--runtime',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--node',type=Path,required=True)
    args=parser.parse_args()
    try:print(json.dumps(package(args.runtime,args.output,args.node)))
    except Exception as error:
        code=str(error)
        print(json.dumps({'error':code if re.fullmatch('[a-z_]+',code) else 'package_failed'}));raise SystemExit(1)
