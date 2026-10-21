import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
const result=spawnSync(process.env.FIREBASE_CLI||'firebase',['emulators:exec','--config','firebase.lab.json','--project','demo-scisense','--only','firestore','node --test scripts/trainer-rules.test.mjs'],{cwd,stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status ?? 1;
