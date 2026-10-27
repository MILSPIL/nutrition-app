import {createHash} from 'node:crypto';
export const FREE_SETTINGS = Object.freeze({
  "TRANSCRIBE_PROVIDER": "groq",
  "TRANSCRIBE_MODEL": "whisper-large-v3",
  "GROQ_ACCOUNT_TIER": "free",
  "PARSE_MODEL": "claude-sonnet-5-5",
  "PRICING_MODEL_PAIR": "whisper-large-v3|claude-sonnet-5-5",
  "PILOT_BUDGET_MICROS": 5000000,
  "INPUT_MICROS_PER_MTOK": 2000000,
  "OUTPUT_MICROS_PER_MTOK": 10000000,
  "MAX_CONCURRENT": 1,
  "REQUESTS_PER_MINUTE": 6,
  "REQUESTS_PER_DAY": 30,
  "MAX_AUDIO_SECONDS": 90,
  "UPSTREAM_TIMEOUT_MS": 45000
});
const fail=()=>{throw Error('pilot_not_approved');};
const validDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=Date.now();
export function configurationHash(proposal) {
 const settings=Object.fromEntries(Object.keys(FREE_SETTINGS).map(key=>[key,proposal?.candidateC?.[key]]));
 return createHash('sha256').update(JSON.stringify({proposalId:proposal?.proposalId,proposalRevision:proposal?.proposalRevision,settings})).digest('hex');
}
export function validateProposal(proposal) {
 if(proposal?.proposalId!=='scisense-phone-api-2026-10-20'||proposal.proposalRevision!==2||proposal.selectedCandidate!=='C'||proposal.configHash!==configurationHash(proposal))fail();
 for(const [key,value] of Object.entries(FREE_SETTINGS))if(proposal.candidateC?.[key]!==value)fail();
 return proposal;
}
export function approvedSettings(proposal,{mode='full'}={}) {
 validateProposal(proposal);
 if(!['full','stt_only'].includes(mode))fail();
 const approval=proposal.sttApproval;
 if(!approval||!['approvedAt','freeTierConfirmedAt','zeroDataRetentionConfirmedAt'].every(key=>validDate(approval[key])))fail();
 const settings={...FREE_SETTINGS,LIVE_ENABLED:'true',INFERENCE_MODE:mode,GROQ_FREE_LIMITS:'true',GROQ_FREE_APPROVED_AT:approval.approvedAt};
 if(mode==='full') {
  if(proposal.fullApproval?.proposalRevision!==proposal.proposalRevision||proposal.fullApproval?.configHash!==proposal.configHash||proposal.fullApproval?.approvedAt!==proposal.approvedAt||Date.parse(proposal.approvedAt)<Date.parse(approval.approvedAt)||proposal.status!=='approved_local_pilot'||!validDate(proposal.approvedAt)||!proposal.accountVerification?.creditAvailabilityConfirmedByOwner||proposal.candidateC.PRICING_APPROVED_AT!==proposal.approvedAt)fail();
  settings.PRICING_APPROVED_AT=proposal.approvedAt;
 }
 return settings;
}
