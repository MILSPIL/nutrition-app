import test from "node:test";
import assert from "node:assert/strict";
import { nativeInputText, projectPersonalModelRequest } from "./personal-model-context.mjs";
const id = n => `synthetic-input-${String(n).padStart(4,"0")}`;
const records = new Map(Array.from({length:19}, (_, n) => [id(n), {proof:String(n%10).repeat(64),text:`Синтетичне повідомлення ${n}`,sentAt:"2026-10-26T20:00:00Z",targetDate:"2026-10-26"}]));
const current = { inputId:id(18),payloadHmac:records.get(id(18)).proof };
const snapshot = JSON.stringify({schemaVersion:1,context:"LATEST_CURATED_FACTS".repeat(1000),message:records.get(id(18)).text});
const binding = n => ({inputId:id(n),payloadHmac:records.get(id(n)).proof});
const full = n => `SCISENSE-INPUT-V1 ${id(n)} ${records.get(id(n)).proof}\n`+JSON.stringify({schemaVersion:1,...records.get(id(n)),message:records.get(id(n)).text,context:"STALE_CONTEXT_".repeat(5500)});
const run = (payload, options={}) => projectPersonalModelRequest(payload,{current,snapshot,resolve:id=>records.get(id),contextWindow:272000,...options});

test("over a megabyte of historical snapshots becomes one current snapshot without changing canonical input",()=>{
 const messages=Array.from({length:18},(_,n)=>({role:"user",content:full(n)}));
 messages.push({role:"user",content:nativeInputText(current,{text:records.get(id(18)).text})});
 const payload={model:"synthetic",messages},before=JSON.stringify(payload);assert.ok(Buffer.byteLength(before)>1000000);
 const result=run(payload),wire=JSON.stringify(result);
 assert.equal(JSON.stringify(payload),before);assert.equal(wire.includes("STALE_CONTEXT_"),false);
 assert.equal(wire.split("LATEST_CURATED_FACTS").length-1,1000);
 for(const value of records.values())assert.ok(wire.includes(value.text));
 assert.equal(result.messages.length,messages.length);assert.ok(Buffer.byteLength(wire)<50000);
});
test("photos, assistant tool calls and paired tool results remain unchanged",()=>{
 const image={type:"image_url",image_url:{url:"data:image/png;base64,synthetic"}};
 const tool={role:"tool",tool_call_id:"call-1",content:"synthetic result"};
 const assistant={role:"assistant",tool_calls:[{id:"call-1",function:{name:"read_plan",arguments:"{}"}}]};
 const result=run({messages:[assistant,tool,{role:"user",content:[{type:"text",text:nativeInputText(current,{text:records.get(id(18)).text})},image]}]});
 assert.strictEqual(result.messages[0],assistant);assert.strictEqual(result.messages[1],tool);assert.strictEqual(result.messages[2].content[1],image);
});
test("foreign HMAC, foreign input, changed text and missing current context fail before a model call",()=>{
 for(const content of [full(1).replace(records.get(id(1)).proof,"f".repeat(64)),full(1).replace(id(1),"unknown-input-0000"),full(1).replace(records.get(id(1)).text,"changed")])
  assert.throws(()=>run({messages:[{role:"user",content}]}),/native_receipt_invalid/);
 assert.throws(()=>run({messages:[{role:"user",content:"ordinary text"}]}),/native_receipt_invalid/);
});
test("oversized clean context is refused and literal user data is retained",()=>{
 const content=nativeInputText(current,{text:records.get(id(18)).text});
 assert.throws(()=>run({messages:[{role:"assistant",content:"x".repeat(1048577)},{role:"user",content}]}),/context_too_large/);
 const literal='literal SCISENSE-INPUT-V1 unknown input';
 assert.equal(run({messages:[{role:"user",content:literal},{role:"user",content}]}).messages[0].content,literal);
});
test("Native outer whitespace stripping keeps the exact signed words for text and photos",()=>{
 const owned={...records.get(id(18)),text:"  Порадь синтетичну вечерю \n"};
 const content=nativeInputText(current,owned);
 const options={resolve:key=>key===current.inputId?owned:records.get(key)};
 assert.ok(run({messages:[{role:"user",content:content.trim()}]},options).messages[0].content.includes(snapshot));
 const photo="\n\n[Image attached at: /synthetic/image.png]\n[screenshot]";
 const projected=run({messages:[{role:"user",content:[{type:"text",text:content.trim()+photo}]}]},options);
 assert.equal(projected.messages[0].content[0].text,nativeInputText(current,{text:snapshot})+photo);
 assert.throws(()=>run({messages:[{role:"user",content:content.trim().replace("вечерю","інший текст")}]},options),/native_receipt_invalid/);
});
test("Native merged user rows project each signed frame and preserve an unsigned Desktop prefix",()=>{
 const content=full(1)+"\n\n"+nativeInputText(current,records.get(id(18)));
 for (const prefix of ["", "Незавершене синтетичне повідомлення Desktop\n\n"]) {
  const result=run({messages:[{role:"user",content:prefix+content}]}).messages[0].content;
  assert.equal(result.includes("STALE_CONTEXT_"),false);assert.ok(result.includes(records.get(id(1)).text));
  assert.ok(result.endsWith(snapshot));assert.ok(result.startsWith(prefix));
 }
 assert.throws(()=>run({messages:[{role:"user",content:content+"\n\n"+nativeInputText(current,records.get(id(18)))}]}),/native_receipt_invalid/);
});
