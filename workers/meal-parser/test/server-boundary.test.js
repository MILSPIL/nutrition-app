import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/index.js';
import { callProvider } from '../src/providers.js';

test('missing Origin is rejected before auth or inference', async () => {
 let authenticated=0, called=0;
 const handler=createHandler({authenticate:async()=>{authenticated++;return 'pilot';},provider:async()=>{called++;return {};}});
 const response=await handler.fetch(new Request('https://ntzg.pp.ua/analyze',{method:'POST',body:'{}'}),{ALLOWED_ORIGINS:'https://ntzg.pp.ua'});
 assert.equal(response.status,403); assert.equal(authenticated,0); assert.equal(called,0);
});
test('caller cancellation aborts Sonnet fetch without waiting for its own deadline', async () => {
 const controller=new AbortController(); let aborted=false;
 const fetcher=async (_url,{signal})=>new Promise((_resolve,reject)=>{
  const abort=()=>{aborted=true;reject(new DOMException('Aborted','AbortError'));};
  signal.addEventListener('abort',abort,{once:true});
  // Watchdog only for the pre-fix reproduction: never calls a real provider.
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);reject(Error('caller_abort_not_forwarded'));},100);
  signal.addEventListener('abort',()=>clearTimeout(timer),{once:true});
  queueMicrotask(()=>controller.abort());
 });
 await assert.rejects(callProvider('analyze',{text:'synthetic',images:[]},{PARSE_MODEL:'claude-sonnet-5-5',ANTHROPIC_API_KEY:'synthetic'},fetcher,{signal:controller.signal}),/upstream_timeout/);
 assert.equal(aborted,true);
});
