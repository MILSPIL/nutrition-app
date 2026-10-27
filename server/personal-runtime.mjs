import { openSync, readFileSync, fstatSync, closeSync, constants, realpathSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createMealApi } from './api.mjs';
import { openFreeSttLedger } from './free-stt-ledger.mjs';
import { createPersonalRuntime } from './trainer/personal-runtime.mjs';
import { createPersonalDesktopEndpoint } from './trainer/personal-desktop-endpoint.mjs';
import { personalProfiles } from './trainer/personal-profiles.mjs';
import { stableJSON } from './trainer/limits.mjs';
import { createSystemdProcess } from './trainer/systemd-process.mjs';
import { callProvider } from '../workers/meal-parser/src/providers.js';
import { PERSONAL_LIMITS } from './trainer/personal-limits.mjs';

const fail = () => { throw Error('personal_activation_invalid'); };
const uid = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now();
const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
export const PERSONAL_POLICY = Object.freeze({ version: 2, task: 'HERMES-PERSONAL-01', sourcePin: '3f2afed3eb813cb00bd381d29b084d0e01de048f',
  nativeLane: 'openai-codex', scope: PERSONAL_LIMITS.scope, turns: null, posts: null, postsPerTurn: PERSONAL_LIMITS.postsPerTurn, deadlineMs: PERSONAL_LIMITS.deadlineMs,
  cpu: 2, memoryBytes: 2147483648, swapBytes: 0, activeModels: 1, maxWaiting: 4, stt: 'groq-free-whisper-large-v3',
  desktopTransport: 'ssh-uds-token-v1', desktopRpcBytes: 16777216,
  privateProfiles: true, canonicalHistory: true, explicitMemoryAppend: true, previewBeforeAdd: true,
  modelContext: 'single-current-snapshot-v1', nativeAutomaticCompression: false });
export const personalPolicyHash = createHash('sha256').update(stableJSON(PERSONAL_POLICY)).digest('hex');
export function validatePersonalManifest(value) {
  if (!exact(value, ['version','releaseId','liveEnabled','firebaseProject','origin','allowedUids','port','maxConcurrent','activationFile','policyHash','credentialNames']) ||
      value.version !== 3 || value.firebaseProject !== 'nutrition-tracker-ua' || value.origin !== 'https://ntzg.pp.ua' || typeof value.liveEnabled !== 'boolean' ||
      !Array.isArray(value.allowedUids) || value.allowedUids.length > 2 || value.allowedUids.some(item => !uid(item)) || new Set(value.allowedUids).size !== value.allowedUids.length ||
      !Number.isInteger(value.port) || value.port < 1024 || value.port > 65535 || value.maxConcurrent !== 2 || value.activationFile !== '/etc/scisense/personal-activation.json' ||
      value.policyHash !== personalPolicyHash || JSON.stringify(value.credentialNames) !== '["groq","personal-state","desktop-y","desktop-w"]' ||
      value.liveEnabled && (!/^[a-f0-9]{40}$/.test(value.releaseId || '') || !value.allowedUids.length)) fail();
  return value;
}
export function validatePersonalActivation(value, manifest) {
  validatePersonalManifest(manifest);
  if (!exact(value, ['version','active','task','policyHash','releaseId','target','approvedAt','sttApprovedAt','registry','dataProfiles','lanes','brokerGid','desktopGids','firebaseApiKey','gates']) ||
      value.version !== 1 || value.active !== true || !manifest.liveEnabled || value.task !== PERSONAL_POLICY.task || value.policyHash !== personalPolicyHash ||
      value.releaseId !== manifest.releaseId || value.target !== manifest.origin || !stamp(value.approvedAt) || !stamp(value.sttApprovedAt) ||
      !Number.isInteger(value.brokerGid) || value.brokerGid <= 0 || !exact(value.desktopGids,['y','w']) ||
      Object.values(value.desktopGids).some(gid=>!Number.isInteger(gid)||gid<=0||gid===value.brokerGid) || value.desktopGids.y===value.desktopGids.w || typeof value.firebaseApiKey !== 'string' || !/^AIza[0-9A-Za-z_-]{20,}$/.test(value.firebaseApiKey) ||
      !exact(value.gates,['linux','privacy','singleWriter','backup','migration']) || Object.values(value.gates).some(gate=>gate!==true)) fail();
  const profiles = personalProfiles(value.registry), entries = profiles.entries();
  if (stableJSON(entries.map(p=>p.uid).sort()) !== stableJSON([...manifest.allowedUids].sort()) || !value.dataProfiles || !value.lanes ||
      Object.keys(value.dataProfiles).length !== entries.length || Object.keys(value.lanes).length !== entries.length ||
      entries.some(p=>!uid(value.dataProfiles[p.uid]) || !['y','w'].includes(value.lanes[p.uid])) || new Set(Object.values(value.lanes)).size !== entries.length ||
      value.lanes[value.registry.fundingOwner] !== 'y') fail();
  for (const p of entries) {
    const role = value.lanes[p.uid];
    if (p.home !== '/var/lib/scisense-personal-'+role+'/profile' || p.socket !== '/run/scisense/desktop-'+role+'.sock') fail();
  }
  return value;
}
export function readPersonalProtected(file, { secret = false, owner = 0 } = {}) {
  if (realpathSync(file) !== file) fail();
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.nlink !== 1 || info.size > 262144 || ![owner,...(secret?[0]:[])].includes(info.uid) || info.mode & (secret?0o337:0o022)) fail();
    return readFileSync(fd);
  } finally { closeSync(fd); }
}
function credentials(name) {
  const root = process.env.CREDENTIALS_DIRECTORY;
  if (root !== '/run/credentials/scisense-api.service' || realpathSync(root) !== root) fail();
  const info = lstatSync(root);
  if (!info.isDirectory() || ![0,process.getuid()].includes(info.uid) || info.mode & 0o227) fail();
  return readPersonalProtected(join(root,name), {secret:true,owner:process.getuid()});
}
export async function createPersonalServerRuntime(manifest, { fetcher = fetch, createApi = createMealApi, createTrainer = createPersonalRuntime,
  openLedger = openFreeSttLedger, createDesktopEndpoint = createPersonalDesktopEndpoint, readActivation = file => JSON.parse(readPersonalProtected(file)), readCredential = credentials, onFatal = () => {} } = {}) {
  validatePersonalManifest(manifest);
  const env = { FIREBASE_PROJECT: manifest.firebaseProject, ALLOWED_ORIGINS: manifest.origin, ALLOWED_UIDS: manifest.allowedUids.join(',') || 'disabled',
    LIVE_ENABLED: 'false', TRAINER_ENABLED: 'false', INFERENCE_MODE: 'stt_only', TRANSCRIBE_PROVIDER: 'groq', TRANSCRIBE_MODEL: 'whisper-large-v3',
    GROQ_ACCOUNT_TIER: 'free', GROQ_FREE_LIMITS: 'true' };
  let trainer, ledger, api, closing; const endpoints = [];
  const close = () => closing ??= (async () => {
    env.LIVE_ENABLED='false';env.TRAINER_ENABLED='false';delete env.GROQ_API_KEY;
    // Close all ingress before waiting for any admitted model turn to drain.
    const desktopClosing = endpoints.map(endpoint=>Promise.resolve().then(()=>endpoint.close()));
    let first;
    try { await api?.close(); } catch (error) { first=error; }
    for (const result of await Promise.allSettled(desktopClosing)) if(result.status==='rejected')first??=result.reason;
    try { await trainer?.close(); } catch (error) { first??=error; }
    try { ledger?.close(); } catch (error) { first??=error; }
    if(first)throw first;
  })();
  try {
    if (manifest.liveEnabled) {
      const active = validatePersonalActivation(readActivation(manifest.activationFile), manifest);
      ledger = openLedger('/var/lib/scisense/free-stt-v1.sqlite');
      let groq, state;
      try {
        groq=readCredential('groq');state=readCredential('personal-state');
        const secret=groq.toString('utf8').trim();if(!/^gsk_[A-Za-z0-9_-]{16,}$/.test(secret) || state.length!==32) fail();
        const spawnRole = role => createSystemdProcess({socketPath:'/run/scisense-broker/'+role+'.sock',role,brokerGid:active.brokerGid});
        trainer=await createTrainer({ registry:active.registry, platformKey:state, root:'/var/lib/scisense/personal-v1', ephemeralRoot:'/run/scisense/personal-media',
          index:'/opt/scisense/personal/data/foods-v1-reviewed.sqlite', project:manifest.firebaseProject, firebaseApiKey:active.firebaseApiKey, dataProfiles:active.dataProfiles,
          onFatal:()=>{env.LIVE_ENABLED='false';env.TRAINER_ENABLED='false';try{onFatal();}finally{void close().catch(()=>{});}},
          spawnOwner:profile=>spawnRole(active.lanes[profile.uid]),spawnPayer:()=>spawnRole('payer'),fetcher });
        for(const profile of active.registry.profiles){
          const role=active.lanes[profile.uid]; let desktopToken;
          try {
            desktopToken=readCredential('desktop-'+role);
            if(!Buffer.isBuffer(desktopToken)||!(/^[A-Za-z0-9_-]{43,128}$/).test(desktopToken.toString()))fail();
            endpoints.push(createDesktopEndpoint({runtime:trainer,uid:profile.uid,token:desktopToken,socketPath:profile.socket,socketGid:active.desktopGids[role]}));
          } finally {desktopToken?.fill(0);}
        }
        Object.assign(env,{GROQ_API_KEY:secret,GROQ_FREE_APPROVED_AT:active.sttApprovedAt,PILOT_BUDGET:ledger.binding,LIVE_ENABLED:'true',TRAINER_ENABLED:'true'});
      } finally {groq?.fill(0);state?.fill(0);}
    }
    const provider=(kind,payload,settings,context)=>{
      if(kind!=='transcribe')throw Object.assign(Error('live_disabled'),{status:503});
      return callProvider(kind,payload,settings,fetcher,{...context,timeoutMs:45000});
    };
    api=createApi({env,provider,trainer,maxConcurrent:manifest.maxConcurrent});
    return Object.freeze({async listen(){
      try {for(const endpoint of endpoints)await endpoint.listen();return await api.listen(manifest.port);}
      catch {await close().catch(()=>{});throw Error('server_start_refused');}
    },close});
  } catch {await close().catch(()=>{});throw Error('server_start_refused');}
}
