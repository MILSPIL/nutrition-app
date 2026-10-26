import {readFile} from 'node:fs/promises';
import {createServerRuntime} from './runtime.mjs';
let runtime,watchdog;
try{
 const manifest=JSON.parse(await readFile(new URL('./deployment.json',import.meta.url),'utf8'));
 if(manifest.version===3){
  const {createPersonalServerRuntime}=await import('./personal-runtime.mjs');
  const {startSystemdWatchdog}=await import('./trainer/systemd-watchdog.mjs');
  watchdog=startSystemdWatchdog();
  runtime=await createPersonalServerRuntime(manifest,{onFatal:()=>watchdog.close()});await runtime.listen();watchdog.ready();
  const underlyingClose=runtime.close;runtime={...runtime,close:async()=>{try{await underlyingClose();}finally{watchdog.close();}}};
 }else{
 const proposal=JSON.parse(await readFile(new URL('../workers/meal-parser/pilot-proposal.json',import.meta.url),'utf8'));
 runtime=await createServerRuntime(manifest,{proposal});await runtime.listen();
 }
 console.log(JSON.stringify({event:'server_ready',inferenceEnabled:manifest.liveEnabled}));
 let closing=false;const close=async()=>{if(closing)return;closing=true;await runtime.close();};
 process.once('SIGTERM',()=>{void close().catch(()=>{process.exitCode=1;});});process.once('SIGINT',()=>{void close().catch(()=>{process.exitCode=1;});});
}catch{watchdog?.close();console.error(JSON.stringify({event:'server_start_refused'}));await runtime?.close();process.exitCode=1;}
