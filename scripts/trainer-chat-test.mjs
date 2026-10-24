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
  const filter = selection ? ['--test-name-pattern', selection] : [];
  const result = spawnSync(process.execPath, ['--test', ...filter, 'server/trainer/contracts.test.mjs'], { cwd: root, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
}
