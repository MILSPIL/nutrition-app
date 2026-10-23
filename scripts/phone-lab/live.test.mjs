import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import path from 'node:path';
import {approvedSettings,liveRuntime} from './live.mjs';
const pending=JSON.parse(readFileSync(new URL('../../workers/meal-parser/pilot-proposal.json',import.meta.url)));
pending.status='approved_implementation';pending.approvedAt='';pending.fullApproval.approvedAt='';pending.candidateC.PRICING_APPROVED_AT='';
pending.sttApproval={approvedAt:'',freeTierConfirmedAt:'',zeroDataRetentionConfirmedAt:''};
export function approvedFixture(){const p=structuredClone(pending),stamp=new Date(Date.now()-1000).toISOString();p.sttApproval={approvedAt:stamp,freeTierConfirmedAt:stamp,zeroDataRetentionConfirmedAt:stamp};p.approvedAt=stamp;p.status='approved_local_pilot';p.candidateC.PRICING_APPROVED_AT=stamp;p.fullApproval={approvedAt:stamp,proposalRevision:p.proposalRevision,configHash:p.configHash};return p;}
test('pending approval fixture refuses inference; historical local Whisper approval cannot unlock Groq',()=>{
 assert.throws(()=>approvedSettings(pending),/pilot_not_approved/);
 assert.throws(()=>approvedSettings(pending,{mode:'stt_only'}),/pilot_not_approved/);
});
test('STT-only approval has no Anthropic pricing and refuses paid tier, stale model or changed cap',()=>{
 const p=approvedFixture();p.approvedAt='';p.candidateC.PRICING_APPROVED_AT='';
 const settings=approvedSettings(p,{mode:'stt_only'});assert.equal(settings.INFERENCE_MODE,'stt_only');assert.equal(settings.TRANSCRIBE_MODEL,'whisper-large-v3');assert.equal(settings.GROQ_FREE_LIMITS,'true');assert.equal(settings.PRICING_APPROVED_AT,undefined);
 assert.throws(()=>approvedSettings(p),/pilot_not_approved/);
 for(const change of [x=>x.sttApproval.zeroDataRetentionConfirmedAt='',x=>x.sttApproval.freeTierConfirmedAt='',x=>x.candidateC.GROQ_ACCOUNT_TIER='developer',x=>x.candidateC.PILOT_BUDGET_MICROS=5000001,x=>x.candidateC.TRANSCRIBE_MODEL='whisper-large-v3-turbo',x=>x.configHash='bad',x=>x.proposalRevision=1]){const copy=structuredClone(p);change(copy);assert.throws(()=>approvedSettings(copy,{mode:'stt_only'}),/pilot_not_approved/);}
});
test('STT-only runtime reads only Groq and existing marker, no local weights or Anthropic',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'groq-live-')),events=[];let marker='',runtime;
 try{mkdirSync(path.join(root,'workers/meal-parser'),{recursive:true});mkdirSync(path.join(root,'tmp/phone-lab'),{recursive:true});writeFileSync(path.join(root,'workers/meal-parser/pilot-proposal.json'),JSON.stringify(approvedFixture()));
 const options={mode:'stt_only',lockFile:path.join(root,'pilot.lock'),keyStore:async(service,account,value)=>{events.push(service+'/'+account);if(service==='scisense-anthropic')throw Error('Anthropic read');if(service==='scisense-groq')return 'gsk_synthetic_1234567890123456';if(value!==undefined)marker=value;return marker;},fetcher:async()=>{throw Error('No network');}};
 runtime=await liveRuntime(root,{...options,initialize:true});assert.equal(runtime.apiEnv.INFERENCE_MODE,'stt_only');assert.equal(runtime.apiEnv.ANTHROPIC_API_KEY,undefined);assert.equal(runtime.spent(),0);await runtime.close();runtime=null;
 runtime=await liveRuntime(root,options);assert.equal(runtime.spent(),0);assert.ok(!events.some(x=>x.includes('anthropic')));
 await assert.rejects(runtime.provider('analyze',{text:'test',images:[]},runtime.apiEnv,{}),/live_disabled/);
 await runtime.close();runtime=null;await assert.rejects(liveRuntime(root,{...options,initialize:true}),/pilot_budget_locked/);
 }finally{await runtime?.close();rmSync(root,{recursive:true,force:true});}
});

test('historical Anthropic approval cannot activate the Groq revision',()=>{
 const p=approvedFixture();assert.equal(approvedSettings(p).INFERENCE_MODE,'full');
 for(const change of [x=>delete x.fullApproval,x=>x.fullApproval.configHash='f'.repeat(64),x=>x.fullApproval.proposalRevision=1,x=>{x.approvedAt='2026-10-20T23:04:32+03:00';x.candidateC.PRICING_APPROVED_AT=x.approvedAt;x.fullApproval.approvedAt=x.approvedAt;}]){const copy=structuredClone(p);change(copy);assert.throws(()=>approvedSettings(copy),/pilot_not_approved/);}
});
