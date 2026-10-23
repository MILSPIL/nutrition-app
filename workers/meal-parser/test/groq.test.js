import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,reservation} from '../src/index.js';
import {callProvider} from '../src/providers.js';
const env={ALLOWED_ORIGINS:'https://app.example',ALLOWED_UIDS:'owner',LIVE_ENABLED:'true',INFERENCE_MODE:'stt_only',TRANSCRIBE_PROVIDER:'groq',TRANSCRIBE_MODEL:'whisper-large-v3',GROQ_ACCOUNT_TIER:'free',GROQ_FREE_LIMITS:'true',GROQ_FREE_APPROVED_AT:'2026-10-21T00:00:00Z',GROQ_API_KEY:'gsk_synthetic_only_1234567890',PARSE_MODEL:'claude-sonnet-5-5'};
function wav(){const bytes=new Uint8Array(32044),v=new DataView(bytes.buffer);for(const [at,s] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])bytes.set(new TextEncoder().encode(s),at);for(const [at,n] of [[4,32036],[16,16],[24,16000],[28,32000],[40,32000]])v.setUint32(at,n,true);for(const [at,n] of [[20,1],[22,1],[32,2],[34,16]])v.setUint16(at,n,true);return bytes;}
const payload={file:new Blob([wav()],{type:'audio/wav'}),filename:'private-name.wav',duration:1,language:'uk'};
function recording(language='uk'){const form=new FormData();form.set('audio',payload.file,'private-name.wav');form.set('duration','0.1');form.set('language',language);return new Request('https://api.example/transcribe',{method:'POST',headers:{Origin:env.ALLOWED_ORIGINS},body:form});}
function binding(events){return {idFromName:x=>x,get:()=>({fetch:async r=>{events.push(await r.json());return Response.json({ok:true});}})};}
test('Groq uses fixed endpoint and sanitized multipart, no user or photo data',async()=>{
 let calls=0;const result=await callProvider('transcribe',payload,env,async(url,opts)=>{
 calls++;assert.equal(url,'https://api.groq.com/openai/v1/audio/transcriptions');assert.equal(opts.redirect,'error');assert.equal(opts.headers.Authorization,'Bearer '+env.GROQ_API_KEY);
 assert.deepEqual([...opts.body.keys()].sort(),['file','language','model','response_format','temperature']);assert.equal(opts.body.get('file').name,'recording.wav');assert.equal(opts.body.get('language'),'uk');assert.equal(opts.body.get('model'),'whisper-large-v3');assert.equal(opts.body.get('temperature'),'0');return Response.json({text:' Кефір 200 грамів '});
 });assert.deepEqual(result,{text:'Кефір 200 грамів'});assert.equal(calls,1);
});
test('Groq automatic language sends no language/prompt and invalid mode stops before network',async()=>{
 for(const language of ['auto','ru'])await callProvider('transcribe',{...payload,language},env,async(_url,{body})=>{assert.equal(body.get('language'),language==='auto'?null:'ru');assert.equal(body.get('prompt'),null);return Response.json({text:'test'});});
 let calls=0;await assert.rejects(callProvider('transcribe',{...payload,language:'xx'},env,async()=>{calls++;}),/invalid_audio/);assert.equal(calls,0);
});
test('STT-only transcribes with zero reservation and never needs Anthropic',async()=>{
 const events=[];const settings={...env,PILOT_BUDGET:binding(events)};Object.defineProperty(settings,'ANTHROPIC_API_KEY',{get(){throw Error('Anthropic credential read');}});
 const handler=createHandler({authenticate:async()=> 'owner',provider:async(kind,p)=>{events.push(kind);assert.equal(p.duration,1);assert.equal(p.language,'uk');return {text:'Кефір'};}});
 const response=await handler.fetch(recording(),settings);assert.equal(response.status,200);assert.equal(events[0].cost,0);assert.equal(events[1],'transcribe');assert.equal(events[2].action,'finish');
 events.length=0;const analyze=new Request('https://api.example/analyze',{method:'POST',headers:{Origin:env.ALLOWED_ORIGINS},body:'{}'});assert.equal((await handler.fetch(analyze,settings)).status,503);assert.deepEqual(events,[]);
});
test('Free approval is explicit and pricing approval cannot activate paid Groq or another model',()=>{
 assert.equal(reservation('transcribe',payload,env),0);
 for(const patch of [{GROQ_ACCOUNT_TIER:'developer'},{GROQ_FREE_APPROVED_AT:''},{GROQ_FREE_APPROVED_AT:'2999-01-01'},{TRANSCRIBE_MODEL:'whisper-large-v3-turbo'},{TRANSCRIBE_PROVIDER:'other'}])assert.throws(()=>reservation('transcribe',payload,{...env,...patch}),/budget_disabled/);
});
test('Groq errors are bounded, sanitized and never retried',async()=>{
 for(const status of [401,429,500,302]){let calls=0;await assert.rejects(callProvider('transcribe',payload,env,async()=>{calls++;return new Response('sk-secret private provider body',{status,headers:{'Retry-After':'12'}});}),e=>{assert.equal(e.message,status===429?'upstream_limited':'upstream_failed');if(status===429){assert.equal(e.status,429);assert.equal(e.retryAfterSeconds,12);}return true;});assert.equal(calls,1);}
 for(const value of [{text:''},{text:'x'.repeat(8001)}])await assert.rejects(callProvider('transcribe',payload,env,async()=>Response.json(value)),/empty_transcript/);
 await assert.rejects(callProvider('transcribe',payload,env,async()=>new Response('x'.repeat(65537))),/invalid_response/);
});
test('Groq deadline and caller cancellation abort the single upstream request',async()=>{
 for(const cancel of [false,true]){let calls=0;const controller=new AbortController();const started=Date.now();const promise=callProvider('transcribe',payload,env,async(_url,{signal})=>{calls++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('Aborted')),{once:true}));},{signal:controller.signal,timeoutMs:20});if(cancel)controller.abort();await assert.rejects(promise,/upstream_timeout/);assert.equal(calls,1);assert.ok(Date.now()-started<1000);}
});
test('handler rejects invalid language before quota and returns safe retry delay on 429',async()=>{
 const events=[];let calls=0;const app=createHandler({authenticate:async()=> 'owner',provider:async()=>{calls++;throw Object.assign(Error('upstream_limited'),{status:429,retryAfterSeconds:17});}}),settings={...env,PILOT_BUDGET:binding(events)};
 assert.equal((await app.fetch(recording('xx'),settings)).status,400);assert.equal(events.length,0);
 const res=await app.fetch(recording(),settings);assert.equal(res.status,429);assert.equal(res.headers.get('Retry-After'),'17');assert.equal(calls,1);assert.equal(events.length,2);
});

test('Groq cannot be activated without the global quota policy',async()=>{const events=[];const app=createHandler({authenticate:async()=> 'owner',provider:async()=>{throw Error('must not call');}});const res=await app.fetch(recording(),{...env,GROQ_FREE_LIMITS:'false',PILOT_BUDGET:binding(events)});assert.equal(res.status,503);assert.deepEqual(events,[]);});
