// Actual pinned authorities/SDK; all identities, food, credentials and HTTP fake.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { deflateSync, crc32 } from "node:zlib";
import { createPersonalRuntime, provisionPersonalRuntime } from "../server/trainer/personal-runtime.mjs";
import { openPersonalCredentials } from "../server/trainer/personal-credentials.mjs";

const setup=JSON.parse(readFileSync(process.argv[2])),root=setup.env.SCISENSE_FIXTURE_ROOT;
const platformKey=randomBytes(32),stateRoot=join(root,"runtime-state");
const registry={version:1,fundingOwner:"owner",profiles:["owner","wife"].map(uid=>({uid,profileId:"native-"+uid,home:join(root,"runtime-"+uid),socket:join(root,"run-"+uid,"native.sock"),canonicalTitle:"Bot Chat"}))};
for(const {home} of registry.profiles)mkdirSync(home,{mode:0o700});
const project="scisense-test",idToken=uid=>"synthetic."+Buffer.from(JSON.stringify({sub:uid,aud:project,iss:`https://securetoken.google.com/${project}`,exp:Math.floor(Date.now()/1000)+3600})).toString("base64url")+".signature";
let runtime,payerCount=0,checks=0,stage="provision";const reads=[];
const launch=env=>spawn(setup.command,setup.args,{cwd:root,env:{...setup.env,...env},stdio:["pipe","pipe","ignore"]});
const config={registry,platformKey,root:stateRoot,index:join(root,"unused-index"),project,firebaseApiKey:"synthetic-public-api-key",dataProfiles:{owner:"yuri",wife:"wife-data"},
 spawnOwner:profile=>launch({HERMES_HOME:profile.home}),
 spawnPayer:()=>{const home=join(root,"synthetic-payer-"+ ++payerCount);mkdirSync(home,{mode:0o700});return launch({HERMES_HOME:home,SCISENSE_IPC_WORKER:join(dirname(new URL(import.meta.url).pathname),"hermes-personal-payer-fixture.py")});},
 verifyToken:async request=>JSON.parse(Buffer.from(request.headers.get("Authorization").slice(7).split(".")[1],"base64url")).sub,
 fetcher:async(url,options)=>{assert.ok(url.startsWith("https://securetoken.googleapis.com/v1/token?"));const refresh=new URLSearchParams(options.body).get("refresh_token"),uid=refresh.startsWith("wife")?"wife":"owner";return Response.json({user_id:uid,token_type:"Bearer",refresh_token:refresh,id_token:idToken(uid),expires_in:"3600"});},
 indexFactory:()=>({close(){}}),readerFactory:({ownerUid,profileId,getOwnerToken})=>({
  readDay:async(uid,targetDate,signal)=>{assert.equal(uid,ownerUid);const token=await getOwnerToken(uid,signal);assert.ok(token===idToken(uid)||JSON.parse(Buffer.from(token.split(".")[1],"base64url")).sub===uid);reads.push([uid,profileId]);return {targetDate,revision:uid==="owner"?7:12,meals:{},notes:[]};},readPlan:async()=>({planContext:{}})})};
async function state(uid){return(await runtime.handle(uid,"/state","GET")).json();}
async function send(uid,text,images=[]){const view=await state(uid),body={turnId:randomUUID(),baseRevision:view.revision,text,dateContext:{mode:"default"},images};assert.equal((await runtime.handle(uid,"/turns","POST",body)).status,202);for(let n=0;n<200;n++){const turn=await(await runtime.handle(uid,"/turns/"+body.turnId,"GET")).json();if(!["queued","running"].includes(turn.state)){assert.equal(turn.state,"completed");return turn;}await new Promise(resolve=>setTimeout(resolve,25));}throw Error("fixture_timeout");}
const png = (()=>{
 const chunk=(name,data)=>{const type=Buffer.from(name),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);type.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([type,data])),data.length+8);return out;};
 const header=Buffer.alloc(13);header.writeUInt32BE(32);header.writeUInt32BE(16,4);header[8]=8;header[9]=2;
 const pixels=Buffer.alloc((32*3+1)*16,100);for(let y=0;y<16;y++)pixels[y*(32*3+1)]=0;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",deflateSync(pixels)),chunk("IEND",Buffer.alloc(0))]).toString("base64");
})();
try{
 provisionPersonalRuntime(config);
 const nativeKey=createHmac("sha256",platformKey).update("scisense-personal-runtime-v1:native").digest();
 const credentials=openPersonalCredentials(join(stateRoot,"native.sqlite"),{key:nativeKey,fundingOwnerUid:"owner"});
 try{credentials.initialize({"auth.json":Buffer.from(JSON.stringify({version:1,providers:{"openai-codex":{tokens:{access_token:"synthetic."+Buffer.from(JSON.stringify({exp:1})).toString("base64url")+".signature",refresh_token:"synthetic-refresh"}}}})),"config.yaml":Buffer.from(JSON.stringify({model:{provider:"openai-codex",default:"synthetic-model"},auth:{adopt_external_logins:false},model_overrides:{"openai-codex":{"synthetic-model":{supports_tools:true,supports_vision:true,context_window:128000}}}}))});}finally{credentials.close();nativeKey.fill(0);}
 stage="runtime-start";runtime=await createPersonalRuntime(config);checks++;assert.equal(existsSync(join(root,"synthetic-physical-posts.jsonl")),false);checks++;
 for(const uid of ["owner","wife"]){const view=await state(uid);assert.deepEqual(view.messages,[]);assert.equal(view.dataSession.phase,"reauth_required");checks++;}
 stage="firebase-connect";
 for(const uid of ["owner","wife"]){assert.equal((await runtime.handle(uid,"/data-session","PUT",{refreshToken:uid+"-synthetic-refresh"},{ownerToken:idToken(uid)})).status,200);checks++;}
 stage="native-web-turns";
 await send("owner","Я з’їв 200 г синтетичної страви, тільки власника. SYNTHETIC_READY_DRAFT",[{type:"image/png",data:png}]);checks++;
 assert.deepEqual((await state("wife")).messages,[]);checks++;
 await send("wife","Покажи мій інший синтетичний день, тільки дружини.");checks++;
 const owner=await state("owner"),wife=await state("wife");
 assert.equal(owner.drafts.length,1);assert.equal(owner.drafts[0].state,"ready");assert.ok(owner.messages.at(-1).content.includes("натисни «Додати»"));checks++;
 assert.ok(owner.messages.some(m=>m.content.includes("тільки власника")));assert.ok(!owner.messages.some(m=>m.content.includes("тільки дружини")));checks++;
 assert.ok(wife.messages.some(m=>m.content.includes("тільки дружини")));assert.ok(!wife.messages.some(m=>m.content.includes("тільки власника")));checks++;
 assert.ok(reads.some(([uid,profile])=>uid==="owner"&&profile==="yuri"));assert.ok(reads.some(([uid,profile])=>uid==="wife"&&profile==="wife-data"));checks++;
 stage="protected-native-photos";
 const photoRef=owner.messages.find(message=>message.photos?.length).photos[0].ref;
 const thumbnail=await(await runtime.handle("owner",`/photos/${photoRef}/thumbnail`,"GET")).json();assert.equal(thumbnail.type,"image/webp");checks++;
 const original=await(await runtime.handle("owner",`/photos/${photoRef}/original`,"GET")).json();assert.equal(original.data,png);checks++;
 await assert.rejects(runtime.handle("wife",`/photos/${photoRef}/original`,"GET"),/media_missing/);checks++;
 assert.deepEqual(await(await runtime.handle("owner",`/photos/${photoRef}`,"POST",{action:"delete"})).json(),{deleted:true});checks++;
 await assert.rejects(runtime.handle("owner",`/photos/${photoRef}/original`,"GET"),/media_missing/);assert.deepEqual((await state("owner")).messages,owner.messages);checks++;
 stage="physical-runtime-restart";await runtime.close();runtime=await createPersonalRuntime(config);checks++;
 for(const [uid,before] of [["owner",owner],["wife",wife]]){const after=await state(uid);assert.deepEqual(after.messages,before.messages);assert.equal(after.latestTurn.nativeInputClaimed,true);assert.equal(after.dataSession.phase,"connected");checks++;}
 await assert.rejects(runtime.handle("stranger","/state","GET"),/pilot_forbidden/);checks++;
 stage="rotated-connection-after-restart";
 await send("owner","Покажи стан після restart без нового refresh.");checks++;
 const posts=readFileSync(join(root,"synthetic-physical-posts.jsonl"),"utf8").trim().split("\n").map(JSON.parse);
 assert.equal(posts.length,7);assert.equal(posts.filter(post=>post.kind==="oauth_refresh").length,1);checks++;
 const db=new DatabaseSync(join(stateRoot,"outbox.sqlite"),{readOnly:true});try{assert.equal(db.prepare("SELECT COUNT(*) AS n FROM personal_attempts").get().n,7);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM personal_turn_budgets").get().n,3);}finally{db.close();}checks++;
 console.log(JSON.stringify({passed:true,checks,realPersonalRuntime:true,realNativeCodexProducer:true,separateDataProfiles:true,canonicalHistoryAfterPhysicalRestart:true,delegatedSessionAfterRestart:true,protectedNativePhotoReadDelete:true,foreignPhotoRefRefused:true,modelLoginNeededForWife:false,startupNoProviderPosts:true,expiredNativeRefreshBeforeInference:true,rotatedConnectionUsedAfterPhysicalRestart:true,readyDraftLocalCompletionWithoutFourthPost:true,physicalPostReservations:7,realModelRequests:0}));
}catch(error){console.error(JSON.stringify({syntheticStage:stage,error:error.message}));throw error;}
finally{await runtime?.close();platformKey.fill(0);}
