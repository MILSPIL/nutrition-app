import {openSync,readFileSync,fstatSync,closeSync,constants,realpathSync} from 'node:fs';
import path from 'node:path';
import {createMealApi} from './api.mjs';
import {openServerLedger,PILOT_CAP} from './ledger.mjs';
import {approvedSettings} from '../scripts/phone-lab/live.mjs';
import {verifyWhisper,createWhisper} from '../scripts/phone-lab/whisper.mjs';
import {callProvider} from '../workers/meal-parser/src/providers.js';
function fail(){throw Error('server_activation_invalid');}
export function validateManifest(manifest){
 if(manifest?.version!==1||typeof manifest.liveEnabled!=='boolean'||manifest.firebaseProject!=='nutrition-tracker-ua'||manifest.origin!=='https://ntzg.pp.ua'||!Array.isArray(manifest.allowedUids)||manifest.allowedUids.some(uid=>typeof uid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(uid))||!Number.isInteger(manifest.port)||manifest.port<1024||manifest.port>65535||manifest.budgetDirectory!=='/var/lib/scisense'||manifest.activationFile!=='/etc/scisense/activation.json'||manifest.credentialName!=='anthropic'||manifest.whisper?.threads!==1||manifest.whisper?.timeoutMs!==45000)fail();
 if(manifest.liveEnabled&&(!/^[a-f0-9]{40}$/.test(manifest.releaseId)||!manifest.allowedUids.length||new Set(manifest.allowedUids).size!==manifest.allowedUids.length))fail();
 return manifest;
}
export function validateActivation(manifest,receipt,proposal){
 validateManifest(manifest);
 const sorted=values=>JSON.stringify([...values].sort());
 if(!manifest.liveEnabled||receipt?.active!==true||receipt.version!==1||receipt.proposalId!==proposal.proposalId||receipt.target!==manifest.origin||receipt.capMicros!==PILOT_CAP||!Number.isSafeInteger(receipt.consumedMicros)||receipt.consumedMicros<0||receipt.consumedMicros>PILOT_CAP||!Number.isSafeInteger(receipt.reservedCalls)||receipt.reservedCalls<0||!/^[a-f0-9-]{36}$/.test(receipt.receiptId||'')||!Array.isArray(receipt.approvedReleases)||!receipt.approvedReleases.includes(manifest.releaseId)||!Array.isArray(receipt.allowedUids)||sorted(receipt.allowedUids)!==sorted(manifest.allowedUids)||!Number.isFinite(Date.parse(receipt.pricingConfirmedAt))||Date.parse(receipt.pricingConfirmedAt)>Date.now()+300000)fail();
 approvedSettings(proposal);return receipt;
}
function readProtected(file,{owner,secret=false}={}){
 const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{
  const stat=fstatSync(fd);if(!stat.isFile()||stat.size>65536||stat.uid!==owner||(stat.mode&(secret?0o177:0o022))!==0)fail();return readFileSync(fd);
 }finally{closeSync(fd);}
}
export async function createServerRuntime(manifest,{proposal}={}){
 validateManifest(manifest);
 const env={FIREBASE_PROJECT:manifest.firebaseProject,ALLOWED_ORIGINS:manifest.origin,ALLOWED_UIDS:manifest.allowedUids.join(',')||'disabled',LIVE_ENABLED:'false'};
 let budget,whisper,api;
 try{
  if(manifest.liveEnabled){
   // Only the root-owned, separately approved activation can unlock an installed release.
   const receipt=validateActivation(manifest,JSON.parse(readProtected(manifest.activationFile,{owner:0}).toString('utf8')),proposal);
   budget=openServerLedger({directory:manifest.budgetDirectory,receipt,onFault:()=>{env.LIVE_ENABLED='false';}});
   await verifyWhisper(manifest.whisper);
   const dir=process.env.CREDENTIALS_DIRECTORY;if(!dir||!path.isAbsolute(dir)||realpathSync(dir)!==dir)fail();
   const bytes=readProtected(path.join(dir,'anthropic'),{owner:process.getuid(),secret:true});
   try{const secret=bytes.toString('utf8').trim();if(!/^sk-ant-[A-Za-z0-9_-]{16,}$/.test(secret))fail();Object.assign(env,approvedSettings(proposal),{ANTHROPIC_API_KEY:secret,PILOT_BUDGET:budget.binding});}finally{bytes.fill(0);}
   whisper=createWhisper(manifest.whisper);
  }
  const provider=(kind,payload,settings,context)=>kind==='transcribe'?whisper.transcribe(payload,context):callProvider(kind,payload,settings,fetch,context);
  api=createMealApi({env,provider});
  return {listen:()=>api.listen(manifest.port),async close(){env.LIVE_ENABLED='false';await api.close();await whisper?.close();budget?.close();delete env.ANTHROPIC_API_KEY;}};
 }catch{await whisper?.close();budget?.close();throw Error('server_start_refused');}
}
