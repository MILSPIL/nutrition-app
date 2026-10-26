import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cancelNativeInput } from './native-cancel.mjs';

function fixture({ captured = false } = {}) {
  const rows = new Map([['head', { admission_id:'head',status:'unknown',execution_generation:7 }],['tail',{ admission_id:'tail',status:'queued',execution_generation:null }]]);
  const calls=[], executed=[];
  const owner={async rpc(_channel, method, params){
    calls.push({method,params});const row=rows.get(params.admission_id);
    if(method==='prompt.receipt')return structuredClone(row);
    if(method==='session.resume')return {session_id:'own-session',pending:[...rows.values()].filter(r=>r.status!=='terminal')};
    if(method==='prompt.cancel'){assert.equal(row.status,'queued');Object.assign(row,{status:'terminal',outcome:'cancelled'});return row;}
    if(method==='prompt.resolve_unknown'){
      assert.equal(row.status,'unknown');assert.equal(params.execution_generation,row.execution_generation);
      Object.assign(row,{status:'terminal',outcome:captured?'completed':'interrupted'});
      for(const r of rows.values())if(r.status==='queued')executed.push(r.admission_id);
      return row;
    }
    throw Error('unexpected_mutation');
  }};
  const cancel=(id,accept=()=>{})=>cancelNativeInput({owner,binding:{sessionId:'own-session',admissionId:id},accept});
  return {rows,calls,executed,cancel};
}
test('an unknown head never launches the queued tail; cancel tail before resolving head',async()=>{
  const f=fixture();await assert.rejects(f.cancel('head'),/native_queue_pending/);
  assert.equal(f.calls.filter(c=>c.method==='prompt.resolve_unknown').length,0);
  assert.equal((await f.cancel('tail')).outcome,'cancelled');
  assert.equal((await f.cancel('head')).outcome,'interrupted');
  assert.deepEqual(f.executed,[]);
  const mutations=f.calls.filter(c=>['prompt.cancel','prompt.resolve_unknown'].includes(c.method)).length;
  await f.cancel('head');await f.cancel('tail');
  assert.equal(f.calls.filter(c=>['prompt.cancel','prompt.resolve_unknown'].includes(c.method)).length,mutations);
  assert.equal(f.calls.some(c=>c.method==='prompt.submit'),false);
});
test('a captured completed result is preserved during unknown recovery',async()=>{
  const f=fixture({captured:true});await f.cancel('tail');assert.equal((await f.cancel('head')).outcome,'completed');
});
test('receipt validation failure cannot cancel or resolve any admission',async()=>{
  const f=fixture();await assert.rejects(f.cancel('tail',()=>{throw Error('native_receipt_invalid');}),/native_receipt_invalid/);
  assert.deepEqual(f.calls.map(c=>c.method),['prompt.receipt']);
});
test('missing native receipt is unknown and is never resubmitted',async()=>{
  const f=fixture();await assert.rejects(f.cancel('missing'),/execution_unknown/);assert.deepEqual(f.calls.map(c=>c.method),['prompt.receipt']);
});
