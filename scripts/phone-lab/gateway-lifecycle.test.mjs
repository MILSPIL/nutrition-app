import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {request} from 'node:https';
import {checkServerIdentity} from 'node:tls';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import path from 'node:path';
import {createPhoneGateway,unsignedToken,PROJECT,UID} from './gateway.mjs';
import {generateTls} from './tls.mjs';
const tls=await generateTls('127.0.0.1');
function token(){const now=Math.floor(Date.now()/1000);return unsignedToken({iss:`https://securetoken.google.com/${PROJECT}`,aud:PROJECT,sub:UID,user_id:UID,iat:now-1,auth_time:now-1,exp:now+60});}
function wave(){const b=new Uint8Array(32044),v=new DataView(b.buffer);for(const [at,s] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])b.set(new TextEncoder().encode(s),at);for(const [at,n] of [[4,32036],[16,16],[24,16000],[28,32000],[40,32000]])v.setUint32(at,n,true);for(const [at,n] of [[20,1],[22,1],[32,2],[34,16]])v.setUint16(at,n,true);return b;}
async function fixture(t,options={}){
 const dir=mkdtempSync(path.join(tmpdir(),'groq-gateway-'));writeFileSync(path.join(dir,'index.html'),'synthetic');
 let gateway;
 const auth=createServer((req,res)=>{req.resume();res.setHeader('Content-Type','application/json');res.end(JSON.stringify({users:[{localId:UID}]}));});await new Promise(resolve=>auth.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await gateway?.close();auth.closeAllConnections();await new Promise(resolve=>auth.close(resolve));rmSync(dir,{recursive:true,force:true});});
 const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const origin=`https://127.0.0.1:${port}`,state={reserved:0,finished:0,budgetClosed:false,finishAfterClose:false},env={LIVE_ENABLED:'true',INFERENCE_MODE:'stt_only',TRANSCRIBE_PROVIDER:'groq',TRANSCRIBE_MODEL:'whisper-large-v3',GROQ_ACCOUNT_TIER:'free',GROQ_FREE_APPROVED_AT:'2026-10-21T00:00:00Z',GROQ_FREE_LIMITS:'true',GROQ_API_KEY:'synthetic',PILOT_BUDGET:{idFromName:x=>x,get:()=>({fetch:async req=>{const b=await req.json();if(b.action==='reserve')state.reserved++;else{state.finished++;if(state.budgetClosed)state.finishAfterClose=true;}return Response.json({ok:true});}})}};
 gateway=await createPhoneGateway({host:'127.0.0.1',port,key:tls.key,cert:tls.cert,buildDir:dir,authPort:auth.address().port,apiEnv:env,provider:async()=>({text:'Кефір'}),...options});await gateway.listen();let cookie='';
 const send=(route,{body,unfinished=false,headers={},method='GET'}={})=>new Promise((resolve,reject)=>{const req=request(origin+route,{method,ca:tls.ca,checkServerIdentity:(_,cert)=>checkServerIdentity('127.0.0.1',cert),headers:{Cookie:cookie,Origin:origin,...headers}},res=>{const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>{resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(chunks).toString()});if(unfinished)req.destroy();});});req.on('error',reject);req.setTimeout(2000,()=>req.destroy(Error('test_timeout')));if(unfinished)req.write(body||'x');else req.end(body);});
 const code=(await send('/lab/setup')).text.match(/<code>([^<]+)<\/code>/)[1];const paired=await send('/lab/pair',{method:'POST',body:'code='+code});cookie=paired.headers['set-cookie'][0].split(';')[0];
 const post=async()=>{const form=new FormData();form.set('audio',new Blob([wave()],{type:'audio/wav'}),'recording.wav');form.set('duration','1');const req=new Request(origin,{method:'POST',body:form});return send('/meal-api/transcribe',{method:'POST',headers:{Authorization:'Bearer '+token(),'Content-Type':req.headers.get('Content-Type')},body:Buffer.from(await req.arrayBuffer())});};
 return {gateway,state,send,post};
}
test('gateway upload timeout rejects before quota and releases its single slot',async t=>{
 const {send,post,state}=await fixture(t,{bodyTimeoutMs:25,deadlineMs:500});const result=await send('/meal-api/transcribe',{method:'POST',headers:{Authorization:'Bearer '+token(),'Transfer-Encoding':'chunked'},body:'x',unfinished:true});assert.equal(result.status,504);assert.equal(result.headers.connection,'close');assert.equal(state.reserved,0);assert.equal((await post()).status,200);
});
test('gateway total timeout aborts inference independently of upload',async t=>{
 let aborted=false;const {post,state}=await fixture(t,{deadlineMs:30,provider:async(_kind,_payload,_env,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('upstream_timeout'));},{once:true}))});assert.equal((await post()).status,504);assert.equal(aborted,true);assert.equal(state.reserved,1);
});
test('gateway close waits for provider abort and finish before the caller closes budget',async t=>{
 let started;const ready=new Promise(resolve=>started=resolve);const {gateway,post,state}=await fixture(t,{provider:async(_kind,_payload,_env,{signal})=>new Promise((_,reject)=>{signal.addEventListener('abort',()=>setTimeout(()=>reject(Error('upstream_timeout')),50),{once:true});started();})});const response=post().catch(()=>null);await ready;await gateway.close();state.budgetClosed=true;await response;assert.equal(state.finished,1);assert.equal(state.finishAfterClose,false);
});
