import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.includes('--baseline')) {
  const result = spawnSync(process.execPath, ['docs/evidence/hermes-food-baseline-2026-10-24.cjs', root], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const evidence = JSON.parse(result.stdout);
  console.log(result.stdout);
  const failures = [];
  if (!evidence.ready.textarea) failures.push('H01: чинний ready не має текстового поля');
  if (!evidence.unknownFood.accepted) failures.push('H03: чинний шлях відхиляє їжу без БЖВ');
  console.error(failures.join('\n'));
  process.exitCode = failures.length ? 1 : 0;
} else {
  const selection = args.find(value => /^H\d\d$/.test(value));
  const matrix={
    H02:['food-acceptance.test.mjs','food-lookup.test.mjs','tools.test.mjs'],
    H03:['drafts-retention.test.mjs'],H04:['gateway-core.test.mjs','runtime.test.mjs'],
    H05:['drafts-retention.test.mjs','tools.test.mjs'],H06:['gateway-core.test.mjs','gateway-http.test.mjs','drafts-retention.test.mjs'],
    H07:['gateway-http.test.mjs','tools.test.mjs','runtime.test.mjs'],H08:['quota.test.mjs','gateway-core.test.mjs'],
    H10:['drafts-retention.test.mjs','gateway-core.test.mjs']
  };
  if(selection&&!matrix[selection])throw Error('Use npm run test:hermes-ui for H01/H09; H11 requires separate approval');
  const files=selection?matrix[selection]:[...new Set(Object.values(matrix).flat()),'contracts.test.mjs'];
  const result = spawnSync(process.execPath, ['--test',...files.map(f=>'server/trainer/'+f)], { cwd: root, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
}
