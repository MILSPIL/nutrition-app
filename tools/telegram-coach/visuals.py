#!/usr/bin/env python3
"""Local sampled visual review. Decoding and human review remain separate."""
import argparse, copy, json, re, subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps
from pipeline import put, rows, sha, writer, hash_value
REVISION = 'frames-v2-ordinal-pts'
NUMBER = r'[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?'
def sheet(items, path, cols=5, rows_count=6, tile=(190, 210)):
    canvas=Image.new('RGB',(cols*tile[0],rows_count*tile[1]),'white');draw=ImageDraw.Draw(canvas)
    for i,item in enumerate(items):
        x,y=(i%cols)*tile[0],(i//cols)*tile[1]
        with Image.open(item['path']) as im:
            im=ImageOps.exif_transpose(im).convert('RGB');im.thumbnail((tile[0]-6,tile[1]-28))
            canvas.paste(im,(x+(tile[0]-im.width)//2,y+22+(tile[1]-28-im.height)//2))
        draw.text((x+3,y+3),item['label'],fill='black')
    canvas.save(path,quality=90)
def ordinals(times,target=.9):
    if not times or any(b<a for a,b in zip(times,times[1:])):raise ValueError('absent or non-monotonic frame timestamps')
    chosen,i=[0],0
    while i<len(times)-1:
        j=i
        while j+1<len(times) and times[j+1]-times[i]<=target+1e-6:j+=1
        i=max(i+1,j);chosen.append(i)
    return chosen
def valid_review_chain(record,depth=0):
    transfer=record.get('review_transfer')
    if transfer is None:return True
    if depth>32 or not isinstance(transfer,dict):return False
    try:
        path=Path(transfer['source'])
        return sha(path)==transfer['sha256'] and valid_review_chain(json.loads(path.read_text()),depth+1)
    except (OSError,ValueError,KeyError,TypeError):return False
def valid_cache(record):
    return (record.get('render_revision')==REVISION and record.get('state')!='error' and record.get('sheets') and record.get('selected_frames')
            and valid_review_chain(record)
            and all(Path(x['path']).is_file() and sha(x['path'])==x['sha256'] for x in record['sheets']+record['selected_frames']))
def render_video(path,target,key,previous):
    out=target/key/REVISION;out.mkdir(parents=True,exist_ok=True)
    decode=subprocess.run(['/opt/homebrew/bin/ffmpeg','-v','error','-xerror','-i',str(path),'-map','0:v:0','-f','null','-'],capture_output=True,timeout=180)
    if decode.returncode:raise ValueError('full video decode failed')
    probe=subprocess.run(['/opt/homebrew/bin/ffprobe','-v','error','-select_streams','v:0','-show_entries','frame=best_effort_timestamp_time,duration_time,pkt_duration_time','-of','json',str(path)],check=True,capture_output=True,text=True,timeout=120)
    frames=json.loads(probe.stdout)['frames'];times=[float(x['best_effort_timestamp_time']) for x in frames];chosen=ordinals(times);offset=times[0]
    end_duration=float(frames[-1].get('duration_time',frames[-1].get('pkt_duration_time',0)))
    selection='+'.join(f'eq(n,{n})' for n in chosen)+'+gt(scene,0.3)'
    for old in out.glob('frame_*.jpg'):old.unlink()
    result=subprocess.run(['/opt/homebrew/bin/ffmpeg','-y','-hide_banner','-loglevel','info','-copyts','-i',str(path),'-map','0:v:0','-an','-vf',f"select='{selection}',scale=384:-2,showinfo",'-fps_mode','vfr','-q:v','4',str(out/'frame_%04d.jpg')],capture_output=True,text=True,timeout=180)
    if result.returncode:raise ValueError('frame extraction failed')
    pts=[float(x) for x in re.findall(r'\bn:\s*\d+.*?\bpts_time:('+NUMBER+r')',result.stderr)];files=sorted(out.glob('frame_*.jpg'))
    if not files or len(files)!=len(pts) or any(b<a for a,b in zip(pts,pts[1:])):raise ValueError('frame timestamp/count/order mismatch')
    if abs(pts[0]-times[0])>.002 or abs(pts[-1]-times[-1])>.002:raise ValueError('first/last source frame mismatch')
    if any(min(abs(t-p) for p in times)>.002 for t in pts):raise ValueError('selected frame PTS absent from source')
    selected=[dict(path=str(f),original_pts=t,seconds=max(0,t-offset),sha256=sha(f),label=f'{max(0,t-offset):.2f}s') for f,t in zip(files,pts)]
    old_reviewed={(previous['selected_frames'][i]['seconds'],previous['selected_frames'][i]['sha256']) for i in previous.get('reviewed_frames',[]) if i<len(previous.get('selected_frames',[]))}
    reviewed=[i for i,f in enumerate(selected) if (f['seconds'],f['sha256']) in old_reviewed]
    gap=max([b['seconds']-a['seconds'] for a,b in zip(selected,selected[1:])]+[end_duration])
    record=dict(render_revision=REVISION,mode='sampled',normalization_offset=offset,decoded_intervals=[[0,times[-1]-offset+end_duration]],video_last_frame_seconds=times[-1]-offset,video_end_pts=times[-1]+end_duration,max_gap_seconds=gap,coverage_limit='source_frame_gap' if gap>1.0001 else None,selected_frames=selected,reviewed_frames=reviewed,sheets=[],state='visual_reviewed_sampled' if len(reviewed)==len(selected) else 'pending_review')
    for n in range(0,len(selected),30):
        name=out/f'sheet_{n//30+1:02d}.jpg';sheet(selected[n:n+30],name)
        record['sheets'].append(dict(path=str(name),sha256=sha(name),frames=list(range(n,min(n+30,len(selected))))))
    if reviewed:
        history=target/'review-history'/(hash_value(previous)+'.json');put(history,previous)
        record['review_transfer']=dict(rule='exact SHA256 and normalized PTS',source=str(history),sha256=sha(history))
    return record
def render(run):
    run=Path(run).resolve();man=json.loads((run/'source-manifest.json').read_text());source=Path(man['snapshot_path']);target=run/'visuals';target.mkdir(exist_ok=True);grouped={}
    for item in rows(run/'media.jsonl'):
        if item.get('href') and item['kind'] in ('photo','video','round_video'):grouped.setdefault(item['sha256'],[]).append(item)
    with writer(target):
        prior=json.loads((target/'manifest.json').read_text()) if (target/'manifest.json').exists() else {}
        if prior and any(x.get('render_revision')!=REVISION for x in prior.get('assets',{}).values() if x['kind']!='photo'):
            if not (target/'manifest-history.json').exists():put(target/'manifest-history.json',prior)
        assets={key:copy.deepcopy(prior.get('assets',{}).get(key,{})) for key in grouped}
        for key,items in grouped.items():assets[key].update(sha256=key,kind=items[0]['kind'],slot_ids=sorted({i['slot_id'] for i in items}),source_version=man['source_version'])
        photos=[]
        for key,items in grouped.items():
            item=items[0];path=source/item['href'];record=assets[key];previous=copy.deepcopy(prior.get('assets',{}).get(key,{}))
            if not valid_review_chain(previous):previous['reviewed_frames']=[]
            try:
                if sha(path)!=key:raise ValueError('source changed')
                if item['kind']=='photo':
                    with Image.open(path) as im:im.load();record['size']=list(im.size)
                    record.setdefault('state','pending_review');record.setdefault('sheets',[]);record.setdefault('selected_frames',[]);record.setdefault('reviewed_frames',[])
                    photos.append(dict(path=str(path),label=item['message_id'],asset_sha=key))
                elif not valid_cache(record):
                    base={k:record[k] for k in ('sha256','kind','slot_ids','source_version')};record={**base,**render_video(path,target,key,previous)}
            except (OSError,ValueError,KeyError,subprocess.SubprocessError) as exc:record.update(state='error',error=type(exc).__name__+': '+str(exc)[:300])
            assets[key]=record;put(target/'manifest.json',dict(assets=assets,photo_sheets=prior.get('photo_sheets',[])))
        photo_sheets=[]
        for n in range(0,len(photos),12):
            name=target/f'photos_{n//12+1:02d}.jpg';subset=photos[n:n+12];sheet(subset,name,cols=4,rows_count=3,tile=(280,360))
            photo_sheets.append(dict(path=str(name),sha256=sha(name),assets=[x['asset_sha'] for x in subset]))
        put(target/'manifest.json',dict(assets=assets,photo_sheets=photo_sheets))
    return dict(assets=len(assets),photo_sheets=len(photo_sheets),video_sheets=sum(len(x.get('sheets',[])) for x in assets.values()),frames=sum(len(x.get('selected_frames',[])) for x in assets.values()),errors=sum(x['state']=='error' for x in assets.values()),coverage_limits=sum(bool(x.get('coverage_limit')) for x in assets.values()))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--run',required=True);a=p.parse_args();print(json.dumps(render(a.run)))
