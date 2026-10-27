import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PilotBudget} from '../src/budget.js';
function storage(file=':memory:') {const db=new DatabaseSync(file);return {db,sql:{exec(sql,...args){const stmt=db.prepare(sql);const rows=stmt.columns().length?stmt.all(...args):(stmt.run(...args),[]);return {toArray:()=>rows,one:()=>rows[0]};}},transactionSync(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}};}
const req=(id,action='reserve',uid='a'.repeat(64),cost=10)=>new Request('https://local',{method:'POST',body:JSON.stringify({id:`request-id-${String(id).padStart(8,'0')}`,action,uid,cost})});
test('SQLite: 2 concurrent, 6 rolling minute, restart retains quotas and budget',async()=>{const dir=mkdtempSync(join(tmpdir(),'scisense-budget-')),file=join(dir,'state.sqlite');let s=storage(file);try{let b=new PilotBudget({storage:s},{PILOT_BUDGET_MICROS:'1000'});
 const results=await Promise.all([b.fetch(req(1)),b.fetch(req(2)),b.fetch(req(3))]);assert.deepEqual(results.map(x=>x.status),[200,200,429]);
 await b.fetch(req(1,'finish'));await b.fetch(req(2,'finish'));for(let i=3;i<=6;i++){assert.equal((await b.fetch(req(i))).status,200);await b.fetch(req(i,'finish'));}
 s.db.close();s=storage(file);b=new PilotBudget({storage:s},{PILOT_BUDGET_MICROS:'1000'});assert.equal((await b.fetch(req(7))).status,429);
 assert.equal(s.sql.exec('SELECT SUM(cost) AS total FROM calls').one().total,60);
 }finally{s.db.close();rmSync(dir,{recursive:true});}});
test('global budget independent of UID; no refund on finish',async()=>{const s=storage();try{const b=new PilotBudget({storage:s},{PILOT_BUDGET_MICROS:'15'});assert.equal((await b.fetch(req(1))).status,200);await b.fetch(req(1,'finish'));assert.equal((await b.fetch(req(2,'reserve','b'.repeat(64)))).status,429);}finally{s.db.close();}});
test('missing budget and failed SQLite fail closed',async()=>{const s=storage();const b=new PilotBudget({storage:s},{});assert.equal((await b.fetch(req(1))).status,503);s.db.close();assert.equal((await b.fetch(req(1,'finish'))).status,503);});
test('UTC daily 30 limit persists while minute window expires',async()=>{const s=storage();try{const b=new PilotBudget({storage:s},{PILOT_BUDGET_MICROS:'10000'});const day=Math.floor(Date.now()/86400000)*86400000;for(let i=0;i<30;i++)s.sql.exec('INSERT INTO calls VALUES(?,?,?,?,?)',`old-${i}`,'a'.repeat(64),day,day,1);assert.equal((await b.fetch(req(31))).status,429);}finally{s.db.close();}});

test('zero-cost local transcription still consumes rolling quota and rejects negative costs',async()=>{
 const s=storage();try{const b=new PilotBudget({storage:s},{PILOT_BUDGET_MICROS:'100'});
 assert.equal((await b.fetch(req(999,'reserve','a'.repeat(64),-1))).status,503);
 for(let i=1;i<=6;i++){assert.equal((await b.fetch(req(i,'reserve','a'.repeat(64),0))).status,200);await b.fetch(req(i,'finish'));}
 assert.equal((await b.fetch(req(7,'reserve','a'.repeat(64),0))).status,429);
 assert.equal(s.sql.exec('SELECT SUM(cost) AS total FROM calls').one().total,0);
 }finally{s.db.close();}
});
