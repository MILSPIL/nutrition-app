import { spawnSync } from 'node:child_process';
import { requireIsolatedBrowser } from './browser-runtime.mjs';
const scripts={'voice-photo':'voice-photo-ui.mjs','phone-lab':'phone-lab-ui.mjs','trainer-access':'trainer-ui.mjs'};
const kind=process.argv[2];if(!Object.hasOwn(scripts,kind))throw Error('unknown_test');
if(process.platform!=='darwin')requireIsolatedBrowser();
const command=process.platform==='darwin'?'/Users/user/.local/bin/agent-test-browser':process.execPath;
const args=process.platform==='darwin'?['run',`scisense-${kind}`]:[`scripts/${scripts[kind]}`];
const result=spawnSync(command,args,{stdio:'inherit'});process.exitCode=result.status??1;
