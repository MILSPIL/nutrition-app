import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, chmodSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { openFreeSttLedger } from "./free-stt-ledger.mjs";
function fixture(t) {
 const dir=realpathSync(mkdtempSync(join(tmpdir(),"free-stt-")));chmodSync(dir,0o700);const file=join(dir,"free-stt.sqlite");let clock=Date.parse("2026-10-26T10:00:00Z"),ledger;
 const open=initialize=>ledger=openFreeSttLedger(file,{initialize,now:()=>clock});open(true);
 t.after(()=>{ledger.close();rmSync(dir,{recursive:true,force:true});});
 return {file,get ledger(){return ledger;},advance(ms){clock+=ms;},reopen(){ledger.close();return open(false);},async call(body){return ledger.binding.get().fetch(new Request("https://limiter",{method:"POST",body:JSON.stringify(body)}));}};
}
const reserve=(id=randomUUID(),uid="a".repeat(64),cost=0)=>({action:"reserve",id,uid,cost});
test("only zero-cost STT reservations are accepted; paid fields cannot reach a currency ledger",async t=>{
 const f=fixture(t);for(const cost of [1,-1,"0",null,false])assert.equal((await f.call(reserve(randomUUID(),undefined,cost))).status,503);
 const r=reserve();assert.equal((await f.call(r)).status,200);assert.equal((await f.call(r)).status,409);
 assert.equal((await f.call({action:"finish",id:r.id})).status,200);assert.equal((await f.call(reserve())).status,200);
});
test("both accounts share rate and active quotas across a restart; unfinished work is not refunded",async t=>{
 const f=fixture(t),first=reserve();assert.equal((await f.call(first)).status,200);f.reopen();assert.equal((await f.call(reserve(randomUUID(),"b".repeat(64)))).status,429);
 f.advance(65001);const second=reserve(randomUUID(),"b".repeat(64));assert.equal((await f.call(second)).status,200);await f.call({action:"finish",id:second.id});
 for(let n=0;n<5;n++){const r=reserve();assert.equal((await f.call(r)).status,200);await f.call({action:"finish",id:r.id});}
 assert.equal((await f.call(reserve())).status,429);
});
test("daily quota never resets when files or schema are missing",async t=>{
 const f=fixture(t);
 for(let n=0;n<30;n++){const r=reserve();assert.equal((await f.call(r)).status,200);await f.call({action:"finish",id:r.id});f.advance(65001);}
 f.reopen();assert.equal((await f.call(reserve())).status,429);assert.throws(()=>openFreeSttLedger(f.file));
 f.ledger.close();unlinkSync(f.file);assert.throws(()=>openFreeSttLedger(f.file));writeFileSync(f.file,"",{mode:0o600});assert.throws(()=>openFreeSttLedger(f.file));
});
