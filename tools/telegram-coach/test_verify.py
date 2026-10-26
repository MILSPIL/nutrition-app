import json, tempfile, unittest
from pathlib import Path
from verify import digest, inspect_source, verify
PAGE='''<html><body><div class="message service" id="message-1"><div class="body">1 January 2025</div></div>
<div class="message default" id="message1"><div class="body"><div class="date" title="D1"></div><div class="from_name">Coach Alpha</div><div class="text">Two sets<br>of ten.</div><div class="media_wrap"><a class="media_voice_message" href="voice/a.ogg"><div class="title">Voice message</div></a></div></div></div>
<div class="message default joined" id="message2"><div class="body"><div class="date" title="D2"></div><div class="reply_to"><a href="#go_to_message1">reply</a></div><div class="media_wrap"><div class="media_video"><div class="title">Video file</div><div class="description">Exceeds maximum size</div></div></div></div></div>
<div class="message default" id="message3"><div class="body"><div class="date" title="D3"></div><div class="from_name">User Beta</div><div class="forwarded"><div class="from_name">Third Author</div></div><div class="text">Done.</div><div class="media_wrap"><a class="media_voice_message" href="voice/a.ogg"><div class="title">Voice message</div></a></div></div></div></body></html>'''
PAGE2='''<html><div class="message default joined" id="message4"><div class="body"><div class="date" title="D4"></div><div class="media_wrap"><div class="media_photo"><div class="title">Sticker</div><div class="description">Not included</div></div></div></div></div></html>'''
class Verification(unittest.TestCase):
    def setUp(self):
        t=tempfile.TemporaryDirectory(); self.addCleanup(t.cleanup); self.run=Path(t.name); self.source=self.run/'source'; (self.source/'voice').mkdir(parents=True)
        (self.source/'messages.html').write_text(PAGE); (self.source/'messages2.html').write_text(PAGE2); (self.source/'voice/a.ogg').write_bytes(b'fixture')
        files=[dict(path=f.relative_to(self.source).as_posix(),bytes=f.stat().st_size,sha256=digest(f)) for f in self.source.rglob('*') if f.is_file()]
        (self.run/'source-manifest.json').write_text(json.dumps(dict(original_path=str(self.source),snapshot_path=str(self.source),files=files,source_version='fixture-v1',corpus_id='fixture')))
        # Explicit golden expectations, independent of both parsers.
        self.messages=[dict(message_id='message-1',record_kind='service',author=None,date=None,joined=False,reply_to=None,forwarded_from=[],text='1 January 2025')]
        for mid,author,joined,reply,fw,text in [(1,'Coach Alpha',False,None,[],'Two sets of ten.'),(2,'Coach Alpha',True,'#go_to_message1',[],''),(3,'User Beta',False,None,['Third Author'],'Done.'),(4,'User Beta',True,None,[],'')]:
            self.messages.append(dict(message_id=f'message{mid}',record_kind='message',author=author,date=f'D{mid}',joined=joined,reply_to=reply,forwarded_from=fw,text=text))
        self.media=[dict(slot_id=f'message{i}:0',kind=k,href=h,source_state=s) for i,k,h,s in [(1,'voice','voice/a.ogg','available'),(2,'video',None,'missing_export'),(3,'voice','voice/a.ogg','available'),(4,'sticker',None,'missing_export')]]; self.save()
    def save(self):
        for m in self.messages+self.media: m.update(source_version='fixture-v1',corpus_id='fixture')
        for m in self.media:
            m['message_id']=m['slot_id'].split(':')[0]
            if m['href'] and (f:=self.source/m['href']).is_file(): m.update(sha256=digest(f),bytes=f.stat().st_size)
        for name,rows in [('messages',self.messages),('media',self.media)]: (self.run/f'{name}.jsonl').write_text(''.join(json.dumps(x)+'\n' for x in rows))
    def test_golden_joined_forwarded_pages_reused_media(self):
        self.assertTrue(verify(self.run,'C01')['passed']); self.assertTrue(verify(self.run,'C02')['passed']); self.assertEqual(inspect_source(self.source)[-1]['slots'][0]['kind'],'sticker')
    def test_bad_author_rejected(self):
        self.messages[2]['author']='User Beta'; self.save(); self.assertFalse(verify(self.run,'C02')['passed'])
    def test_missing_message_rejected(self):
        self.messages.pop(); self.save(); self.assertFalse(verify(self.run,'C01')['passed'])
    def test_missing_placeholder_rejected(self):
        self.media.pop(); self.save(); self.assertFalse(verify(self.run,'C01')['passed'])
    def test_changed_source_rejected(self):
        (self.source/'voice/a.ogg').write_bytes(b'changed'); self.assertFalse(verify(self.run,'C01')['passed'])
    def test_escape_rejected(self):
        (self.source/'messages.html').write_text(PAGE.replace('voice/a.ogg','../outside.ogg')); (self.run/'outside.ogg').write_bytes(b'outside')
        for m in self.media:
            if m['kind']=='voice': m['href']='../outside.ogg'
        self.save(); self.assertIn('attachment escapes root',verify(self.run,'C01')['errors'])
    def test_unknown_fact_rejected(self):
        (self.run/'facts.jsonl').write_text(json.dumps(dict(id='F1',sources=[dict(message_id='message999')]))+'\n'); self.assertIn('unknown fact source',verify(self.run,'C04')['errors'])
    def test_not_implemented_criteria_fail(self):
        for c in range(3,9): self.assertFalse(verify(self.run,f'C{c:02d}')['passed'])
    def reviewed_fixture(self):
        (self.run/'reviews').mkdir();(self.run/'knowledge').mkdir();(self.run/'hermes').mkdir()
        fact=dict(id='F1',claim='Neutral synthetic fact',sources=[dict(message_id='message1')])
        (self.run/'facts.jsonl').write_text(json.dumps(fact)+'\n')
        for name in ['knowledge/training-program-draft.md','hermes/addendum.md','hermes/proposals.json']:(self.run/name).write_text('Neutral synthetic fixture\n')
        mapping={m['message_id']:{'fact_ids':['F1'] if m['message_id']=='message1' else []} for m in self.messages}
        (self.run/'reviews/content-coverage.json').write_text(json.dumps({'messages':mapping}))
        reviewed=['facts.jsonl','knowledge/training-program-draft.md','hermes/addendum.md','hermes/proposals.json']
        (self.run/'reviews/independent-content-review.json').write_text(json.dumps({'verdict':'PASS','all_facts_checked':True,'sha256':{name:digest(self.run/name) for name in reviewed}}))
        self.assertTrue(verify(self.run,'C04')['passed'])
    def test_old_pass_rejected_after_interrupted_facts_publication(self):
        self.reviewed_fixture()
        path=self.run/'facts.jsonl';path.write_text(path.read_text().replace('Neutral synthetic fact','Changed synthetic fact'))
        self.assertIn('semantic review digest mismatch: facts.jsonl',verify(self.run,'C04')['errors'])
    def test_changed_program_cannot_reuse_fact_only_review(self):
        self.reviewed_fixture();(self.run/'knowledge/training-program-draft.md').write_text('Changed fixture')
        self.assertIn('semantic review digest mismatch: knowledge/training-program-draft.md',verify(self.run,'C04')['errors'])
    def test_missing_reverse_fact_reference_is_rejected(self):
        self.reviewed_fixture();path=self.run/'reviews/content-coverage.json';data=json.loads(path.read_text());data['messages']['message1']['fact_ids']=[];path.write_text(json.dumps(data))
        self.assertIn('content reverse mapping mismatch',verify(self.run,'C04')['errors'])
    def retrieval_fixture(self):
        folder=self.run/'reviews/search';folder.mkdir(parents=True)
        cases={'frozen_before_search':True,'cases':[{'id':f'R{i:02}','query':f'neutral question {i}'} for i in range(1,13)]};(self.run/'retrieval-cases.json').write_text(json.dumps(cases))
        assessment={'cases_sha256':digest(self.run/'retrieval-cases.json'),'index_receipts_sha256':{},'search_receipts_sha256':{},'search_outputs_sha256':{},'results':[{'id':x['id'],'pass':True} for x in cases['cases']]}
        for group in ('telegram','knowledge'):
            project='coach-telegram-private' if group=='telegram' else 'coach-knowledge-private'
            path=self.run/'reviews'/('index-final-'+group+'.json');path.write_text(json.dumps({'exit_code':0,'project':project,'fingerprint':'fixture-'+group}));assessment['index_receipts_sha256'][group]=digest(path)
            for case in cases['cases']:
                key=case['id']+'-'+group;output=folder/(key+'.txt');output.write_text('Neutral synthetic search output')
                receipt=folder/(key+'.json');receipt.write_text(json.dumps({'exit_code':0,'project':project,'case':case['id'],'cases_sha256':digest(self.run/'retrieval-cases.json'),'query':case['query'],'mode':'semantic','limit':5,'index_fingerprint':'fixture-'+group,'output_sha256':digest(output)}))
                assessment['search_receipts_sha256'][key]=digest(receipt);assessment['search_outputs_sha256'][key]=digest(output)
        (self.run/'reviews/retrieval-results.json').write_text(json.dumps(assessment));self.assertTrue(verify(self.run,'C05')['passed'])
    def test_retrieval_assessment_rejects_changed_cases(self):
        self.retrieval_fixture();p=self.run/'retrieval-cases.json';p.write_text(p.read_text().replace('neutral question 1','changed question 1'))
        self.assertIn('retrieval cases digest mismatch',verify(self.run,'C05')['errors'])
    def test_retrieval_assessment_rejects_new_index_receipt(self):
        self.retrieval_fixture();p=self.run/'reviews/index-final-knowledge.json';p.write_text(p.read_text().replace('fixture-knowledge','new-index'))
        self.assertIn('retrieval index receipt mismatch: knowledge',verify(self.run,'C05')['errors'])
    def test_retrieval_assessment_rejects_changed_output_and_failed_receipt(self):
        self.retrieval_fixture();(self.run/'reviews/search/R01-telegram.txt').write_text('changed output')
        p=self.run/'reviews/search/R02-knowledge.json';data=json.loads(p.read_text());data['exit_code']=1;p.write_text(json.dumps(data))
        errors=verify(self.run,'C05')['errors'];self.assertIn('retrieval search output mismatch: R01-telegram',errors);self.assertIn('retrieval search binding mismatch: R02-knowledge',errors)
    def test_duplicate_retrieval_ids_are_rejected(self):
        self.retrieval_fixture();p=self.run/'retrieval-cases.json';data=json.loads(p.read_text());data['cases']=[data['cases'][0]]*12;p.write_text(json.dumps(data))
        p=self.run/'reviews/retrieval-results.json';data=json.loads(p.read_text());data['results']=[data['results'][0]]*12;p.write_text(json.dumps(data))
        self.assertIn('retrieval unique id count mismatch',verify(self.run,'C05')['errors'])
    def test_search_identity_cannot_be_replaced_even_with_new_receipt_hash(self):
        self.retrieval_fixture();p=self.run/'reviews/search/R01-telegram.json';original=json.loads(p.read_text());a=self.run/'reviews/retrieval-results.json';assessment=json.loads(a.read_text())
        for field,value in [('project','wrong-project'),('case','R02'),('cases_sha256','old-cases')]:
            with self.subTest(field=field):
                changed=dict(original);changed[field]=value;p.write_text(json.dumps(changed));assessment['search_receipts_sha256']['R01-telegram']=digest(p);a.write_text(json.dumps(assessment))
                self.assertIn('retrieval search identity mismatch: R01-telegram',verify(self.run,'C05')['errors'])
if __name__=='__main__': unittest.main()
