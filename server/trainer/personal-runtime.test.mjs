import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { mkdtempSync, chmodSync, realpathSync, rmSync, unlinkSync, writeFileSync, statfsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes, randomUUID } from "node:crypto";
import { personalProfiles } from "./personal-profiles.mjs";
import { provisionPersonalRuntime, createPersonalRuntime, closeProvisionResources, preparePersonalEphemeral, personalRuntimePaths } from "./personal-runtime.mjs";

function fixture(t) {
 const base=realpathSync(mkdtempSync(join(tmpdir(),"personal-runtime-")));chmodSync(base,0o700);
 const root=join(base,"state"), platformKey=randomBytes(32), registry={version:1,fundingOwner:"owner",profiles:["owner","wife"].map(uid=>({uid,profileId:"native-"+uid,home:join(base,uid),socket:join(base,"run-"+uid,"native.sock"),canonicalTitle:"Bot Chat"}))};
 const project="scisense-test", apiKey="synthetic-public-api-key";
 const idToken=uid=>"test."+Buffer.from(JSON.stringify({sub:uid,aud:project,iss:`https://securetoken.google.com/${project}`,exp:Math.floor(Date.now()/1000)+3600})).toString("base64url")+".signature";
 let native=0, calls=0, runtime; const reads=[];
 const config={registry,platformKey,root,index:join(base,"index"),project,firebaseApiKey:apiKey,dataProfiles:{owner:"firestore-yuri",wife:"firestore-wife"},
  verifyToken:async request=>JSON.parse(Buffer.from(request.headers.get("Authorization").slice(7).split(".")[1],"base64url")).sub,
  fetcher:async(url,options)=>{calls++;assert.equal(url,`https://securetoken.googleapis.com/v1/token?key=${apiKey}`);const refresh=new URLSearchParams(options.body).get("refresh_token");const uid=refresh.startsWith("wife")?"wife":"owner";return Response.json({user_id:uid,token_type:"Bearer",refresh_token:refresh,id_token:idToken(uid),expires_in:"3600"});},
  spawnOwner:()=>{native++;throw Error("unexpected-native");},spawnPayer:()=>{native++;throw Error("unexpected-payer");},indexFactory:()=>({close(){}}),
  readerFactory:({ownerUid,profileId,getOwnerToken})=>({readDay:async(uid,targetDate,signal)=>{assert.equal(uid,ownerUid);const token=await getOwnerToken(uid,signal);reads.push({uid,profileId,token});return {targetDate,revision:0,meals:{},notes:[]};},readPlan:async()=>({planContext:{}})})};
 t.after(async()=>{await runtime?.close();platformKey.fill(0);rmSync(base,{recursive:true,force:true});});
 return {config,root,idToken,reads,get native(){return native;},get calls(){return calls;},async open(){runtime=await createPersonalRuntime(config);return runtime;},provision(){return provisionPersonalRuntime(config);}};
}

test("startup requires operator provisioning and never repairs missing ledgers or schemas",async t=>{
 const f=fixture(t);await assert.rejects(f.open());assert.deepEqual(f.provision(),{replayed:false});assert.deepEqual(f.provision(),{replayed:true});
 const db=join(f.root,"outbox.sqlite");unlinkSync(db);await assert.rejects(f.open());assert.throws(()=>f.provision());
 writeFileSync(db,"",{mode:0o600});await assert.rejects(f.open());assert.equal(f.native,0);assert.equal(f.calls,0);
});
test("both verified accounts share payer capability without revealing another profile or needing model login",async t=>{
 const f=fixture(t);f.provision();const runtime=await f.open();
 for(const uid of ["owner","wife"]){assert.equal(runtime.accepts(uid),true);const data=await(await runtime.handle(uid,"/capabilities","GET")).json();assert.deepEqual(data,{canonicalHistory:true,dataSession:true,fundingOwner:uid==="owner",modelPhase:"empty"});assert.equal(JSON.stringify(data).includes("firestore-"),false);}
 assert.equal(runtime.accepts("stranger"),false);await assert.rejects(runtime.handle("stranger","/data-session","GET"),/pilot_forbidden/);assert.equal(f.native,0);assert.equal(f.calls,0);
});
test("missing Firebase delegation refuses before any admission or native process",async t=>{
 const f=fixture(t);f.provision();const runtime=await f.open();
 await assert.rejects(runtime.handle("wife","/turns","POST",{turnId:randomUUID(),baseRevision:0,text:"own food",dateContext:{mode:"default"}}),/data_auth_required/);
 assert.equal(f.native,0);assert.equal(f.calls,0);
});
test("delegated own Firebase sessions stay bound to verified UID and explicit Firestore profile",async t=>{
 const f=fixture(t);f.provision();const runtime=await f.open();
 for(const uid of ["owner","wife"]){const r=await runtime.handle(uid,"/data-session","PUT",{refreshToken:uid+"-synthetic-refresh"},{ownerToken:f.idToken(uid)});assert.deepEqual(await r.json(),{phase:"connected"});}
 for(const uid of ["owner","wife"]){const result=await runtime.handle(uid,"/days/2026-10-25","GET");assert.equal(result.status,200);}
 assert.deepEqual(f.reads.map(x=>[x.uid,x.profileId]),[["owner","firestore-yuri"],["wife","firestore-wife"]]);
 assert.notEqual(f.reads[0].token,f.reads[1].token);
 await assert.rejects(runtime.handle("wife","/data-session","PUT",{refreshToken:"owner-synthetic-refresh"},{ownerToken:f.idToken("wife")}),/data_auth_required/);
 assert.deepEqual(await(await runtime.handle("wife","/data-session","GET")).json(),{phase:"connected"});
 await runtime.close();assert.equal(runtime.accepts("owner"),false);assert.equal(f.native,0);
 const reopened=await f.open();assert.deepEqual(await(await reopened.handle("wife","/data-session","GET")).json(),{phase:"connected"});
});

test("lost critical tables never become an empty admission or save store",async t=>{
 for(const [name,table] of [["outbox.sqlite","personal_inputs"],["outbox.sqlite","personal_attempts"],["accounts/owner/turns.sqlite","turns"],["accounts/owner/turns.sqlite","drafts"],["accounts/owner/turns.sqlite","save_commands"],["native.sqlite","connection_state"]]){
  const f=fixture(t);f.provision();const file=join(f.root,name),db=new DatabaseSync(file);try{db.exec("DROP TABLE "+table);}finally{db.close();}
  await assert.rejects(f.open());const after=new DatabaseSync(file,{readOnly:true});try{assert.equal(after.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table),undefined);}finally{after.close();}
  assert.equal(f.native,0);assert.equal(f.calls,0);
 }
});

test("provisioning close failure still closes other stores and erases all derived key bytes",()=>{
 const seen=[],keys=[Buffer.alloc(32,1),Buffer.alloc(32,2)],resources=[{close(){seen.push("first");}},{close(){seen.push("fault");throw Error("synthetic-io-fault");}},{close(){seen.push("last");}}];
 assert.throws(()=>closeProvisionResources(resources,keys),/personal_provision_cleanup_failed/);
 assert.deepEqual(seen,["last","fault","first"]);assert.ok(keys.every(key=>key.every(byte=>byte===0)));
});

test("caller may erase the bootstrap key before lazy Firebase vault access",async t=>{
 const f=fixture(t);f.provision();const original=Buffer.from(f.config.platformKey);const runtime=await f.open();f.config.platformKey.fill(0);
 const connected=await runtime.handle("wife","/data-session","PUT",{refreshToken:"wife-synthetic-refresh"},{ownerToken:f.idToken("wife")});assert.equal(connected.status,200);
 await runtime.close();original.copy(f.config.platformKey);original.fill(0);
 const reopened=await f.open();assert.deepEqual(await(await reopened.handle("wife","/data-session","GET")).json(),{phase:"connected"});
});

test("ephemeral upload provision rejects a regular disk instead of silently storing raw media there", t=>{
 const f=fixture(t);if(statfsSync(f.root.replace(/\/state$/,"")).type===0x01021994)return;
 const profiles=personalProfiles(f.config.registry),ephemeralRoot=join(f.root.replace(/\/state$/,""),"ephemeral");
 const paths=personalRuntimePaths(f.root,profiles,f.config.index,{ephemeralRoot});
 assert.throws(()=>preparePersonalEphemeral(paths,profiles),/personal_runtime_invalid/);assert.deepEqual(readdirSync(ephemeralRoot),[]);
 assert.throws(()=>personalRuntimePaths(f.root,profiles,f.config.index,{ephemeralRoot:join(f.root,"media")}),/personal_runtime_invalid/);
});

test("Desktop viewer lanes remain bounded and reusable across repeated reconnects", async t => {
 const f=fixture(t);f.provision();const runtime=await f.open();
 for(let index=0;index<12;index++){
  const primary=runtime.openDesktop("owner","desktop:primary",()=>{});
  assert.throws(()=>runtime.openDesktop("owner","desktop:primary",()=>{}),/desktop_unavailable/);
  const secondary=runtime.openDesktop("owner","desktop:secondary",()=>{});
  const wife=runtime.openDesktop("wife","desktop:primary",()=>{});
  assert.throws(()=>runtime.openDesktop("owner","desktop:third",()=>{}),/desktop_unavailable/);
  await Promise.all([primary.close(),secondary.close(),wife.close()]);
 }
 assert.equal(f.native,0);
});
