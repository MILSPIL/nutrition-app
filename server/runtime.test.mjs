import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {validateManifest,validateActivation,createServerRuntime} from './runtime.mjs';
const manifest=JSON.parse(await readFile(new URL('./deployment.json',import.meta.url),'utf8')),pending=JSON.parse(await readFile(new URL('../workers/meal-parser/pilot-proposal.json',import.meta.url),'utf8'));
function fixture(){const proposal=structuredClone(pending),stamp=new Date(Date.now()-1000).toISOString();proposal.approvedAt=stamp;proposal.status='approved_local_pilot';proposal.candidateC.PRICING_APPROVED_AT=stamp;proposal.fullApproval={approvedAt:stamp,proposalRevision:proposal.proposalRevision,configHash:proposal.configHash};proposal.sttApproval={approvedAt:stamp,freeTierConfirmedAt:stamp,zeroDataRetentionConfirmedAt:stamp};return proposal;}
test('Prepared manifest disables inference, removes local weights and pins Groq Free with one active request',()=>{
 assert.equal(manifest.liveEnabled,false);assert.equal(manifest.whisper,undefined);validateManifest(manifest);
 for(const changed of [{version:1},{firebaseProject:'demo-scisense'},{origin:'https://other.example'},{budgetDirectory:'/opt/scisense/releases/current/budget'},{maxConcurrent:2},{credentialNames:['anthropic']},{transcription:{...manifest.transcription,accountTier:'developer'}},{liveEnabled:true}])assert.throws(()=>validateManifest({...manifest,...changed}));
});
test('Activation v2 binds existing budget, new configuration, UID/release and separate STT/full approvals',()=>{
 const proposal=fixture(),active={...manifest,liveEnabled:true,releaseId:'a'.repeat(40),allowedUids:['synthetic-uid']},receipt={version:2,active:true,proposalId:proposal.proposalId,proposalRevision:proposal.proposalRevision,configHash:proposal.configHash,target:manifest.origin,capMicros:5000000,receiptId:'12345678-1234-1234-1234-123456789abc',consumedMicros:100000,reservedCalls:1,approvedReleases:['a'.repeat(40)],allowedUids:['synthetic-uid'],pricingConfirmedAt:proposal.approvedAt,sttApprovedAt:proposal.sttApproval.approvedAt};
 validateActivation(active,receipt,proposal);
 for(const changed of [{version:1},{proposalRevision:1},{configHash:'f'.repeat(64)},{active:false},{target:'https://other.example'},{proposalId:'new'},{capMicros:5000001},{approvedReleases:['b'.repeat(40)]},{allowedUids:['stranger']},{consumedMicros:-1},{reservedCalls:-1},{pricingConfirmedAt:null},{sttApprovedAt:''}])assert.throws(()=>validateActivation(active,{...receipt,...changed},proposal));
 assert.throws(()=>validateActivation(active,receipt,pending));
});
test('Disabled server starts without credentials, budget, weights or external inference',async()=>{
 const runtime=await createServerRuntime({...manifest,port:18787},{proposal:pending,fetcher:async()=>{throw Error('No network');}});try{await runtime.listen();const health=await fetch('http://127.0.0.1:18787/meal-api/health');assert.deepEqual(await health.json(),{ok:true,inferenceEnabled:false});const inference=await fetch('http://127.0.0.1:18787/meal-api/analyze',{method:'POST',headers:{Origin:manifest.origin},body:'{}'});assert.equal(inference.status,401);}finally{await runtime.close();}
});
test('Runtime passes the single concurrency slot to the HTTP server',async()=>{
 let options;const runtime=await createServerRuntime(manifest,{proposal:pending,createApi:value=>{options=value;return {close:async()=>{}};}});await runtime.close();assert.equal(options.maxConcurrent,1);assert.equal(options.env.LIVE_ENABLED,'false');
});
