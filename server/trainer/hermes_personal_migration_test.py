"""Synthetic migration with pinned native SQLite API; no network or credentials."""
import base64
import copy
import os
from pathlib import Path
import tempfile
import unittest

from hermes_personal_migration import prepare, preflight, seal, unseal, import_empty, web_history, publish_new, digest, semantic

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZz8AAAAASUVORK5CYII=')


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(dir=os.environ['SCISENSE_FIXTURE_ROOT'])
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.source, self.dest = self.root / 'source', self.root / 'destination'
        self.source.mkdir(mode=0o700)
        from hermes_state import SessionDB
        db = SessionDB(self.source / 'state.db')
        try:
            db.create_session('local-native-first', 'local', model='synthetic-model')
            db.set_session_title('local-native-first', 'Bot Chat')
            db.append_message('local-native-first', 'user', 'Синтетичний текст', timestamp=1700000000, message_uid='stable-first')
            db.append_message('local-native-first', 'assistant', 'Синтетична відповідь', timestamp=1700000001, message_uid='stable-second')
            self.sessions = db.export_all(include_inactive=True)
        finally:
            db.close()
        self.before = (self.source / 'state.db').read_bytes()

    def bundle(self, **overrides):
        args = dict(uid='owner', source_home=str(self.source), destination_home=str(self.dest), primary_id='local-native-first',
                    sessions=self.sessions, materials=[{'name':'personal-context.md','text':'Синтетичний особистий контекст'}])
        args.update(overrides)
        return prepare(**args)

    def test_a_isolated_cli_inventory_bootstrap_and_no_output_leak(self):
        import json, subprocess, sys
        operator_path=Path(__file__).resolve().parents[2]/'scripts/hermes-personal-migration-operator.py'
        source=Path(sys.modules['hermes_state'].__file__).parent
        foreign=self.root/'inherited-home';foreign.mkdir(mode=0o700)
        (foreign/'config.yaml').write_text(json.dumps({'sessions':{'max_export_messages':1}}))
        output=self.root/'inventory.json'
        environment={**os.environ,'HERMES_HOME':str(foreign),'HOME':str(foreign),'OPENAI_API_KEY':'synthetic-parent-must-not-be-used'}
        result=subprocess.run([sys.executable,'-I','-B',str(operator_path),'inventory','--native-source',str(source),'--home',str(self.source),'--output',str(output)],env=environment,cwd=self.root,capture_output=True,text=True,timeout=30)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(json.loads(result.stdout)['sessions'],1)
        self.assertEqual(json.loads(output.read_text())['sessions'][0]['messages'],2)
        self.assertNotIn('synthetic-parent-must-not-be-used',result.stdout+result.stderr+output.read_text())
        self.assertEqual((self.source/'state.db').read_bytes(),self.before)

    def test_native_roundtrip_exact_ids_messages_context_and_no_overlay(self):
        bundle = self.bundle()
        receipt = import_empty(bundle)
        self.assertEqual(receipt['messages'], 2)
        from hermes_state import SessionDB
        db = SessionDB(self.dest / 'state.db', read_only=True)
        try:
            exported = db.export_all(include_inactive=True)
            self.assertEqual(digest(semantic(exported[0])), bundle['fingerprints']['local-native-first'])
            self.assertEqual([m['message_uid'] for m in exported[0]['messages']], ['stable-first','stable-second'])
            self.assertEqual(preflight(bundle, exported)['skipped'], 1)
        finally:
            db.close()
        from hermes_personal_context import ProfileContext
        context = ProfileContext(self.dest, initialize=True).read()
        self.assertIn('Синтетичний особистий контекст', str(context))
        self.assertFalse((self.dest / 'auth.json').exists()); self.assertFalse((self.dest / 'config.yaml').exists())
        with self.assertRaisesRegex(RuntimeError, 'migration_destination_exists'):
            import_empty(bundle)
        self.assertEqual((self.source / 'state.db').read_bytes(), self.before)

    def test_aead_wrong_uid_home_key_and_tamper(self):
        bundle = self.bundle(); key = b'x' * 32; encrypted = seal(bundle, key)
        self.assertNotIn('Синтетичний'.encode(), encrypted)
        self.assertEqual(unseal(encrypted,key,uid='owner',destination_home=str(self.dest)), bundle)
        for uid,home,secret in [('wife',str(self.dest),key),('owner',str(self.dest)+'-other',key),('owner',str(self.dest),b'y'*32)]:
            with self.assertRaisesRegex(RuntimeError,'migration_authentication_failed'):
                unseal(encrypted,secret,uid=uid,destination_home=home)
        with self.assertRaisesRegex(RuntimeError,'migration_authentication_failed'):
            unseal(encrypted[:-4]+b'xxxx',key,uid='owner',destination_home=str(self.dest))

    def test_policy_auth_config_hooks_and_telegram_not_carried(self):
        raw=copy.deepcopy(self.sessions); raw[0].update(model_config='SECRET_POLICY',system_prompt='SECRET_POLICY',auth={'tokens':'SECRET_POLICY'},cwd='/other',origin_json='SECRET_POLICY')
        bundle=self.bundle(sessions=raw)
        self.assertNotIn('SECRET_POLICY',str(bundle)); self.assertEqual(bundle['sessions'][0]['source'],'desktop')
        for name in ['auth.md','config.txt','hooks.md','telegram.md','../context.md']:
            with self.assertRaises(RuntimeError):self.bundle(materials=[{'name':name,'text':'no'}])
        with self.assertRaisesRegex(RuntimeError,'migration_secret_or_size'):
            self.bundle(materials=[{'name':'context.md','text':'sk-ant-'+('x'*30)}])

    def test_primary_ambiguity_lineage_collision_and_oversize_block_before_write(self):
        with self.assertRaises(RuntimeError):self.bundle(primary_id='absent')
        raw=copy.deepcopy(self.sessions); raw[0]['parent_session_id']='missing-parent'
        with self.assertRaisesRegex(RuntimeError,'migration_lineage_incomplete'):self.bundle(sessions=raw)
        bundle=self.bundle(); existing=copy.deepcopy(bundle['sessions']);existing[0]['messages'][0]['content']='changed'
        with self.assertRaisesRegex(RuntimeError,'migration_id_collision'):preflight(bundle,existing)
        with self.assertRaisesRegex(RuntimeError,'migration_context_limit'):
            self.bundle(materials=[{'name':'context.md','text':'x'*400001}])
        with self.assertRaises(RuntimeError):self.bundle(destination_home=str(self.source/'nested'))
        self.assertFalse(self.dest.exists())

    def test_failure_before_publish_and_destination_race_leave_source_unchanged(self):
        def interrupted(stage, path):raise OSError('synthetic_disk_full')
        with self.assertRaisesRegex(OSError,'synthetic_disk_full'):import_empty(self.bundle(),failpoint=interrupted)
        self.assertFalse(self.dest.exists());self.assertFalse(list(self.root.glob('.scisense-migration-*')))
        def concurrent_target(stage,path):self.dest.mkdir(mode=0o700)
        with self.assertRaisesRegex(RuntimeError,'migration_destination_exists'):import_empty(self.bundle(),failpoint=concurrent_target)
        self.assertEqual(list(self.dest.iterdir()),[])
        self.assertEqual((self.source / 'state.db').read_bytes(),self.before)
        staged=self.root/'publication';staged.mkdir(mode=0o700);(staged/'payload').write_text('own')
        with self.assertRaisesRegex(RuntimeError,'migration_destination_exists'):publish_new(staged,self.dest)
        self.assertTrue((staged/'payload').exists())

    def test_photo_mapping_integrity_and_missing_attachment(self):
        raw=copy.deepcopy(self.sessions);old=str(self.source/'cache/images/test.png');raw[0]['messages'][0]['content']+=' [Image attached at: '+old+']'
        media=[{'sourcePath':old,'mime':'image/png','data':base64.b64encode(PNG).decode()}]
        with self.assertRaisesRegex(RuntimeError,'migration_media_missing'):self.bundle(sessions=raw)
        bundle=self.bundle(sessions=raw,media=media);import_empty(bundle)
        self.assertNotIn(old,bundle['sessions'][0]['messages'][0]['content'])
        self.assertEqual((self.dest/bundle['media'][0]['path']).read_bytes(),PNG)
        changed=copy.deepcopy(bundle);changed['media'][0]['data']=base64.b64encode(PNG+b'corrupt').decode()
        with self.assertRaisesRegex(RuntimeError,'migration_media_corrupt'):preflight(changed)
        changed=copy.deepcopy(bundle);changed['media'][0]['path']='../escape'
        with self.assertRaises(RuntimeError):preflight(changed)

    def test_native_hidden_and_compaction_display_flags_roundtrip(self):
        from hermes_state import SessionDB
        db=SessionDB(self.source/'state.db')
        try:
            db.append_message('local-native-first','user','MODEL_ONLY_SYNTHETIC',timestamp=1700000002,message_uid='model-only',display_metadata={'model_only':True})
            db.append_message('local-native-first','user','SUMMARY_CARRIER_SYNTHETIC',timestamp=1700000003,message_uid='stable-first',_compressed_summary=True,display_kind='hidden')
            raw=db.export_all(include_inactive=True)
            before=db.get_messages('local-native-first',include_compacted=True)
        finally:db.close()
        bundle=self.bundle(sessions=raw);import_empty(bundle)
        db=SessionDB(self.dest/'state.db',read_only=True)
        try:
            after=db.get_messages('local-native-first',include_compacted=True)
            self.assertEqual([(m['role'],m['content'],m.get('message_uid')) for m in before],[(m['role'],m['content'],m.get('message_uid')) for m in after])
            self.assertNotIn('MODEL_ONLY_SYNTHETIC',str(after))
        finally:db.close()

    def test_photo_path_prefix_collision_cannot_mask_missing_longer_photo(self):
        raw=copy.deepcopy(self.sessions);old=str(self.source/'cache/images/a.png');raw[0]['messages'][0]['content']+=' [Image attached at: '+old+'-extra.png]'
        with self.assertRaisesRegex(RuntimeError,'migration_media_missing'):
            self.bundle(sessions=raw,media=[{'sourcePath':old,'mime':'image/png','data':base64.b64encode(PNG).decode()}])
        raw[0]['messages'][0]['content']='[Image attached at: /other'+old+']'
        with self.assertRaisesRegex(RuntimeError,'migration_media_missing'):
            self.bundle(sessions=raw,media=[{'sourcePath':old,'mime':'image/png','data':base64.b64encode(PNG).decode()}])

    def test_old_gateway_input_owner_is_not_adopted_by_the_new_home(self):
        raw=copy.deepcopy(self.sessions)
        raw[0]['messages'][0]['display_metadata']={'gateway_input_owner':'old-telegram-owner'}
        bundle=self.bundle(sessions=raw)
        self.assertNotIn('display_metadata',bundle['sessions'][0]['messages'][0])
        self.assertEqual(bundle['provenance'][0]['sourceFingerprint'],digest(semantic(raw[0])))
        raw[0]['messages'][0]['display_metadata']['model_only']=True
        self.assertEqual(self.bundle(sessions=raw)['sessions'][0]['messages'][0]['display_metadata'],{'model_only':True})
        raw=copy.deepcopy(self.sessions)
        raw[0]['messages'].append({'role':'session_meta','content':None,'message_uid':'legacy-setup-only'})
        bundle=self.bundle(sessions=raw)
        self.assertEqual(len(bundle['sessions'][0]['messages']),len(self.sessions[0]['messages']))
        self.assertEqual(bundle['provenance'][0]['sourceFingerprint'],digest(semantic(raw[0])))
        raw[0]['messages'][-1]['content']='Unexpected content must not disappear'
        with self.assertRaisesRegex(RuntimeError,'migration_session_meta_unsupported'):self.bundle(sessions=raw)
        raw=copy.deepcopy(self.sessions)
        for owner in ['',{},'x'*1025,'bad\0owner']:
            raw[0]['messages'][0]['display_metadata']={'gateway_input_owner':owner}
            with self.assertRaisesRegex(RuntimeError,'migration_display_metadata_unsupported'):self.bundle(sessions=raw)

    def test_fixed_operator_inventory_selection_and_native_source_fence(self):
        import importlib.util
        operator_path=Path(__file__).resolve().parents[2]/'scripts/hermes-personal-migration-operator.py'
        spec=importlib.util.spec_from_file_location('synthetic_migration_operator',operator_path)
        operator=importlib.util.module_from_spec(spec);spec.loader.exec_module(operator)
        selected={'uid':'owner','sourceHome':str(self.source),'destinationHome':str(self.dest),'primaryId':'local-native-first','sessionIds':['local-native-first'],'materials':[{'name':'curated.md','path':'yura-context.md'}],'mediaPaths':[]}
        (self.source/'yura-context.md').write_text('Синтетичний контекст, тільки власника')
        view=operator.inventory(self.source)
        self.assertEqual(view['primaryCandidates'],['local-native-first']);self.assertFalse(view['selectionRequired'])
        with operator.source_fence(self.source):
            with self.assertRaisesRegex(RuntimeError,'migration_source_still_owned'):
                with operator.source_fence(self.source):self.fail('second source owner admitted')
            bundle=operator.export_selection(selected)
            self.assertEqual(bundle['materials'][0]['text'],'Синтетичний контекст, тільки власника')
        with operator.source_fence(self.source):pass
        (self.source/'home').mkdir(mode=0o700)
        (self.source/'home/yura-context.md').write_text('Контекст із робочої теки профілю')
        selected['materials'][0]['path']='home/yura-context.md'
        self.assertEqual(operator.export_selection(selected)['materials'][0]['text'],'Контекст із робочої теки профілю')
        for denied in ['home/auth.json','home/other.md','home/../yura-context.md']:
            selected['materials'][0]['path']=denied
            with self.assertRaisesRegex(RuntimeError,'migration_material_not_allowed'):operator.export_selection(selected)
        selected['materials'][0]['path']='../auth.json'
        with self.assertRaisesRegex(RuntimeError,'migration_material_not_allowed'):operator.export_selection(selected)
        self.assertEqual((self.source/'state.db').read_bytes(),self.before)

    def test_fixed_operator_cli_key_stdin_receipt_release_verify_import_and_eof(self):
        import importlib.util, io, json, sys
        from unittest.mock import patch
        operator_path=Path(__file__).resolve().parents[2]/'scripts/hermes-personal-migration-operator.py'
        spec=importlib.util.spec_from_file_location('synthetic_migration_cli',operator_path)
        operator=importlib.util.module_from_spec(spec);spec.loader.exec_module(operator)
        source=Path(sys.modules['hermes_state'].__file__).parent
        foreign_config=self.root/'config.yaml';foreign_config.write_text('SYNTHETIC_FOREIGN_CONFIG_MUST_NOT_READ')
        operator.source_code(source)
        with self.assertRaisesRegex(PermissionError,'migration_foreign_config_read_denied'):
            operator.read_data(foreign_config)
        selection=self.root/'selection.json';bundle_file=self.root/'bundle.enc';key=b'z'*32
        selection.write_text(json.dumps({'uid':'owner','sourceHome':str(self.source),'destinationHome':str(self.dest),'primaryId':'local-native-first','sessionIds':['local-native-first'],'materials':[],'mediaPaths':[]}));selection.chmod(0o600)
        class Input:
            def __init__(self,release=True):self.buffer=self;self.release=release
            def read(self,count):self.assert_count=count;return key
            def readline(self,count):return (json.dumps({'release':__import__('hashlib').sha256(bundle_file.read_bytes()).hexdigest()})+'\n').encode() if self.release else b''
        def run(args,stdin):
            with patch.object(operator,'source_code',lambda value:source),patch.object(sys,'argv',[str(operator_path),*args,'--native-source',str(source)]),patch.object(sys,'stdin',stdin),patch.object(sys,'stdout',io.StringIO()) as output:
                operator.main();return [json.loads(line) for line in output.getvalue().splitlines()]
        sent=Input();result=run(['export','--selection',str(selection),'--output',str(bundle_file)],sent)
        self.assertEqual(sent.assert_count,32);self.assertTrue(result[0]['fenceHeld']);self.assertTrue(result[1]['fenceReleased'])
        for command in ('verify','import'):
            result=run([command,'--bundle',str(bundle_file),'--uid','owner','--destination-home',str(self.dest)],Input())
            self.assertTrue(result[0]['verified'])
        bundle_file.unlink()
        with self.assertRaisesRegex(RuntimeError,'migration_cutover_not_confirmed'):
            run(['export','--selection',str(selection),'--output',str(bundle_file)],Input(release=False))
        with operator.source_fence(self.source):pass
        self.assertEqual((self.source/'state.db').read_bytes(),self.before)

    def test_operator_closed_source_rejects_extra_code_bytecode_and_alias(self):
        import importlib.util, hashlib, json
        operator_path=Path(__file__).resolve().parents[2]/'scripts/hermes-personal-migration-operator.py'
        spec=importlib.util.spec_from_file_location('synthetic_source_guard',operator_path);operator=importlib.util.module_from_spec(spec);spec.loader.exec_module(operator)
        root=self.root/'code';source=root/'source';source.mkdir(parents=True,mode=0o700)
        (source/'legit.py').write_text('VALUE=1')
        manifest=json.dumps({'legit.py':hashlib.sha256((source/'legit.py').read_bytes()).hexdigest()}).encode()
        (root/'source-manifest.json').write_bytes(manifest)
        pin={'files':1,'manifestSha256':hashlib.sha256(manifest).hexdigest()}
        self.assertEqual(operator.verify_source_tree(source,pin),source)
        for name in ('sqlite3.py','__pycache__/legit.cpython-314.pyc','evil.so'):
            path=source/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(b'SYNTHETIC_UNTRUSTED_CODE')
            with self.assertRaisesRegex(RuntimeError,'migration_source_extra_module'):operator.verify_source_tree(source,pin)
            path.unlink()
        (source/'alias').symlink_to(self.source,target_is_directory=True)
        with self.assertRaisesRegex(RuntimeError,'migration_source_alias'):operator.verify_source_tree(source,pin)

    def test_operator_database_symlink_hardlink_and_sidecars_are_refused(self):
        import importlib.util
        operator_path=Path(__file__).resolve().parents[2]/'scripts/hermes-personal-migration-operator.py'
        spec=importlib.util.spec_from_file_location('synthetic_db_guard',operator_path);operator=importlib.util.module_from_spec(spec);spec.loader.exec_module(operator)
        other=self.root/'other';other.mkdir(mode=0o700);foreign=other/'state.db';foreign.write_bytes(self.before)
        saved=self.source/'saved.db';database=self.source/'state.db';database.rename(saved)
        try:
            for kind in ('symbolic','hard'):
                database.symlink_to(foreign) if kind=='symbolic' else os.link(foreign,database)
                with self.assertRaisesRegex(RuntimeError,'migration_database_alias'):operator.transcripts(self.source)
                database.unlink()
            saved.rename(database)
            for suffix in ('-wal','-shm'):
                path=self.source/('state.db'+suffix);path.symlink_to(foreign)
                with self.assertRaisesRegex(RuntimeError,'migration_database_alias'):operator.transcripts(self.source)
                path.unlink()
            self.assertEqual(database.read_bytes(),self.before);self.assertEqual(foreign.read_bytes(),self.before)
        finally:
            if saved.exists():
                database.unlink(missing_ok=True);saved.rename(database)

    def test_operator_encrypted_envelope_can_exceed_plaintext_cap(self):
        import importlib.util, io, json, sys
        from unittest.mock import patch
        import hermes_personal_migration as migration
        operator_path=Path(__file__).resolve().parents[2]/'scripts/hermes-personal-migration-operator.py'
        spec=importlib.util.spec_from_file_location('synthetic_envelope_guard',operator_path);operator=importlib.util.module_from_spec(spec);spec.loader.exec_module(operator)
        bundle=self.bundle(materials=[{'name':'context.md','text':'x'*4000}]);key=b'k'*32
        plain_cap=len(migration.encoded(bundle))+1;encrypted_cap=4*((plain_cap+18)//3)+512
        encrypted=seal(bundle,key);self.assertGreater(len(encrypted),plain_cap);self.assertLess(len(encrypted),encrypted_cap)
        path=self.root/'sized-envelope.enc';path.write_bytes(encrypted);path.chmod(0o600)
        old_defaults=operator.read_data.__defaults__;operator.read_data.__defaults__=(plain_cap,)
        try:
            with patch.object(migration,'MAX_BUNDLE',plain_cap),patch.object(migration,'MAX_ENCRYPTED_BUNDLE',encrypted_cap),patch.object(operator,'MAX_ENCRYPTED_BUNDLE',encrypted_cap),patch.object(operator,'source_code',lambda value:None),patch.object(sys,'argv',[str(operator_path),'verify','--native-source','/synthetic','--bundle',str(path),'--uid','owner','--destination-home',str(self.dest)]),patch.object(sys,'stdin',io.TextIOWrapper(io.BytesIO(key))),patch.object(sys,'stdout',io.StringIO()) as output:
                operator.main();self.assertTrue(json.loads(output.getvalue())['verified'])
        finally:operator.read_data.__defaults__=old_defaults

    def test_legacy_web_archive_has_stable_ids_and_no_turn_replay(self):
        rows=[{'id':'web-first','role':'user','content':'Вчора з’їв синтетичне яблуко','created':1700000000000,'run_id':'must-not-execute','draft':{'state':'ready'}}]
        first=web_history(rows,uid='owner',conversation_id='one')
        self.assertEqual(first,web_history(rows,uid='owner',conversation_id='one'))
        self.assertNotEqual(first['id'],web_history(rows,uid='wife',conversation_id='one')['id'])
        self.assertNotIn('must-not-execute',str(first));self.assertEqual(first['archived'],1)
        bundle=self.bundle(sessions=self.sessions+[first]);self.assertEqual(import_empty(bundle)['messages'],3)


from hermes_personal_snapshot_test import CanonicalSnapshotTests
from hermes_personal_context_test import ContextTests

if __name__ == '__main__':
    unittest.main()
