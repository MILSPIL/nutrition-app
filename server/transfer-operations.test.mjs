import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,rmSync,readFileSync,writeFileSync,copyFileSync,constants,existsSync,readdirSync,chmodSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {spawnSync} from 'node:child_process';
import {exportBudget,sendTransfer,receiveTransfer,assertReceiverReady,inspectTransferStatus,readTransferBundle,sshTransport,readBoundedInput,MAX_TRANSFER_BYTES} from './transfer-operations.mjs';
import {localBudget} from '../scripts/phone-lab/sqlite.mjs';
import {acquirePilotLock} from '../scripts/phone-lab/pilot-lock.mjs';
import {openServerLedger,PILOT_CAP} from './ledger.mjs';
const proposal=JSON.parse(readFileSync(new URL('../workers/meal-parser/pilot-proposal.json',import.meta.url)));
const base=JSON.parse(readFileSync(new URL('./deployment.json',import.meta.url)));
const keys={groq:'gsk_'+'synthetic'.repeat(5),anthropic:'sk-ant-'+'synthetic'.repeat(5)},releaseId='a'.repeat(40);
async function fixture(fn,{exported=true,emptyDirectory=false}={}){
 const root=realpathSync(mkdtempSync(path.join(tmpdir(),'scisense-transfer-ops-'))),sourceFile=path.join(root,'local.sqlite'),bundle=path.join(root,'bundle'),lockFile=path.join(root,'pilot.lock');let marker=JSON.stringify({proposal:proposal.proposalId,cap:PILOT_CAP,file:sourceFile}),readKeys=0,encryptions=0;
 const markerStore={read:async()=>marker,write:async value=>{marker=value;}};
 const local=localBudget(sourceFile,PILOT_CAP,{initialize:true});for(const cost of [123456,0]){const id=randomUUID(),binding=local.binding.get();assert.equal((await binding.fetch(new Request('https://budget',{method:'POST',body:JSON.stringify({action:'reserve',id,uid:'a'.repeat(64),cost})}))).status,200);await binding.fetch(new Request('https://budget',{method:'POST',body:JSON.stringify({action:'finish',id})}));}local.close();
 const options={sourceFile,bundle,proposal,markerStore,lockFile};
 const receiver={manifest:{...base,releaseId},proposal,directory:path.join(root,'server-state'),credentialDirectory:path.join(root,'encrypted'),workDirectory:path.join(root,'transfer-work'),activationFile:path.join(root,'activation.json'),dropInFile:path.join(root,'50-live.conf'),owner:{uid:process.getuid()||10001,gid:process.getgid()||10001},serviceInactive:()=>true,
  encrypt:async(name,input,file)=>{encryptions++;writeFileSync(file,'synthetic-ciphertext:'+createHash('sha256').update(input).digest('hex'),{flag:'wx',mode:0o600});}};
 const transport=async(op,input)=>op==='check'?assertReceiverReady(receiver):receiveTransfer(Buffer.from(input),receiver);
 const sendOptions={bundle,proposal,releaseId,markerStore,readKey:async name=>{readKeys++;return keys[name];},transport,lockFile};
 try{
  if(emptyDirectory)mkdirSync(receiver.directory,{mode:0o700});
  const receipt=exported?await exportBudget(options):null;
  await fn({root,options,receiver,sendOptions,receipt,marker:()=>marker,keyReads:()=>readKeys,encryptions:()=>encryptions});
 }finally{rmSync(root,{recursive:true,force:true});}
}
test('T01 export-send-receive preserves paid/free rows and supports systemd empty StateDirectory',()=>fixture(async({receiver,sendOptions,receipt,marker})=>{
 const result=await sendTransfer(sendOptions);assert.equal(result.consumedMicros,123456);assert.equal(result.reservedCalls,2);assert.equal(result.liveEnabled,false);assert.ok(marker().includes('permanently_transferred'));
 assert.equal(existsSync(receiver.activationFile),false);assert.equal(existsSync(receiver.dropInFile),false);
 for(const name of ['groq','anthropic'])assert.equal(readFileSync(path.join(receiver.credentialDirectory,'scisense-'+name),'utf8').includes(keys[name]),false);
 for(let i=0;i<2;i++){const ledger=openServerLedger({directory:receiver.directory,receipt});assert.equal(ledger.spent(),123456);ledger.close();}
},{emptyDirectory:true}));
test('T02 active/stale shared lock refuses export before touching the marker',()=>fixture(async({options,marker})=>{
 const old=marker(),unlock=acquirePilotLock(options.lockFile);
 try{await assert.rejects(exportBudget(options));assert.equal(marker(),old);assert.equal(existsSync(options.bundle),false);}finally{unlock();}
},{exported:false}));
test('T03 failed permanent marker confirmation never creates a transferable bundle',()=>fixture(async({options,marker})=>{
 const old=marker();await assert.rejects(exportBudget({...options,markerStore:{read:async()=>old,write:async()=>{}}}));assert.equal(existsSync(options.bundle),false);
},{exported:false}));
test('T04 interrupted upload keeps local fence, and explicit resend uses the same receipt',()=>fixture(async({sendOptions,marker,receiver,receipt})=>{
 let captured;await assert.rejects(sendTransfer({...sendOptions,transport:async(op,input)=>{if(op==='check')return assertReceiverReady(receiver);captured=input;throw Error('synthetic_disconnect');}}));
 assert.ok(captured.every(byte=>byte===0));assert.ok(marker().includes('permanently_transferred'));assert.equal(existsSync(receiver.directory),false);
 const result=await sendTransfer(sendOptions);assert.equal(result.receiptId,receipt.receiptId);
}));
test('T05 wrong hash and stale marker fail before any credential read or receiver write',()=>fixture(async({options,sendOptions,keyReads,receiver})=>{
 await assert.rejects(sendTransfer({...sendOptions,markerStore:{read:async()=>JSON.stringify({state:'permanently_transferred'})}}));
 const file=path.join(options.bundle,'transfer.json'),receipt=JSON.parse(readFileSync(file));writeFileSync(file,JSON.stringify({...receipt,ledgerSha256:'0'.repeat(64)}));
 await assert.rejects(sendTransfer(sendOptions));assert.equal(keyReads(),0);assert.equal(existsSync(receiver.directory),false);
}));
test('T06 missing credential and receiver preflight mismatch cannot stage or activate',()=>fixture(async({sendOptions,receiver,keyReads})=>{
 await assert.rejects(sendTransfer({...sendOptions,transport:async()=>({ready:true,releaseId:'b'.repeat(40),configHash:proposal.configHash})}));assert.equal(keyReads(),0);
 await assert.rejects(sendTransfer({...sendOptions,readKey:async name=>name==='groq'?keys.groq:''}));assert.equal(existsSync(receiver.directory),false);
}));
test('T07 corrupt packet, active service and an existing activation refuse before encryption',()=>fixture(async({sendOptions,receiver,encryptions})=>{
 for(const change of [packet=>{packet.receipt.ledgerSha256='0'.repeat(64);},packet=>{packet.releaseId='b'.repeat(40);},packet=>{packet.credentials.anthropic='invalid';}]){
  await assert.rejects(sendTransfer({...sendOptions,transport:async(op,input)=>{if(op==='check')return assertReceiverReady(receiver);const packet=JSON.parse(input);change(packet);return receiveTransfer(Buffer.from(JSON.stringify(packet)),receiver);}}));
 }
 assert.equal(encryptions(),0);assert.throws(()=>assertReceiverReady({...receiver,serviceInactive:()=>false}));
 writeFileSync(receiver.activationFile,'{}');assert.throws(()=>assertReceiverReady(receiver));assert.equal(existsSync(receiver.directory),false);
}));
test('T08 encryption failure cleans owned staging and preserves the permanent source fence',()=>fixture(async({sendOptions,receiver,marker})=>{
 const original=receiver.encrypt;receiver.encrypt=async(name,input,file)=>{if(name==='anthropic')throw Error('synthetic_encrypt_failure');return original(name,input,file);};
 await assert.rejects(sendTransfer(sendOptions));assert.ok(marker().includes('permanently_transferred'));assert.equal(existsSync(receiver.directory),false);
 assert.deepEqual(readdirSync(receiver.workDirectory),[]);assert.equal(existsSync(receiver.activationFile),false);
}));
test('T09 lost acknowledgement and reimport never replace server state or reset budget',()=>fixture(async({sendOptions,receiver,receipt})=>{
 const real=sendOptions.transport;await assert.rejects(sendTransfer({...sendOptions,transport:async(op,input)=>{const result=await real(op,input);if(op==='receive')throw Error('synthetic_ack_lost');return result;}}));
 const ledger=openServerLedger({directory:receiver.directory,receipt});assert.equal(ledger.spent(),123456);ledger.close();
 const before=readFileSync(path.join(receiver.directory,'pilot-budget.sqlite'));await assert.rejects(sendTransfer(sendOptions));assert.deepEqual(readFileSync(path.join(receiver.directory,'pilot-budget.sqlite')),before);
 assert.equal(existsSync(receiver.activationFile),false);assert.equal(existsSync(receiver.dropInFile),false);
}));
test('T10 symlinks, unsafe directories and a second export are rejected',()=>fixture(async({root,options,receiver})=>{
 await assert.rejects(exportBudget({...options,bundle:path.join(root,'second')}));
 symlinkSync(path.join(root,'absent'),receiver.activationFile);assert.throws(()=>assertReceiverReady(receiver));rmSync(receiver.activationFile);
 mkdirSync(receiver.directory,{mode:0o755});assert.throws(()=>assertReceiverReady(receiver));chmodSync(receiver.directory,0o700);writeFileSync(path.join(receiver.directory,'preserve'),'state');assert.throws(()=>assertReceiverReady(receiver));
}));
test('T11 SSH pins host verification and carries credentials only through stdin',()=>fixture(async({root})=>{
 const knownHostsFile=path.join(root,'known_hosts');writeFileSync(knownHostsFile,'synthetic host record',{mode:0o600});let called;
 const transport=sshTransport({host:'synthetic.invalid',user:'root',port:22,knownHostsFile},async(command,args,options)=>{called={command,args,options};return Buffer.from('{"ready":true}');});
 const packet=Buffer.from(JSON.stringify(keys));await transport('receive',packet);
 assert.equal(called.command,'/usr/bin/ssh');assert.ok(called.args.includes('StrictHostKeyChecking=yes'));assert.ok(called.args.includes('BatchMode=yes'));assert.ok(called.args.includes('IdentityFile=none'));assert.equal(called.options.input,packet);
 for(const value of Object.values(keys))assert.equal(called.args.join(' ').includes(value),false);
 assert.throws(()=>sshTransport({host:'host; echo bad',user:'root',port:22,knownHostsFile}));await assert.rejects(transport('arbitrary-command',packet));
}));
test('T12 bounded stdin and CLI help/unapproved commands have no external side effects',async()=>{
 assert.equal((await readBoundedInput(Readable.from([Buffer.from('synthetic')]))).toString(),'synthetic');
 await assert.rejects(readBoundedInput(Readable.from([Buffer.alloc(MAX_TRANSFER_BYTES+1)])));
 const hanging=new Readable({read(){}});await assert.rejects(readBoundedInput(hanging,20),/transfer_input_timeout/);
 for(const [args,code] of [[['--help'],0],[['export'],1],[['receive'],1]]){
  const r=spawnSync(process.execPath,['server/transfer-cli.mjs',...args],{env:{...process.env,PATH:'/nonexistent'},encoding:'utf8',timeout:5000});assert.equal(r.status,code);for(const value of Object.values(keys))assert.equal((r.stdout+r.stderr).includes(value),false);
 }
});

test('T13 missing source and marker cannot implicitly create a new five-dollar budget',()=>fixture(async({options})=>{
 rmSync(options.sourceFile);let writes=0;
 await assert.rejects(exportBudget({...options,markerStore:{read:async()=>'',write:async()=>{writes++;}}}),/transfer_source_missing/);
 assert.equal(writes,0);assert.equal(existsSync(options.sourceFile),false);assert.equal(existsSync(options.bundle),false);
},{exported:false}));
test('T14 an interrupted credential install retains state, refuses reimport and stays disabled',()=>fixture(async({sendOptions,receiver,receipt,marker})=>{
 let copies=0;receiver.installCredential=(source,target)=>{if(++copies===2)throw Error('synthetic_install_failure');copyFileSync(source,target,constants.COPYFILE_EXCL);};
 await assert.rejects(sendTransfer(sendOptions));assert.ok(marker().includes('permanently_transferred'));
 assert.equal(existsSync(path.join(receiver.credentialDirectory,'scisense-groq')),true);
 assert.equal(existsSync(receiver.activationFile),false);assert.equal(existsSync(receiver.dropInFile),false);
 const ledger=openServerLedger({directory:receiver.directory,receipt});assert.equal(ledger.spent(),123456);ledger.close();
 const before=readFileSync(path.join(receiver.directory,'pilot-budget.sqlite'));await assert.rejects(sendTransfer(sendOptions));assert.deepEqual(readFileSync(path.join(receiver.directory,'pilot-budget.sqlite')),before);
}));
test('T15 dangling state directory symlink is never replaced by an import',()=>fixture(async({root,receiver,sendOptions})=>{
 symlinkSync(path.join(root,'absent'),receiver.directory);await assert.rejects(sendTransfer(sendOptions));
 assert.equal(existsSync(path.join(root,'absent')),false);
}));

test('T16 fsync failure cannot acknowledge transfer or install state',()=>fixture(async({sendOptions,receiver,marker})=>{
 receiver.persistFile=()=>{throw Error('synthetic_fsync_failure');};
 await assert.rejects(sendTransfer(sendOptions));assert.equal(existsSync(receiver.directory),false);assert.equal(existsSync(receiver.credentialDirectory),false);
 assert.ok(marker().includes('permanently_transferred'));assert.deepEqual(readdirSync(receiver.workDirectory),[]);
}));
test('T17 reconciliation only reads state and distinguishes lost-ack/partial/ledger-only cases',()=>fixture(async({sendOptions,receiver,receipt})=>{
 assert.equal(inspectTransferStatus(receiver).phase,'not_installed');await sendTransfer(sendOptions);
 const file=path.join(receiver.directory,'pilot-budget.sqlite'),before=readFileSync(file),state=inspectTransferStatus(receiver);
 assert.equal(state.phase,'staged_unacknowledged');assert.equal(state.snapshotMatches,true);assert.equal(state.budgetNotDecreased,true);assert.equal(state.receiptId,receipt.receiptId);
 assert.equal(state.requiresReconciliation,true);assert.equal(state.deploymentLiveFlag,false);
 rmSync(path.join(receiver.credentialDirectory,'scisense-anthropic'));assert.equal(inspectTransferStatus(receiver).phase,'partial_credentials');
 rmSync(path.join(receiver.credentialDirectory,'scisense-groq'));assert.equal(inspectTransferStatus(receiver).phase,'ledger_only');assert.deepEqual(readFileSync(file),before);
}));
