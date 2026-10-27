import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {limitsEnforced} from './linux/limits.mjs';
const cpuMax=readFileSync('/sys/fs/cgroup/cpu.max','utf8'),memoryMax=readFileSync('/sys/fs/cgroup/memory.max','utf8');
if(!limitsEnforced(cpuMax,memoryMax,1,'normal'))throw Error('resource_limits_not_enforced');
const started=Date.now();
const result=spawnSync(process.execPath,['--test','server/api.test.mjs','server/runtime.test.mjs','server/groq-budget.test.mjs','server/ledger.test.mjs','workers/meal-parser/test/groq.test.js'],{stdio:'inherit',timeout:120000});
console.log(JSON.stringify({fixtureOnly:true,providerNetwork:false,cpuMax:cpuMax.trim(),memoryMax:Number(memoryMax),elapsedMs:Date.now()-started,passed:result.status===0}));
process.exitCode=result.status===0?0:1;
