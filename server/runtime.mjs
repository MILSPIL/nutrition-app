import {openSync,readFileSync,fstatSync,closeSync,constants,realpathSync,lstatSync} from 'node:fs';
import path from 'node:path';
import {createMealApi} from './api.mjs';
import {openServerLedger,PILOT_CAP} from './ledger.mjs';
import {approvedSettings,validateProposal} from '../scripts/phone-lab/approval.mjs';
import {callProvider} from '../workers/meal-parser/src/providers.js';
function fail(){throw Error('server_activation_invalid');}
const validDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=Date.now();
export function validateManifest(manifest){
 if(manifest?.version!==2||manifest.proposalRevision!==2||!/^[a-f0-9]{64}$/.test(manifest.configHash||'')||typeof manifest.liveEnabled!=='boolean'||manifest.firebaseProject!=='nutrition-tracker-ua'||manifest.origin!=='https://ntzg.pp.ua'||!Array.isArray(manifest.allowedUids)||manifest.allowedUids.some(uid=>typeof uid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(uid))||!Number.isInteger(manifest.port)||manifest.port<1024||manifest.port>65535||manifest.budgetDirectory!=='/var/lib/scisense'||manifest.activationFile!=='/etc/scisense/activation.json'||JSON.stringify(manifest.credentialNames)!=='["groq","anthropic"]'||manifest.maxConcurrent!==1||manifest.transcription?.provider!=='groq'||manifest.transcription?.model!=='whisper-large-v3'||manifest.transcription?.accountTier!=='free'||manifest.transcription?.timeoutMs!==45000)fail();
 if(manifest.liveEnabled&&(!/^[a-f0-9]{40}$/.test(manifest.releaseId)||!manifest.allowedUids.length||new Set(manifest.allowedUids).size!==manifest.allowedUids.length))fail();
 return manifest;
}
export function validateActivation(manifest,receipt,proposal){
 validateManifest(manifest);validateProposal(proposal);
 const sorted=values=>JSON.stringify([...values].sort());
 if(!manifest.liveEnabled||receipt?.active!==true||receipt.version!==2||receipt.proposalId!==proposal.proposalId||receipt.proposalRevision!==proposal.proposalRevision||receipt.configHash!==proposal.configHash||manifest.configHash!==proposal.configHash||receipt.target!==manifest.origin||receipt.capMicros!==PILOT_CAP||!Number.isSafeInteger(receipt.consumedMicros)||receipt.consumedMicros<0||receipt.consumedMicros>PILOT_CAP||!Number.isSafeInteger(receipt.reservedCalls)||receipt.reservedCalls<0||!/^[a-f0-9-]{36}$/.test(receipt.receiptId||'')||!Array.isArray(receipt.approvedReleases)||!receipt.approvedReleases.includes(manifest.releaseId)||!Array.isArray(receipt.allowedUids)||sorted(receipt.allowedUids)!==sorted(manifest.allowedUids)||!validDate(receipt.pricingConfirmedAt)||receipt.pricingConfirmedAt!==proposal.approvedAt||receipt.sttApprovedAt!==proposal.sttApproval?.approvedAt)fail();
 approvedSettings(proposal);return receipt;
}
function readProtected(file,{owner,secret=false}={}){
 const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{
  // systemd may retain root ownership and grant the service a read-only ACL (mode 0440).
  const stat=fstatSync(fd),ownerValid=stat.uid===owner||(secret&&stat.uid===0);
  if(!stat.isFile()||stat.size>65536||!ownerValid||(stat.mode&(secret?0o337:0o022))!==0)fail();return readFileSync(fd);
 }finally{closeSync(fd);}
}
export async function createServerRuntime(manifest,{proposal,createApi=createMealApi,fetcher=fetch}={}){
 validateManifest(manifest);
 const env={FIREBASE_PROJECT:manifest.firebaseProject,ALLOWED_ORIGINS:manifest.origin,ALLOWED_UIDS:manifest.allowedUids.join(',')||'disabled',LIVE_ENABLED:'false'};
 let budget,api;
 const clear=()=>{env.LIVE_ENABLED='false';delete env.ANTHROPIC_API_KEY;delete env.GROQ_API_KEY;};
 try{
  if(manifest.liveEnabled){
   const receipt=validateActivation(manifest,JSON.parse(readProtected(manifest.activationFile,{owner:0}).toString('utf8')),proposal);
   budget=openServerLedger({directory:manifest.budgetDirectory,receipt,groqFree:true,onFault:()=>{env.LIVE_ENABLED='false';}});
   const dir=process.env.CREDENTIALS_DIRECTORY;
   if(dir!=='/run/credentials/scisense-api.service'||realpathSync(dir)!==dir)fail();
   const directory=lstatSync(dir);if(!directory.isDirectory()||![0,process.getuid()].includes(directory.uid)||(directory.mode&0o227)!==0)fail();
   for(const name of manifest.credentialNames){
    const bytes=readProtected(path.join(dir,name),{owner:process.getuid(),secret:true});
    try{const secret=bytes.toString('utf8').trim();if(!(name==='groq'?/^gsk_[A-Za-z0-9_-]{16,}$/:/^sk-ant-[A-Za-z0-9_-]{16,}$/).test(secret))fail();env[name==='groq'?'GROQ_API_KEY':'ANTHROPIC_API_KEY']=secret;}finally{bytes.fill(0);}
   }
   Object.assign(env,approvedSettings(proposal),{PILOT_BUDGET:budget.binding});
  }
  const provider=(kind,payload,settings,context)=>callProvider(kind,payload,settings,fetcher,{...context,timeoutMs:manifest.transcription.timeoutMs});
  api=createApi({env,provider,maxConcurrent:manifest.maxConcurrent});
  return {listen:()=>api.listen(manifest.port),async close(){clear();await api.close();budget?.close();}};
 }catch{clear();budget?.close();throw Error('server_start_refused');}
}
