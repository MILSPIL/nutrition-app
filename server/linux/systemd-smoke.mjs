// Runs ONLY inside the disposable systemd container. Synthetic state; no provider network.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,rmSync,copyFileSync,existsSync,readdirSync,chownSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {exportBudget,sendTransfer} from '../transfer-operations.mjs';
import {localBudget} from '../../scripts/phone-lab/sqlite.mjs';
import {inspectLedger,PILOT_CAP} from '../ledger.mjs';
const root='/opt/scisense/current',unit='scisense-api.service',steps=[];
if(readFileSync('/proc/1/comm','utf8').trim()!=='systemd'||process.env.container!=='docker')throw Error('disposable_container_required');
const run=(command,args,input)=>{const r=spawnSync(command,args,{input,timeout:15000,maxBuffer:65536});if(r.status!==0)throw Error('fixture_command_failed:'+command+':'+args[1]);return r.stdout.toString().trim();};
const ctl=(...args)=>run('systemctl',args);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function ready(enabled){
 for(let i=0;i<100;i++){
  try{const response=await fetch('http://127.0.0.1:8787/meal-api/health',{signal:AbortSignal.timeout(500)});const d=await response.json();if(d.ok&&d.inferenceEnabled===enabled)return;}catch{}
  await delay(100);
 }
 throw Error('health_not_ready:'+enabled);
}
async function refused(status){
 for(let i=0;i<100;i++){
  if(ctl('show',unit,'-p','ActiveState','--value')==='failed'){
   assert.equal(ctl('show',unit,'-p','ExecMainStatus','--value'),String(status));
   await assert.rejects(fetch('http://127.0.0.1:8787/meal-api/health',{signal:AbortSignal.timeout(500)}));return;
  }
  await delay(100);
 }
 throw Error('start_was_not_refused');
}
const start=()=>{if(ctl('show',unit,'-p','ActiveState','--value')==='failed')ctl('reset-failed',unit);spawnSync('systemctl',['start',unit],{timeout:15000,stdio:'ignore'});};
const receiver=(operation,input)=>JSON.parse(run(process.execPath,['server/transfer-cli.mjs',({check:'receive-check',receive:'receive',status:'receive-status'})[operation],'--approved-transfer'],input));
try{
 // PID 1 can exist before the system bus is accepting commands.
 for(let i=0;i<100;i++){if(spawnSync('systemctl',['show','-p','Version','--value'],{timeout:1000,stdio:'ignore'}).status===0)break;if(i===99)throw Error('systemd_not_ready');await delay(100);}
 ctl('daemon-reload');start();await ready(false);
 for(const name of ['groq','anthropic'])assert.equal(existsSync('/etc/credstore.encrypted/scisense-'+name),false);
 const response=await fetch('http://127.0.0.1:8787/meal-api/analyze',{method:'POST',body:'{}',headers:{Origin:'https://ntzg.pp.ua'}});assert.equal(response.status,401);
 steps.push('disabled unit starts without credentials; inference denied');ctl('stop',unit);
 const proposal=JSON.parse(readFileSync(path.join(root,'workers/meal-parser/pilot-proposal.json'))),stamp=new Date(Date.now()-1000).toISOString();
 Object.assign(proposal,{status:'approved_local_pilot',approvedAt:stamp,fullApproval:{approvedAt:stamp,proposalRevision:proposal.proposalRevision,configHash:proposal.configHash},sttApproval:{approvedAt:stamp,freeTierConfirmedAt:stamp,zeroDataRetentionConfirmedAt:stamp}});proposal.candidateC.PRICING_APPROVED_AT=stamp;
 writeFileSync(path.join(root,'workers/meal-parser/pilot-proposal.json'),JSON.stringify(proposal));
 const manifest=JSON.parse(readFileSync(path.join(root,'server/deployment.json')));manifest.releaseId='a'.repeat(40);writeFileSync(path.join(root,'server/deployment.json'),JSON.stringify(manifest));
 // Seed a separate synthetic paid row AND a free row. The real budget is never available here.
 const sourceFile='/tmp/synthetic-budget.sqlite',bundle='/tmp/synthetic-bundle',lockFile='/tmp/synthetic-lock/pilot.lock';
 const local=localBudget(sourceFile,PILOT_CAP,{initialize:true});
 try{for(const cost of [123456,0]){
  const id=randomUUID(),binding=local.binding.get();
  assert.equal((await binding.fetch(new Request('https://budget',{method:'POST',body:JSON.stringify({action:'reserve',id,uid:'a'.repeat(64),cost})}))).status,200);
  assert.equal((await binding.fetch(new Request('https://budget',{method:'POST',body:JSON.stringify({action:'finish',id})}))).status,200);
 }}finally{local.close();}
 let marker=JSON.stringify({proposal:proposal.proposalId,cap:PILOT_CAP,file:sourceFile});
 const markerStore={read:async()=>marker,write:async value=>{marker=value;}};
 const receipt=await exportBudget({sourceFile,bundle,proposal,lockFile,markerStore});
 assert.deepEqual(readdirSync('/var/lib/scisense'),[]);
 const keys={groq:'gsk_'+'syntheticfixture'.repeat(3),anthropic:'sk-ant-'+'syntheticfixture'.repeat(3)};
 // Exercise the shipped receiver CLI, real systemd-creds and actual empty StateDirectory.
 await sendTransfer({bundle,proposal,releaseId:manifest.releaseId,markerStore,lockFile,readKey:async name=>keys[name],transport:async(op,input)=>receiver(op,input)});
 const staged=receiver('status');assert.equal(staged.phase,'staged_unacknowledged');assert.equal(staged.snapshotMatches,true);assert.equal(staged.budgetNotDecreased,true);
 assert.equal(staged.consumedMicros,123456);assert.equal(staged.reservedCalls,2);assert.equal(staged.activationPresent,false);assert.equal(staged.dropInPresent,false);
 for(const name of ['groq','anthropic'])assert.equal(readFileSync('/etc/credstore.encrypted/scisense-'+name).includes(keys[name]),false);
 steps.push('receiver CLI encrypts synthetic keys; paid/free rows retained without activation');
 const before=readFileSync('/var/lib/scisense/pilot-budget.sqlite'),anchorBefore=readFileSync('/var/lib/scisense/budget-anchor.json'),receiptBefore=readFileSync('/var/lib/scisense/activation.pending.json');
 await assert.rejects(sendTransfer({bundle,proposal,releaseId:manifest.releaseId,markerStore,lockFile,readKey:async()=>{throw Error('must_not_read_keys');},transport:async(op,input)=>receiver(op,input)}));
 assert.deepEqual(readFileSync('/var/lib/scisense/pilot-budget.sqlite'),before);
 start();await ready(false);ctl('stop',unit);steps.push('reimport refused; staged credentials do not activate the base unit');
 Object.assign(manifest,{liveEnabled:true,allowedUids:['synthetic-unit-user']});writeFileSync(path.join(root,'server/deployment.json'),JSON.stringify(manifest));
 mkdirSync('/etc/scisense',{mode:0o755});writeFileSync('/etc/scisense/activation.json',JSON.stringify({...receipt,active:true,approvedReleases:[manifest.releaseId],allowedUids:manifest.allowedUids,pricingConfirmedAt:stamp,sttApprovedAt:stamp}),{mode:0o640});chownSync('/etc/scisense/activation.json',0,10001);
 start();await refused(1);steps.push('live without credential drop-in refused');
 mkdirSync('/etc/systemd/system/scisense-api.service.d');copyFileSync(path.join(root,'deploy/scisense-api.live.conf'),'/etc/systemd/system/scisense-api.service.d/50-live.conf');ctl('daemon-reload');
 rmSync('/etc/credstore.encrypted/scisense-anthropic');start();await refused(243);steps.push('live drop-in with one credential refused by systemd');
 writeFileSync('/etc/credstore.encrypted/scisense-anthropic','corrupt');start();await refused(243);steps.push('corrupt encrypted credential refused by systemd');rmSync('/etc/credstore.encrypted/scisense-anthropic');
 const bytes=Buffer.from(keys.anthropic);try{run('systemd-creds',['--with-key=host','--name=anthropic','encrypt','-','/etc/credstore.encrypted/scisense-anthropic'],bytes);}finally{bytes.fill(0);}
 start();await ready(true);steps.push('two encrypted synthetic credentials start live runtime');
 ctl('restart',unit);await ready(true);ctl('stop',unit);
 const retained=inspectLedger('/var/lib/scisense/pilot-budget.sqlite');assert.deepEqual(retained,{consumedMicros:123456,reservedCalls:2});
 assert.deepEqual(readFileSync('/var/lib/scisense/budget-anchor.json'),anchorBefore);assert.deepEqual(readFileSync('/var/lib/scisense/activation.pending.json'),receiptBefore);
 steps.push('service restart preserves paid/free rows, budget total, receipt and anchor');
 console.log(JSON.stringify({syntheticOnly:true,modelCalls:0,passed:steps.length,steps,retained,systemd:run('systemd',['--version']).split('\n')[0]}));
}catch(error){const diagnostic=spawnSync('journalctl',['-u',unit,'--no-pager','-n','40'],{encoding:'utf8'}).stdout;console.error(JSON.stringify({syntheticOnly:true,passed:steps.length,error:error.message,diagnostic}));process.exitCode=1;}
