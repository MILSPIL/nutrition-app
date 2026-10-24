"""Failure tests for the narrow cleanup wrapper; no Hermes or model is mocked here."""
import hashlib
from pathlib import Path
import sqlite3
import os
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from hermes_privacy import finish_media_cleanup, enable_secure_deletion

LAB = Path(__file__).resolve().parents[2] / '.agents/runtime/hermes-lab'

class PrivacyTests(unittest.TestCase):
    def setUp(self):
        LAB.mkdir(parents=True,exist_ok=True,mode=0o700)
        self.tmp = tempfile.TemporaryDirectory(prefix='privacy-unit-',dir=LAB)
        self.home = Path(self.tmp.name).resolve()
        (self.home/'cache/images').mkdir(parents=True)
        self.path = self.home/'state.db'
        conn = sqlite3.connect(self.path)
        conn.executescript('CREATE TABLE sessions(id TEXT PRIMARY KEY); CREATE TABLE session_admissions(status TEXT);')
        conn.close()
        self.bytes = b'synthetic owned media fixture'*50
        self.digest = hashlib.sha256(self.bytes).hexdigest()
        self.media = [{'sha256':self.digest,'suffix':'.png'}]
        self.image = self.home/'cache/images'/('api_'+self.digest[:32]+'.png')
        self.image.write_bytes(self.bytes)
        self.other = self.home/'cache/images/not-owned.png'
        self.other.write_bytes(b'preserve other data')
        self.ownership = SimpleNamespace(owns=lambda home:home==self.home)
        self.database = SimpleNamespace(_conn=None)
    def tearDown(self):
        self.tmp.cleanup()
    def clean(self):
        return finish_media_cleanup(self.home,self.media,ownership=self.ownership,database=self.database,session_id='synthetic-owned-session')
    def write(self, sql):
        conn=sqlite3.connect(self.path)
        conn.execute(sql)
        conn.commit()
        conn.close()
    def test_cleanup_replay_is_idempotent_and_preserves_other_files(self):
        self.assertEqual(self.clean(),{'checkpointBusy':0,'removedStagingFiles':1})
        self.assertEqual(self.clean()['removedStagingFiles'],0)
        self.assertEqual(self.other.read_bytes(),b'preserve other data')
    def test_live_writer_refused(self):
        self.database._conn=object()
        with self.assertRaisesRegex(RuntimeError,'closed'):
            self.clean()
        self.assertTrue(self.image.exists())
    def test_missing_ownership_refused(self):
        self.ownership.owns=lambda _:False
        with self.assertRaisesRegex(RuntimeError,'ownership'):
            self.clean()
    def test_session_not_deleted_refused(self):
        self.write("INSERT INTO sessions VALUES ('synthetic-owned-session')")
        with self.assertRaisesRegex(RuntimeError,'deletion'):
            self.clean()
        self.assertTrue(self.image.exists())
    def test_unknown_or_started_admission_refused(self):
        for state in ('started','queued','unknown'):
            self.write('DELETE FROM session_admissions')
            self.write("INSERT INTO session_admissions VALUES ('"+state+"')")
            with self.assertRaisesRegex(RuntimeError,'active'):
                self.clean()
        self.assertTrue(self.image.exists())
    def test_changed_media_bytes_refused(self):
        self.image.write_bytes(b'someone else changed this')
        with self.assertRaisesRegex(RuntimeError,'changed'):
            self.clean()
        self.assertTrue(self.image.exists())
    def test_symlink_media_refused(self):
        self.image.unlink()
        self.image.symlink_to(self.other)
        with self.assertRaises(OSError):
            self.clean()
        self.assertEqual(self.other.read_bytes(),b'preserve other data')
    def test_fifo_media_is_rejected_without_blocking(self):
        self.image.unlink()
        os.mkfifo(self.image)
        code = """from pathlib import Path
from types import SimpleNamespace
from hermes_privacy import finish_media_cleanup
import sys
try:
 finish_media_cleanup(Path(sys.argv[1]),[{'sha256':sys.argv[2],'suffix':'.png'}],ownership=SimpleNamespace(owns=lambda _:True),database=SimpleNamespace(_conn=None),session_id='synthetic-owned-session')
except RuntimeError as error:
 assert str(error)=='Unsafe media staging object'
else:
 raise AssertionError('FIFO was accepted')
"""
        result = subprocess.run([sys.executable,'-B','-c',code,str(self.home),self.digest],cwd=Path(__file__).parent,timeout=2,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
    def test_symlink_database_refused(self):
        actual=self.home/'other.db'
        self.path.rename(actual)
        self.path.symlink_to(actual)
        with self.assertRaisesRegex(RuntimeError,'Unsafe'):
            self.clean()
    def test_invalid_owned_reference_refused(self):
        self.media[0]['sha256']='../outside'
        with self.assertRaisesRegex(RuntimeError,'reference'):
            self.clean()
    def test_busy_checkpoint_refused(self):
        writer=sqlite3.connect(self.path)
        reader=sqlite3.connect(self.path)
        try:
            writer.execute('PRAGMA journal_mode=WAL')
            writer.execute("INSERT INTO session_admissions VALUES ('terminal')")
            writer.commit()
            reader.execute('BEGIN')
            reader.execute('SELECT * FROM session_admissions').fetchall()
            writer.execute("INSERT INTO session_admissions VALUES ('terminal')")
            writer.commit()
            with self.assertRaisesRegex(RuntimeError,'busy'):
                self.clean()
            self.assertTrue(self.image.exists())
        finally:
            reader.close()
            writer.close()
    def test_secure_delete_readback_required(self):
        db=SimpleNamespace(_execute_write=lambda fn:0)
        with self.assertRaisesRegex(RuntimeError,'not enabled'):
            enable_secure_deletion(db)

if __name__=='__main__':
    unittest.main()
