#!/usr/bin/env python3
"""Local Telegram HTML ledger. Never executes or uploads export content."""
import argparse, contextlib, fcntl, hashlib, json, os, re, shutil, subprocess, tempfile, uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlsplit
from bs4 import BeautifulSoup

def sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda:f.read(1048576),b''): h.update(block)
    return h.hexdigest()
def encoded(value): return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def hash_value(value): return hashlib.sha256(encoded(value)).hexdigest()
def atomic(path,data):
    path=Path(path); path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    fd,tmp=tempfile.mkstemp(prefix='.'+path.name+'.',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as f: f.write(data); f.flush(); os.fsync(f.fileno())
        os.chmod(tmp,0o600); os.replace(tmp,path)
        dfd=os.open(path.parent,os.O_RDONLY)
        try: os.fsync(dfd)
        finally: os.close(dfd)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)
def put(path,value): atomic(path,encoded(value)+b'\n')
def rows(path): return [json.loads(x) for x in Path(path).read_text().splitlines() if x.strip()]
def put_rows(path,values): atomic(path,b''.join(encoded(x)+b'\n' for x in values))
@contextlib.contextmanager
def writer(run):
    run=Path(run);run.mkdir(parents=True,exist_ok=True,mode=0o700)
    with (run/'.writer.lock').open('a') as f:
        fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
        try: yield
        finally: fcntl.flock(f,fcntl.LOCK_UN)
def invalidate(run,changed):
    path=Path(run)/'artifacts.json'
    if not path.exists(): return []
    graph=json.loads(path.read_text()); dirty=set(changed); found=[]
    while True:
        new=[]
        for record in graph:
            if record['id'] not in dirty and any(x['id'] in dirty for x in record.get('derived_from',[])):
                record['stale']=True; dirty.add(record['id']); new.append(record['id'])
        found.extend(new)
        if not new: break
    put(path,graph); return found
def safe_file(root,href):
    if urlsplit(href).scheme or urlsplit(href).netloc: raise ValueError('external attachment')
    path=(Path(root)/unquote(href)).resolve()
    if not path.is_relative_to(Path(root).resolve()): raise ValueError('attachment escapes source')
    if not path.is_file(): raise ValueError('missing local attachment')
    return path
def inventory(source):
    result=[]
    for f in sorted(Path(source).rglob('*')):
        if f.is_symlink(): raise ValueError('source symlinks are not accepted')
        if f.is_file(): result.append(dict(path=f.relative_to(source).as_posix(),bytes=f.stat().st_size,sha256=sha(f)))
    if not result: raise ValueError('empty source')
    return result
def probe_file(path):
    try:
        r=subprocess.run(['/opt/homebrew/bin/ffprobe','-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',str(path)],capture_output=True,text=True,timeout=60)
    except (subprocess.TimeoutExpired,OSError) as exc:
        return dict(error='ffprobe_unavailable',detail=type(exc).__name__)
    if r.returncode: return dict(error='ffprobe_failed',detail=r.stderr[:400])
    try:
        d=json.loads(r.stdout)
        return dict(duration=float(d.get('format',{}).get('duration',0)),has_audio=any(x['codec_type']=='audio' for x in d['streams']),has_video=any(x['codec_type']=='video' for x in d['streams']),streams=d['streams'])
    except (ValueError,KeyError,TypeError):
        return dict(error='ffprobe_invalid_output')
def classify(wrap):
    title=wrap.select_one('.title'); title=title.get_text(' ',strip=True).lower() if title else ''
    classes={c for node in wrap.find_all(True) for c in node.get('class',[])}
    if 'media_call' in classes: return 'call'
    if 'sticker' in title or 'media_sticker' in classes: return 'sticker'
    if 'media_voice_message' in classes or 'voice' in title: return 'voice'
    if title=='video message': return 'round_video'
    if 'video_file_wrap' in classes or 'video' in title: return 'video'
    if 'photo_wrap' in classes or 'photo' in title: return 'photo'
    if 'audio' in title: return 'audio'
    return 'document'
def ingest(source,run):
    source,run=Path(source).resolve(),Path(run).resolve()
    if source==run or source.is_relative_to(run) or run.is_relative_to(source): raise ValueError('source and output overlap')
    with writer(run):
        files=inventory(source); version=hash_value(files); snapshot=run/'sources'/version
        old=json.loads((run/'source-manifest.json').read_text()) if (run/'source-manifest.json').exists() else None
        corpus=old['corpus_id'] if old else 'coach-'+uuid.uuid4().hex
        if not snapshot.exists():
            snapshot.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
            temp=Path(tempfile.mkdtemp(prefix='.snapshot-',dir=snapshot.parent))
            try:
                shutil.copytree(source,temp,dirs_exist_ok=True)
                if inventory(temp)!=files or inventory(source)!=files: raise ValueError('source changed during freeze')
                os.rename(temp,snapshot)
            finally:
                if temp.exists(): shutil.rmtree(temp)
        elif inventory(snapshot)!=files: raise ValueError('frozen snapshot changed')
        pages=sorted(snapshot.glob('messages*.html'),key=lambda p:int(re.search(r'(\d+)\.html$',p.name).group(1)) if re.search(r'(\d+)\.html$',p.name) else 1)
        if not pages: raise ValueError('Telegram HTML pages absent')
        messages=[];media=[];links=[];previous=None;names=set(); titles=set();probes={}
        for page in pages:
            soup=BeautifulSoup(page.read_text(),'html.parser')
            heading=soup.select_one('.page_header .text')
            if heading: titles.add(heading.get_text(' ',strip=True))
            for node in soup.select('div.message'):
                mid=node.get('id','')
                if not re.fullmatch(r'message-?\d+',mid): raise ValueError('missing message ID')
                body=node.find('div',class_='body',recursive=False)
                if body is None: raise ValueError('message body absent')
                service='service' in node.get('class',[]);joined='joined' in node.get('class',[])
                sender=body.find('div',class_='from_name',recursive=False)
                author=sender.get_text(' ',strip=True) if sender else previous if joined else None
                if not service:
                    if not author: raise ValueError('author cannot be resolved')
                    previous=author;names.add(author)
                dt=body.find('div',class_='date',recursive=False)
                texts=[x for x in body.select('.text') if not any('text' in y.get('class',[]) for y in x.parents if y is not body and y is not node)]
                reply=body.find('div',class_='reply_to',recursive=False);ra=reply.find('a') if reply else None
                fw=[x.get_text(' ',strip=True) for x in body.select('.forwarded .from_name')]
                record=dict(corpus_id=corpus,message_id=mid,source_version=version,source_page=page.name,
                            record_kind='service' if service else 'message',author=None if service else author,
                            date=dt.get('title') if dt else None,joined=joined,reply_to=ra.get('href') if ra else None,
                            forwarded_from=fw,text=' '.join(x.get_text(' ',strip=True) for x in texts) if texts else body.get_text(' ',strip=True) if service else '',
                            text_html='\n'.join(x.decode_contents() for x in texts) if texts else None,slots=[])
                for i,wrap in enumerate(body.select('.media_wrap')):
                    a=wrap.find('a',href=True);href=a.get('href') if a else None;kind=classify(wrap)
                    desc=wrap.select_one('.description');status=wrap.select_one('.status,.video_duration')
                    omitted=bool(desc and not href and kind!='call')
                    slot=dict(corpus_id=corpus,source_version=version,message_id=mid,slot_id=f'{mid}:{i}',kind=kind,href=href,
                              source_state='missing_export' if omitted else 'metadata_only' if kind=='call' else 'available',
                              state='missing_export' if omitted else 'processed' if kind=='call' else 'pending',
                              export_description=desc.get_text(' ',strip=True) if desc else None,
                              export_status=status.get_text(' ',strip=True) if status else None)
                    if href:
                        f=safe_file(snapshot,href);slot.update(sha256=sha(f),bytes=f.stat().st_size)
                        if kind in ('voice','audio','video','round_video'):
                            if slot['sha256'] not in probes: probes[slot['sha256']]=probe_file(f)
                            slot['probe']=probes[slot['sha256']]
                            if 'error' in slot['probe']: slot['state']='error'
                    elif kind=='call': slot['evidence']={'kind':'metadata_only','note':'Запис розмови в експорті відсутній.'}
                    elif not omitted: slot['state']='unsupported'
                    media.append(slot);record['slots'].append(slot['slot_id'])
                message_links=[]
                for txt in texts:
                    for a in txt.find_all('a',href=True):
                        href=a['href']
                        if urlsplit(href).scheme in ('http','https'):
                            links.append(dict(source_version=version,message_id=mid,url=href,text=a.get_text(' ',strip=True),state='pending_classification'))
                            message_links.append(href)
                payload={k:record[k] for k in ['record_kind','author','date','reply_to','forwarded_from','text']}
                payload['attachments']=[{k:m.get(k) for k in ['kind','sha256','source_state']} for m in media if m['message_id']==mid]
                payload['text']=' '.join(payload['text'].split());payload['links']=message_links
                record['payload_sha256']=hash_value(payload);messages.append(record)
        if len(titles)>1 or len(names)>2: raise ValueError('source does not look like one two-person chat')
        if len({m['message_id'] for m in messages})!=len(messages): raise ValueError('duplicate IDs across pages')
        if old and (old['chat_titles']!=sorted(titles) or old['authors']!=sorted(names)): raise ValueError('chat identity differs')
        prior_dir=run/'versions'/old['source_version'] if old else None
        prior_ready=prior_dir is not None and all((prior_dir/name).exists() for name in ['source-manifest.json','messages.jsonl','media.jsonl','links.jsonl'])
        previous_rows={m['message_id']:m for m in rows(prior_dir/'messages.jsonl')} if prior_ready else {}
        prior_media=rows(prior_dir/'media.jsonl') if prior_ready else []
        prior_links=rows(prior_dir/'links.jsonl') if prior_ready else []
        if prior_ready and all((run/name).exists() for name in ['messages.jsonl','media.jsonl','links.jsonl']):
            coherent=False
            try:
                live_messages=rows(run/'messages.jsonl');live_media=rows(run/'media.jsonl');live_links=rows(run/'links.jsonl')
                coherent=all(x.get('source_version')==old['source_version'] for x in live_messages+live_media+live_links)
                coherent=coherent and {x['message_id'] for x in live_messages}==set(previous_rows) and {x['slot_id'] for x in live_media}=={x['slot_id'] for x in prior_media}
                coherent=coherent and all(x['payload_sha256']==previous_rows[x['message_id']]['payload_sha256'] for x in live_messages)
                if coherent:
                    prior_media=live_media
                    prior_links=live_links
            except (OSError,ValueError,KeyError): pass  # recover from committed generation
            if coherent:
                # Commit durable processing receipts before replacing any live ledger.
                # A write failure here must abort, not fall through to publication.
                put_rows(prior_dir/'media.jsonl',prior_media)
                put_rows(prior_dir/'links.jsonl',prior_links)
        changed=[m['message_id'] for m in messages if m['message_id'] in previous_rows and m['payload_sha256']!=previous_rows[m['message_id']]['payload_sha256']]
        def parse_date(value):
            try: return datetime.strptime(value,'%d.%m.%Y %H:%M:%S UTC%z')
            except (TypeError,ValueError): return None
        dates=[d for m in messages if (d:=parse_date(m['date']))]
        absent=[]
        for mid,previous_row in previous_rows.items():
            if mid not in {m['message_id'] for m in messages}:
                date=parse_date(previous_row['date'])
                state='discrepancy' if date and dates and min(dates)<=date<=max(dates) else 'outside_coverage' if date and dates else 'coverage_unknown'
                absent.append(dict(message_id=mid,state=state,not_proven_deleted=True))
                if state!='outside_coverage': changed.append(mid)
        if previous_rows:
            shared={m['message_id'] for m in messages if m['record_kind']=='message'} & {m['message_id'] for m in previous_rows.values() if m['record_kind']=='message'}
            if not shared: raise ValueError('no overlapping message IDs; cannot establish chat identity')
        if prior_ready:
            prior={m['slot_id']:m for m in prior_media}
            for row in media:
                previous_row=prior.get(row['slot_id'])
                if previous_row and previous_row.get('sha256')==row.get('sha256') and previous_row['source_state']==row['source_state'] and previous_row['kind']==row['kind']:
                    for k in ['state','evidence','decode','visual','transcript']:
                        if k in previous_row: row[k]=previous_row[k]
            # URL, visible label and the entire message context must still match.
            # Preserve occurrence order for repeated links without merging receipts.
            prior_by_link={}
            for row in prior_links:
                key=(row['message_id'],row['url'],row['text'])
                prior_by_link.setdefault(key,[]).append(row)
            unchanged={m['message_id'] for m in messages if m['message_id'] in previous_rows and m['payload_sha256']==previous_rows[m['message_id']]['payload_sha256']}
            for row in links:
                key=(row['message_id'],row['url'],row['text'])
                matches=prior_by_link.get(key,[])
                if row['message_id'] in unchanged and matches:
                    previous_link=matches.pop(0)
                    row.update({k:v for k,v in previous_link.items() if k not in ('source_version','message_id','url','text')})
        invalidated=invalidate(run,changed)
        man=dict(corpus_id=corpus,source_version=version,original_path=str(source),snapshot_path=str(snapshot),
                 files=files,chat_titles=sorted(titles),authors=sorted(names),html_pages=[p.name for p in pages],
                 created_at=datetime.now(timezone.utc).isoformat(),changed_message_ids=changed,absent_messages=absent,invalidated_artifacts=invalidated)
        archive=run/'versions'/version
        for folder in [archive,run]:
            put_rows(folder/'messages.jsonl',messages);put_rows(folder/'media.jsonl',media);put_rows(folder/'links.jsonl',links)
            # Manifest is the generation commit marker, always published last.
            put(folder/'source-manifest.json',man)
        if not (run/'waivers.json').exists(): put(run/'waivers.json',[])
        return dict(messages=sum(m['record_kind']=='message' for m in messages),service=sum(m['record_kind']=='service' for m in messages),slots=len(media),missing=sum(m['state']=='missing_export' for m in media),source_version=version)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True,type=Path);p.add_argument('--run',required=True,type=Path);a=p.parse_args();print(json.dumps(ingest(a.source,a.run),ensure_ascii=False))
