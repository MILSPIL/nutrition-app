"""Full native store recovery, synthetic only, including interrupted receipts."""
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import hermes_personal_snapshot as snapshots

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZz8AAAAASUVORK5CYII=')


class CanonicalSnapshotTests(unittest.IsolatedAsyncioTestCase):
    async def authority(self, home):
        from gateway.config import GatewayConfig
        from gateway.session import SessionStore
        from gateway.session_authorities import SessionAuthorities
        from gateway.runtime_ownership import ProfileOwnership
        from gateway.run_runtime import _build_profile_authority
        ownership = ProfileOwnership(); ownership.reserve([home])
        os.environ['HERMES_HOME'] = str(home)
        store = SessionStore(home / 'sessions', GatewayConfig())
        runner = SimpleNamespace(session_store=store, _session_db=store._db, adapters={}, _draining=False,
                                 _cached_agent_for=lambda route: None, session_authorities=SessionAuthorities(home),
                                 session_runtime_descriptor={'instance_id': 'snapshot-fixture'})
        runner._adapter_for_source = lambda source: runner.adapters.get(source.platform)
        authority = await _build_profile_authority(runner, 'default', home, register=True)
        self.owners.append((ownership, home))
        return authority

    def release(self, home):
        from hermes_state_registry import close_all_under
        for ownership, path in self.owners:
            if path == home:
                ownership.close()
        close_all_under(home)

    async def asyncSetUp(self):
        from gateway import run
        self.old_environment = os.environ.get('HERMES_HOME')
        self.temporary = tempfile.TemporaryDirectory(dir=os.environ['SCISENSE_FIXTURE_ROOT'])
        self.root = Path(self.temporary.name).resolve(); self.home = self.root / 'canonical'
        self.home.mkdir(mode=0o700); self.owners = []
        self.config = {'model': {'default': 'synthetic-model', 'provider': 'synthetic'},
                       'platform_toolsets': {'cli': [], 'gui': []},
                       'auth': {'adopt_external_logins': False},
                       'memory': {'memory_enabled': False, 'user_profile_enabled': False}}
        self.config_patch = patch.object(run, '_load_gateway_config', lambda *a, **k: self.config)
        self.config_patch.start()
        (self.home / 'config.yaml').write_text(json.dumps(self.config)); (self.home / 'config.yaml').chmod(0o600)
        self.owner = await self.authority(self.home)
        from gateway.session_contract import Principal
        from gateway.session_local import create_local_session
        self.principal = Principal('synthetic-owner', self.owner.profile_id,
                                   frozenset({'session:create', 'session:read', 'session:control'}), 'socket')
        self.session = create_local_session(self.owner, self.principal, {'request_id': 'canonical-stable-create',
            'source': 'gui', 'cwd': str(self.home), 'model': 'synthetic-model', 'toolsets': []})
        self.sid = self.session.session_id
        self.owner.db.append_message(self.sid, 'user', 'BEFORE_CUTOVER', timestamp=1700000000, message_uid='stable-first')
        self.owner.db.append_message(self.sid, 'assistant', 'FRESH_CONFIRMED_TAIL', timestamp=1700000060, message_uid='stable-tail')
        from hermes_state_runtime import admit_session_input, claim_session_input
        self.payload = {'text': 'Synthetic interrupted input'}
        self.admission = admit_session_input(self.owner.db, epoch=self.owner.epoch, principal_id=self.principal.subject,
            session_id=self.sid, request_id='stable-interrupted-input', payload=self.payload)
        self.assertEqual(claim_session_input(self.owner.db, epoch=self.owner.epoch, session_id=self.sid)['status'], 'started')
        self.messages = self.owner.db.get_messages(self.sid); self.epoch = self.owner.epoch
        from hermes_personal_context import ProfileContext
        ProfileContext(self.home, initialize=True).commit({'proposalId': 'snapshot-confirmed-context', 'baseRevision': 0,
                                                        'text': 'Синтетичне підтверджене доповнення'})
        self.context = ProfileContext(self.home, read_only=True).read()
        image = self.home / 'cache/documents/native-inputs/kept.png'
        image.parent.mkdir(parents=True, mode=0o700)
        for parent in (image.parent, image.parent.parent, image.parent.parent.parent): parent.chmod(0o700)
        image.write_bytes(PNG); image.chmod(0o600)
        self.photo = image
        self.key = b'k' * 32; self.archive = self.root / 'snapshot.enc'

    async def asyncTearDown(self):
        for _ownership, home in self.owners:
            self.release(home)
        self.config_patch.stop()
        if self.old_environment is None: os.environ.pop('HERMES_HOME', None)
        else: os.environ['HERMES_HOME'] = self.old_environment
        self.temporary.cleanup()

    def capture(self):
        self.release(self.home)
        return snapshots.capture(self.home, 'owner', self.archive, self.key)

    def remove_destination(self):
        self.home.rename(self.root / 'retained-original')

    def restore(self, receipt, **overrides):
        args = dict(expected_sha256=receipt['sha256'], minimum_epoch=self.epoch)
        args.update(overrides)
        return snapshots.restore(self.archive, 'owner', self.home, self.key, **args)

    async def test_full_restore_preserves_tail_context_photo_unknown_and_no_duplicate(self):
        ledger = self.root / 'external-spend-ledger'; ledger.write_bytes(b'never-roll-back')
        receipt = self.capture(); encrypted = self.archive.read_bytes()
        self.assertNotIn(b'FRESH_CONFIRMED_TAIL', encrypted)
        self.assertNotIn('Синтетичне'.encode(), encrypted)
        self.remove_destination()
        result = self.restore(receipt)
        self.assertFalse(result['credentialsRestored']); self.assertFalse(result['appLedgersRestored'])
        self.assertFalse((self.home / 'auth.json').exists()); self.assertFalse((self.home / 'config.yaml').exists())
        self.assertEqual(self.photo.read_bytes(), PNG)
        from hermes_personal_context import ProfileContext
        self.assertEqual(ProfileContext(self.home, read_only=True).read(), self.context)
        restored = await self.authority(self.home)
        self.assertGreater(restored.epoch, self.epoch)
        self.assertEqual(restored.db.get_messages(self.sid), self.messages)
        from hermes_state_runtime import find_session_admission, admit_session_input, RuntimeStoreError
        found = find_session_admission(restored.db, principal_id=self.principal.subject, session_id=self.sid,
                                       request_id='stable-interrupted-input')
        self.assertEqual(found['admission_id'], self.admission['admission_id']); self.assertEqual(found['status'], 'unknown')
        repeated = admit_session_input(restored.db, epoch=restored.epoch, principal_id=self.principal.subject,
                                      session_id=self.sid, request_id='stable-interrupted-input', payload=self.payload)
        self.assertEqual(repeated['admission_id'], found['admission_id']); self.assertEqual(repeated['status'], 'unknown')
        with self.assertRaises(RuntimeStoreError):
            admit_session_input(restored.db, epoch=restored.epoch, principal_id=self.principal.subject,
                                session_id=self.sid, request_id='stable-interrupted-input', payload={'text': 'CHANGED'})
        self.assertEqual(self.archive.read_bytes(), encrypted); self.assertEqual(ledger.read_bytes(), b'never-roll-back')
        with self.assertRaisesRegex(RuntimeError, 'snapshot_destination_exists'): self.restore(receipt)

    async def test_cold_operator_snapshot_fence_release_and_restore_without_secret_output(self):
        import selectors, subprocess, sys
        self.release(self.home)
        operator = Path(__file__).resolve().parents[2] / 'scripts/hermes-personal-migration-operator.py'
        native = Path(sys.modules['hermes_state'].__file__).parent
        command = [sys.executable, '-I', '-B', str(operator)]
        process = subprocess.Popen(command + ['snapshot', '--native-source', str(native), '--home', str(self.home),
            '--uid', 'owner', '--output', str(self.archive)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            process.stdin.write(self.key); process.stdin.flush()
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ)
                self.assertTrue(selector.select(timeout=20), 'snapshot receipt timeout')
            line = process.stdout.readline(8192); receipt = json.loads(line)
            self.assertTrue(receipt['snapshotWritten']); self.assertTrue(receipt['fenceHeld'])
            from gateway.runtime_ownership import ProfileOwnership
            second = ProfileOwnership()
            try:
                with self.assertRaises(Exception): second.reserve([self.home])
            finally: second.close()
            rest, errors = process.communicate(json.dumps({'release': receipt['sha256']}).encode() + b'\n', timeout=15)
            self.assertEqual(process.returncode, 0, errors.decode())
            self.assertTrue(json.loads(rest)['fenceReleased']); self.assertNotIn(self.key, line + rest + errors)
        finally:
            if process.poll() is None: process.kill()
            process.communicate()
        self.remove_destination()
        result = subprocess.run(command + ['restore', '--native-source', str(native), '--bundle', str(self.archive),
            '--uid', 'owner', '--destination-home', str(self.home), '--expected-sha256', receipt['sha256'],
            '--minimum-epoch', str(self.epoch)], input=self.key, capture_output=True, timeout=25)
        self.assertEqual(result.returncode, 0, result.stderr.decode()); self.assertTrue(json.loads(result.stdout)['restored'])
        restored = await self.authority(self.home)
        self.assertEqual(restored.db.get_messages(self.sid), self.messages)
        self.assertGreater(restored.epoch, self.epoch)

    async def test_authenticated_bad_tar_members_and_manifest_are_rejected_before_publish(self):
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        receipt = self.capture(); encrypted = self.archive.read_bytes(); self.remove_destination()
        offset = len(snapshots.MAGIC); nonce = encrypted[offset:offset + 12]
        plain = AESGCM(self.key).decrypt(nonce, encrypted[offset + 12:], snapshots._aad('owner', self.home))
        with tarfile.open(fileobj=io.BytesIO(plain), mode='r:') as archive:
            members = [(member.name, archive.extractfile(member).read()) for member in archive.getmembers()]
        for kind in ('traversal', 'link', 'duplicate', 'missing', 'boolean_version', 'bad_digest'):
            manifest = json.loads(members[0][1]); rows = list(members[1:]); output = io.BytesIO()
            if kind == 'traversal':
                manifest['files'][0]['path'] = '../escape'; rows[0] = ('../escape', rows[0][1])
            if kind == 'missing': rows.pop()
            if kind == 'boolean_version': manifest['version'] = True
            if kind == 'bad_digest': rows[-1] = (rows[-1][0], b'x' * len(rows[-1][1]))
            with tarfile.open(fileobj=output, mode='w', format=tarfile.USTAR_FORMAT) as archive:
                data = snapshots.encoded(manifest); info = tarfile.TarInfo('snapshot.json'); info.size = len(data)
                archive.addfile(info, io.BytesIO(data))
                for name, data in rows:
                    info = tarfile.TarInfo(name); info.size = len(data)
                    if kind == 'link' and name == rows[0][0]:
                        info.type = tarfile.SYMTYPE; info.linkname = '../../outside'; info.size = 0
                        archive.addfile(info)
                    else: archive.addfile(info, io.BytesIO(data))
                if kind == 'duplicate':
                    name, data = rows[0]; info = tarfile.TarInfo(name); info.size = len(data)
                    archive.addfile(info, io.BytesIO(data))
            fresh_nonce = os.urandom(12)
            invalid = snapshots.MAGIC + fresh_nonce + AESGCM(self.key).encrypt(fresh_nonce, output.getvalue(), snapshots._aad('owner', self.home))
            self.archive.write_bytes(invalid)
            with self.assertRaises(RuntimeError, msg=kind):
                self.restore(receipt, expected_sha256=hashlib.sha256(invalid).hexdigest())
            self.assertFalse(self.home.exists()); self.assertFalse((self.root / 'escape').exists())
            self.assertFalse(list(self.root.glob('.canonical-restore-*')))

    async def test_live_owner_blocks_snapshot_without_publication(self):
        with self.assertRaises(Exception): snapshots.capture(self.home, 'owner', self.archive, self.key)
        self.assertFalse(self.archive.exists())

    async def test_uid_home_key_tamper_digest_and_epoch_fail_without_destination(self):
        receipt = self.capture(); self.remove_destination(); original = self.archive.read_bytes()
        for uid, home, key in [('wife', self.home, self.key), ('owner', self.root / 'other', self.key), ('owner', self.home, b'x' * 32)]:
            with self.assertRaisesRegex(RuntimeError, 'snapshot_authentication_failed'):
                snapshots.restore(self.archive, uid, home, key, expected_sha256=receipt['sha256'], minimum_epoch=self.epoch)
            self.assertFalse(home.exists())
        with self.assertRaisesRegex(RuntimeError, 'snapshot_digest_invalid'): self.restore(receipt, expected_sha256='0' * 64)
        with self.assertRaisesRegex(RuntimeError, 'snapshot_manifest_invalid'): self.restore(receipt, minimum_epoch=self.epoch + 1)
        changed = original[:-1] + bytes([original[-1] ^ 1]); self.archive.write_bytes(changed)
        with self.assertRaisesRegex(RuntimeError, 'snapshot_authentication_failed'):
            self.restore(receipt, expected_sha256=hashlib.sha256(changed).hexdigest())
        self.assertFalse(self.home.exists())

    async def test_database_wal_alias_and_context_drift_refuse_without_source_write(self):
        self.release(self.home)
        alias = self.home / 'state.db-wal'; target = self.root / 'unrelated'; target.write_bytes(b'private')
        alias.symlink_to(target)
        with self.assertRaises(RuntimeError): snapshots.capture(self.home, 'owner', self.archive, self.key)
        alias.unlink(); before = (self.home / 'personal-context/memory.json').read_bytes()
        value = json.loads(before); value['sourceDigest'] = 'f' * 64
        (self.home / 'personal-context/memory.json').write_text(json.dumps(value))
        drifted = (self.home / 'personal-context/memory.json').read_bytes()
        with self.assertRaises(RuntimeError): snapshots.capture(self.home, 'owner', self.archive, self.key)
        self.assertEqual((self.home / 'personal-context/memory.json').read_bytes(), drifted)
        self.assertEqual(target.read_bytes(), b'private'); self.assertFalse(self.archive.exists())

    async def test_copy_and_restore_failure_leave_original_and_empty_target(self):
        self.release(self.home); original = (self.home / 'state.db').read_bytes()
        with patch('hermes_cli.backup_sqlite._safe_copy_db', return_value=False):
            with self.assertRaisesRegex(RuntimeError, 'snapshot_native_copy_failed'):
                snapshots.capture(self.home, 'owner', self.archive, self.key)
        self.assertFalse(self.archive.exists()); self.assertEqual((self.home / 'state.db').read_bytes(), original)
        receipt = self.capture(); self.remove_destination()
        with patch('hermes_cli.backup_restore._safe_restore_db', return_value=False):
            with self.assertRaisesRegex(RuntimeError, 'snapshot_native_restore_failed'): self.restore(receipt)
        self.assertFalse(self.home.exists()); self.assertFalse(list(self.root.glob('.canonical-restore-*')))
        self.assertEqual((self.root / 'retained-original/state.db').read_bytes(), original)

    async def test_valid_rendered_context_keeps_json_overhead_without_increasing_context_limit(self):
        self.release(self.home)
        text = 's' * 300000; sources = self.home / 'personal-context/sources'
        material = sources / (('a' * 101) + '.md'); material.write_text(text); material.chmod(0o600)
        manifest = {'version': 1, 'profileHome': str(self.home), 'files': [{'name': material.name, 'sha256': hashlib.sha256(text.encode()).hexdigest()}]}
        source_manifest = self.home / 'personal-context/sources.json'
        source_manifest.write_text(json.dumps(manifest)); source_manifest.chmod(0o600)
        state = {'version': 1, 'profileHome': str(self.home), 'revision': 2000,
                 'sourceDigest': hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest(),
                 'entries': [{'proposalId': str(i).zfill(80), 'baseRevision': i, 'text': 'x'} for i in range(2000)]}
        (self.home / 'personal-context/memory.json').write_text(json.dumps(state))
        from hermes_personal_context import ProfileContext, MAX_CONTEXT
        before = ProfileContext(self.home, read_only=True).read()
        self.assertLess(len(before['text'].encode()), MAX_CONTEXT)
        self.assertGreater(sum(p.stat().st_size for p in (self.home / 'personal-context').rglob('*') if p.is_file()), 500000)
        receipt = self.capture(); self.remove_destination(); self.restore(receipt)
        self.assertEqual(ProfileContext(self.home, read_only=True).read(), before)
        self.assertEqual(MAX_CONTEXT, 400000)

    async def test_capture_integrity_failure_never_publishes_an_unrestorable_copy(self):
        self.release(self.home); before = (self.home / 'state.db').read_bytes()
        with patch('hermes_cli.backup.verify_sqlite_integrity', return_value={'valid': False}):
            with self.assertRaisesRegex(RuntimeError, 'snapshot_native_integrity_failed'):
                snapshots.capture(self.home, 'owner', self.archive, self.key)
        self.assertFalse(self.archive.exists()); self.assertEqual((self.home / 'state.db').read_bytes(), before)

    async def test_latest_digest_binds_the_actual_decrypted_stream_after_atomic_replacement(self):
        old_receipt = self.capture(); old_archive = self.root / 'older.enc'; self.archive.rename(old_archive)
        from gateway.runtime_ownership import exclusive_maintenance
        from hermes_state import SessionDB
        with exclusive_maintenance([self.home]):
            db = SessionDB(self.home / 'state.db')
            try: db.append_message(self.sid, 'assistant', 'NEWEST_TAIL_MUST_SURVIVE', message_uid='newest-tail')
            finally: db.close()
        latest = self.capture(); self.assertEqual(old_receipt['nativeEpoch'], latest['nativeEpoch'])
        self.assertNotEqual(old_receipt['sha256'], latest['sha256']); self.remove_destination()
        original_open = snapshots._open_private; changed = []
        def open_after_replace(path):
            if path == self.archive and not changed:
                old_archive.replace(self.archive); changed.append(True)
            return original_open(path)
        with patch.object(snapshots, '_open_private', open_after_replace):
            with self.assertRaisesRegex(RuntimeError, 'snapshot_digest_invalid'): self.restore(latest)
        self.assertTrue(changed); self.assertFalse(self.home.exists())

    async def test_cold_snapshot_missing_or_aliased_source_never_creates_or_touches_home(self):
        import subprocess, sys
        self.release(self.home)
        operator = Path(__file__).resolve().parents[2] / 'scripts/hermes-personal-migration-operator.py'
        native = Path(sys.modules['hermes_state'].__file__).parent
        missing = self.root / 'missing'; other = self.root / 'other'; other.mkdir(mode=0o700)
        (other / 'sentinel').write_bytes(b'unchanged'); alias = self.root / 'alias'; alias.symlink_to(other, target_is_directory=True)
        for home in (missing, alias):
            result = subprocess.run([sys.executable, '-I', '-B', str(operator), 'snapshot', '--native-source', str(native),
                '--home', str(home), '--uid', 'owner', '--output', str(self.archive)], input=self.key, capture_output=True, timeout=25)
            self.assertNotEqual(result.returncode, 0)
        self.assertFalse(missing.exists()); self.assertFalse(self.archive.exists())
        self.assertEqual(list(other.iterdir()), [other / 'sentinel']); self.assertEqual((other / 'sentinel').read_bytes(), b'unchanged')
        self.assertEqual(other.stat().st_mode & 0o777, 0o700)

    async def test_output_inside_source_never_creates_sqlite_sidecar_or_context_file(self):
        self.release(self.home)
        before = {str(p.relative_to(self.home)): p.read_bytes() for p in self.home.rglob('*') if p.is_file()}
        for output in (self.home / 'state.db-wal', self.home / 'state.db-shm', self.home / 'personal-context/snapshot.enc'):
            with self.assertRaisesRegex(RuntimeError, 'snapshot_output_inside_source'):
                snapshots.capture(self.home, 'owner', output, self.key)
        after = {str(p.relative_to(self.home)): p.read_bytes() for p in self.home.rglob('*') if p.is_file()}
        self.assertEqual(after, before)

    async def test_published_output_is_private_and_never_overwritten(self):
        receipt = self.capture(); before = self.archive.read_bytes()
        self.assertEqual(self.archive.stat().st_mode & 0o777, 0o600)
        with self.assertRaisesRegex(RuntimeError, 'snapshot_output_exists'):
            snapshots.capture(self.home, 'owner', self.archive, self.key)
        self.assertEqual(self.archive.read_bytes(), before); self.assertGreater(receipt['files'], 2)
        self.assertFalse(list(self.root.glob('.canonical-capture-*')))


if __name__ == '__main__': unittest.main()
