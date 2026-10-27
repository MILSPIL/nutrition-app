import { spawnSync } from 'node:child_process';
import { requireIsolatedBrowser } from './browser-runtime.mjs';
requireIsolatedBrowser();
const run=(cmd,args,env=process.env)=>{const r=spawnSync(cmd,args,{stdio:'inherit',env});if(r.status!==0)throw Error('trainer_qa_failed');};
run('npm',['run','build'],{...process.env,CI:'true',REACT_APP_LOCAL_LAB:'1',BUILD_PATH:'tmp/trainer-ui-build'});
run(process.env.FIREBASE_CLI||'firebase',['emulators:exec','--config','firebase.lab.json','--project','demo-scisense','--only','auth,firestore','node scripts/trainer-browser.mjs']);
