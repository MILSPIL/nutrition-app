// Runs only in the owned synthetic container, as the real non-root API unit.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createInternalProcess } from '../server/trainer/internal-process.mjs';
import { createSystemdProcess } from '../server/trainer/systemd-process.mjs';
import { startSystemdWatchdog } from '../server/trainer/systemd-watchdog.mjs';
const {scenario,brokerGid}=JSON.parse(readFileSync('/etc/scisense/personal/scenario.json'));
const mark=value=>{writeFileSync('/var/lib/scisense/stage.tmp',JSON.stringify(value),{mode:0o600});renameSync('/var/lib/scisense/stage.tmp','/var/lib/scisense/stage.json');};
const watchdog=startSystemdWatchdog();watchdog.ready();
let clients=[];
try {
  for(const role of scenario==='happy'?['y','w','payer']:['y']){
    const client=createInternalProcess({spawnWorker:()=>createSystemdProcess({socketPath:'/run/scisense-broker/'+role+'.sock',role,brokerGid}),setup:{padding:'x'.repeat(20000)},handlers:{},deadlineMs:3000,validateIdentity:value=>Number.isInteger(value?.uid)});
    clients.push(client);const identity=await client.start();
    assert.equal(identity.uid,{y:10002,w:10003,payer:10004}[role]);
    for(const key of ['execDeniedInOldThread','forkDeniedInOldThread','newThreadAllowed','nodeKeyDenied','privateTmpfs'])assert.equal(identity[key],true,key);
    if(role==='y')assert.equal(identity.foreignHomeDenied,true);
    assert.equal(identity.networkDenied,role!=='payer');
  }
  if(scenario==='happy'){
    assert.equal((await clients[0].call('ttl')).expiredRawRemovedWhileIdle,true);
    assert.equal((await clients[2].call('timerCycle')).oldDeadlineDidNotKillNewTurn,true);
    const pending=assert.rejects(clients[2].call('killTimer'),/execution_unknown/);
    await pending;await clients[2].close();assert.equal(clients[2].exited,true);
    mark({stage:'complete',passed:true,checks:25});
  }else{
    mark({stage:'ready',passed:true});
    if(scenario==='backpressure')clients[0].call('blocked',{padding:'x'.repeat(48*1024*1024-1000)}).catch(()=>{});
    await clients[0].waitForExit();mark({stage:'drained',passed:true});
  }
}catch(error){mark({stage:'failed',passed:false,error:error.message.slice(0,100)});process.exitCode=1;}
finally {await Promise.allSettled(clients.map(client=>client.close()));watchdog.close();}
