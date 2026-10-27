// Exercise failure paths with a fake local CLI. No Docker daemon or credentials are used.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const runner=fileURLToPath(new URL('./linux/run-systemd.mjs',import.meta.url));
async function fixture(mode,fn){
 const root=mkdtempSync(path.join(tmpdir(),'scisense-runner-test-'));
 const cli=`#!${process.execPath}\nimport{appendFileSync,writeFileSync,existsSync,rmSync}from'node:fs';
const a=process.argv.slice(2);if(a[0]==='--host')a.splice(0,2);const c=a[0],mode=process.env.FIXTURE_MODE;appendFileSync('commands',c+'\\n');
if(c==='context')console.log(mode==='remote'?'ssh://synthetic.invalid':'unix:///tmp/synthetic-docker.sock');
else if(c==='info')console.log('aarch64');
else if(c==='build'){}
else if(c==='run'){writeFileSync('owned','yes');if(mode==='cleanup-failure')process.exitCode=1;else setTimeout(()=>{},10000);}
else if(c==='ps'){if(mode==='cleanup-failure')process.exitCode=1;else if(existsSync('owned'))console.log('owned-container');}
else if(c==='rm')rmSync('owned');
else process.exitCode=1;`;
 mkdirSync(path.join(root,'bin'));writeFileSync(path.join(root,'bin/docker'),cli,{mode:0o700});
 mkdirSync(path.join(root,'tmp/systemd-check'),{recursive:true});writeFileSync(path.join(root,'tmp/systemd-check/evidence.json'),'{"cleanup":true,"passed":99}');
 const env={...process.env,PATH:path.join(root,'bin')+path.delimiter+process.env.PATH,FIXTURE_MODE:mode};delete env.DOCKER_HOST;delete env.DOCKER_CONTEXT;
 const child=spawn(process.execPath,[runner],{cwd:root,env,stdio:'ignore'}),exit=new Promise(resolve=>child.on('close',resolve));
 try{await fn({root,child,exit,proof:()=>JSON.parse(readFileSync(path.join(root,'tmp/systemd-check/evidence.json')))});}finally{child.kill('SIGKILL');await exit;rmSync(root,{recursive:true,force:true});}
}
test('Systemd runner replaces stale success when cleanup cannot be confirmed',()=>fixture('cleanup-failure',async({exit,proof})=>{
 assert.equal(await exit,1);const result=proof();assert.equal(result.passed,false);assert.equal(result.cleanup,false);assert.ok(result.cleanupError);assert.match(result.containerName,/^scisense-systemd-[a-f0-9-]{36}$/);
}));
test('Systemd runner rejects a remote Docker context before contacting any daemon',()=>fixture('remote',async({root,exit,proof})=>{
 assert.equal(await exit,1);assert.equal(proof().error,'local_unix_docker_required');assert.equal(readFileSync(path.join(root,'commands'),'utf8'),'context\n');
}));
test('Systemd runner handles SIGTERM and verifies removal of its own container',()=>fixture('interrupt',async({root,child,exit,proof})=>{
 for(let i=0;i<100&&!existsSync(path.join(root,'owned'));i++)await new Promise(resolve=>setTimeout(resolve,30));
 assert.equal(existsSync(path.join(root,'owned')),true);child.kill('SIGTERM');assert.equal(await exit,1);
 const result=proof();assert.equal(result.passed,false);assert.equal(result.interrupted,'SIGTERM');assert.equal(result.cleanup,true);assert.equal(existsSync(path.join(root,'owned')),false);
}));
