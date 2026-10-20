import { analysisSchema,systemPrompt,validateAnalysis } from './schema.js';
export async function callProvider(kind,payload,env,fetcher=fetch) {
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
 try {
  let response;
  if(kind==='transcribe') {
   const form=new FormData();form.set('model',env.TRANSCRIBE_MODEL);form.set('file',payload.file,payload.filename);form.set('response_format','json');
   response=await fetcher('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:form,signal:controller.signal});
  } else {
   const content=(payload.images||[]).map(image=>({type:'image',source:{type:'base64',media_type:image.type,data:image.data}}));
   content.push({type:'text',text:payload.text});
   response=await fetcher('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},signal:controller.signal,
    body:JSON.stringify({model:env.PARSE_MODEL,max_tokens:4096,system:systemPrompt,messages:[{role:'user',content}],tools:[{name:'food_record',description:'Структурована чернетка харчування',input_schema:analysisSchema}],tool_choice:{type:'tool',name:'food_record'}})});
  }
  if(!response.ok) throw Error(response.status===429?'upstream_limited':'upstream_failed');
  const data=await response.json();
  if(kind==='transcribe') { if(typeof data.text!=='string'||!data.text.trim()||data.text.length>8000) throw Error('empty_transcript'); return {text:data.text.trim()}; }
  if(data.stop_reason==='max_tokens') throw Error('invalid_response');
  return validateAnalysis(data.content?.find(x=>x.type==='tool_use'&&x.name==='food_record')?.input,!!payload.images?.length);
 } catch(error) { if(controller.signal.aborted) throw Error('upstream_timeout'); throw error; }
 finally {clearTimeout(timer);}
}
