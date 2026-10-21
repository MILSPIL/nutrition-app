import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {validateManifest,validateActivation,createServerRuntime} from './runtime.mjs';
const manifest=JSON.parse(await readFile(new URL('./deployment.json',import.meta.url),'utf8')),proposal=JSON.parse(await readFile(new URL('../workers/meal-parser/pilot-proposal.json',import.meta.url),'utf8'));
test('Prepared manifest is disabled and strict production target cannot become demo',()=>{
 assert.equal(manifest.liveEnabled,false);validateManifest(manifest);
 for(const changed of [{firebaseProject:'demo-scisense'},{origin:'https://other.example'},{budgetDirectory:'/opt/scisense/releases/current/budget'},{whisper:{...manifest.whisper,threads:4}},{liveEnabled:true}])assert.throws(()=>validateManifest({...manifest,...changed}));
});
test('Activation binds one proposal, release, UID list, target, price confirmation and budget',()=>{
 const active={...manifest,liveEnabled:true,releaseId:'a'.repeat(40),allowedUids:['synthetic-uid']},receipt={version:1,active:true,proposalId:proposal.proposalId,target:manifest.origin,capMicros:5000000,receiptId:'12345678-1234-1234-1234-123456789abc',consumedMicros:100000,reservedCalls:1,approvedReleases:['a'.repeat(40)],allowedUids:['synthetic-uid'],pricingConfirmedAt:new Date().toISOString()};
 validateActivation(active,receipt,proposal);
 for(const changed of [{active:false},{target:'https://other.example'},{proposalId:'new'},{capMicros:5000001},{approvedReleases:['b'.repeat(40)]},{allowedUids:['stranger']},{consumedMicros:-1},{reservedCalls:-1},{pricingConfirmedAt:null}])assert.throws(()=>validateActivation(active,{...receipt,...changed},proposal));
});
test('Disabled server starts without a credential or budget and refuses paid inference',async()=>{
 const runtime=await createServerRuntime({...manifest,port:18787},{proposal});try{await runtime.listen();const health=await fetch('http://127.0.0.1:18787/meal-api/health');assert.deepEqual(await health.json(),{ok:true,inferenceEnabled:false});const inference=await fetch('http://127.0.0.1:18787/meal-api/analyze',{method:'POST',headers:{Origin:manifest.origin},body:'{}'});assert.equal(inference.status,401);}finally{await runtime.close();}
});
