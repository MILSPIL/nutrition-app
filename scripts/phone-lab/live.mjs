import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {callProvider} from '../../workers/meal-parser/src/providers.js';
import {localBudget} from './sqlite.mjs';
import {keychain} from './keychain.mjs';
import {assertLocalMarker} from './budget-marker.mjs';
import {acquirePilotLock} from './pilot-lock.mjs';
import {approvedSettings} from './approval.mjs';
export {approvedSettings} from './approval.mjs';
const CAP=5000000;
export async function liveRuntime(root,{initialize=false,mode='full',keyStore=keychain,fetcher=fetch,lockFile}={}) {
 const unlock=acquirePilotLock(lockFile);let budget,env,closed=false;
 try {
  const proposal=JSON.parse(await readFile(path.join(root,'workers/meal-parser/pilot-proposal.json'),'utf8'));
  const settings=approvedSettings(proposal,{mode});
  const file=path.join(root,'tmp/phone-lab/pilot-budget.sqlite');
  const marker=JSON.stringify({proposal:proposal.proposalId,cap:CAP,file});
  const previous=await keyStore('scisense-phone-lab','pilot-2026-10-20');
  assertLocalMarker(marker,previous,{initialize});
  const groq=await keyStore('scisense-groq','api-key');
  if(!/^gsk_[A-Za-z0-9_-]{16,}$/.test(groq))throw Error('keychain_unavailable');
  env={...settings,GROQ_API_KEY:groq};
  if(mode==='full') {
   const anthropic=await keyStore('scisense-anthropic','api-key');
   if(!/^sk-ant-[A-Za-z0-9_-]{16,}$/.test(anthropic))throw Error('keychain_unavailable');
   env.ANTHROPIC_API_KEY=anthropic;
  }
  budget=localBudget(file,CAP,{initialize,groqFree:true});env.PILOT_BUDGET=budget.binding;
  if(initialize){await keyStore('scisense-phone-lab','pilot-2026-10-20',marker);if(await keyStore('scisense-phone-lab','pilot-2026-10-20')!==marker)throw Error('pilot_budget_locked');}
  return {apiEnv:env,localTranscription:false,mode,
   provider:(kind,payload,settings,context)=>{
    if(closed||(mode==='stt_only'&&kind!=='transcribe'))return Promise.reject(Error('live_disabled'));
    return callProvider(kind,payload,settings,fetcher,context);
   },spent:budget.spent,
   async close(){if(closed)return;closed=true;env.LIVE_ENABLED='false';delete env.GROQ_API_KEY;delete env.ANTHROPIC_API_KEY;budget.close();unlock();},
  };
 }catch(error){if(env){delete env.GROQ_API_KEY;delete env.ANTHROPIC_API_KEY;}budget?.close();unlock();throw error;}
}
