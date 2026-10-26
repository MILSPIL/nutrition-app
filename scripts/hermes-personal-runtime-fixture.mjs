// Actual pinned authorities/SDK; all identities, food, credentials and HTTP fake.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { readFileSync, mkdirSync, existsSync, lstatSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createHmac, createHash, randomBytes, randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { createSystemdProcess } from "../server/trainer/systemd-process.mjs";
import { startSystemdWatchdog } from "../server/trainer/systemd-watchdog.mjs";
import { deflateSync, crc32 } from "node:zlib";
import { createPersonalRuntime, provisionPersonalRuntime } from "../server/trainer/personal-runtime.mjs";
import { openPersonalCredentials } from "../server/trainer/personal-credentials.mjs";
import { createPersonalDesktopEndpoint } from "../server/trainer/personal-desktop-endpoint.mjs";
import { WebSocket } from "ws";

const setup=JSON.parse(readFileSync(process.argv[2])),root=setup.env.SCISENSE_FIXTURE_ROOT;
if(setup.systemd){
 const marker="/etc/scisense/personal/ci-only",info=lstatSync(marker);
 if(process.platform!=="linux"||info.uid!==0||info.mode&0o022||!info.isFile()||readFileSync(marker,"utf8")!=="synthetic-native-systemd-v1\n")throw Error("owned_synthetic_container_required");
}
const platformKey=randomBytes(32),stateRoot=join(root,"runtime-state");
const registry=setup.systemd?.registry||{version:1,fundingOwner:"owner",profiles:["owner","wife"].map(uid=>({uid,profileId:"native-"+uid,home:join(root,"runtime-"+uid),socket:join(root,"run-"+uid,"native.sock"),canonicalTitle:"Bot Chat"}))};
if(!setup.systemd)for(const {home} of registry.profiles)mkdirSync(home,{mode:0o700});
const watchdog=setup.systemd?startSystemdWatchdog():null;watchdog?.ready();
const systemdLaunch=role=>createSystemdProcess({socketPath:"/run/scisense-broker/"+role+".sock",role,brokerGid:10005});
const project="scisense-test",idToken=uid=>"synthetic."+Buffer.from(JSON.stringify({sub:uid,aud:project,iss:`https://securetoken.google.com/${project}`,exp:Math.floor(Date.now()/1000)+3600})).toString("base64url")+".signature";
let runtime,payerCount=0,checks=0,stage="provision";const reads=[];
const launch=env=>spawn(setup.command,setup.args,{cwd:root,env:{...setup.env,...env},stdio:["pipe","pipe","ignore"]});
const config={registry,platformKey,root:stateRoot,index:join(root,"unused-index"),project,firebaseApiKey:"synthetic-public-api-key",dataProfiles:{owner:"yuri",wife:"wife-data"},
 ...(setup.systemd?{ephemeralRoot:"/run/scisense/native-test-media"}:{}),
 spawnOwner:profile=>setup.systemd?systemdLaunch(setup.systemd.lanes[profile.uid]):launch({HERMES_HOME:profile.home}),
 spawnPayer:()=>{if(setup.systemd)return systemdLaunch("payer");const home=join(root,"synthetic-payer-"+ ++payerCount);mkdirSync(home,{mode:0o700});return launch({HERMES_HOME:home,SCISENSE_IPC_WORKER:join(dirname(new URL(import.meta.url).pathname),"hermes-personal-payer-fixture.py")});},
 verifyToken:async request=>JSON.parse(Buffer.from(request.headers.get("Authorization").slice(7).split(".")[1],"base64url")).sub,
 fetcher:async(url,options)=>{assert.ok(url.startsWith("https://securetoken.googleapis.com/v1/token?"));const refresh=new URLSearchParams(options.body).get("refresh_token"),uid=refresh.startsWith("wife")?"wife":"owner";return Response.json({user_id:uid,token_type:"Bearer",refresh_token:refresh,id_token:idToken(uid),expires_in:"3600"});},
 indexFactory:()=>({close(){}}),readerFactory:({ownerUid,profileId,getOwnerToken})=>({
  readDay:async(uid,targetDate,signal)=>{assert.equal(uid,ownerUid);const token=await getOwnerToken(uid,signal);assert.ok(token===idToken(uid)||JSON.parse(Buffer.from(token.split(".")[1],"base64url")).sub===uid);reads.push([uid,profileId]);return {targetDate,revision:uid==="owner"?7:12,meals:{},notes:[]};},readPlan:async()=>({planContext:{}})})};
async function desktopWire(socketPath,token,events){
 const ws=new WebSocket("ws+unix://"+socketPath+":/api/ws?hermes_canonical=1",["hermes-gateway-v1","hermes-gateway-ticket."+token.toString()]);
 ws.on("error",()=>{});await new Promise((resolve,reject)=>{ws.once("open",resolve);ws.once("error",reject);});
 let next=0;const pending=new Map();
 ws.on("message",raw=>{const frame=JSON.parse(raw);if(frame.method==="event")events.push(frame.params.type);else{const current=pending.get(frame.id);if(!current)return;pending.delete(frame.id);frame.error?current.reject(Error(frame.error.data.reason)):current.resolve(frame.result);}});
 ws.on("close",()=>{for(const request of pending.values())request.reject(Error("desktop_wire_closed"));pending.clear();});
 return{ws,call:(method,params={})=>new Promise((resolve,reject)=>{if(ws.readyState!==1)return reject(Error("desktop_wire_closed"));const id=++next;pending.set(id,{resolve,reject});ws.send(JSON.stringify({jsonrpc:"2.0",id,method,params}));})};
}
async function state(uid){return(await runtime.handle(uid,"/state","GET")).json();}
async function send(uid,text,images=[]){const view=await state(uid),body={turnId:randomUUID(),baseRevision:view.revision,text,dateContext:{mode:"default"},images};assert.equal((await runtime.handle(uid,"/turns","POST",body)).status,202);for(let n=0,until=Date.now()+45000;n<1800&&Date.now()<until;n++){const turn=await(await runtime.handle(uid,"/turns/"+body.turnId,"GET")).json();if(!["queued","running"].includes(turn.state)){assert.equal(turn.state,"completed");return turn;}await new Promise(resolve=>setTimeout(resolve,25));}throw Error("fixture_timeout");}
const makePng = ()=>{
 const chunk=(name,data)=>{const type=Buffer.from(name),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);type.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([type,data])),data.length+8);return out;};
 const width=setup.systemd?1024:32,height=setup.systemd?1400:16;
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
 const pixels=setup.systemd?randomBytes((width*3+1)*height):Buffer.alloc((width*3+1)*height,100);for(let y=0;y<height;y++)pixels[y*(width*3+1)]=0;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",deflateSync(pixels)),chunk("IEND",Buffer.alloc(0))]).toString("base64");
};
const png=makePng(),secondPng=setup.systemd?makePng():png,thirdPng=setup.systemd?makePng():png;
if(setup.systemd)(await import("node:fs")).writeFileSync("/var/lib/scisense/native-expected.json",JSON.stringify({imageDigests:[png,secondPng,thirdPng].map(value=>createHash("sha256").update(Buffer.from(value,"base64")).digest("hex"))}),{mode:0o600});
try{
 provisionPersonalRuntime(config);
 const nativeKey=createHmac("sha256",platformKey).update("scisense-personal-runtime-v1:native").digest();
 const credentials=openPersonalCredentials(join(stateRoot,"native.sqlite"),{key:nativeKey,fundingOwnerUid:"owner"});
 try{credentials.initialize({"auth.json":Buffer.from(JSON.stringify({version:1,providers:{"openai-codex":{tokens:{access_token:"synthetic."+Buffer.from(JSON.stringify({exp:1})).toString("base64url")+".signature",refresh_token:"synthetic-refresh"}}}})),"config.yaml":Buffer.from(JSON.stringify({model:{provider:"openai-codex",default:"synthetic-model"},auth:{adopt_external_logins:false},model_overrides:{"openai-codex":{"synthetic-model":{supports_tools:true,supports_vision:true,context_window:128000},"gpt-6-sol":{supports_tools:true,supports_vision:true,context_window:128000}}}}))});}finally{credentials.close();nativeKey.fill(0);}
 stage="runtime-start";runtime=await createPersonalRuntime(config);checks++;if(setup.systemd){const initial=new DatabaseSync(join(stateRoot,"outbox.sqlite"),{readOnly:true});try{assert.equal(initial.prepare("SELECT COUNT(*) AS n FROM personal_attempts").get().n,0);}finally{initial.close();}}else assert.equal(existsSync(join(root,"synthetic-physical-posts.jsonl")),false);checks++;
 for(const uid of ["owner","wife"]){const view=await state(uid);assert.deepEqual(view.messages,[]);assert.equal(view.dataSession.phase,"reauth_required");checks++;}
 stage="firebase-connect";
 for(const uid of ["owner","wife"]){assert.equal((await runtime.handle(uid,"/data-session","PUT",{refreshToken:uid+"-synthetic-refresh"},{ownerToken:idToken(uid)})).status,200);checks++;}
 stage="native-web-turns";
 await send("owner","Я з’їв 200 г синтетичної страви, тільки власника. SYNTHETIC_READY_DRAFT",(setup.systemd?[{type:"image/png",data:png},{type:"image/png",data:secondPng}]:[{type:"image/png",data:png}]));checks++;
 assert.deepEqual((await state("wife")).messages,[]);checks++;
 await send("wife","Покажи мій інший синтетичний день, тільки дружини.");checks++;
 const owner=await state("owner"),wife=await state("wife");
 assert.equal(owner.drafts.length,1);assert.equal(owner.drafts[0].state,"ready");assert.ok(owner.messages.at(-1).content.includes("натисни «Додати»"));checks++;
 assert.ok(owner.messages.some(m=>m.content.includes("тільки власника")));assert.ok(!owner.messages.some(m=>m.content.includes("тільки дружини")));checks++;
 assert.ok(wife.messages.some(m=>m.content.includes("тільки дружини")));assert.ok(!wife.messages.some(m=>m.content.includes("тільки власника")));checks++;
 assert.ok(reads.some(([uid,profile])=>uid==="owner"&&profile==="yuri"));assert.ok(reads.some(([uid,profile])=>uid==="wife"&&profile==="wife-data"));checks++;
 stage="native-model-selection";
 const options=await runtime.modelOptions("owner");assert.equal(options.model,"synthetic-model");assert.ok(options.providers[0].models.includes("gpt-6-sol"));checks++;
 await assert.rejects(runtime.selectModel("wife",{provider:"openai-codex",model:"gpt-6-sol"}),/model_owner_required/);checks++;
 const selection=await runtime.selectModel("owner",{provider:"openai-codex",model:"gpt-6-sol"});assert.equal(selection.connection.model,"gpt-6-sol");assert.equal(selection.connection.provider,"openai-codex");checks++;
 assert.deepEqual((await state("owner")).messages,owner.messages);assert.deepEqual((await state("wife")).messages,wife.messages);checks++;
 stage="protected-native-photos";
 const photoRef=owner.messages.find(message=>message.photos?.length).photos[0].ref;
 const thumbnail=await(await runtime.handle("owner",`/photos/${photoRef}/thumbnail`,"GET")).json();assert.equal(thumbnail.type,"image/webp");checks++;
 const original=await(await runtime.handle("owner",`/photos/${photoRef}/original`,"GET")).json();assert.equal(original.data,png);checks++;
 await assert.rejects(runtime.handle("wife",`/photos/${photoRef}/original`,"GET"),/media_missing/);checks++;
 const deletePhoto=async()=>{
 assert.deepEqual(await(await runtime.handle("owner",`/photos/${photoRef}`,"POST",{action:"delete"})).json(),{deleted:true});checks++;
 await assert.rejects(runtime.handle("owner",`/photos/${photoRef}/original`,"GET"),/media_missing/);assert.deepEqual((await state("owner")).messages,owner.messages);checks++;
 };
 if(!setup.systemd)await deletePhoto();
 stage="physical-runtime-restart";await runtime.close();runtime=await createPersonalRuntime(config);checks++;
 for(const [uid,before] of [["owner",owner],["wife",wife]]){const after=await state(uid);assert.deepEqual(after.messages,before.messages);assert.equal(after.latestTurn.nativeInputClaimed,true);assert.equal(after.dataSession.phase,"connected");checks++;}
 await assert.rejects(runtime.handle("stranger","/state","GET"),/pilot_forbidden/);checks++;
 stage="rotated-connection-after-restart";
 const desktopEvents=[],endpointToken=Buffer.from(randomBytes(32).toString("base64url")),socketDirectory=setup.systemd?"/run/scisense":mkdtempSync("/private/tmp/scisense-wire-"),socketPath=join(socketDirectory,"desktop-y.sock");
 const endpoint=createPersonalDesktopEndpoint({runtime,uid:"owner",token:endpointToken,socketPath,socketGid:process.getgid()});
 await endpoint.listen();
 let wire=await desktopWire(socketPath,endpointToken,desktopEvents);
 const call=(method,params)=>wire.call(method,params);
 try{
  const native=await call("session.create",{title:"Bot Chat",request_id:randomUUID()});assert.equal(native.messages.filter(message=>message.role==="user").length,owner.messages.filter(message=>message.role==="user").length);checks++;
  await assert.rejects(call("prompt.submit",{session_id:native.session_id,text:"forged bypass",api_text:"forged snapshot"}),/desktop_method_forbidden/);checks++;
  await assert.rejects(call("session.info",{session_id:"another-profile-session"}),/session_changed/);checks++;
  let inputId=randomUUID();const text="Покажи стан після restart без нового refresh. SYNTHETIC_MODEL_CHANGED"+(setup.systemd?" SYNTHETIC_AFTER_RESTART":"");
  let uiResult;
  if(setup.desktopProbe){
    const closed=new Promise(resolve=>wire.ws.once("close",resolve));wire.ws.terminate();await closed;await new Promise(resolve=>setTimeout(resolve,10));
    const {checkPersonalDesktopUi}=await import("./hermes-personal-desktop-ui.mjs");
    const photo=join(root,"synthetic-desktop-photo.png");writeFileSync(photo,Buffer.from(thirdPng,"base64"),{mode:0o600});
    uiResult=await checkPersonalDesktopUi({...setup.desktopProbe,root,socketPath,token:endpointToken,sessionId:native.session_id,photo,
      existingText:"тільки власника",sendText:text,expectedAnswer:"Спільний native діалог збережений."});
    await new Promise(resolve=>setTimeout(resolve,25));wire=await desktopWire(socketPath,endpointToken,desktopEvents);
  }
  const images=setup.systemd?[{type:"image/png",data:thirdPng}]:[],attachments=[];
  for(const image of images){const staged=await call("image.attach_bytes",{session_id:native.session_id,content_base64:image.data,filename:"synthetic.png"});attachments.push({path:staged.path,mime:staged.mime});}
  if(uiResult)inputId=uiResult.inputId;
  const ack=uiResult?.receipt??await call("prompt.submit",{submission_id:inputId,session_id:native.session_id,text,attachments});assert.ok(ack.admission_id);checks++;
  for(let until=Date.now()+45000;;){const turn=await(await runtime.handle("owner","/turns/"+inputId,"GET")).json();if(!["queued","running"].includes(turn.state)){assert.equal(turn.state,"completed");break;}if(Date.now()>until)throw Error("desktop_fixture_timeout");await new Promise(resolve=>setTimeout(resolve,25));}checks++;
  assert.ok((await state("owner")).messages.some(message=>message.content.includes("SYNTHETIC_MODEL_CHANGED")));
  for(let until=Date.now()+1000;!desktopEvents.includes("message.complete")&&Date.now()<until;)await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(uiResult?.desktopLiveEvent||desktopEvents.includes("message.complete"),JSON.stringify(desktopEvents));checks++;
  const repeated=await call("prompt.submit",{submission_id:inputId,session_id:native.session_id,text,attachments:uiResult?.attachments??attachments});assert.equal(repeated.admission_id,ack.admission_id);checks++;
  if(uiResult){assert.equal(uiResult.sameCanonicalSession,true);checks++;}
 }finally{wire.ws.terminate();endpointToken.fill(0);await endpoint.close();if(!setup.systemd)rmSync(socketDirectory,{recursive:true});}
 if(setup.systemd){await runtime.handle("owner",`/photos/${photoRef}`,"POST",{action:"delete"});await assert.rejects(runtime.handle("owner",`/photos/${photoRef}/original`,"GET"),/media_missing/);checks++;}
 if(!setup.systemd){
 const posts=readFileSync(join(root,"synthetic-physical-posts.jsonl"),"utf8").trim().split("\n").map(JSON.parse);
 assert.equal(posts.length,7);assert.equal(posts.filter(post=>post.kind==="oauth_refresh").length,1);checks++;
 }
 const db=new DatabaseSync(join(stateRoot,"outbox.sqlite"),{readOnly:true});try{assert.equal(db.prepare("SELECT COUNT(*) AS n FROM personal_attempts").get().n,7);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM personal_turn_budgets").get().n,3);}finally{db.close();}checks++;
 const result={passed:true,checks,realPersonalRuntime:true,realNativeCodexProducer:true,separateDataProfiles:true,canonicalHistoryAfterPhysicalRestart:true,delegatedSessionAfterRestart:true,protectedNativePhotoReadDelete:true,nativeModelSelectedWithoutInference:true,nativeHistoryAfterModelSelection:true,desktopAppAdmission:true,desktopReceiptReplayNoDuplicate:true,desktopLiveEvents:true,privateDesktopWire:true,actualElectronUi:!!setup.desktopProbe,desktopRawRpcRefused:true,foreignPhotoRefRefused:true,modelLoginNeededForWife:false,startupNoProviderPosts:true,expiredNativeRefreshBeforeInference:true,rotatedConnectionUsedAfterPhysicalRestart:true,readyDraftLocalCompletionWithoutFourthPost:true,physicalPostReservations:7,realModelRequests:0};
 console.log(JSON.stringify(result));
 if(setup.systemd)(await import("node:fs")).writeFileSync("/var/lib/scisense/native-result.json",JSON.stringify(result),{mode:0o600});
}catch(error){console.error(JSON.stringify({syntheticStage:stage,error:error.message}));throw error;}
finally{await runtime?.close();platformKey.fill(0);watchdog?.close();}
