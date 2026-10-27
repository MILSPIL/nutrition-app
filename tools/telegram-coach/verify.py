#!/usr/bin/env python3
"""Read-only independent verifier. Uses only the Python standard library."""
import argparse, hashlib, json, re, subprocess
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

STATES = {'pending','processed','irrelevant','missing_export','unreadable','unsupported','error','review_required','owner_excluded'}
UNRESOLVED = STATES - {'processed','irrelevant','owner_excluded'}
def digest(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''): h.update(b)
    return h.hexdigest()
def norm(s): return ' '.join(s.split())
class Node:
    def __init__(self,tag='',attrs=()): self.tag,self.attrs,self.children=tag,dict(attrs),[]
    def has(self,c): return c in self.attrs.get('class','').split()
    def all(self,c=None,tag=None):
        for n in self.children:
            if isinstance(n,Node):
                if (c is None or n.has(c)) and (tag is None or n.tag==tag): yield n
                yield from n.all(c,tag)
    def direct(self,c): return next((n for n in self.children if isinstance(n,Node) and n.has(c)),None)
    def text(self): return norm(' '.join(n.text() if isinstance(n,Node) else n for n in self.children))
class ExportHTML(HTMLParser):
    VOID={'img','br','hr','input','meta','link','source','area','base','embed','param','track','wbr','col'}
    def __init__(self,text):
        super().__init__(convert_charrefs=True); self.root=Node(); self.stack=[self.root]; self.feed(text); self.close()
    def handle_starttag(self,tag,attrs):
        n=Node(tag,attrs); self.stack[-1].children.append(n)
        if tag not in self.VOID: self.stack.append(n)
    def handle_startendtag(self,tag,attrs):
        self.handle_starttag(tag,attrs)
        if tag not in self.VOID: self.handle_endtag(tag)
    def handle_endtag(self,tag):
        for i in range(len(self.stack)-1,0,-1):
            if self.stack[i].tag==tag: del self.stack[i:]; break
    def handle_data(self,data): self.stack[-1].children.append(data)
def html_pages(root):
    return sorted(Path(root).glob('messages*.html'),key=lambda p:int(re.search(r'(\d+)\.html$',p.name).group(1)) if re.search(r'(\d+)\.html$',p.name) else 1)
def inspect_source(root):
    rows=[]; previous=None
    for page in html_pages(root):
        for n in ExportHTML(page.read_text()).root.all('message'):
            mid=n.attrs.get('id',''); body=n.direct('body')
            if not re.fullmatch(r'message-?\d+',mid) or body is None: raise ValueError('invalid message')
            service=n.has('service'); sender=body.direct('from_name')
            author=sender.text() if sender else previous if n.has('joined') else None
            if not service and author: previous=author
            date=body.direct('date'); reply=body.direct('reply_to'); ra=next(reply.all(tag='a'),None) if reply else None
            fw=[x.text() for f in body.all('forwarded') for x in f.all('from_name')]
            text=list(body.all('text')); slots=[]
            for i,w in enumerate(body.all('media_wrap')):
                a=next(w.all(tag='a'),None); t=next(w.all('title'),None); desc=next(w.all('description'),None)
                href=a.attrs.get('href') if a else None; label=t.text().lower() if t else ''
                cls=' '.join(x.attrs.get('class','') for x in w.all())
                if 'media_call' in cls: kind='call'
                elif 'sticker' in label or 'media_sticker' in cls: kind='sticker'
                elif 'voice' in label or 'media_voice_message' in cls: kind='voice'
                elif 'video message' in label: kind='round_video'
                elif 'video' in label or 'video_file_wrap' in cls: kind='video'
                elif 'photo_wrap' in cls or 'photo' in label: kind='photo'
                elif 'audio' in label: kind='audio'
                else: kind='document'
                slots.append(dict(slot_id=f'{mid}:{i}',kind=kind,href=href,omitted=bool(desc and not href and kind!='call')))
            rows.append(dict(message_id=mid,record_kind='service' if service else 'message',author=None if service else author,
                             date=date.attrs.get('title') if date else None,joined=n.has('joined'),reply_to=ra.attrs.get('href') if ra else None,
                             forwarded_from=fw,text=norm(' '.join(x.text() for x in text)) if text else body.text() if service else '',slots=slots))
    return rows
def read_jsonl(path):
    with Path(path).open() as f: return [json.loads(x) for x in f if x.strip()]
def retrieval_provenance(run,cases,assessment):
    run=Path(run);errors=[]
    def check(ok,why):
        if not ok:errors.append(why)
    check(assessment.get('cases_sha256')==digest(run/'retrieval-cases.json'),'retrieval cases digest mismatch')
    expected=set()
    for group in ('telegram','knowledge'):
        project='coach-telegram-private' if group=='telegram' else 'coach-knowledge-private'
        path=run/'reviews'/('index-final-'+group+'.json');index=json.loads(path.read_text())
        check(index['exit_code']==0 and index.get('project')==project and assessment.get('index_receipts_sha256',{}).get(group)==digest(path),'retrieval index receipt mismatch: '+group)
        for case in cases['cases']:
            if not re.fullmatch(r'R\d{2}',case['id']):raise ValueError('unsafe retrieval case id')
            key=case['id']+'-'+group;expected.add(key);receipt_path=run/'reviews/search'/(key+'.json');output=run/'reviews/search'/(key+'.txt');receipt=json.loads(receipt_path.read_text())
            check(assessment.get('search_receipts_sha256',{}).get(key)==digest(receipt_path),'retrieval search receipt mismatch: '+key)
            check(assessment.get('search_outputs_sha256',{}).get(key)==digest(output)==receipt.get('output_sha256'),'retrieval search output mismatch: '+key)
            check(receipt.get('exit_code')==0 and receipt.get('query')==case['query'] and receipt.get('mode')=='semantic' and receipt.get('limit')==5 and receipt.get('index_fingerprint')==index.get('fingerprint'),'retrieval search binding mismatch: '+key)
            check(receipt.get('project')==project and receipt.get('case')==case['id'] and receipt.get('cases_sha256')==digest(run/'retrieval-cases.json'),'retrieval search identity mismatch: '+key)
    check(set(assessment.get('index_receipts_sha256',{}))=={'telegram','knowledge'},'retrieval index receipt set mismatch')
    for field in ('search_receipts_sha256','search_outputs_sha256'):check(set(assessment.get(field,{}))==expected,'retrieval receipt set mismatch: '+field)
    return errors
def verify(run,criterion):
    run=Path(run).resolve(); errors=[]
    def check(ok,why):
        if not ok: errors.append(why)
    try:
        man=json.loads((run/'source-manifest.json').read_text()); frozen=Path(man['snapshot_path']).resolve()
        messages=read_jsonl(run/'messages.jsonl'); media=read_jsonl(run/'media.jsonl'); ids={m['message_id'] for m in messages}
        if criterion in ('C01','C02'):
            ref=inspect_source(frozen); actual={m['message_id']:m for m in messages}; slots={m['slot_id']:m for m in media}
            check(len(ref)==len(messages)==len(ids),'message count/duplicates'); check(len(slots)==len(media),'duplicate slots')
            check(len(media)==sum(len(m['slots']) for m in ref),'media slot count')
            for m in ref:
                got=actual.get(m['message_id'],{})
                check(got.get('source_version')==man.get('source_version') and got.get('corpus_id')==man.get('corpus_id'),'message provenance mismatch')
                for key in ['record_kind','author','date','joined','reply_to','forwarded_from','text']:
                    value=norm(got.get(key,'')) if key=='text' else got.get(key)
                    check(value==m[key],f"{m['message_id']}: {key} mismatch")
                for slot in m['slots']:
                    row=slots.get(slot['slot_id'],{})
                    check(row.get('message_id')==m['message_id'],'media message link mismatch')
                    check(row.get('source_version')==man.get('source_version') and row.get('corpus_id')==man.get('corpus_id'),'media provenance mismatch')
                    for key in ['kind','href']: check(row.get(key)==slot[key],f"{slot['slot_id']}: {key} mismatch")
                    if slot['omitted']: check(row.get('source_state')=='missing_export','omission concealed')
                    if row.get('href'):
                        target=(frozen/unquote(row['href'])).resolve()
                        check(target.is_relative_to(frozen),'attachment escapes root')
                        if target.is_file() and target.is_relative_to(frozen):
                            check(row.get('sha256')==digest(target) and row.get('bytes')==target.stat().st_size,'media hash/size mismatch')
            if criterion=='C01':
                for base in [Path(man['original_path']),frozen]:
                    check({f.relative_to(base).as_posix() for f in base.rglob('*') if f.is_file()}=={f['path'] for f in man['files']},'file set changed')
                    for row in man['files']:
                        f=base/row['path']; check(f.is_file() and not f.is_symlink(),'missing/symlink source')
                        if f.is_file(): check(f.stat().st_size==row['bytes'] and digest(f)==row['sha256'],'source changed')
                for row in media:
                    href=row.get('href')
                    if href and not urlsplit(href).scheme:
                        f=(frozen/unquote(href)).resolve(); check(f.is_relative_to(frozen),'attachment escapes root'); check(f.is_file(),'missing local href')
        elif criterion=='C03':
            waivers=json.loads((run/'waivers.json').read_text())
            waived={w['slot_id'] for w in waivers if w.get('approval_evidence') and w.get('reason') and w.get('consequence')}
            for row in media:
                check(row.get('state') in STATES,'unknown state'); check(row.get('state')!='pending','pending media')
                if row.get('state') in ('processed','irrelevant'): check(bool(row.get('evidence')),'media lacks evidence')
                if row.get('state')=='owner_excluded': check(row['slot_id'] in waived,'exclusion lacks explicit waiver')
            coverage=json.loads((run/'coverage.json').read_text()); unresolved=sum(m.get('state') in UNRESOLVED for m in media)
            check(coverage['unresolved_media']==unresolved,'coverage count')
            if unresolved: check(coverage['status']=='partial','false completeness')
            elif any(m.get('state')=='owner_excluded' for m in media): check(coverage['status']=='complete_with_owner_exclusions','waiver concealed')
        elif criterion=='C04':
            facts=read_jsonl(run/'facts.jsonl')
            for f in facts:
                check(bool(f.get('sources')),'fact lacks source')
                for s in f.get('sources',[]): check(s['message_id'] in ids,'unknown fact source')
            mapping=json.loads((run/'reviews/content-coverage.json').read_text()); check(set(mapping['messages'])==ids,'content coverage')
            reverse={mid:[] for mid in ids}
            for f in facts:
                for source in f.get('sources',[]):
                    if source['message_id'] in reverse:reverse[source['message_id']].append(f['id'])
            for mid,expected in reverse.items():
                check(sorted(mapping['messages'].get(mid,{}).get('fact_ids',[]))==sorted(expected),'content reverse mapping mismatch')
            review=json.loads((run/'reviews/independent-content-review.json').read_text()); check(review['verdict']=='PASS' and review['all_facts_checked'],'semantic review pending')
            for relative in ['facts.jsonl','knowledge/training-program-draft.md','hermes/addendum.md','hermes/proposals.json']:
                check(review.get('sha256',{}).get(relative)==digest(run/relative),'semantic review digest mismatch: '+relative)
        elif criterion=='C05':
            cases=json.loads((run/'retrieval-cases.json').read_text()); check(len(cases['cases'])==12 and cases['frozen_before_search'],'retrieval protocol')
            r=json.loads((run/'reviews/retrieval-results.json').read_text()); check(len(r['results'])==12 and all(x['pass'] is True for x in r['results']),'retrieval failed')
            check(len({x['id'] for x in r['results']})==len({x['id'] for x in cases['cases']})==12,'retrieval unique id count mismatch')
            check({x['id'] for x in r['results']}=={x['id'] for x in cases['cases']},'retrieval result ids mismatch')
            errors.extend(retrieval_provenance(run,cases,r))
        elif criterion=='C06':
            e=json.loads((run/'reviews/privacy.json').read_text()); check(e['positive_tcp'] and e['negative_tcp'],'network guard')
            check(e['stt_offline'] and e['local_indexes_only'] and not e['production_changed'],'privacy boundary')
            repo=Path(e['repo']); check(subprocess.run(['git','check-ignore','-q',str(run)],cwd=repo).returncode==0,'runtime not ignored')
            staged=subprocess.check_output(['git','diff','--cached','--name-only'],cwd=repo,text=True); check('.agents/runtime' not in staged,'private data staged')
        elif criterion=='C07':
            e=json.loads((run/'reviews/recovery.json').read_text()); required={'corrupt_input','interrupt_resume','changed_source','changed_model','single_writer','atomic_output','transitive_invalidation','same_export_reingest'}
            check(set(e['tests'])>=required and all(e['tests'][k] for k in required),'recovery not proven')
            proof=json.loads((run/'reviews/reingest.json').read_text())
            check(proof.get('passed') is True and proof.get('source_version')==man['source_version'],'reingest source binding mismatch')
            check(proof.get('pipeline_sha256')==digest(Path(__file__).with_name('pipeline.py')),'reingest producer changed')
            stable={'messages.jsonl','media.jsonl','links.jsonl','facts.jsonl','facts-asr.jsonl','transcripts/index.json','reviews/asr-reading.json'}
            passes=proof.get('runs',[]);check(len(passes)==2,'two actual reingest runs required')
            for attempt in passes:
                check(attempt.get('changed_message_ids')==[] and attempt.get('invalidated_artifacts')==[],'same export invalidated content')
                before=attempt.get('before_sha256',{});after=attempt.get('after_sha256',{})
                check(set(before)==set(after)==stable and before==after,'reingest lost durable processing')
                for name in stable:check(after.get(name)==digest(run/name),'reingest receipt stale: '+name)
        elif criterion=='C08':
            p=json.loads((run/'hermes/proposals.json').read_text()); check(p['target_revision'] is None and not p['applied'],'live boundary')
            for k in ['current_context_diff_status','current_capacity_status']: check(p[k]=='pending_live_read','live check falsely claimed')
            facts={f['id']:f for f in read_jsonl(run/'facts.jsonl')}; check(bool(p['parts']),'empty candidate')
            for part in p['parts']:
                check(0<len(part['text'].encode())<=8000,'byte limit'); check(bool(part['fact_ids']),'candidate lacks facts')
                for fid in part['fact_ids']: check(fid in facts and facts[fid]['verification'] in ('text_verified','visual_verified','audio_verified','owner_confirmed'),'unverified candidate fact')
        else: raise ValueError('unknown criterion')
        if criterion in ('C03','C04','C05','C07','C08') and (run/'artifacts.json').exists():
            artifacts=json.loads((run/'artifacts.json').read_text())
            check(not any(x.get('stale') for x in artifacts),'stale derived artifacts require rebuild')
    except (OSError,ValueError,KeyError,TypeError) as exc: errors.append(f'{type(exc).__name__}: {exc}')
    return dict(criterion=criterion,passed=not errors,errors=errors)
if __name__=='__main__':
    p=argparse.ArgumentParser(); p.add_argument('--run',required=True,type=Path); p.add_argument('--criterion',required=True,choices=[f'C{x:02d}' for x in range(1,9)]); a=p.parse_args()
    r=verify(a.run,a.criterion); print(json.dumps(r,ensure_ascii=False,indent=2)); raise SystemExit(0 if r['passed'] else 1)
