import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const binary = '/app/stdio-probe';
test('Linux Node pipe reproduces silent legacy ofstream failure while native stdout works', {skip:process.platform!=='linux'}, ()=>{
 const options={stdio:['pipe','pipe','pipe'],timeout:2000};
 const old=spawnSync(binary,['legacy'],options), direct=spawnSync(binary,['direct'],options);
 assert.equal(old.error,undefined);assert.equal(old.status,0);assert.equal(old.stdout.length,0);
 assert.equal(direct.error,undefined);assert.equal(direct.status,0);assert.equal(direct.stdout.toString(),'synthetic-stdout-probe');
 assert.equal(old.stderr.length,0);assert.equal(direct.stderr.length,0);
});
