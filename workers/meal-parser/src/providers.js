import { groqFreeApproved, transcriptionLanguage, limitedJson } from './groq.js';
import { analysisSchema,systemPrompt,validateAnalysis } from './schema.js';
// Sonnet 5.5 не приймає forced tool_choice. JSON outputs зберігають той самий контракт.
// Непідтримувані grammar-обмеження лишаються в описі; validateAnalysis перевіряє їх локально.
function jsonOutputSchema(value) {
 if(Array.isArray(value)) return value.map(jsonOutputSchema);
 if(!value || typeof value!=='object') return value;
 const result={},limits=[];
 for(const [key,item] of Object.entries(value)) {
  if(['minimum','maxLength','maxItems'].includes(key)) limits.push(`${key}=${item}`);
  else result[key]=jsonOutputSchema(item);
 }
 if(limits.length) result.description=[result.description,limits.join(', ')].filter(Boolean).join('; ');
 return result;
}
const sonnetSchema=jsonOutputSchema(analysisSchema);
export async function callProvider(kind,payload,env,fetcher=fetch,{signal,timeoutMs=45000}={}) {
 const controller=new AbortController(),abort=()=>controller.abort();
 const timer=setTimeout(abort,timeoutMs);
 signal?.addEventListener('abort',abort,{once:true});
 if(signal?.aborted) abort();
 const structured=env.PARSE_MODEL==='claude-sonnet-5-5';
 try {
  if(controller.signal.aborted) throw Error('upstream_timeout');
  let response;
  if(kind==='transcribe') {
   const groq=env.TRANSCRIBE_PROVIDER==='groq';
   if(groq && (!groqFreeApproved(env)||!env.GROQ_API_KEY)) throw Error('budget_disabled');
   if(env.TRANSCRIBE_PROVIDER && !['groq','openai'].includes(env.TRANSCRIBE_PROVIDER)) throw Error('budget_disabled');
   const language=transcriptionLanguage(payload.language);
   const form=new FormData();form.set('model',env.TRANSCRIBE_MODEL);form.set('file',payload.file,'recording.wav');form.set('response_format','json');
   if(language!=='auto') form.set('language',language);
   if(groq) form.set('temperature','0');
   response=await fetcher(groq?'https://api.groq.com/openai/v1/audio/transcriptions':'https://api.openai.com/v1/audio/transcriptions',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${groq?env.GROQ_API_KEY:env.OPENAI_API_KEY}`},body:form,signal:controller.signal});
  } else {
   const content=(payload.images||[]).map(image=>({type:'image',source:{type:'base64',media_type:image.type,data:image.data}}));
   content.push({type:'text',text:payload.text});
   const body={model:env.PARSE_MODEL,max_tokens:4096,system:systemPrompt,messages:[{role:'user',content}]};
   if(structured) {
    body.thinking={type:'between_tools'};
    body.output_config={effort:'medium',format:{type:'json_schema',schema:sonnetSchema}};
   } else {
    body.tools=[{name:'food_record',description:'Структурована чернетка харчування',input_schema:analysisSchema}];
    body.tool_choice={type:'tool',name:'food_record'};
   }
   response=await fetcher('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},signal:controller.signal,body:JSON.stringify(body)});
  }
  if(!response.ok) {
   void response.body?.cancel().catch(()=>{});
   const error=Error(response.status===429?'upstream_limited':'upstream_failed');
   if(response.status===429){error.status=429;const retry=Number(response.headers.get('retry-after'));if(Number.isSafeInteger(retry)&&retry>0&&retry<=86400)error.retryAfterSeconds=retry;}
   throw error;
  }
  const data=kind==='transcribe'?await limitedJson(response,controller.signal):await response.json();
  if(kind==='transcribe') { if(typeof data.text!=='string'||!data.text.trim()||data.text.length>8000) throw Error('empty_transcript'); return {text:data.text.trim()}; }
  if(structured) {
   if(data.model!==env.PARSE_MODEL||data.stop_reason!=='end_turn'||!Array.isArray(data.content)) throw Error('invalid_response');
   const texts=data.content.filter(x=>x?.type==='text');
   if(texts.length!==1||typeof texts[0].text!=='string'||texts[0].text.length>64000||data.content.some(x=>!['text','thinking','redacted_thinking'].includes(x?.type))) throw Error('invalid_response');
   let parsed;try{parsed=JSON.parse(texts[0].text);}catch(_){throw Error('invalid_response');}
   return validateAnalysis(parsed,!!payload.images?.length);
  }
  if(data.stop_reason==='max_tokens') throw Error('invalid_response');
  return validateAnalysis(data.content?.find(x=>x.type==='tool_use'&&x.name==='food_record')?.input,!!payload.images?.length);
 } catch(error) { if(controller.signal.aborted) throw Error('upstream_timeout'); throw error; }
 finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
