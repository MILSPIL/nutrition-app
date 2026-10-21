import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {generateTls} from './tls.mjs';
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('TLS overflow waits for cleanup of a descendant that ignores SIGTERM',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'scisense-tls-owned-'));
 const original=process.env.PATH,report=path.join(dir,'owned.json');let owned;
 try{
  await writeFile(path.join(dir,'openssl'),`#!${process.execPath}
const {spawn}=require('node:child_process');
const {writeFileSync}=require('node:fs');
const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});process.send(process.pid);setInterval(()=>{},1000)"],{stdio:['ignore','ignore','ignore','ipc']});
child.on('message',pid=>{writeFileSync(${JSON.stringify(report)},JSON.stringify({parent:process.pid,child:pid}));process.stdout.write(Buffer.alloc(33000,65));});
`,{mode:0o700});
  process.env.PATH=dir+path.delimiter+original;
  await assert.rejects(generateTls('127.0.0.1'),/tls_generation_failed/);
  owned=JSON.parse(await readFile(report,'utf8'));
  await pause(1500);
  assert.equal(alive(owned.parent),false);
  assert.equal(alive(owned.child),false,'owned SIGTERM-resistant descendant must be killed');
 }finally{
  process.env.PATH=original;
  if(!owned){try{owned=JSON.parse(await readFile(report,'utf8'));}catch{}}
  if(owned){for(const pid of [-owned.parent,owned.child]){try{process.kill(pid,'SIGKILL');}catch{}}}
  await rm(dir,{recursive:true,force:true});
 }
});
