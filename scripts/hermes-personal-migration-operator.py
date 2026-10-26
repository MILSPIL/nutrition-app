#!/usr/bin/env python3
"""Fixed offline migration operator; private output only, no arbitrary commands.
Key is exactly 32 raw bytes on stdin, never argv. Export holds native maintenance
ownership until the controller releases its receipt; a second owner is refused.
This does not stop source services or choose an ambiguous primary session.
"""
import argparse
import base64
from contextlib import contextmanager
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import signal
import stat
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'server/trainer'))
from hermes_personal_migration import PIN, prepare, preflight, seal, unseal, import_empty, _private, _write, encoded, digest, MAX_BUNDLE, MAX_ENCRYPTED_BUNDLE


def verify_source_tree(source, pin):
    source=source.resolve(strict=True)
    data=(source.parent/'source-manifest.json').read_bytes()
    if hashlib.sha256(data).hexdigest()!=pin['manifestSha256']:
        raise RuntimeError('migration_source_pin')
    manifest=json.loads(data)
    if len(manifest)!=pin['files']:
        raise RuntimeError('migration_source_pin')
    for name,sha in manifest.items():
        file=source/name
        if file.is_symlink() or not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest()!=sha:
            raise RuntimeError('migration_source_pin')
    importable=('.py','.pyc','.pyo','.so','.pyd','.dylib','.dll')
    for directory, names, files in os.walk(source,followlinks=False):
        excluded={'.venv','node_modules','.git'} if Path(directory)==source else set()
        for name in names:
            if name not in excluded and (Path(directory)/name).is_symlink():
                raise RuntimeError('migration_source_alias')
        names[:]=[name for name in names if name not in excluded]
        for name in files:
            path=Path(directory)/name
            if name.endswith(importable) and path.relative_to(source).as_posix() not in manifest:
                raise RuntimeError('migration_source_extra_module')
    return source


def source_code(source):
    pin=json.loads((ROOT/'server/trainer/hermes-pin.json').read_text())
    source=verify_source_tree(source,pin)
    sys.path.insert(1,str(source))
    # The operator never uses provider resolvers, gateways, tools or automation.
    config_root=Path(os.environ['HERMES_HOME']).resolve()
    def no_external(event,args):
        if event.startswith('socket.connect') or event in ('socket.sendto','subprocess.Popen','os.system','os.posix_spawn','os.exec','os.fork'):
            raise PermissionError('migration_external_operation_denied')
        if event=='open' and isinstance(args[0],(str,bytes,os.PathLike)):
            path=Path(os.fsdecode(args[0]))
            if path.name=='config.yaml' and not path.absolute().is_relative_to(config_root):
                raise PermissionError('migration_foreign_config_read_denied')
            if path.name in ('auth.json','.env','credentials.json') or 'Keychains' in path.parts:
                raise PermissionError('migration_credential_read_denied')
    sys.addaudithook(no_external)
    logging.disable(logging.CRITICAL)
    return source


def read_data(path, maximum=400*1024*1024):
    path=Path(path)
    if path.resolve()!=path:
        raise RuntimeError('migration_path_alias')
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    with os.fdopen(fd,'rb') as stream:
        info=os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or info.st_nlink!=1 or info.st_size>maximum:
            raise RuntimeError('migration_file_invalid')
        return stream.read(maximum+1)


def database_identity(home):
    result={};total=0
    for suffix in ('','-wal','-shm'):
        path=home/('state.db'+suffix)
        if suffix and not (path.exists() or path.is_symlink()):continue
        if path.resolve()!=path:raise RuntimeError('migration_database_alias')
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
        try:
            info=os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or info.st_nlink!=1:
                raise RuntimeError('migration_database_alias')
            total+=info.st_size;result[suffix]=(info.st_dev,info.st_ino)
        finally:os.close(fd)
    if total>MAX_BUNDLE:raise RuntimeError('migration_database_size')
    return result


def transcripts(home):
    _private(home,directory=True)
    before=database_identity(home)
    from hermes_state import SessionDB
    db=SessionDB(home/'state.db',read_only=True)
    try:
        rows=db.export_all(include_inactive=True)
    finally:
        db.close()
    after=database_identity(home)
    if any(after.get(name)!=identity for name,identity in before.items()):
        raise RuntimeError('migration_database_changed')
    return rows


@contextmanager
def source_fence(home):
    _private(home,directory=True)
    from gateway.runtime_ownership import ProfileOwnership
    ownership=ProfileOwnership()
    try:
        ownership.reserve([home],purpose='scisense-private-migration')
    except Exception:
        ownership.close()
        raise RuntimeError('migration_source_still_owned') from None
    try:
        yield
    finally:
        ownership.close()


def inventory(home):
    rows=transcripts(home)
    result=[]
    for row in rows:
        result.append({'id':row['id'],'title':row.get('title'),'source':row.get('source'),'parentId':row.get('parent_session_id'),
                       'messages':len(row['messages']),'fingerprint':digest(row)})
    candidates=[r['id'] for r in result if r['title']=='Bot Chat']
    return {'version':1,'pin':PIN,'sourceHome':str(home),'sessions':result,'primaryCandidates':candidates,'selectionRequired':len(candidates)!=1}


def export_selection(selection):
    expected={'uid','sourceHome','destinationHome','primaryId','sessionIds','materials','mediaPaths'}
    if not isinstance(selection,dict) or set(selection)!=expected or not isinstance(selection['sessionIds'],list) or not selection['sessionIds'] or selection['primaryId'] not in selection['sessionIds']:
        raise RuntimeError('migration_selection_invalid')
    home=Path(selection['sourceHome'])
    rows=transcripts(home);by_id={r['id']:r for r in rows};ids=set(selection['sessionIds'])
    if not ids.issubset(by_id):raise RuntimeError('migration_selection_changed')
    # Complete compression ancestry only, never an unrelated profile/session.
    for sid in list(ids):
        visited=set()
        while sid:
            if sid in visited or sid not in by_id:raise RuntimeError('migration_lineage_incomplete')
            visited.add(sid);ids.add(sid);sid=by_id[sid].get('parent_session_id')
    materials=[]
    for material in selection['materials']:
        if not isinstance(material,dict) or set(material)!={'name','path'} or not isinstance(material['path'],str):raise RuntimeError('migration_selection_invalid')
        path=Path(material['path'])
        if path.is_absolute() or '..' in path.parts or not path.parts or path.parts[0] not in ('yura-context.md','memory','memories','context') or path.suffix not in ('.md','.txt') or re.search('auth|secret|token|config|hook|cron|telegram',str(path),re.I):
            raise RuntimeError('migration_material_not_allowed')
        materials.append({'name':material['name'],'text':read_data(home/path,400000).decode('utf8')})
    media=[]
    for name in selection['mediaPaths']:
        path=Path(name)
        if not path.is_relative_to(home/'cache/images') and not path.is_relative_to(home/'cache/documents/native-inputs'):
            raise RuntimeError('migration_media_not_allowed')
        data=read_data(path,5*1024*1024)
        from hermes_personal_media import _image
        media.append({'sourcePath':str(path),'mime':_image(data),'data':base64.b64encode(data).decode()})
    return prepare(uid=selection['uid'],source_home=str(home),destination_home=selection['destinationHome'],primary_id=selection['primaryId'],sessions=[row for row in rows if row['id'] in ids],materials=materials,media=media)


def write_private(path,data):
    _private(path.parent,directory=True)
    _write(path,data)
    fd=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(fd)
    finally:os.close(fd)


def operator_environment(root):
    """Native data APIs must not consult another installed profile's config."""
    root=Path(root)
    for name in list(os.environ):
        if name.startswith(('HERMES_','CODEX_','OPENAI_','ANTHROPIC_','GROQ_')):
            os.environ.pop(name,None)
    for name in ('home','hermes','codex','config','cache','data','pycache'):
        (root/name).mkdir(mode=0o700)
    os.environ.update(HOME=str(root/'home'),HERMES_HOME=str(root/'hermes'),CODEX_HOME=str(root/'codex'),
                      XDG_CONFIG_HOME=str(root/'config'),XDG_CACHE_HOME=str(root/'cache'),XDG_DATA_HOME=str(root/'data'))
    sys.pycache_prefix=str(root/'pycache')


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('operation',choices=('inventory','export','verify','import','snapshot','restore'))
    parser.add_argument('--native-source',type=Path,required=True)
    parser.add_argument('--home',type=Path)
    parser.add_argument('--selection',type=Path)
    parser.add_argument('--bundle',type=Path)
    parser.add_argument('--output',type=Path)
    parser.add_argument('--uid')
    parser.add_argument('--destination-home')
    parser.add_argument('--expected-sha256')
    parser.add_argument('--minimum-epoch',type=int)
    args=parser.parse_args();source_code(args.native_source)
    if args.operation=='inventory':
        if not args.home or not args.output:raise RuntimeError('migration_arguments_invalid')
        result=inventory(args.home);write_private(args.output,encoded(result))
        print(json.dumps({'inventoryWritten':True,'sessions':len(result['sessions']),'selectionRequired':result['selectionRequired']}));return
    key=sys.stdin.buffer.read(32)
    if len(key)!=32:raise RuntimeError('migration_key_invalid')
    if args.operation=='snapshot':
        if not args.home or not args.uid or not args.output:
            raise RuntimeError('migration_arguments_invalid')
        home=_private(args.home,directory=True)
        database_identity(home)
        from gateway.runtime_ownership import exclusive_maintenance
        from hermes_personal_snapshot import capture
        with exclusive_maintenance([home],purpose='scisense-canonical-snapshot'):
            receipt=capture(home,args.uid,args.output,key)
            print(json.dumps({'snapshotWritten':True,'fenceHeld':True,**receipt}),flush=True)
            line=sys.stdin.buffer.readline(4096)
            if len(line)>=4096 or json.loads(line or '{}')!={'release':receipt['sha256']}:
                raise RuntimeError('migration_cutover_not_confirmed')
            print(json.dumps({'fenceReleased':True}),flush=True)
        return
    if args.operation=='restore':
        if not args.bundle or not args.uid or not args.destination_home or not args.expected_sha256 or not args.minimum_epoch:
            raise RuntimeError('migration_arguments_invalid')
        from hermes_personal_snapshot import restore
        result=restore(args.bundle,args.uid,Path(args.destination_home),key,expected_sha256=args.expected_sha256,minimum_epoch=args.minimum_epoch)
        print(json.dumps(result),flush=True);return
    if args.operation=='export':
        if not args.selection or not args.output:raise RuntimeError('migration_arguments_invalid')
        selection=json.loads(read_data(args.selection,32000))
        with source_fence(Path(selection['sourceHome'])):
            bundle=export_selection(selection);data=seal(bundle,key);write_private(args.output,data)
            receipt=hashlib.sha256(data).hexdigest()
            print(json.dumps({'exportWritten':True,'fenceHeld':True,'bundleSha256':receipt,'counts':preflight(bundle)}),flush=True)
            # Controller keeps stdin open across B2/B3. EOF or SIGTERM means
            # aborted cutover, never successful source channel rebinding.
            line=sys.stdin.buffer.readline(4096)
            if len(line)>=4096 or json.loads(line or '{}')!={'release':receipt}:
                raise RuntimeError('migration_cutover_not_confirmed')
            print(json.dumps({'fenceReleased':True}),flush=True)
    else:
        if not args.bundle or not args.uid or not args.destination_home:raise RuntimeError('migration_arguments_invalid')
        bundle=unseal(read_data(args.bundle,MAX_ENCRYPTED_BUNDLE),key,uid=args.uid,destination_home=args.destination_home)
        counts=preflight(bundle) if args.operation=='verify' else import_empty(bundle)
        print(json.dumps({'verified':True,'imported':args.operation=='import','counts':counts}))


if __name__=='__main__':
    try:
        if not sys.flags.isolated or not sys.flags.ignore_environment or not sys.flags.no_user_site:
            raise RuntimeError('migration_isolated_python_required')
        sys.dont_write_bytecode=True
        with tempfile.TemporaryDirectory(prefix='scisense-migration-pycache-') as cache:
            operator_environment(cache)
            main()
    except Exception as fault:
        code=str(fault)
        print(json.dumps({'error':code if re.fullmatch('[a-z_]{1,80}',code) else 'migration_refused'}),file=sys.stderr)
        raise SystemExit(1)
