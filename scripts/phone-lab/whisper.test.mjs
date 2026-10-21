import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { readFile } from "node:fs/promises";
import { createWhisper, verifyWhisper } from "./whisper.mjs";
import { approvedSettings } from "./live.mjs";
const audio = () => ({file: new Blob([Buffer.alloc(32044, 20)], {type: "audio/wav"})});
function processFactory(mode, captured) {
  return (binary, args, options) => {
    captured.binary=binary;captured.args=args;captured.options=options;captured.kills=[];
    const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();
    child.kill=signal=>{captured.kills.push(signal);queueMicrotask(()=>child.emit('close',null));return true;};
    let bytes=0;child.stdin.on('data',x=>bytes+=x.length);
    child.stdin.on('finish',()=>{captured.bytes=bytes;queueMicrotask(()=>{
      if(mode==='text') {child.stdout.emit('data',Buffer.from('Випив кефір, 200 грамів'));child.emit('close',0);}
      if(mode==='empty')child.emit('close',0);
      if(mode==='failure')child.emit('close',1);
      if(mode==='large')child.stdout.emit('data',Buffer.alloc(33000));
    });});return child;
  };
}
test('Whisper uses stdin, returns transcript, passes no secrets and enables no file writer',async()=>{
 const captured={},w=createWhisper({binary:'/local/whisper',model:'/local/model',spawnProcess:processFactory('text',captured)});
 assert.deepEqual(await w.transcribe(audio()),{text:'Випив кефір, 200 грамів'});
 assert.equal(captured.bytes,32044);assert.equal(captured.args[captured.args.indexOf('-f')+1],'-');assert.equal(captured.args[captured.args.indexOf('-of')+1],'scisense-stdout');assert.ok(!captured.args.some(x=>['-otxt','-osrt','-ovtt','-ocsv','-oj','-ojf','-olrc','-owts','-ls'].includes(x)));
 assert.deepEqual(Object.keys(captured.options.env).sort(),['HOME','PATH','TMPDIR']);
 await w.close();await assert.rejects(w.transcribe(audio()),/upstream_limited/);
});
test('Whisper rejects empty output, child failure, and oversized output without a fallback',async()=>{
 for(const [mode,error] of [['empty','empty_transcript'],['failure','upstream_failed'],['large','invalid_response']]){
  const captured={},w=createWhisper({binary:'/local/whisper',model:'/local/model',spawnProcess:processFactory(mode,captured)});
  await assert.rejects(w.transcribe(audio()),new RegExp(error));await w.close();
 }
});
test('Timeout and close kill only the owned child; concurrency is bounded',async()=>{
 const captured={},w=createWhisper({binary:'/local/whisper',model:'/local/model',timeoutMs:25,spawnProcess:processFactory('hang',captured)});
 const first=w.transcribe(audio());const rejected=assert.rejects(first,/upstream_timeout/);
 await new Promise(resolve=>setTimeout(resolve,5));
 await assert.rejects(w.transcribe(audio()),/upstream_limited/);await rejected;
 assert.deepEqual(captured.kills,['SIGTERM']);await w.close();
 const c={},w2=createWhisper({binary:'/local/whisper',model:'/local/model',spawnProcess:processFactory('hang',c)});
 const pending=assert.rejects(w2.transcribe(audio()),/upstream_timeout/);
 await new Promise(resolve=>setTimeout(resolve,5));await w2.close();await pending;assert.deepEqual(c.kills,['SIGTERM']);
});
test('Abort and silence do not become a meal',async()=>{
 let spawns=0;const w=createWhisper({spawnProcess:()=>{spawns++;throw Error();}});
 await assert.rejects(w.transcribe({file:new Blob([Buffer.alloc(32044)])}),/empty_transcript/);
 const c=new AbortController();c.abort();await assert.rejects(w.transcribe(audio(),{signal:c.signal}),/upstream_timeout/);
 assert.equal(spawns,0);await w.close();
});
test('Approval is exact: no model change, no bigger cap, no missing credit confirmation',async()=>{
 const p=JSON.parse(await readFile(new URL('../../workers/meal-parser/pilot-proposal.json',import.meta.url),'utf8'));
 assert.throws(()=>approvedSettings(p),/pilot_not_approved/);
 for(const change of [x=>x.status='pending_owner_approval',x=>x.candidateB.PILOT_BUDGET_MICROS=5000001,x=>x.candidateB.PARSE_MODEL='claude-haiku-5-5',x=>x.candidateB.INPUT_MICROS_PER_MTOK=1,x=>x.accountVerification.creditAvailabilityConfirmedByOwner=false]){
 const modified=structuredClone(p);change(modified);assert.throws(()=>approvedSettings(modified),/pilot_not_approved/);
 }
 await assert.rejects(verifyWhisper({}),/whisper_unverified/);
});

test('Server passes exactly one Whisper thread and rejects invalid thread configuration',async()=>{
 const captured={},w=createWhisper({binary:'/local/whisper',model:'/local/model',threads:1,spawnProcess:processFactory('text',captured)});
 await w.transcribe(audio());assert.equal(captured.args[captured.args.indexOf('-t')+1],'1');await w.close();
 for(const threads of [0,2.5,9,'1'])assert.throws(()=>createWhisper({threads}),/whisper_config/);
});
