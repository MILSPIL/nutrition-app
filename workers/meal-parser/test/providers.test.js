import {test} from 'node:test';
import assert from 'node:assert/strict';
import {callProvider} from '../src/providers.js';
import {analysisSchema} from '../src/schema.js';
import {createHandler,reservation} from '../src/index.js';

const env={PARSE_MODEL:'claude-sonnet-5-5',ANTHROPIC_API_KEY:'synthetic-key'};
const item=()=>({name:'Кефір',quantity:{value:200,unit:'g'},nutritionBasis:{value:100,unit:'g'},nutrients:{p:3,f:2.5,c:4,cal:53},source:{kind:'label',label:'Тестова етикетка'},estimated:false,clarification:''});
const record=()=>({items:[item()],unparsed:[]});
const payload={text:'Випив кефір, 200 грамів',images:[{type:'image/jpeg',data:'/9j/'}]};
const reply=(value=record(),overrides={})=>({model:env.PARSE_MODEL,stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(value)}],...overrides});
const fake=(data)=>async()=>Response.json(data);

test('Sonnet повертає ту саму чернетку етикетки через JSON outputs без forced tool choice',async()=>{
 let count=0;
 const result=await callProvider('analyze',payload,env,async(url,options)=>{
  count++;
  assert.equal(url,'https://api.anthropic.com/v1/messages');
  const body=JSON.parse(options.body);
  assert.equal(body.model,env.PARSE_MODEL);
  assert.equal(body.max_tokens,4096);
  assert.deepEqual(body.thinking,{type:'between_tools'});
  assert.equal(body.output_config.effort,'medium');
  assert.equal(body.output_config.format.type,'json_schema');
  assert.equal(body.tools,undefined);
  assert.equal(body.tool_choice,undefined);
  assert.equal(body.temperature,undefined);
  assert.equal(body.fallback,undefined);
  assert.equal(body.messages[0].content[0].source.data,payload.images[0].data);
  assert.equal(body.messages[0].content[1].text,payload.text);
  function verify(node){
   if(!node||typeof node!=='object')return;
   for(const key of ['minimum','maxLength','maxItems'])assert.equal(node[key],undefined);
   if(node.type==='object')assert.equal(node.additionalProperties,false);
   Object.values(node).forEach(verify);
  }
  verify(body.output_config.format.schema);
  return Response.json(reply());
 });
 assert.deepEqual(result,record());assert.equal(count,1);
 assert.equal(result.items[0].nutrients.cal*result.items[0].quantity.value/result.items[0].nutritionBasis.value,106);
 assert.equal(analysisSchema.properties.items.maxItems,20);
});

test('Sonnet читає текст за типом, не сприймає thinking за результат',async()=>{
 const data=reply();data.content.unshift({type:'thinking',thinking:'',signature:'synthetic'});
 assert.deepEqual(await callProvider('analyze',payload,env,fake(data)),record());
});

test('refusal, обрізана або підмінена відповідь Sonnet відхиляється без retry/fallback',async()=>{
 const cases=[...['refusal','max_tokens','tool_use','pause_turn','model_context_window_exceeded'].map(stop_reason=>reply(record(),{stop_reason})),
  reply(record(),{model:'claude-haiku-5-5'}),reply(record(),{content:[]}),
  reply(record(),{content:[{type:'text',text:'broken JSON'}]}),
  reply(record(),{content:[{type:'text',text:'{}'},{type:'text',text:'{}'}]}),
  reply(record(),{content:[{type:'tool_use',name:'food_record',input:record()}]})];
 for(const data of cases){let count=0;await assert.rejects(callProvider('analyze',payload,env,async()=>{count++;return Response.json(data);}),/invalid_response/);assert.equal(count,1);}
});

test('прибрані з grammar обмеження лишаються обов’язковими для результату',async()=>{
 const invalid=[];
 const many=record();many.items=Array.from({length:21},item);invalid.push(many);
 const long=record();long.items[0].name='x'.repeat(161);invalid.push(long);
 const negative=record();negative.items[0].nutrients.p=-1;invalid.push(negative);
 const noField=record();delete noField.items[0].nutrients.f;invalid.push(noField);
 const zero=record();zero.items[0].quantity.value=0;invalid.push(zero);
 for(const value of invalid)await assert.rejects(callProvider('analyze',payload,env,fake(reply(value))),/invalid_response/);
 await assert.rejects(callProvider('analyze',{...payload,images:[]},env,fake(reply())),/invalid_response/);
});

test('збій Sonnet не запускає іншу модель і не повторює запит',async()=>{
 for(const status of [429,503]){let count=0;await assert.rejects(callProvider('analyze',payload,env,async()=>{count++;return Response.json({error:'synthetic'},{status});}),status===429?/upstream_limited/:/upstream_failed/);assert.equal(count,1);}
});

test('попередній явно вибраний протокол зберігається, автоматичного переходу до нього немає',async()=>{
 const previous={...env,PARSE_MODEL:'claude-haiku-5-5'};
 const value=await callProvider('analyze',payload,previous,async(_,options)=>{
  const body=JSON.parse(options.body);assert.deepEqual(body.tool_choice,{type:'tool',name:'food_record'});assert.equal(body.output_config,undefined);
  return Response.json({stop_reason:'tool_use',content:[{type:'tool_use',name:'food_record',input:record()}]});
 });assert.deepEqual(value,record());
});

test('резерв Sonnet для 10 записів і 5 пар фото рахується з чинних тарифів',()=>{
 const prices={...env,TRANSCRIBE_MODEL:'local-whisper',PRICING_MODEL_PAIR:'local-whisper|claude-sonnet-5-5',PRICING_APPROVED_AT:'offline-test-only',INPUT_MICROS_PER_MTOK:2000000,OUTPUT_MICROS_PER_MTOK:10000000};
 const costs=[0,1,2].map(count=>reservation('analyze',{text:'x'.repeat(32000),images:Array(count).fill({})},prices));
 assert.deepEqual(costs,[136960,156960,176960]);
 assert.equal(costs[0]*10+costs[1]*5+costs[2]*5,3039200);
 assert.throws(()=>reservation('analyze',payload,{...prices,PRICING_APPROVED_AT:''}),/budget_disabled/);
});

test('вибір Sonnet без дозволеного live запуску не доходить до провайдера',async()=>{
 let count=0;
 const app=createHandler({authenticate:async()=> 'test-user',provider:async()=>count++});
 const request=new Request('https://test.invalid/analyze',{method:'POST',headers:{Origin:'https://app.example'}});
 const response=await app.fetch(request,{...env,ALLOWED_ORIGINS:'https://app.example',ALLOWED_UIDS:'test-user',LIVE_ENABLED:'false'});
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'live_disabled'});assert.equal(count,0);
});
