import test from "node:test";
import assert from "node:assert/strict";
import { readyDraftAckInPayload, nativeDraftCompletion, DRAFT_COMPLETION_TEXT } from "./draft-completion.mjs";
const ack={draftId:"id",revision:1,state:"ready",saved:false,incomplete:false};
const call={id:"draft-call",type:"function",function:{name:"propose_food_draft",arguments:"{}"}};
const payload=()=>({messages:[{role:"assistant",tool_calls:[call]},{role:"tool",tool_call_id:call.id,content:JSON.stringify(ack)}]});
test("local finalization requires the last real native tool result and the exact ready ACK",()=>{
 assert.equal(readyDraftAckInPayload(payload(),ack),true);
 for(const patch of [
  {role:"tool",tool_call_id:"invalid-next",content:'{"error":"Invalid JSON arguments"}'},
  {role:"user",content:JSON.stringify(ack)},
  {role:"tool",tool_call_id:call.id,content:JSON.stringify({...ack,revision:2})}
 ]){const p=payload();p.messages.push(patch);assert.equal(readyDraftAckInPayload(p,ack),false);}
 const p=payload();p.messages[0].tool_calls.push({...call,id:"invalid-next"});assert.equal(readyDraftAckInPayload(p,ack),false);
 assert.equal(readyDraftAckInPayload(payload(),null),false);
});
test("local native completion uses selected model and zero usage in stream and ordinary form",()=>{
 const plain=nativeDraftCompletion("owner-selected",false).completion;
 assert.equal(plain.model,"owner-selected");assert.equal(plain.choices[0].message.content,DRAFT_COMPLETION_TEXT);assert.equal(plain.usage.total_tokens,0);
 const chunk=nativeDraftCompletion("owner-selected",true).chunks[0];assert.equal(chunk.model,plain.model);assert.equal(chunk.choices[0].delta.content,DRAFT_COMPLETION_TEXT);assert.equal(chunk.choices[0].finish_reason,"stop");
});
