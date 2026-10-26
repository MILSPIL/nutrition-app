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
if __name__=='__main__': unittest.main()
