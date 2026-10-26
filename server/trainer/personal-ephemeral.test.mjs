import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, existsSync, rmSync, utimesSync, symlinkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPersonalEphemeralSweeper } from './personal-ephemeral.mjs';
test('idle sweeper removes partial metadata/orphan raw bytes, survives one bad item and a backwards wall clock',()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'scisense-ephemeral-'))),user=join(root,'user');mkdirSync(user,{mode:0o700});
 let wall=1000000,mono=100;const put=name=>{const path=join(user,name);writeFileSync(path,'synthetic',{mode:0o600});utimesSync(path,wall/1000,wall/1000);return path;};
 const raw=put('orphan.bin'),partial=put('partial.json'),outside=join(root,'outside');writeFileSync(outside,'do not delete',{mode:0o600});symlinkSync(outside,join(user,'bad-alias'));
 const sweep=createPersonalEphemeralSweeper({ephemeralRoot:root,account:()=>({media:user})},{entries:()=>[{uid:'user'}]},{wall:()=>wall,monotonic:()=>mono,ttlMs:100,intervalMs:5});
 try{mono+=50;wall-=100000;assert.equal(sweep.tick().removed,0);mono+=51;const result=sweep.tick();assert.equal(result.removed,2);assert.equal(result.faults,1);assert.equal(existsSync(raw),false);assert.equal(existsSync(partial),false);assert.equal(existsSync(outside),true);}finally{sweep.close();rmSync(root,{recursive:true,force:true});}
});

test('cleanup I/O failure latches a fatal state once and never silently resumes',()=>{
 if(process.getuid()===0)return;
 const root=realpathSync(mkdtempSync(join(tmpdir(),'scisense-ephemeral-fault-'))),user=join(root,'user');mkdirSync(user,{mode:0o700});
 const file=join(user,'raw.bin');writeFileSync(file,'synthetic',{mode:0o600});let mono=0,fatal=0;
 const sweep=createPersonalEphemeralSweeper({ephemeralRoot:root,account:()=>({media:user})},{entries:()=>[{uid:'user'}]},{monotonic:()=>mono,ttlMs:10,intervalMs:5,onFault(){fatal++;}});
 try{chmodSync(user,0o500);mono=11;assert.equal(sweep.tick().faults,1);assert.equal(sweep.faulted,true);assert.equal(fatal,1);chmodSync(user,0o700);assert.equal(sweep.tick().removed,1);assert.equal(sweep.faulted,true);assert.equal(fatal,1);}finally{sweep.close();chmodSync(user,0o700);rmSync(root,{recursive:true,force:true});}
});
