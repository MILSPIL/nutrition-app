import json, os, subprocess, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from pipeline import atomic, ingest, invalidate, put, writer
from test_verify import PAGE,PAGE2
from verify import verify
class Pipeline(unittest.TestCase):
    def setUp(self):
        t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);self.root=Path(t.name).resolve();self.source=self.root/'source';self.run=self.root/'run'
        (self.source/'voice').mkdir(parents=True);(self.source/'voice/a.ogg').write_bytes(b'corrupt fixture');(self.source/'messages.html').write_text(PAGE);(self.source/'messages2.html').write_text(PAGE2)
    def test_golden_independent_verifier_and_corrupt_item(self):
        report=ingest(self.source,self.run);self.assertEqual(report['messages'],4)
        self.assertTrue(verify(self.run,'C01')['passed']);self.assertTrue(verify(self.run,'C02')['passed'])
        m=[json.loads(s) for s in (self.run/'media.jsonl').read_text().splitlines()];self.assertEqual(m[0]['state'],'error');self.assertEqual(m[-1]['state'],'missing_export')
    def test_resume_preserves_completed_slot(self):
        ingest(self.source,self.run);f=self.run/'media.jsonl';data=[json.loads(x) for x in f.read_text().splitlines()];data[0]['evidence']={'review':'receipt'};f.write_text(''.join(json.dumps(x)+'\n' for x in data))
        ingest(self.source,self.run);self.assertEqual(json.loads(f.read_text().splitlines()[0])['evidence'],{'review':'receipt'})
    def test_atomic_failure_keeps_old(self):
        f=self.root/'out';f.write_bytes(b'old')
        with patch('pipeline.os.replace',side_effect=OSError('fixture')):
            with self.assertRaises(OSError):atomic(f,b'new')
        self.assertEqual(f.read_bytes(),b'old');self.assertEqual(list(self.root.glob('.out.*')),[])
    def test_single_writer(self):
        with writer(self.run):
            code='from pipeline import writer; from pathlib import Path;\nwith writer(Path('+repr(str(self.run))+')): pass'
            r=subprocess.run([sys.executable,'-c',code],cwd=Path(__file__).parent,capture_output=True)
            self.assertNotEqual(r.returncode,0)
    def test_transitive_invalidation_keeps_independent(self):
        graph=[dict(id='A',derived_from=[dict(id='message1')]),dict(id='B',derived_from=[dict(id='A')]),dict(id='C',derived_from=[dict(id='message4')])]
        put(self.run/'artifacts.json',graph);self.assertEqual(set(invalidate(self.run,['message1'])),{'A','B'})
        self.assertFalse(json.loads((self.run/'artifacts.json').read_text())[-1].get('stale',False))
    def test_changed_source_keeps_old_revision(self):
        before=ingest(self.source,self.run);(self.source/'messages.html').write_text(PAGE.replace('Two sets','Three sets'));after=ingest(self.source,self.run)
        self.assertNotEqual(before['source_version'],after['source_version']);self.assertEqual(len(list((self.run/'versions').iterdir())),2)
    def test_snapshot_tampering_rejected(self):
        ingest(self.source,self.run);man=json.loads((self.run/'source-manifest.json').read_text());(Path(man['snapshot_path'])/'voice/a.ogg').write_bytes(b'tampered')
        with self.assertRaises(ValueError):ingest(self.source,self.run)
    def test_forwarded_text_and_caption_preserved(self):
        (self.source/'messages.html').write_text(PAGE.replace('<div class="from_name">Third Author</div>','<div class="from_name">Third Author</div><div class="text">Three sets of twelve.</div>'))
        ingest(self.source,self.run);data=[json.loads(x) for x in (self.run/'messages.jsonl').read_text().splitlines()]
        self.assertEqual(data[3]['text'],'Three sets of twelve. Done.');self.assertTrue(verify(self.run,'C02')['passed'])
    def test_probe_timeout_is_one_item_error(self):
        with patch('pipeline.subprocess.run',side_effect=subprocess.TimeoutExpired('ffprobe',60)):
            self.assertEqual(ingest(self.source,self.run)['messages'],4)
    def test_interrupted_publish_can_resume(self):
        from pipeline import put_rows
        def fail(path,data):
            if Path(path)==self.run/'media.jsonl': raise OSError('interrupted')
            return put_rows(path,data)
        with patch('pipeline.put_rows',side_effect=fail):
            with self.assertRaises(OSError):ingest(self.source,self.run)
        ingest(self.source,self.run);self.assertTrue(verify(self.run,'C01')['passed'])
    def test_link_target_is_part_of_revision(self):
        f=self.source/'messages.html';f.write_text(PAGE.replace('Done.','<a href="https://example.org/old">Guide</a>'));ingest(self.source,self.run)
        f.write_text(f.read_text().replace('example.org/old','example.org/new'));ingest(self.source,self.run)
        self.assertIn('message3',json.loads((self.run/'source-manifest.json').read_text())['changed_message_ids'])
    def test_progress_survives_every_publish_interruption(self):
        import shutil
        for stop in range(1,10):
            with self.subTest(stop=stop):
                source=self.root/('source'+str(stop));run=self.root/('run'+str(stop))
                shutil.copytree(self.source,source);ingest(source,run)
                f=run/'media.jsonl';data=[json.loads(x) for x in f.read_text().splitlines()]
                data[0].update(state='processed',evidence={'review':'durable receipt'})
                f.write_text(''.join(json.dumps(x)+'\n' for x in data))
                page=source/'messages.html';page.write_text(page.read_text().replace('Two sets','Three sets'))
                count=0
                def fail(path,value):
                    nonlocal count
                    count+=1
                    if count==stop:raise OSError('interrupted publication')
                    return atomic(path,value)
                with patch('pipeline.atomic',side_effect=fail):
                    with self.assertRaises(OSError):ingest(source,run)
                ingest(source,run)
                actual=json.loads(f.read_text().splitlines()[0])
                self.assertEqual(actual['state'],'processed')
                self.assertEqual(actual['evidence'],{'review':'durable receipt'})
                self.assertTrue(verify(run,'C01')['passed'])
if __name__=='__main__':unittest.main()
