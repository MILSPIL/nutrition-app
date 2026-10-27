import {validateProposal} from '../scripts/phone-lab/approval.mjs';
// Pure filesystem/marker adapters. No Keychain, SSH, provider, activation or live side effects at import.
import {mkdirSync,readFileSync,copyFileSync,constants,existsSync,chmodSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {inspectLedger,durableJson,PILOT_CAP,privateFile} from './ledger.mjs';
import {localBudget} from '../scripts/phone-lab/sqlite.mjs';
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
export {assertLocalMarker} from '../scripts/phone-lab/budget-marker.mjs';
import {assertLocalMarker} from '../scripts/phone-lab/budget-marker.mjs';
import {acquirePilotLock} from '../scripts/phone-lab/pilot-lock.mjs';
export async function prepareTransfer(options){
 // Stopping precedes the lock because liveRuntime holds that same lock for its entire lifetime.
 if(await options.stopLocal()!==true)throw Error('local_not_stopped');
 const unlock=acquirePilotLock(options.lockFile);
 try{return await prepareLocked(options);}finally{unlock();}
}
async function prepareLocked({sourceFile,proposalId,proposal,destination,markerStore,requireExisting=false}){
 if(proposal){validateProposal(proposal);if(proposal.proposalId!==proposalId)throw Error('transfer_config');}
 if(!proposalId||!path.isAbsolute(sourceFile)||!path.isAbsolute(destination))throw Error('transfer_config');
 const previous=await markerStore.read(),expected=JSON.stringify({proposal:proposalId,cap:PILOT_CAP,file:sourceFile});
 const fresh=!previous&&!existsSync(sourceFile);
 if(requireExisting&&fresh)throw Error('transfer_source_missing');
 if(!fresh)assertLocalMarker(expected,previous);
 const state=fresh?{consumedMicros:0,reservedCalls:0}:inspectLedger(sourceFile);
 const receipt={version:proposal?2:1,...(proposal?{proposalRevision:proposal.proposalRevision,configHash:proposal.configHash}:{}),proposalId,capMicros:PILOT_CAP,target:'https://ntzg.pp.ua',receiptId:randomUUID(),...state};
 const permanent=JSON.stringify({state:'permanently_transferred',...receipt,sourceFile});
 await markerStore.write(permanent);
 if(await markerStore.read()!==permanent)throw Error('marker_unconfirmed');
 // A failure from this point leaves the local marker locked and no active server receipt.
 if(fresh){const local=localBudget(sourceFile,PILOT_CAP,{initialize:true});local.close();}
 if(JSON.stringify(inspectLedger(sourceFile))!==JSON.stringify(state))throw Error('source_changed');
 mkdirSync(destination,{mode:0o700});
 const target=path.join(destination,'pilot-budget.sqlite');copyFileSync(sourceFile,target,constants.COPYFILE_EXCL);chmodSync(target,0o600);
 const db=new DatabaseSync(target);try{db.exec('CREATE TABLE server_transfer(receipt_id TEXT NOT NULL)');db.prepare('INSERT INTO server_transfer VALUES(?)').run(receipt.receiptId);}finally{db.close();}
 if(JSON.stringify(inspectLedger(target))!==JSON.stringify(state))throw Error('snapshot_mismatch');
 const envelope={...receipt,ledgerSha256:hash(target),liveEnabled:false};durableJson(path.join(destination,'transfer.json'),envelope,{exclusive:true});
 return envelope;
}
export function stageTransfer({bundle,directory}){
 privateFile(path.join(bundle,'transfer.json'));const receipt=JSON.parse(readFileSync(path.join(bundle,'transfer.json'),'utf8')),source=path.join(bundle,'pilot-budget.sqlite');
 if(![1,2].includes(receipt.version)||(receipt.version===2&&(receipt.proposalRevision!==2||!/^[a-f0-9]{64}$/.test(receipt.configHash||'')))||receipt.liveEnabled!==false||receipt.capMicros!==PILOT_CAP||receipt.target!=='https://ntzg.pp.ua'||hash(source)!==receipt.ledgerSha256)throw Error('transfer_invalid');
 const state=inspectLedger(source);if(state.consumedMicros!==receipt.consumedMicros||state.reservedCalls!==receipt.reservedCalls)throw Error('transfer_invalid');
 // Existing state can never be overwritten by another import or a deploy rollback.
 mkdirSync(directory,{mode:0o700});copyFileSync(source,path.join(directory,'pilot-budget.sqlite'),constants.COPYFILE_EXCL);chmodSync(path.join(directory,'pilot-budget.sqlite'),0o600);
 durableJson(path.join(directory,'budget-anchor.json'),{receiptId:receipt.receiptId,...(receipt.version===2?{proposalRevision:receipt.proposalRevision,configHash:receipt.configHash}:{}),...state},{exclusive:true});
 durableJson(path.join(directory,'activation.pending.json'),receipt,{exclusive:true});
 return receipt;
}
