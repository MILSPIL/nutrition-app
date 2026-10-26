import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersonalServerRuntime, validatePersonalManifest, validatePersonalActivation, personalPolicyHash } from './personal-runtime.mjs';
import { createHandler } from '../workers/meal-parser/src/index.js';
const manifest={version:3,releaseId:'a'.repeat(40),liveEnabled:true,firebaseProject:'nutrition-tracker-ua',origin:'https://ntzg.pp.ua',allowedUids:['owner','wife'],port:8787,maxConcurrent:2,activationFile:'/etc/scisense/personal-activation.json',policyHash:personalPolicyHash,credentialNames:['groq','personal-state']};
const stamp=new Date(Date.now()-1000).toISOString();
const activation={version:1,active:true,task:'HERMES-PERSONAL-01',policyHash:personalPolicyHash,releaseId:manifest.releaseId,target:manifest.origin,approvedAt:stamp,sttApprovedAt:stamp,
 registry:{version:1,fundingOwner:'owner',profiles:[['owner','y'],['wife','w']].map(([uid,lane])=>({uid,profileId:'native-'+uid,home:'/var/lib/scisense-personal-'+lane+'/profile',socket:'/run/scisense/desktop-'+lane+'.sock',canonicalTitle:'Bot Chat'}))},
 dataProfiles:{owner:'yuri',wife:'wife'},lanes:{owner:'y',wife:'w'},brokerGid:10005,firebaseApiKey:'AIza'+'x'.repeat(30),gates:{linux:true,privacy:true,singleWriter:true,backup:true,migration:true}};
const disabled={...manifest,liveEnabled:false,allowedUids:[]};
test('V3 activation binds both identities and cannot inherit legacy money/model controls',()=>{
 validatePersonalManifest(manifest);validatePersonalActivation(activation,manifest);
 for(const patch of [{credentialNames:['groq','anthropic']},{policyHash:'0'.repeat(64)},{maxConcurrent:3},{allowedUids:['owner','owner']},{version:2},{capMicros:5000000}])assert.throws(()=>validatePersonalManifest({...manifest,...patch}));
 for(const patch of [{gates:{...activation.gates,backup:false}},{lanes:{owner:'y',wife:'y'}},{dataProfiles:{owner:'yuri'}},{registry:{...activation.registry,fundingOwner:'wife'}},{releaseId:'b'.repeat(40)},{capMicros:5000000},{active:false}])assert.throws(()=>validatePersonalActivation({...activation,...patch},manifest));
});
test('disabled V3 does not open any ledger, credential, trainer or model request',async()=>{
 let options;const forbidden=()=>{throw Error('unexpected_access');};
 const runtime=await createPersonalServerRuntime(disabled,{readActivation:forbidden,readCredential:forbidden,openLedger:forbidden,createTrainer:forbidden,fetcher:forbidden,createApi:value=>(options=value,{close:async()=>{},listen:async()=>{}})});
 await runtime.listen();assert.equal(options.env.LIVE_ENABLED,'false');assert.equal(options.env.INFERENCE_MODE,'stt_only');assert.equal(options.maxConcurrent,2);
 assert.throws(()=>options.provider('analyze',{},{}),/live_disabled/);await runtime.close();
});
test('V3 real STT handler uses only a zero-cost ledger and never requires Anthropic',async()=>{
 let apiOptions,trainerOptions,requests=0,closed=0;const reservations=[],buffers=[];
 const runtime=await createPersonalServerRuntime(manifest,{readActivation:()=>activation,readCredential:name=>{const value=name==='groq'?Buffer.from('gsk_'+'x'.repeat(30)):Buffer.alloc(32,7);buffers.push(value);return value;},
 openLedger:file=>{assert.equal(file,'/var/lib/scisense/free-stt-v1.sqlite');return {binding:{idFromName:v=>v,get:()=>({fetch:async req=>{const value=await req.json();if(value.action==='reserve'){assert.equal(value.cost,0);reservations.push(value);}return Response.json({ok:true});}})},close(){closed++;}};},
 createTrainer:async value=>(trainerOptions=value,{accepts:uid=>['owner','wife'].includes(uid),close:async()=>{}}),
 createApi:value=>(apiOptions=value,{close:async()=>{}}),fetcher:async(url,options)=>{assert.equal(url,'https://api.groq.com/openai/v1/audio/transcriptions');assert.match(options.headers.Authorization||options.headers.authorization,/^Bearer gsk_/);requests++;return Response.json({text:'Синтетичне повідомлення.'});}});
 assert.equal(trainerOptions.ephemeralRoot,'/run/scisense/personal-media');assert.deepEqual(trainerOptions.dataProfiles,{owner:'yuri',wife:'wife'});assert.ok(buffers.every(value=>value.every(byte=>byte===0)));
 assert.equal(Object.hasOwn(apiOptions.env,'ANTHROPIC_API_KEY'),false);assert.equal(Object.hasOwn(apiOptions.env,'PARSE_MODEL'),false);
 const bytes=Buffer.alloc(32044);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(16000,24);bytes.writeUInt32LE(32000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(bytes.length-44,40);
 const form=new FormData();form.set('audio',new Blob([bytes],{type:'audio/wav'}),'test.wav');form.set('duration','1');form.set('language','uk');
 const handler=createHandler({authenticate:async()=> 'owner',provider:apiOptions.provider,localTranscription:true});
 const result=await handler.fetch(new Request('https://ntzg.pp.ua/transcribe',{method:'POST',headers:{Origin:manifest.origin},body:form}),apiOptions.env);
 assert.equal(result.status,200);assert.equal((await result.json()).text,'Синтетичне повідомлення.');assert.equal(reservations.length,1);assert.equal(requests,1);
 const denied=await handler.fetch(new Request('https://ntzg.pp.ua/analyze',{method:'POST',headers:{Origin:manifest.origin},body:'{}'}),apiOptions.env);assert.equal(denied.status,503);assert.equal(requests,1);
 await runtime.close();assert.equal(closed,1);assert.equal(Object.hasOwn(apiOptions.env,'GROQ_API_KEY'),false);
});
test('failed credential read erases already-read bytes and closes the free ledger',async()=>{
 let closed=false;const groq=Buffer.from('gsk_'+'x'.repeat(30));
 await assert.rejects(createPersonalServerRuntime(manifest,{readActivation:()=>activation,readCredential:name=>{if(name==='personal-state')throw Error('synthetic failure');return groq;},openLedger:()=>({close(){closed=true;}})}),/server_start_refused/);
 assert.ok(groq.every(byte=>byte===0));assert.equal(closed,true);
});
test('failed HTTP shutdown still closes trainer and free ledger',async()=>{
 const closed=[];
 const runtime=await createPersonalServerRuntime(manifest,{readActivation:()=>activation,readCredential:name=>name==='groq'?Buffer.from('gsk_'+'x'.repeat(30)):Buffer.alloc(32),openLedger:()=>({binding:{},close(){closed.push('ledger');}}),createTrainer:async()=>({close:async()=>{closed.push('trainer');}}),createApi:()=>({close:async()=>{closed.push('api');throw Error('synthetic failure');}})});
 await assert.rejects(runtime.close(),/synthetic failure/);assert.deepEqual(closed,['api','trainer','ledger']);
});

test('trainer fatal callback disables inference and closes every runtime resource',async()=>{
 let trainerOptions,apiOptions;const closed=[];
 const runtime=await createPersonalServerRuntime(manifest,{readActivation:()=>activation,readCredential:name=>name==='groq'?Buffer.from('gsk_'+'x'.repeat(30)):Buffer.alloc(32),onFatal(){closed.push('watchdog');},openLedger:()=>({binding:{},close(){closed.push('ledger');}}),createTrainer:async options=>(trainerOptions=options,{close:async()=>{closed.push('trainer');}}),createApi:options=>(apiOptions=options,{close:async()=>{closed.push('api');}})});
 trainerOptions.onFatal();await runtime.close();assert.equal(apiOptions.env.LIVE_ENABLED,'false');assert.equal(apiOptions.env.TRAINER_ENABLED,'false');assert.deepEqual(closed,['watchdog','api','trainer','ledger']);
});
