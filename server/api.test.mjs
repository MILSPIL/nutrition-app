import { test } from 'node:test';
import { request as httpRequest } from 'node:http';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { createMealApi } from './api.mjs';
import { LOCAL_TRANSCRIBE_MODEL } from '../workers/meal-parser/src/index.js';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
function jwt(overrides={}){
 const now=Math.floor(Date.now()/1000);
 const data=[{alg:'RS256',kid:'synthetic'},{iss:'https://securetoken.google.com/scisense-test',aud:'scisense-test',sub:'pilot',iat:now-10,auth_time:now-20,exp:now+300,...overrides}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
 return data+'.'+sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url');
}
const baseEnv={ALLOWED_ORIGINS:'https://ntzg.pp.ua',FIREBASE_PROJECT:'scisense-test',ALLOWED_UIDS:'pilot',
 LIVE_ENABLED:'true',TRANSCRIBE_MODEL:LOCAL_TRANSCRIBE_MODEL,PARSE_MODEL:'claude-sonnet-5-5',ANTHROPIC_API_KEY:'synthetic',
 PRICING_APPROVED_AT:'synthetic-only',PRICING_MODEL_PAIR:`${LOCAL_TRANSCRIBE_MODEL}|claude-sonnet-5-5`,INPUT_MICROS_PER_MTOK:2,OUTPUT_MICROS_PER_MTOK:10};
async function fixture(t,{provider=async()=>({items:[],unparsed:['synthetic']}),env={},...options}={}){
 const state={reserved:0,finished:0,calls:0};
 const api=createMealApi({env:{...baseEnv,PILOT_BUDGET:{idFromName:x=>x,get:()=>({fetch:async req=>{const b=await req.json();state[b.action==='reserve'?'reserved':'finished']++;return Response.json({ok:true});}})},...env},keyResolver:publicKey,
 provider:(...args)=>{state.calls++;return provider(...args);},...options});
 const address=await api.listen(0);const url=`http://${address.address}:${address.port}`;t.after(()=>api.close());
 const post=(pathname='/meal-api/analyze',options={})=>fetch(url+pathname,{method:'POST',body:JSON.stringify({text:'synthetic',images:[]}),...options,
 headers:{Origin:'https://ntzg.pp.ua',Authorization:`Bearer ${jwt()}`,'Content-Type':'application/json',...options.headers}});
 return {api,url,post,state};
}
test('loopback API returns a fixture only with real signed authorization and origin',async t=>{
 const {post,url,state}=await fixture(t);
 assert.equal((await post()).status,200);assert.equal(state.calls,1);assert.equal(state.reserved,1);assert.equal(state.finished,1);
 const health=await fetch(url+'/meal-api/health');assert.equal(health.status,200);assert.equal(health.headers.get('cache-control'),'no-store');
 for(const path of ['/missing.js','/.env','/meal-api/unknown','/','/lab/token'])assert.equal((await fetch(url+path)).status,404);
});
test('rejections produce no inference or budget reservation',async t=>{
 const {post,state,url}=await fixture(t);
 for(const [headers,status] of [[{Origin:''},403],[{Origin:'https://wrong.invalid'},403],[{Authorization:''},401],[{Authorization:`Bearer ${jwt({sub:'stranger'})}`},403],[{Authorization:`Bearer ${jwt({aud:'other'})}`},401],[{Authorization:`Bearer ${jwt({exp:1})}`},401]])assert.equal((await post(undefined,{headers})).status,status);
 assert.equal((await post(undefined,{body:'null'})).status,400);
 assert.equal((await post(undefined,{body:'{'})).status,400);
 const oversized=await new Promise((resolve,reject)=>{const req=httpRequest(url+'/meal-api/analyze',{method:'POST',headers:{Origin:'https://ntzg.pp.ua','Content-Length':15*1024*1024+1}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});
 assert.equal(oversized,413);
 const preflight=await fetch(url+'/meal-api/analyze',{method:'OPTIONS',headers:{Origin:'https://ntzg.pp.ua'}});assert.equal(preflight.status,204);
 assert.equal(state.calls,0);assert.equal(state.reserved,0);
});
test('live off, unavailable limiter and unavailable JWKS are closed before inference',async t=>{
 for(const env of [{LIVE_ENABLED:'false'},{PILOT_BUDGET:{idFromName:x=>x,get:()=>({fetch:async()=>Response.json({error:'synthetic'},{status:503})})}}]){
  const {post,state}=await fixture(t,{env});assert.equal((await post()).status,503);assert.equal(state.calls,0);
 }
 const {post,state}=await fixture(t,{keyResolver:async()=>{throw Error('offline');}});assert.equal((await post()).status,401);assert.equal(state.calls,0);assert.equal(state.reserved,0);
});
test('disconnect aborts inference; in-flight work is bounded and cleaned',async t=>{
 let started,aborted=0;const ready=new Promise(resolve=>started=resolve);
 const {post,state}=await fixture(t,{maxConcurrent:1,provider:async(_kind,_body,_env,{signal})=>new Promise((_resolve,reject)=>{
  signal.addEventListener('abort',()=>{aborted++;reject(Error('upstream_timeout'));},{once:true});started();
 })});
 const controller=new AbortController();const first=post(undefined,{signal:controller.signal}).catch(()=>null);await ready;
 assert.equal((await post()).status,429);assert.equal(state.calls,1);controller.abort();await first;
 for(let n=0;n<100&&!state.finished;n++)await sleep(5);
 assert.equal(aborted,1);assert.equal(state.finished,1);assert.equal(state.reserved,1);
});
test('transport deadline aborts upstream independently and releases resources',async t=>{
 let aborted=0;
 const {post,state}=await fixture(t,{deadlineMs:40,provider:async(_kind,_body,_env,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted++;reject(Error('upstream_timeout'));},{once:true}))});
 assert.equal((await post()).status,504);await sleep(10);assert.equal(aborted,1);assert.equal(state.finished,1);
});
test('invalid or emulator config cannot be served',()=>{
 for(const env of [{...baseEnv,FIREBASE_PROJECT:'demo-scisense'},{...baseEnv,ALLOWED_ORIGINS:'*'},{...baseEnv,ALLOWED_UIDS:''}])assert.throws(()=>createMealApi({env}),/server_config_invalid/);
});

test('chunked oversized body returns 413 promptly with no inference', async t => {
 const {url,state}=await fixture(t);
 const status=await new Promise((resolve,reject)=>{
  const req=httpRequest(url+'/meal-api/analyze',{method:'POST',headers:{Origin:'https://ntzg.pp.ua',Authorization:`Bearer ${jwt()}`,'Content-Type':'application/json','Transfer-Encoding':'chunked'}},res=>{res.resume();resolve(res.statusCode);});
  req.on('error',reject);req.setTimeout(2000,()=>req.destroy(Error('chunked_timeout')));
  req.write(Buffer.alloc(15*1024*1024));req.end('x');
 });
 assert.equal(status,413);assert.equal(state.calls,0);assert.equal(state.reserved,0);
});

test('unfinished unauthenticated body is rejected before buffering or occupying inference',async t=>{
 const {url,post,state}=await fixture(t,{maxConcurrent:1,deadlineMs:1000});
 for(const authorization of ['', 'Bearer invalid']){
  const response=await new Promise((resolve,reject)=>{
   const req=httpRequest(url+'/meal-api/analyze',{method:'POST',headers:{Origin:'https://ntzg.pp.ua',Authorization:authorization,'Transfer-Encoding':'chunked'}},res=>{res.resume();resolve(res.statusCode);req.destroy();});
   req.on('error',reject);req.setTimeout(500,()=>req.destroy(Error('auth_too_late')));req.write('{');
  });
  assert.equal(response,401);assert.equal(state.calls,0);
 }
 assert.equal((await post()).status,200);
});

test('slow upload is bounded independently, without reservation, and releases the slot',async t=>{
 const {url,state,post}=await fixture(t,{bodyTimeoutMs:30,deadlineMs:500});
 const status=await new Promise((resolve,reject)=>{const req=httpRequest(url+'/meal-api/analyze',{method:'POST',headers:{Origin:'https://ntzg.pp.ua',Authorization:`Bearer ${jwt()}`,'Transfer-Encoding':'chunked'}},res=>{res.resume();resolve(res.statusCode);req.destroy();});req.on('error',reject);req.setTimeout(1000,()=>req.destroy(Error('upload_timeout_not_enforced')));req.write('{');});
 assert.equal(status,504);assert.equal(state.reserved,0);assert.equal(state.calls,0);assert.equal((await post()).status,200);
});
test('maximum 90-second WAV reaches Groq through HTTP with duration derived from bytes',async t=>{
 const bytes=new Uint8Array(44+90*32000),v=new DataView(bytes.buffer);for(const [at,s] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])bytes.set(new TextEncoder().encode(s),at);for(const [at,n] of [[4,bytes.length-8],[16,16],[24,16000],[28,32000],[40,bytes.length-44]])v.setUint32(at,n,true);for(const [at,n] of [[20,1],[22,1],[32,2],[34,16]])v.setUint16(at,n,true);
 const {url,state}=await fixture(t,{env:{TRANSCRIBE_PROVIDER:'groq',TRANSCRIBE_MODEL:'whisper-large-v3',GROQ_ACCOUNT_TIER:'free',GROQ_FREE_LIMITS:'true',GROQ_FREE_APPROVED_AT:'2026-10-21T00:00:00Z',GROQ_API_KEY:'synthetic',ANTHROPIC_API_KEY:undefined,INFERENCE_MODE:'stt_only'},provider:async(kind,p)=>{assert.equal(kind,'transcribe');assert.equal(p.duration,90);assert.equal(p.language,'ru');return {text:'Тест'};}});
 const form=new FormData();form.set('audio',new Blob([bytes],{type:'audio/wav'}),'private.wav');form.set('duration','1');form.set('language','ru');
 const res=await fetch(url+'/meal-api/transcribe',{method:'POST',headers:{Origin:'https://ntzg.pp.ua',Authorization:`Bearer ${jwt()}`},body:form});assert.equal(res.status,200);assert.deepEqual(await res.json(),{text:'Тест'});assert.equal(state.reserved,1);
});
