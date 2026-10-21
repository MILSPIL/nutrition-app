import {spawn,spawnSync} from 'node:child_process';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createWhisper,verifyWhisper,WHISPER_SOURCE,WHISPER_MODEL_SHA1} from '../../scripts/phone-lab/whisper.mjs';
import {parseThreads,limitsEnforced} from './limits.mjs';
const [language,durationText,mode='normal',threadsText='1']=process.argv.slice(2),duration=Number(durationText),threads=parseThreads(threadsText);
if(process.platform!=='linux'||!['uk','ru'].includes(language)||![5,30,90].includes(duration)||!['normal','abort','timeout','concurrency','oom'].includes(mode))throw Error('test_arguments');
const runtime={binary:'/whisper/build/bin/whisper-cli',model:'/whisper/model.bin',sourceCommit:WHISPER_SOURCE,modelSha1:WHISPER_MODEL_SHA1};await verifyWhisper(runtime);
// Synthetic speech is generated in memory; only measurements leave the container.
const text=language==='uk'?'Я випив кефір, двісті грамів.':'Я выпил кефир, двести граммов.';
const tts=spawnSync('espeak-ng',['--stdout','-v',language,'-s','170',text],{maxBuffer:1024*1024});if(tts.status!==0)throw Error('tts_failed');
const wav=tts.stdout;let rate,pcm;
for(let at=12;at+8<wav.length;){const name=wav.toString('ascii',at,at+4),size=wav.readUInt32LE(at+4);if(name==='fmt ')rate=wav.readUInt32LE(at+12);if(name==='data'){pcm=wav.subarray(at+8);break;}at+=8+size+(size%2);}
if(!rate||!pcm)throw Error('tts_wav_invalid');
const clipSamples=Math.floor(pcm.length/2*16000/rate),clip=Buffer.alloc(clipSamples*2+8000);
for(let i=0;i<clipSamples;i++)clip.writeInt16LE(pcm.readInt16LE(Math.min(Math.floor(i*rate/16000),pcm.length/2-1)*2),i*2);
const audio=Buffer.alloc(44+duration*32000);audio.write('RIFF');audio.writeUInt32LE(audio.length-8,4);audio.write('WAVEfmt ',8);audio.writeUInt32LE(16,16);audio.writeUInt16LE(1,20);audio.writeUInt16LE(1,22);audio.writeUInt32LE(16000,24);audio.writeUInt32LE(32000,28);audio.writeUInt16LE(2,32);audio.writeUInt16LE(16,34);audio.write('data',36);audio.writeUInt32LE(audio.length-44,40);for(let i=44;i<audio.length;i++)audio[i]=clip[(i-44)%clip.length];
const owned=new Set(),controller=new AbortController();let timer;
const spawnProcess=(binary,args,options)=>{const c=spawn(binary,args,options);owned.add(c.pid);c.once('close',()=>owned.delete(c.pid));return c;};
const whisper=createWhisper({...runtime,threads,spawnProcess,timeoutMs:mode==='timeout'?20:45000});
const evidence={syntheticOnly:true,language,durationSeconds:duration,mode,threads,timeoutMs:mode==='timeout'?20:45000,sourceCommit:WHISPER_SOURCE,modelSha1:WHISPER_MODEL_SHA1,architecture:process.arch,node:process.version};
const readCgroup=async name=>{try{return (await readFile('/sys/fs/cgroup/'+name,'utf8')).trim();}catch{return 'unavailable';}};
evidence.cpuMax=await readCgroup('cpu.max');evidence.memoryMax=await readCgroup('memory.max');evidence.oomBefore=await readCgroup('memory.events');
await writeFile('/out/result.json',JSON.stringify({...evidence,result:'started'})+'\n');
const started=performance.now();
try{
 const first=whisper.transcribe({file:new Blob([audio],{type:'audio/wav'})},{signal:controller.signal});
 if(mode==='abort')timer=setTimeout(()=>controller.abort(),20);
 if(mode==='concurrency'){await new Promise(r=>setTimeout(r,20));try{await whisper.transcribe({file:new Blob([audio],{type:'audio/wav'})});evidence.concurrentRejected=false;}catch(e){evidence.concurrentRejected=e.message==='upstream_limited';}}
 const result=await first;evidence.recognized=/кеф[іи]р/i.test(result.text);evidence.outputCharacters=result.text.length;evidence.result='success';
}catch(error){evidence.result=error.message;}
finally{clearTimeout(timer);await whisper.close();audio.fill(0);wav.fill(0);clip.fill(0);evidence.elapsedMs=Math.round(performance.now()-started);evidence.ownedProcesses=owned.size;evidence.memoryPeak=await readCgroup('memory.peak');evidence.oomAfter=await readCgroup('memory.events');evidence.temporaryFiles=(await readdir('/tmp')).filter(x=>x!=='lost+found').length;
 const events=value=>Object.fromEntries(value.split('\n').map(line=>line.split(/\s+/).map((x,i)=>i?Number(x):x)));
 evidence.limitsEnforced=limitsEnforced(evidence.cpuMax,evidence.memoryMax,threads,mode);
 evidence.oomKilled=(events(evidence.oomAfter).oom_kill||0)>(events(evidence.oomBefore).oom_kill||0);
 evidence.pass=owned.size===0&&evidence.temporaryFiles===0&&evidence.limitsEnforced&&(mode==='normal'?evidence.result==='success'&&evidence.recognized:mode==='concurrency'?evidence.concurrentRejected&&['success','upstream_timeout'].includes(evidence.result):mode==='oom'?evidence.result==='upstream_failed'&&evidence.oomKilled:evidence.result==='upstream_timeout');
 await writeFile('/out/result.json',JSON.stringify(evidence,null,2)+'\n');}
