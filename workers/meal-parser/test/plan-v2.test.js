import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHandler,reservation} from '../src/index.js';
import {callProvider} from '../src/providers.js';
const catalog=[{refId:'fruit:0',name:'фрукти та ягоди',group:'fruits',basisState:'as_sold'}];
const payload={text:'Яблуко 200 г',images:[],analysisVersion:2,planCatalog:catalog};
const env={ALLOWED_ORIGINS:'https://lab.example',ALLOWED_UIDS:'owner',LIVE_ENABLED:'true',OPENAI_API_KEY:'synthetic',ANTHROPIC_API_KEY:'synthetic',TRANSCRIBE_MODEL:'test',PARSE_MODEL:'claude-sonnet-5-5',PRICING_APPROVED_AT:'test',PRICING_MODEL_PAIR:'test|claude-sonnet-5-5',INPUT_MICROS_PER_MTOK:'3000000',OUTPUT_MICROS_PER_MTOK:'15000000',PILOT_BUDGET:{idFromName:x=>x,get:()=>({fetch:async()=>Response.json({ok:true})})}};
const request=body=>new Request('https://lab.example/analyze',{method:'POST',headers:{Origin:'https://lab.example','Content-Type':'application/json'},body:JSON.stringify(body)});
const food=()=>({name:'Яблуко',quantity:{value:200,unit:'g'},nutritionBasis:{value:100,unit:'g'},nutrients:{p:1,f:1,c:10,cal:53},source:{kind:'estimate',label:'Оцінка'},estimated:true,clarification:'',planMatch:{referenceId:'fruit:0',consumedState:'as_sold',certainty:'matched'}});
test('L09: старий handler приймає v2 поля і передає provider лише v1',async()=>{
 const frozen=JSON.parse(await readFile(new URL('../../../scripts/fixtures/voice-letters-previous-writer.json',import.meta.url)));
 const source=frozen.files['workers/meal-parser/src/index.js'].replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${new URL(p,new URL('../src/index.js',import.meta.url)).href}'`);
 const old=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 let seen;const handler=old.createHandler({authenticate:async()=> 'owner',provider:async(k,p)=>{seen=p;return {items:[food()],unparsed:[]};}});
 assert.equal((await handler.fetch(request(payload),env)).status,200);assert.deepEqual(Object.keys(seen),['text','images']);
});
test('L09: v2 bounds відхиляються перед provider',async()=>{
 let calls=0;const handler=createHandler({authenticate:async()=> 'owner',provider:async()=>{calls++;return {};}});
 for(const planCatalog of [Array(201).fill(catalog[0]),[{...catalog[0],refId:'private id'}],[{...catalog[0],name:'x'.repeat(161)}]]) assert.equal((await handler.fetch(request({...payload,planCatalog}),env)).status,400);
 assert.equal(calls,0);
});
test('L09: v2 схема, метадані envelope і невідомий ref не псують харчування',async()=>{
 let sent;const result=await callProvider('analyze',payload,env,async(url,opts)=>{
  sent=JSON.parse(opts.body);const row=food();row.planMatch.referenceId='outside';row.transcript='PRIVATE';row.reasoning='PRIVATE';
  return Response.json({model:env.PARSE_MODEL,stop_reason:'end_turn',usage:{output_tokens:123},content:[{type:'text',text:JSON.stringify({items:[row],unparsed:[],analysisMeta:{outputTokens:999}})}]});
 });
 assert.ok(sent.output_config.format.schema.properties.items.items.required.includes('planMatch'));
 assert.ok(!JSON.stringify(result).includes('PRIVATE'));assert.equal(result.items[0].planMatch,null);assert.equal(result.items[0].nutrients.cal,53);
 assert.deepEqual(result.analysisMeta,{model:env.PARSE_MODEL,stopReason:'end_turn',outputTokens:123,maxOutputTokens:4096});
 assert.ok(reservation('analyze',payload,env)>reservation('analyze',{text:payload.text,images:[]},env));
});

test('L09: forced-tool v2 має ту саму схему, null usage і відкидає refusal',async()=>{
 const custom={...env,PARSE_MODEL:'configured-previous-model'};
 for(const reason of ['tool_use','refusal','max_tokens']) {
  const run=()=>callProvider('analyze',payload,custom,async(u,o)=>{
   assert.ok(JSON.parse(o.body).tools[0].input_schema.properties.items.items.required.includes('planMatch'));
   return Response.json({model:custom.PARSE_MODEL,stop_reason:reason,content:[{type:'tool_use',name:'food_record',input:{items:[food()],unparsed:[]}}]});
  });
  if(reason==='tool_use') {const result=await run();assert.equal(result.analysisMeta.outputTokens,null);}else await assert.rejects(run,/invalid_response/);
 }
});
