import {DatabaseSync} from 'node:sqlite';
import {openSync,closeSync,writeFileSync,readFileSync,fsyncSync,renameSync,unlinkSync,lstatSync,existsSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {localBudget} from '../scripts/phone-lab/sqlite.mjs';
export const PILOT_CAP=5000000;
export function privateFile(file){const stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw Error('budget_permissions');return stat;}
export function inspectLedger(file,cap=PILOT_CAP){
 privateFile(file);const db=new DatabaseSync(file,{readOnly:true});
 try{
  if(db.prepare('PRAGMA journal_mode').get().journal_mode!=='delete')throw Error();
  const meta=db.prepare('SELECT version,cap FROM lab_budget_metadata').get();if(meta?.version!==1||meta.cap!==cap||db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error();
  const row=db.prepare('SELECT COALESCE(SUM(cost),0) AS consumedMicros,COUNT(*) AS reservedCalls,COALESCE(MIN(cost),0) AS minimum FROM calls').get();
  if(!Number.isSafeInteger(row.consumedMicros)||row.consumedMicros<0||row.consumedMicros>cap||row.minimum<0)throw Error();
  return {consumedMicros:row.consumedMicros,reservedCalls:row.reservedCalls};
 }catch{throw Error('budget_invalid');}finally{db.close();}
}
export function durableJson(file,value,{exclusive=false}={}){
 const temporary=file+'.'+randomUUID()+'.tmp';let fd;
 try{
  if(exclusive&&existsSync(file))throw Error('state_exists');
  fd=openSync(temporary,'wx',0o600);writeFileSync(fd,JSON.stringify(value)+'\n');fsyncSync(fd);closeSync(fd);fd=undefined;
  // The owning process lock protects replacement. Exclusive callers own a newly-created directory.
  if(exclusive&&existsSync(file))throw Error('state_exists');renameSync(temporary,file);
  const directory=openSync(path.dirname(file),'r');try{fsyncSync(directory);}finally{closeSync(directory);}
 }finally{if(fd!==undefined)closeSync(fd);if(existsSync(temporary))unlinkSync(temporary);}
}
export function openServerLedger({directory,receipt,groqFree=false,onFault=()=>{}}){
 if(receipt?.capMicros!==PILOT_CAP||!receipt.receiptId||receipt.target!=='https://ntzg.pp.ua')throw Error('receipt_invalid');
 const stat=lstatSync(directory);if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw Error('budget_permissions');
 const file=path.join(directory,'pilot-budget.sqlite'),anchorFile=path.join(directory,'budget-anchor.json'),lockFile=path.join(directory,'budget.lock');
 const nonce=randomUUID();let lockFd,budget,closed=false,faulted=false,identity;
 const release=()=>{if(lockFd!==undefined){closeSync(lockFd);lockFd=undefined;if(readFileSync(lockFile,'utf8')===nonce)unlinkSync(lockFile);}};
 try{
  lockFd=openSync(lockFile,'wx',0o600);writeFileSync(lockFd,nonce);fsyncSync(lockFd);
  identity=privateFile(file);privateFile(anchorFile);
  const db=new DatabaseSync(file,{readOnly:true});try{const row=db.prepare('SELECT receipt_id FROM server_transfer').get();if(row?.receipt_id!==receipt.receiptId)throw Error('receipt_stale');}finally{db.close();}
  const validate=()=>{
   const current=privateFile(file);if(current.ino!==identity.ino||current.dev!==identity.dev)throw Error('ledger_replaced');privateFile(anchorFile);
   const anchor=JSON.parse(readFileSync(anchorFile,'utf8')),state=inspectLedger(file);
   if(anchor.receiptId!==receipt.receiptId||!Number.isSafeInteger(anchor.consumedMicros)||!Number.isSafeInteger(anchor.reservedCalls)||anchor.consumedMicros<receipt.consumedMicros||anchor.reservedCalls<receipt.reservedCalls||state.consumedMicros<anchor.consumedMicros||state.reservedCalls<anchor.reservedCalls)throw Error('budget_rollback');
   return state;
  };
  const synchronize=()=>{const state=validate();durableJson(anchorFile,{receiptId:receipt.receiptId,...state});return state;};
  synchronize();budget=localBudget(file,PILOT_CAP,{groqFree});
  const fetch=async request=>{
   if(closed||faulted)return Response.json({error:'limiter_unavailable'},{status:503});
   try{
    validate();const response=await budget.binding.get().fetch(request);
    // Persist the high-water mark before any caller can contact a paid upstream.
    synchronize();return response;
   }catch{faulted=true;onFault();return Response.json({error:'limiter_unavailable'},{status:503});}
  };
  return {binding:{idFromName:name=>name,get:()=>({fetch})},spent:()=>inspectLedger(file).consumedMicros,
   close(){if(closed)return;closed=true;budget.close();release();}};
 }catch(error){budget?.close();release();throw error;}
}
