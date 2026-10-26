#!/usr/bin/env python3
"""Bounded local ASR worker. An ASR result never means audio_verified."""
import argparse, dataclasses, errno, importlib.metadata, json, os, resource, socket, subprocess, time
from pathlib import Path
from pipeline import hash_value, invalidate, put, sha, writer

def cache_key(job,model_sha,settings):
    return hash_value(dict(source=job['sha256'],model=model_sha,settings=settings,start=job.get('start',0),end=job.get('end')))
def pcm(job):
    args=['/opt/homebrew/bin/ffmpeg','-v','error','-xerror','-i',job['path']]
    if job.get('start'): args+=['-ss',str(job['start'])]
    if job.get('end') is not None: args+=['-t',str(job['end']-job.get('start',0))]
    args+=['-ac','1','-ar','16000','-f','f32le','pipe:1']
    r=subprocess.run(args,capture_output=True,timeout=180)
    if r.returncode: raise ValueError('decoder failed: '+r.stderr.decode(errors='replace')[:300])
    import numpy as np
    a=np.frombuffer(r.stdout,dtype=np.float32)
    if len(a)==0: raise ValueError('empty decoded audio')
    return a
def execute(run,jobs_path,model_path,variant,probe,max_seconds,engine='faster-whisper'):
    if os.environ.get('HF_HUB_OFFLINE')!='1' or os.environ.get('TELEGRAM_NETWORK_GUARD')!='verified':
        raise ValueError('launch through the verified network guard')
    with socket.socket() as sock:
        sock.settimeout(0.2)
        try: sock.connect(('127.0.0.1',9))
        except OSError as exc:
            if exc.errno not in (errno.EPERM,errno.EACCES): raise ValueError('network is not denied in this process') from exc
        else: raise ValueError('network is not denied in this process')
    run=Path(run).resolve(); jobs=json.loads(Path(jobs_path).read_text())['jobs']; model_path=Path(model_path).resolve()
    proof=json.loads((run/'reviews/network-guard.json').read_text())
    if not (proof['positive_tcp'] and proof['negative_tcp']): raise ValueError('guard control failed')
    if probe:
        if len(jobs)>8 or sum(j.get('end',j['duration'])-j.get('start',0) for j in jobs)>600: raise ValueError('probe bound')
    else:
        approval=json.loads((run/'reviews/batch-approval.json').read_text())
        if approval.get('mode') not in ('probe_verified','owner_authorized_draft') or not approval.get('evidence'): raise ValueError('batch gate pending')
    config=dict(task='transcribe',language=None,multilingual=True,word_timestamps=True,vad_filter=variant=='vad',
                vad_parameters=dict(min_silence_duration_ms=2000),no_speech_threshold=0.6,
                log_prob_threshold=-1.0,compression_ratio_threshold=2.4,beam_size=5)
    config['versions']={name:importlib.metadata.version(name) for name in ['faster-whisper','ctranslate2','av','tokenizers']}
    label=variant
    if engine=='mlx':
        if variant!='no-vad': raise ValueError('MLX backend has no VAD adapter; select no-vad explicitly')
        if not model_path.is_dir():raise ValueError('local MLX model directory required')
        config=dict(task='transcribe',language=None,word_timestamps=True,verbose=None,
                    no_speech_threshold=0.6,logprob_threshold=-1.0,compression_ratio_threshold=2.4,
                    condition_on_previous_text=True,temperature=(0.0,0.2,0.4,0.6,0.8,1.0),fp16=True)
        config['versions']={name:importlib.metadata.version(name) for name in ['mlx','mlx-whisper']}
        label='mlx-'+variant
    model_files={p.name:sha(p) for p in model_path.iterdir() if p.is_file()}; model_sha=hash_value(model_files)
    with writer(run):
        start=time.monotonic()
        if engine=='mlx':
            import mlx_whisper
            model=None
        else:
            from faster_whisper import WhisperModel
            model=WhisperModel(str(model_path),device='cpu',compute_type='int8',cpu_threads=4,num_workers=1,local_files_only=True)
        outdir=run/'transcripts';outdir.mkdir(exist_ok=True,mode=0o700)
        index_path=outdir/'index.json'; index=json.loads(index_path.read_text()) if index_path.exists() else {}
        completed=0; failed=0; skipped=0
        for job in jobs:
            if time.monotonic()-start>max_seconds: break
            key=cache_key(job,model_sha,config); output=outdir/(key+'.json'); ident=job['id']+':'+label
            prior=index.get(ident,{})
            if not probe and prior and prior.get('key')!=key: invalidate(run,['transcript:'+job['id']])
            try: actual_sha=sha(job['path'])
            except OSError as exc:
                index[ident]=dict(key=key,state='error',error=type(exc).__name__)
                put(index_path,index);invalidate(run,['transcript:'+job['id']]);failed+=1
                print(json.dumps(dict(job=job['id'],state='error')),flush=True);continue
            if actual_sha!=job['sha256']:
                index[ident]=dict(key=key,state='source_changed',expected_sha256=job['sha256'])
                put(index_path,index);invalidate(run,['transcript:'+job['id']]);failed+=1
                print(json.dumps(dict(job=job['id'],state='source_changed')),flush=True);continue
            if output.exists():
                known=next((v for v in index.values() if v.get('key')==key and v.get('state')=='completed' and v.get('result_sha256')==sha(output)),None)
                if known:
                    index[ident]={**known,'job':job};put(index_path,index);completed+=1;skipped+=1;continue
            result=None
            for attempt in range(2):
                began=time.monotonic()
                try:
                    if sha(job['path'])!=job['sha256']: raise ValueError('source changed')
                    audio=pcm(job); kwargs={k:v for k,v in config.items() if k!='versions'}
                    if engine=='mlx':
                        from types import SimpleNamespace
                        response=mlx_whisper.transcribe(audio,path_or_hf_repo=str(model_path),**kwargs)
                        data=response['segments'];info=SimpleNamespace(language=response['language'],duration=len(audio)/16000,duration_after_vad=len(audio)/16000)
                    else:
                        segments,info=model.transcribe(audio,**kwargs)
                        # Consumption is mandatory: the generator performs inference lazily.
                        data=[dataclasses.asdict(s) for s in segments]
                    result=dict(key=key,source=dict(sha256=job['sha256'],start=job.get('start',0),end=job.get('end')),model_path=str(model_path),model_files=model_files,model_sha=model_sha,settings=config,
                                state='completed',verification='asr_unverified',segments=data,language=info.language,
                                duration=info.duration,duration_after_vad=info.duration_after_vad,
                                elapsed_seconds=time.monotonic()-began,attempt=attempt+1,
                                peak_rss_bytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
                    break
                except Exception as exc:
                    result=dict(key=key,job=job,model_sha=model_sha,settings=config,state='error',attempt=attempt+1,
                                error=type(exc).__name__+': '+str(exc)[:500],elapsed_seconds=time.monotonic()-began)
            put(output,result);index[ident]=dict(key=key,file=output.name,result_sha256=sha(output),state=result['state'],job=job)
            put(index_path,index)
            if result['state']=='completed': completed+=1
            else: failed+=1
            print(json.dumps(dict(job=job['id'],state=result['state'],elapsed_seconds=round(result['elapsed_seconds'],1))),flush=True)
        receipt=dict(jobs=len(jobs),completed=completed,failed=failed,skipped=skipped,remaining=len(jobs)-completed-failed,
                     elapsed_seconds=time.monotonic()-start,model_sha=model_sha,settings=config,semantic_gate='not_evaluated',probe=probe)
        put(run/'reviews'/('stt-probe-'+label+'.json' if probe else 'stt-batch-'+label+'.json'),receipt)
        return receipt
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--run',required=True);p.add_argument('--jobs',required=True);p.add_argument('--model',required=True)
    p.add_argument('--variant',choices=['vad','no-vad'],default='vad');p.add_argument('--engine',choices=['faster-whisper','mlx'],default='faster-whisper');p.add_argument('--probe',action='store_true');p.add_argument('--max-seconds',type=int,default=1800);a=p.parse_args()
    print(json.dumps(execute(a.run,a.jobs,a.model,a.variant,a.probe,a.max_seconds,a.engine),ensure_ascii=False))
