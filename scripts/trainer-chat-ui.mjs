// Крок 0: фактичний SSR baseline. Браузерне приймання залишається pending до кроку 5.
import { spawnSync } from 'node:child_process';
console.log('H01: SSR baseline; браузерні H01/H09 ще не перевірені.');
const result = spawnSync(process.execPath, ['scripts/trainer-chat-test.mjs', '--baseline'], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
