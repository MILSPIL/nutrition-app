import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { createFirebaseAuthenticator } from '../src/auth.js';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const now = 2000000000000;
const claims = () => ({ sub:'pilot',aud:'scisense-test',iss:'https://securetoken.google.com/scisense-test',iat:now/1000-10,exp:now/1000+60,auth_time:now/1000-20 });
const token = (payload, key = privateKey, header = {alg:'RS256',kid:'synthetic'}) => new SignJWT(payload).setProtectedHeader(header).sign(key);
const request = value => new Request('https://ntzg.pp.ua/analyze',{headers:{Authorization:`Bearer ${value}`}});
const verify = createFirebaseAuthenticator({keyResolver:publicKey,now:()=>now});
const env = {FIREBASE_PROJECT:'scisense-test'};
test('real RS256 JWT verifies subject and all Firebase claims',async()=>{
 assert.equal(await verify(request(await token(claims())),env),'pilot');
 const wrong=(await generateKeyPair('RS256')).privateKey;
 await assert.rejects(verify(request(await token(claims(),wrong)),env),/unauthorized/);
 for(const mutate of [p=>delete p.exp,p=>delete p.iat,p=>delete p.auth_time,p=>p.iat=now/1000+1,p=>p.auth_time=now/1000+1,p=>p.exp=now/1000-1,p=>p.iss='https://evil.invalid',p=>p.aud='other-project',p=>p.sub='',p=>p.sub='x'.repeat(129),p=>p.auth_time=-1,p=>p.iat=-1]){
  const p=claims();mutate(p);await assert.rejects(verify(request(await token(p)),env),/unauthorized/);
 }
 await assert.rejects(verify(request(await token(claims(),privateKey,{alg:'RS256'})),env),/unauthorized/);
 await assert.rejects(verify(request('eyJhbGciOiJub25lIn0.eyJzdWIiOiJwaWxvdCJ9.'),env),/unauthorized/);
});
test('unavailable JWKS fails closed, never accepts an unsigned fallback',async()=>{
 let count=0;const unavailable=createFirebaseAuthenticator({keyResolver:async()=>{count++;throw Error('offline');},now:()=>now});
 await assert.rejects(unavailable(request(await token(claims())),env),/unauthorized/);assert.equal(count,1);
});
