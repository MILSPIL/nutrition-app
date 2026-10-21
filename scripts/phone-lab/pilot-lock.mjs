import {mkdirSync,lstatSync,openSync,writeFileSync,fsyncSync,closeSync,readFileSync,unlinkSync} from 'node:fs';
import {homedir} from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';
// One location for all checkouts using this Keychain pilot slot. Never remove a stale lock automatically.
const defaultFile=path.join(homedir(),'Library','Application Support','SciSense','pilot-2026-10-20.lock');
export function acquirePilotLock(file=defaultFile){
 const directory=path.dirname(file);mkdirSync(directory,{recursive:true,mode:0o700});const stat=lstatSync(directory);
 if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw Error('pilot_lock_permissions');
 const nonce=randomUUID(),fd=openSync(file,'wx',0o600);let closed=false;
 try{writeFileSync(fd,nonce);fsyncSync(fd);}catch(error){closeSync(fd);throw error;}
 return ()=>{if(closed)return;closed=true;closeSync(fd);if(readFileSync(file,'utf8')!==nonce)throw Error('pilot_lock_changed');unlinkSync(file);};
}
