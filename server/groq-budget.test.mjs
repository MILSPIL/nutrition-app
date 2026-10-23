import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {localBudget} from '../scripts/phone-lab/sqlite.mjs';
const send=(b,data)=>b.binding.get().fetch(new Request('https://budget',{method:'POST',body:JSON.stringify(data)}));
async function reserve(b,{uid='a'.repeat(64),cost=0,finish=true}={}){const id=randomUUID();const r=await send(b,{action:'reserve',id,uid,cost});if(finish&&r.ok)await send(b,{action:'finish',id});return r;}
async function fixture(fn){const dir=mkdtempSync(path.join(tmpdir(),'groq-budget-')),file=path.join(dir,'budget.sqlite'),clock=Date.now;let budget;try{
 const now=Math.floor(clock()/86400000)*86400000+3600000;Date.now=()=>now-86400000;
 budget=localBudget(file,5000000,{initialize:true});await reserve(budget,{cost:123456});budget.close();budget=null;Date.now=()=>now;
 const open=()=>localBudget(file,5000000,{groqFree:true});await fn(open,now);
 }finally{Date.now=clock;budget?.close();rmSync(dir,{recursive:true,force:true});}}
test('Free reservations preserve legacy spend and global per-minute limits across restart',()=>fixture(async open=>{
 let b=open();try{for(let i=0;i<6;i++)assert.equal((await reserve(b,{uid:i.toString(16).repeat(64)})).status,200);assert.equal(b.spent(),123456);}finally{b.close();}
 b=open();try{assert.equal((await reserve(b,{uid:'f'.repeat(64)})).status,429);assert.equal(b.spent(),123456);}finally{b.close();}
}));
test('Free daily quota is shared across users, includes failures and survives reopening',()=>fixture(async(open,now)=>{
 for(let i=0;i<30;i++){Date.now=()=>now+i*90000;const b=open();try{assert.equal((await reserve(b,{uid:(i%16).toString(16).repeat(64),finish:false})).status,200);}finally{b.close();}}
 Date.now=()=>now+30*90000;const b=open();try{assert.equal((await reserve(b,{uid:'f'.repeat(64)})).status,429);assert.equal(b.spent(),123456);}finally{b.close();}
}));
test('Free requests reserve atomically with only one active upstream slot across UIDs',()=>fixture(async open=>{
 const b=open();try{const responses=await Promise.all(['a','b'].map(x=>reserve(b,{uid:x.repeat(64),finish:false})));assert.deepEqual(responses.map(x=>x.status).sort(),[200,429]);}finally{b.close();}
}));
