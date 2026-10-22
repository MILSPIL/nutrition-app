// Explicit transfer operations. Import is inert; tests inject stores, transport and OS operations.
import {existsSync,lstatSync,realpathSync,readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,readdirSync,renameSync,copyFileSync,constants,chmodSync,chownSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {prepareTransfer,stageTransfer} from './transfer.mjs';
import {privateFile,inspectLedger,openServerLedger,PILOT_CAP} from './ledger.mjs';
import {validateManifest} from './runtime.mjs';
import {validateProposal} from '../scripts/phone-lab/approval.mjs';
import {acquirePilotLock} from '../scripts/phone-lab/pilot-lock.mjs';
export const MAX_TRANSFER_BYTES=8*1024*1024;
const fail=()=>{throw Error('transfer_refused');};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const secretValid=(name,value)=>typeof value==='string'&&value.length<=4096&&(name==='groq'?/^gsk_[A-Za-z0-9_-]{16,}$/:/^sk-ant-[A-Za-z0-9_-]{16,}$/).test(value);
const statIfPresent=file=>{try{return lstatSync(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}};
const privateDirectory=directory=>{const s=lstatSync(directory);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)!==0||realpathSync(directory)!==directory)fail();};
const syncDirectory=directory=>{const fd=openSync(directory,'r');try{fsyncSync(fd);}finally{closeSync(fd);}};
const syncFile=file=>{const fd=openSync(file,'r');try{fsyncSync(fd);}finally{closeSync(fd);}};
const installCiphertext=(source,target)=>{copyFileSync(source,target,constants.COPYFILE_EXCL);chmodSync(target,0o600);syncFile(target);syncDirectory(path.dirname(target));};
function validateReceipt(receipt,proposal){
 validateProposal(proposal);
 if(receipt?.version!==2||receipt.proposalId!==proposal.proposalId||receipt.proposalRevision!==proposal.proposalRevision||receipt.configHash!==proposal.configHash||receipt.target!=='https://ntzg.pp.ua'||receipt.capMicros!==PILOT_CAP||receipt.liveEnabled!==false||!/^[a-f0-9-]{36}$/.test(receipt.receiptId||'')||!/^[a-f0-9]{64}$/.test(receipt.ledgerSha256||'')||!Number.isSafeInteger(receipt.consumedMicros)||receipt.consumedMicros<0||receipt.consumedMicros>PILOT_CAP||!Number.isSafeInteger(receipt.reservedCalls)||receipt.reservedCalls<0)fail();
 return receipt;
}
export function readTransferBundle(bundle,proposal){
 privateDirectory(bundle);privateFile(path.join(bundle,'transfer.json'));privateFile(path.join(bundle,'pilot-budget.sqlite'));
 if(lstatSync(path.join(bundle,'transfer.json')).size>65536||lstatSync(path.join(bundle,'pilot-budget.sqlite')).size>MAX_TRANSFER_BYTES/2)fail();
 const receipt=validateReceipt(JSON.parse(readFileSync(path.join(bundle,'transfer.json'),'utf8')),proposal),ledger=readFileSync(path.join(bundle,'pilot-budget.sqlite'));
 const state=inspectLedger(path.join(bundle,'pilot-budget.sqlite'));
 if(sha(ledger)!==receipt.ledgerSha256||state.consumedMicros!==receipt.consumedMicros||state.reservedCalls!==receipt.reservedCalls)fail();
 return {receipt,ledger};
}
export async function exportBudget({sourceFile,bundle,proposal,markerStore,lockFile}){
 // A running lab owns the same global lock. Never signal an unverified PID or remove a stale lock.
 // prepareTransfer acquires it BEFORE reading or writing the marker, closing the startup race.
 return prepareTransfer({sourceFile,proposalId:proposal.proposalId,proposal,destination:bundle,markerStore,lockFile,requireExisting:true,stopLocal:async()=>!lockFile||!existsSync(lockFile)});
}
function verifyPermanent(marker,receipt){
 let value;try{value=JSON.parse(marker);}catch{fail();}
 if(value.state!=='permanently_transferred'||typeof value.sourceFile!=='string'||!path.isAbsolute(value.sourceFile))fail();
 for(const key of ['version','proposalId','proposalRevision','configHash','capMicros','target','receiptId','consumedMicros','reservedCalls'])if(value[key]!==receipt[key])fail();
}
export async function sendTransfer({bundle,proposal,releaseId,markerStore,readKey,transport,lockFile}){
 if(!/^[a-f0-9]{40}$/.test(releaseId||''))fail();
 const unlock=acquirePilotLock(lockFile);let packet;
 try{
  const {receipt,ledger}=readTransferBundle(bundle,proposal);verifyPermanent(await markerStore.read(),receipt);
  const ready=await transport('check');
  if(ready?.ready!==true||ready.releaseId!==releaseId||ready.configHash!==proposal.configHash)fail();
  const credentials={};
  try{
   for(const name of ['groq','anthropic']){credentials[name]=(await readKey(name)).trim();if(!secretValid(name,credentials[name]))fail();}
   packet=Buffer.from(JSON.stringify({version:1,releaseId,receipt,ledger:ledger.toString('base64'),credentials}));
  }finally{for(const name of Object.keys(credentials))delete credentials[name];ledger.fill(0);}
  if(packet.length>MAX_TRANSFER_BYTES)fail();
  const result=await transport('receive',packet);
  if(result?.staged!==true||result.liveEnabled!==false||result.receiptId!==receipt.receiptId||result.releaseId!==releaseId||result.ledgerSha256!==receipt.ledgerSha256)fail();
  return {staged:true,liveEnabled:false,receiptId:receipt.receiptId,releaseId,consumedMicros:receipt.consumedMicros,reservedCalls:receipt.reservedCalls};
 }finally{packet?.fill(0);unlock();}
}
export function assertReceiverReady({manifest,proposal,directory,credentialDirectory,activationFile,dropInFile,serviceInactive}){
 validateManifest(manifest);validateProposal(proposal);
 if(manifest.liveEnabled||manifest.configHash!==proposal.configHash||!/^[a-f0-9]{40}$/.test(manifest.releaseId||'')||serviceInactive()!==true)fail();
 if(statIfPresent(directory)){privateDirectory(directory);if(readdirSync(directory).length)fail();}
 if(statIfPresent(credentialDirectory)){privateDirectory(credentialDirectory);}
 for(const file of [activationFile,dropInFile,...['groq','anthropic'].map(name=>path.join(credentialDirectory,'scisense-'+name))]){
  // lstat catches dangling symlinks too; never import over any existing deployment state.
  try{lstatSync(file);fail();}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 return {ready:true,releaseId:manifest.releaseId,configHash:proposal.configHash};
}
export async function receiveTransfer(input,options){
 try{return await receiveChecked(input,options);}finally{if(Buffer.isBuffer(input))input.fill(0);}
}
async function receiveChecked(input,options){
 const {manifest,proposal,directory,credentialDirectory,workDirectory,encrypt,owner}=options;
 if(!Buffer.isBuffer(input)||input.length>MAX_TRANSFER_BYTES||!Number.isInteger(owner?.uid)||owner.uid<1||!Number.isInteger(owner.gid)||owner.gid<1)fail();
 assertReceiverReady(options);
 mkdirSync(workDirectory,{recursive:true,mode:0o700});privateDirectory(workDirectory);
 const unlock=acquirePilotLock(path.join(workDirectory,'import.lock'));let temporary,ledger;
 try{
  assertReceiverReady(options); // A concurrent receiver may have completed while this one waited.
  const packet=JSON.parse(input.toString('utf8')),receipt=validateReceipt(packet.receipt,proposal);
  if(packet.version!==1||packet.releaseId!==manifest.releaseId||typeof packet.ledger!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(packet.ledger)||!packet.credentials||Object.keys(packet.credentials).sort().join(',')!=='anthropic,groq')fail();
  for(const name of ['groq','anthropic'])if(!secretValid(name,packet.credentials[name]))fail();
  ledger=Buffer.from(packet.ledger,'base64');if(ledger.length>MAX_TRANSFER_BYTES/2||ledger.toString('base64')!==packet.ledger||sha(ledger)!==receipt.ledgerSha256)fail();
  temporary=mkdtempSync(path.join(workDirectory,'incoming-'));
  const bundle=path.join(temporary,'bundle');mkdirSync(bundle,{mode:0o700});
  writeFileSync(path.join(bundle,'pilot-budget.sqlite'),ledger,{mode:0o600,flag:'wx'});
  writeFileSync(path.join(bundle,'transfer.json'),JSON.stringify(receipt),{mode:0o600,flag:'wx'});
  const staged=path.join(temporary,'state');stageTransfer({bundle,directory:staged});
  // Check the SQLite receipt binding as well as aggregate counts before any credential install.
  const check=openServerLedger({directory:staged,receipt,groqFree:true});check.close();
  for(const name of ['groq','anthropic']){
   const bytes=Buffer.from(packet.credentials[name]);delete packet.credentials[name];
   try{await encrypt(name,bytes,path.join(temporary,name));}finally{bytes.fill(0);}
   privateFile(path.join(temporary,name));
  }
  assertReceiverReady(options);
  // systemd may already have created an empty StateDirectory. POSIX rename replaces only an
  // empty directory; an existing ledger/nonempty directory is never removed or overwritten.
  for(const name of readdirSync(staged)){chownSync(path.join(staged,name),owner.uid,owner.gid);(options.persistFile||syncFile)(path.join(staged,name));}
  chownSync(staged,owner.uid,owner.gid);syncDirectory(staged);renameSync(staged,directory);syncDirectory(path.dirname(directory));
  mkdirSync(credentialDirectory,{recursive:true,mode:0o700});privateDirectory(credentialDirectory);
  for(const name of ['groq','anthropic']){
   (options.installCredential||installCiphertext)(path.join(temporary,name),path.join(credentialDirectory,'scisense-'+name));
  }
  // No activation file, live drop-in or systemctl start is written/run here.
  return {staged:true,liveEnabled:false,receiptId:receipt.receiptId,releaseId:manifest.releaseId,ledgerSha256:receipt.ledgerSha256};
 }finally{ledger?.fill(0);input.fill(0);if(temporary)rmSync(temporary,{recursive:true,force:true});unlock();}
}
export function runPrivateCommand(command,args,{input,timeout=45000}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{stdio:['pipe','pipe','ignore']}),chunks=[];let size=0;
  const timer=setTimeout(()=>child.kill('SIGKILL'),timeout);
  child.on('error',()=>{clearTimeout(timer);reject(Error('transfer_command_failed'));});
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>65536)child.kill('SIGKILL');else chunks.push(chunk);});
  child.stdin.on('error',()=>{});
  child.on('close',code=>{clearTimeout(timer);if(code===0&&size<=65536)resolve(Buffer.concat(chunks));else reject(Error('transfer_command_failed'));});
  child.stdin.end(input);
 });
}
export function sshTransport(config,run=runPrivateCommand){
 if(!config||typeof config.host!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/.test(config.host)||!/^[a-z_][a-z0-9_-]{0,31}$/.test(config.user||'')||!Number.isInteger(config.port)||config.port<1||config.port>65535||!path.isAbsolute(config.knownHostsFile||'')||/[\r\n\0]/.test(config.knownHostsFile))fail();
 const known=lstatSync(config.knownHostsFile);if(!known.isFile()||known.isSymbolicLink()||(known.mode&0o022)!==0||known.size===0)fail();
 const args=['-F','/dev/null','-T','-a','-x','-o','BatchMode=yes','-o','IdentityFile=none','-o','StrictHostKeyChecking=yes','-o','GlobalKnownHostsFile=/dev/null','-o','UserKnownHostsFile='+config.knownHostsFile,'-o','ClearAllForwardings=yes','-o','ConnectionAttempts=1','-o','ConnectTimeout=10','-p',String(config.port),'-l',config.user,config.host];
 return async(operation,input)=>{
  if(!['check','receive','status'].includes(operation))fail();
  const remote='/opt/scisense/node/bin/node /opt/scisense/current/server/transfer-cli.mjs '+({check:'receive-check',receive:'receive',status:'receive-status'})[operation]+' --approved-transfer';
  const output=await run('/usr/bin/ssh',[...args,remote],{input});
  try{return JSON.parse(output.toString('utf8'));}finally{output.fill(0);}
 };
}
export async function readBoundedInput(stream,timeoutMs=30000){
 const chunks=[];let size=0;const timer=setTimeout(()=>stream.destroy(Error('transfer_input_timeout')),timeoutMs);
 try{for await(const chunk of stream){size+=chunk.length;if(size>MAX_TRANSFER_BYTES)fail();chunks.push(chunk);}return Buffer.concat(chunks);}
 finally{clearTimeout(timer);for(const chunk of chunks)chunk.fill(0);}
}

// Read-only reconciliation: metadata/ledger only, never decrypt credentials or change locks.
export function inspectTransferStatus(options){
 const {manifest,proposal,directory,credentialDirectory,activationFile,dropInFile,workDirectory}=options;
 validateManifest(manifest);validateProposal(proposal);
 const credentials=Object.fromEntries(['groq','anthropic'].map(name=>{const file=path.join(credentialDirectory,'scisense-'+name),stat=statIfPresent(file);if(stat)privateFile(file);return [name,!!stat];}));
 const result={deploymentLiveFlag:manifest.liveEnabled,serviceInactive:options.serviceInactive(),activationPresent:!!statIfPresent(activationFile),dropInPresent:!!statIfPresent(dropInFile),importLockPresent:!!statIfPresent(path.join(workDirectory,'import.lock')),credentials,requiresReconciliation:true};
 if(!statIfPresent(directory))return {...result,phase:Object.values(credentials).some(Boolean)?'credentials_without_ledger':'not_installed'};
 privateDirectory(directory);
 if(!readdirSync(directory).length)return {...result,phase:Object.values(credentials).some(Boolean)?'credentials_without_ledger':'not_installed'};
 const receiptFile=path.join(directory,'activation.pending.json');privateFile(receiptFile);if(lstatSync(receiptFile).size>65536)fail();
 const receipt=validateReceipt(JSON.parse(readFileSync(receiptFile,'utf8')),proposal),file=path.join(directory,'pilot-budget.sqlite'),state=inspectLedger(file);
 const count=Object.values(credentials).filter(Boolean).length;
 return {...result,phase:count===0?'ledger_only':count===1?'partial_credentials':'staged_unacknowledged',receiptId:receipt.receiptId,configHash:receipt.configHash,ledgerSha256:receipt.ledgerSha256,snapshotMatches:sha(readFileSync(file))===receipt.ledgerSha256,budgetNotDecreased:state.consumedMicros>=receipt.consumedMicros&&state.reservedCalls>=receipt.reservedCalls,...state};
}
