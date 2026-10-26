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

    def test_legacy_web_archive_has_stable_ids_and_no_turn_replay(self):
        rows=[{'id':'web-first','role':'user','content':'Вчора з’їв синтетичне яблуко','created':1700000000000,'run_id':'must-not-execute','draft':{'state':'ready'}}]
        first=web_history(rows,uid='owner',conversation_id='one')
        self.assertEqual(first,web_history(rows,uid='owner',conversation_id='one'))
        self.assertNotEqual(first['id'],web_history(rows,uid='wife',conversation_id='one')['id'])
        self.assertNotIn('must-not-execute',str(first));self.assertEqual(first['archived'],1)
        bundle=self.bundle(sessions=self.sessions+[first]);self.assertEqual(import_empty(bundle)['messages'],3)


if __name__ == '__main__':
    unittest.main()
