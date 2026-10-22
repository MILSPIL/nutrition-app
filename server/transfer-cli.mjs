// Operator tool, deliberately inert without an explicit future transfer approval flag.
// Never run export/send/receive during preparation. --help reads no Keychain or server state.
import {readFileSync,lstatSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {keychain} from '../scripts/phone-lab/keychain.mjs';
import {exportBudget,sendTransfer,receiveTransfer,assertReceiverReady,inspectTransferStatus,sshTransport,runPrivateCommand,readBoundedInput} from './transfer-operations.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),command=args.shift();
const flag=name=>{const n=args.indexOf(name);if(n<0||!args[n+1]||args[n+1].startsWith('--'))throw Error();return args[n+1];};
const absolute=name=>{const value=flag(name);if(!path.isAbsolute(value))throw Error();return value;};
const json=file=>JSON.parse(readFileSync(file,'utf8'));
const markerStore={read:()=>keychain('scisense-phone-lab','pilot-2026-10-20'),write:value=>keychain('scisense-phone-lab','pilot-2026-10-20',value)};
function receiver(proposal){
 if(process.platform!=='linux'||process.getuid()!==0)throw Error();
 const manifest=json(path.join(root,'server/deployment.json'));
 const id=kind=>{const r=spawnSync('/usr/bin/id',[kind,'scisense'],{encoding:'utf8',timeout:5000});if(r.status!==0)throw Error();return Number(r.stdout.trim());};
 return {manifest,proposal,directory:'/var/lib/scisense',credentialDirectory:'/etc/credstore.encrypted',workDirectory:'/var/lib/scisense-transfer',activationFile:'/etc/scisense/activation.json',dropInFile:'/etc/systemd/system/scisense-api.service.d/50-live.conf',owner:{uid:id('-u'),gid:id('-g')},
  serviceInactive:()=>{const r=spawnSync('/usr/bin/systemctl',['show','scisense-api.service','--property=LoadState,ActiveState','--value'],{encoding:'utf8',timeout:5000});return r.status===0&&r.stdout.trim().split('\n').sort().join(',')==='inactive,loaded';},
  encrypt:async(name,input,output)=>{await runPrivateCommand('/usr/bin/systemd-creds',['--with-key=host','--name='+name,'encrypt','-',output],{input});}
 };
}
try{
 if(!command||command==='--help')console.log('Команди: export --source <абсолютний шлях ledger> --bundle <нова тека>; send --bundle <тека> --transport <приватний JSON>; status --transport <приватний JSON>; receive-check; receive-status; receive. Кожна операція вимагає --approved-transfer та окремого дозволу Юрія. Запущену лабораторію треба спочатку зупинити; stale lock автоматично не видаляється.');
 else{
  if(!args.includes('--approved-transfer'))throw Error();
  const proposal=json(path.join(root,'workers/meal-parser/pilot-proposal.json'));let result;
  if(command==='export')result=await exportBudget({sourceFile:absolute('--source'),bundle:absolute('--bundle'),proposal,markerStore});
  else if(['send','status'].includes(command)){
   const configFile=absolute('--transport'),s=lstatSync(configFile);if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)!==0||s.size>16384)throw Error();
   const config=json(configFile);result=command==='status'?await sshTransport(config)('status'):await sendTransfer({bundle:absolute('--bundle'),proposal,releaseId:config.releaseId,markerStore,readKey:name=>keychain('scisense-'+name,'api-key'),transport:sshTransport(config)});
  }else if(command==='receive-status')result=inspectTransferStatus(receiver(proposal));
  else if(command==='receive-check')result=assertReceiverReady(receiver(proposal));
  else if(command==='receive')result=await receiveTransfer(await readBoundedInput(process.stdin),receiver(proposal));
  else throw Error();
  console.log(JSON.stringify(result));
 }
}catch{console.error(JSON.stringify({error:'transfer_refused',liveEnabled:false}));process.exitCode=1;}
