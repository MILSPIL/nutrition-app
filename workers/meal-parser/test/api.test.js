import {test} from 'node:test';import assert from 'node:assert/strict';
import {createHandler,reservation} from '../src/index.js';import {validateAnalysis} from '../src/schema.js';
const base={ALLOWED_ORIGINS:'https://app.example',ALLOWED_UIDS:'owner',LIVE_ENABLED:'true',FIREBASE_PROJECT:'demo-scisense',TRANSCRIBE_MODEL:'gpt-4o-mini-transcribe-2025-12-15',PARSE_MODEL:'test-photo',OPENAI_API_KEY:'synthetic',ANTHROPIC_API_KEY:'synthetic',PRICING_APPROVED_AT:'test-only',PRICING_MODEL_PAIR:'gpt-4o-mini-transcribe-2025-12-15|test-photo',TRANSCRIBE_INPUT_MICROS_PER_MTOK:'1250000',TRANSCRIBE_OUTPUT_MICROS_PER_MTOK:'5000000',INPUT_MICROS_PER_MTOK:'3000000',OUTPUT_MICROS_PER_MTOK:'15000000'};
const request=(body={text:'Тестовий кефір 200 г',images:[]},headers={})=>new Request('https://api.example/analyze',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://app.example',...headers},body:JSON.stringify(body)});
test('default authentication rejects missing JWT before provider',async()=>{const res=await createHandler().fetch(request(),base);assert.equal(res.status,401);});
test('spoofed body UID is ignored, allowlist uses verified subject',async()=>{let calls=0;const app=createHandler({authenticate:async()=> 'stranger',provider:async()=>calls++});assert.equal((await app.fetch(request({text:'x',images:[],uid:'owner'}),base)).status,403);assert.equal(calls,0);});
test('wrong origin fails before upstream',async()=>{const res=await createHandler({authenticate:async()=> 'owner'}).fetch(request(undefined,{Origin:'https://evil.example'}),base);assert.equal(res.status,403);});
test('missing approved budget disables paid calls',()=>assert.throws(()=>reservation('transcribe',{},{}),/budget_disabled/));
test('upstream cannot run when limiter fails; no automatic retries',async()=>{let calls=0;const env={...base,PILOT_BUDGET:{idFromName:x=>x,get:()=>({fetch:async()=>new Response('',{status:503})})}};const app=createHandler({authenticate:async()=> 'owner',provider:async()=>calls++});assert.equal((await app.fetch(request(),env)).status,503);assert.equal(calls,0);});
test('paid call reserved first, finish retains reservation, error body redacted',async()=>{const events=[];const env={...base,PILOT_BUDGET:{idFromName:x=>x,get:()=>({fetch:async r=>{events.push((await r.json()).action);return Response.json({ok:true});}})}};const app=createHandler({authenticate:async()=> 'owner',provider:async()=>{events.push('provider');throw Error('Bearer sk-synthetic-secret transcript');}});const res=await app.fetch(request(),env);assert.equal(res.status,502);assert.deepEqual(events,['reserve','provider','finish']);assert.equal(await res.text(),'{"error":"upstream_failed"}');});
test('invalid media rejected before reservation',async()=>{let calls=0;const env={...base,PILOT_BUDGET:{idFromName:x=>x,get:()=>{calls++;throw Error();}}};const app=createHandler({authenticate:async()=> 'owner'});const res=await app.fetch(request({text:'x',images:[{type:'image/png',data:'YWJj'}]}),env);assert.equal(res.status,400);assert.equal(calls,0);});
test('schema rejects omitted macros, invented database and label without photo',()=>{const i={name:'Кефір',quantity:{value:200,unit:'g'},nutritionBasis:{value:100,unit:'g'},nutrients:{p:3,f:2,c:4,cal:60},source:{kind:'label',label:'Етикетка'},estimated:false,clarification:''};assert.throws(()=>validateAnalysis({items:[i],unparsed:[]}));assert.equal(validateAnalysis({items:[i],unparsed:[]},true).items.length,1);delete i.nutrients.f;assert.throws(()=>validateAnalysis({items:[i],unparsed:[]},true));});

test('транскрипція резервує максимальний input і output, невідомі моделі закриті',()=>{
 assert.equal(reservation('transcribe',{},base),30000);
 assert.throws(()=>reservation('transcribe',{}, {...base,TRANSCRIBE_OUTPUT_MICROS_PER_MTOK:undefined}),/budget_disabled/);
 assert.throws(()=>reservation('transcribe',{}, {...base,TRANSCRIBE_MODEL:'future-model',PRICING_MODEL_PAIR:'future-model|test-photo'}),/budget_disabled/);
});
function wave(seconds=1) {
 const bytes=new Uint8Array(44+seconds*32000),view=new DataView(bytes.buffer);
 const text=(at,value)=>bytes.set(new TextEncoder().encode(value),at);
 text(0,'RIFF'); view.setUint32(4,bytes.length-8,true); text(8,'WAVE'); text(12,'fmt ');
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
 view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
 text(36,'data');view.setUint32(40,bytes.length-44,true); return bytes;
}
function recording(bytes=wave(),duration='1',type='audio/wav') {
 const form=new FormData();form.set('audio',new Blob([bytes],{type}),'recording.wav');form.set('duration',duration);
 return new Request('https://api.example/transcribe',{method:'POST',headers:{Origin:'https://app.example'},body:form});
}
test('multipart WAV проходить реальний Worker parser і provider adapter без зовнішньої мережі',async()=>{
 const {callProvider}=await import('../src/providers.js');const events=[];
 const env={...base,PILOT_BUDGET:{idFromName:x=>x,get:()=>({fetch:async r=>{const b=await r.json();events.push(b.action);if(b.action==='reserve')assert.equal(b.cost,30000);return Response.json({ok:true});}})}};
 const app=createHandler({authenticate:async()=> 'owner',provider:(kind,payload,e)=>{
  assert.equal(payload.duration,1);
  return callProvider(kind,payload,e,async(url,opts)=>{
   events.push('provider');assert.equal(url,'https://api.openai.com/v1/audio/transcriptions');
   assert.equal(opts.body.get('model'),base.TRANSCRIBE_MODEL);assert.equal(opts.body.get('file').type,'audio/wav');
   assert.deepEqual(new Uint8Array(await opts.body.get('file').arrayBuffer()),wave());
   return Response.json({text:'Кефір 200 грамів'});
  });
 }});
 const response=await app.fetch(recording(wave(),'0.1'),env);
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{text:'Кефір 200 грамів'});assert.deepEqual(events,['reserve','provider','finish']);
});
test('пошкоджений, завеликий і непідтримуваний звук не доходить до резервування',async()=>{
 let calls=0;const env={...base,PILOT_BUDGET:{idFromName:x=>x,get:()=>{calls++;throw Error();}}};
 const app=createHandler({authenticate:async()=> 'owner'});
 for(const req of [recording(new Uint8Array(45)),recording(wave(91),'1'),recording(wave(),'1','audio/webm')]){
  const res=await app.fetch(req,env);assert.ok([400,415].includes(res.status));
 }
 assert.equal(calls,0);
});
test('unsigned emulator token не послаблює production JWT-перевірку',async()=>{
 const req=request(undefined,{Authorization:'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJvd25lciJ9.'});
 assert.equal((await createHandler().fetch(req,base)).status,401);
});

test('local Whisper reserves zero but keeps quota; default Worker cannot enable it through env',async()=>{
 const {LOCAL_TRANSCRIBE_MODEL}=await import('../src/index.js');const events=[];
 const env={...base,OPENAI_API_KEY:undefined,TRANSCRIBE_MODEL:LOCAL_TRANSCRIBE_MODEL,PRICING_MODEL_PAIR:`${LOCAL_TRANSCRIBE_MODEL}|test-photo`,LOCAL_TRANSCRIPTION:'true',PILOT_BUDGET:{idFromName:x=>x,get:()=>({fetch:async r=>{const b=await r.json();events.push(b.action);if(b.action==='reserve')assert.equal(b.cost,0);return Response.json({ok:true});}})}};
 const provider=async()=>{events.push('provider');return {text:'Кефір 200 грамів'};};
 const normal=createHandler({authenticate:async()=> 'owner',provider});
 assert.equal((await normal.fetch(recording(),env)).status,503);assert.deepEqual(events,[]);
 assert.throws(()=>reservation('transcribe',{},env),/budget_disabled/);
 const local=createHandler({authenticate:async()=> 'owner',provider,localTranscription:true});
 assert.equal((await local.fetch(recording(),env)).status,200);assert.deepEqual(events,['reserve','provider','finish']);
 assert.throws(()=>reservation('transcribe',{}, {...env,PRICING_APPROVED_AT:''},{localTranscription:true}),/budget_disabled/);
});
