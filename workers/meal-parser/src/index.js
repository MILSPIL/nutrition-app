import { createRemoteJWKSet,jwtVerify } from 'jose';
import { MAX_AUDIO,MAX_IMAGE,MAX_BODY } from './schema.js';
import { callProvider } from './providers.js';
export { PilotBudget } from './budget.js';
const jwks=createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const fail=(code,status)=>{ const e=Error(code);e.status=status;throw e; };
async function authenticate(request,env) {
 const token=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
 if(!token||!env.FIREBASE_PROJECT) fail('unauthorized',401);
 try {const {payload}=await jwtVerify(token,jwks,{algorithms:['RS256'],issuer:`https://securetoken.google.com/${env.FIREBASE_PROJECT}`,audience:env.FIREBASE_PROJECT});
  if(typeof payload.sub!=='string'||!payload.sub||payload.sub.length>128||typeof payload.auth_time!=='number'||payload.auth_time>Date.now()/1000) fail('unauthorized',401);
  return payload.sub;
 } catch(_){fail('unauthorized',401);}
}
async function limitedBody(request,max) {
 if(Number(request.headers.get('Content-Length'))>max) fail('media_too_large',413);
 const reader=request.body?.getReader();if(!reader) fail('bad_request',400);
 const chunks=[];let size=0;
 try {while(true) {const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();fail('media_too_large',413);}chunks.push(value);}}
 finally{reader.releaseLock();}
 const result=new Uint8Array(size);let offset=0;for(const c of chunks){result.set(c,offset);offset+=c.length;}return result;
}
function signature(bytes,type) {
 if(type==='image/jpeg') return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(type==='image/png') return [137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x);
 if(type==='image/webp') return new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
 return false;
}
async function input(request,kind) {
 const bytes=await limitedBody(request,MAX_BODY);
 if(kind==='transcribe') {
  let form;try{form=await new Request('https://local.invalid',{method:'POST',headers:{'Content-Type':request.headers.get('Content-Type')||''},body:bytes}).formData();}catch(_){fail('bad_request',400);}
  const file=form.get('audio'),duration=Number(form.get('duration'));
  if(!file||typeof file.arrayBuffer!=='function'||!file.size||file.size>MAX_AUDIO||!(duration>0&&duration<=90)) fail('invalid_audio',400);
  if(!['audio/wav','audio/x-wav'].includes(file.type)) fail('unsupported_audio',415);
  const audio=new Uint8Array(await file.arrayBuffer()),view=new DataView(audio.buffer);
  const ascii=(a,b)=>new TextDecoder().decode(audio.slice(a,b));
  if(audio.length<44||ascii(0,4)!=='RIFF'||ascii(8,12)!=='WAVE'||ascii(12,16)!=='fmt '||ascii(36,40)!=='data'||view.getUint32(16,true)!==16||view.getUint16(20,true)!==1||view.getUint16(22,true)!==1||view.getUint32(24,true)!==16000||view.getUint32(28,true)!==32000||view.getUint16(32,true)!==2||view.getUint16(34,true)!==16||view.getUint32(40,true)!==audio.length-44||view.getUint32(4,true)!==audio.length-8||audio.length%2) fail('invalid_audio',400);
  const actualDuration=(audio.length-44)/32000;
  if(actualDuration<=0||actualDuration>90) fail('invalid_audio',400);
  return {file,filename:'recording.wav',duration:actualDuration};
 }
 let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch(_){fail('bad_request',400);}
 if(typeof body.text!=='string'||!body.text.trim()||body.text.length>8000||!Array.isArray(body.images)||body.images.length>2) fail('bad_request',400);
 for(const image of body.images) {
  if(!['image/jpeg','image/png','image/webp'].includes(image.type)||typeof image.data!=='string'||image.data.length>Math.ceil(MAX_IMAGE/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) fail('invalid_image',400);
  let decoded;try{decoded=Uint8Array.from(atob(image.data),x=>x.charCodeAt(0));}catch(_){fail('invalid_image',400);}
  if(decoded.length>MAX_IMAGE||!signature(decoded,image.type)) fail('invalid_image',400);
 }
 return {text:body.text,images:body.images};
}
// Зафіксовані snapshot-и: https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe
// До 16000 input та 2000 output токенів. Середня ціна хвилини не є верхньою межею.
const transcriptionCaps = new Set(['gpt-4o-mini-transcribe-2025-12-15','gpt-4o-mini-transcribe-2025-03-20']);
export const LOCAL_TRANSCRIBE_MODEL='whisper.cpp-v1.9.5-large-v3-turbo-q5_0';
export function reservation(kind,payload,env,{localTranscription=false}={}) {
 if(!env.PRICING_APPROVED_AT||!env.PRICING_MODEL_PAIR||env.PRICING_MODEL_PAIR!==`${env.TRANSCRIBE_MODEL}|${env.PARSE_MODEL}`) fail('budget_disabled',503);
 const price = key => { const value=Number(env[key]); if(!Number.isSafeInteger(value)||value<=0) fail('budget_disabled',503); return value; };
 let cost;
 if(kind==='transcribe') {
  if(localTranscription && env.TRANSCRIBE_MODEL===LOCAL_TRANSCRIBE_MODEL) return 0;
  if(!transcriptionCaps.has(env.TRANSCRIBE_MODEL)) fail('budget_disabled',503);
  cost=Math.ceil((16000*price('TRANSCRIBE_INPUT_MICROS_PER_MTOK')+2000*price('TRANSCRIBE_OUTPUT_MICROS_PER_MTOK'))/1000000);
 } else {
  // UTF-8 байти як верхня межа токенів тексту, запас для інструкцій/схеми,
  // до 10000 токенів на зображення і фактичний max_tokens=4096 для output.
  cost=Math.ceil(((new TextEncoder().encode(payload.text).length+16000+payload.images.length*10000)*price('INPUT_MICROS_PER_MTOK')+4096*price('OUTPUT_MICROS_PER_MTOK'))/1000000);
 }
 if(!Number.isSafeInteger(cost)||cost<=0) fail('budget_disabled',503);
 return cost;
}
export function createHandler(deps={}) {
 return {async fetch(request,env) {
  const origin=request.headers.get('Origin'),allowed=(env.ALLOWED_ORIGINS||'').split(',');
  const cors={'Vary':'Origin','Cache-Control':'no-store','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type',...(allowed.includes(origin)?{'Access-Control-Allow-Origin':origin}:{})};
  const reply=(data,status=200)=>Response.json(data,{status,headers:cors});
  let budget,id;
  try {
   if(origin&&!allowed.includes(origin)) return reply({error:'origin_forbidden'},403);
   if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
   if(request.method!=='POST') return reply({error:'method_not_allowed'},405);
   const kind=new URL(request.url).pathname==='/transcribe'?'transcribe':new URL(request.url).pathname==='/analyze'?'analyze':null;
   if(!kind) return reply({error:'not_found'},404);
   const uid=await (deps.authenticate||authenticate)(request,env);
   if(!(env.ALLOWED_UIDS||'').split(',').includes(uid)) return reply({error:'pilot_forbidden'},403);
   const localTranscription=deps.localTranscription===true && env.TRANSCRIBE_MODEL===LOCAL_TRANSCRIBE_MODEL && typeof deps.provider==='function';
   if(env.LIVE_ENABLED!=='true'||!env.TRANSCRIBE_MODEL||!env.PARSE_MODEL||(!localTranscription&&!env.OPENAI_API_KEY)||!env.ANTHROPIC_API_KEY||!env.PILOT_BUDGET) return reply({error:'live_disabled'},503);
   const payload=await input(request,kind),cost=reservation(kind,payload,env,{localTranscription});
   budget=env.PILOT_BUDGET.get(env.PILOT_BUDGET.idFromName('pilot-v1'));id=crypto.randomUUID();
   const reserved=await budget.fetch(new Request('https://budget/reserve',{method:'POST',body:JSON.stringify({action:'reserve',id,uid:await digest(uid),cost})}));
   if(!reserved.ok) { id=null; return reply({error:reserved.status===429?'rate_limited':'limiter_unavailable'},reserved.status===429?429:503); }
   return reply(await (deps.provider ? deps.provider(kind,payload,env,{signal:request.signal}) : callProvider(kind,payload,env)));
  } catch(error) {
   const codes=['unauthorized','bad_request','invalid_audio','unsupported_audio','invalid_image','media_too_large','budget_disabled','empty_transcript','upstream_timeout','upstream_limited','invalid_response'];
   return reply({error:codes.includes(error.message)?error.message:'upstream_failed'},error.status||502);
  } finally {
   if(budget&&id) {try{await budget.fetch(new Request('https://budget/finish',{method:'POST',body:JSON.stringify({action:'finish',id})}));}catch(_){} }
  }
 }};
}
export default createHandler();
