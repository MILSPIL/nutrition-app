import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, chmodSync, rmSync, lstatSync, existsSync, renameSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { request } from "node:http";
import { connect as connectSocket } from "node:net";
import { WebSocket } from "ws";
import { createPersonalDesktopEndpoint } from "./personal-desktop-endpoint.mjs";

const ownHome = "/synthetic/owner", token = Buffer.from("s".repeat(43)), protocol = "hermes-gateway-v1";
async function fixture(t, { beforeSubmit = async () => {}, monotonicNow } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "scisense-desktop-endpoint-"))); chmodSync(dir, 0o700);
  const socketPath = join(dir, "private.sock"), submitted = [], reads = [], selected = [], opened = new Set(), connections = new Set();
  let historyReads = 0;
  const history = { profileId: ownHome, session_id: "own-session", messages: [{ role: "user", content: "own food" }], info: { profile_name: "native-server-name", profile_id: ownHome }, execution_generation: 1, authority_epoch: 1 };
  const runtime = { accepts: uid => uid === "owner", openDesktop(uid, lane, notify) {
    assert.equal(uid, "owner"); assert.equal(opened.has(lane), false); opened.add(lane);
    return {
      profileId: ownHome,
      async history() { historyReads++; return history; },
      async connection() { return { provider: "openai-codex", model: "synthetic-model", contextWindow: 128000, supportsTools: true, supportsVision: true }; },
      async modelOptions() { return { model: "synthetic-model", providers: [] }; },
      async selectModel(selection) { selected.push(selection); return { connection: selection }; },
      hashImage(image) { return createHash("sha256").update(image.data).digest("hex"); },
      async submit(value) {
        submitted.push(value); await beforeSubmit();
        notify({ jsonrpc: "2.0", method: "event", params: { type: "message.complete", session_id: "own-session", payload: { text: "own answer" } } });
        return { admission_id: value.inputId, ref: { session_id: "own-session" } };
      },
      async photo(ref) { if (ref === Buffer.from('a'.repeat(64)+'/photo.png').toString('base64url')) return {type:'image/png',data:'c3ludGhldGlj'}; throw Error('media_missing'); },
      async read(method, params) { reads.push([method, params]); if (method !== "session.resume") throw Error("desktop_method_forbidden"); if (params.session_id !== "own-session") throw Error("session_changed"); return history; },
      async cancel(id) { return { interrupted: true, id }; },
      async close() { opened.delete(lane); },
    };
  } };
  const endpoint = createPersonalDesktopEndpoint({ runtime, uid: "owner", token, socketPath, socketGid: process.getgid(), ...(monotonicNow?{monotonicNow}:{}) });
  await endpoint.listen();
  t.after(async () => { for (const ws of connections) ws.terminate(); await endpoint.close(); rmSync(dir, { recursive: true, force: true }); });
  const http = (path, { auth = true, method = "GET", body } = {}) => new Promise((resolve, reject) => {
    const req = request({ socketPath, path, method, headers: auth ? { Authorization: "Bearer " + token.toString(), "Content-Type": "application/json" } : {} }, res => {
      let text = ""; res.setEncoding("utf8"); res.on("data", chunk => text += chunk); res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
    });
    req.on("error", reject); req.end(body ? JSON.stringify(body) : undefined);
  });
  async function connect({ secret = token.toString(), query = "hermes_canonical=1" } = {}) {
    const ws = new WebSocket("ws+unix://" + socketPath + ":/api/ws?" + query, [protocol, "hermes-gateway-ticket." + secret]);
    connections.add(ws); ws.on("error", () => {});
    await new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
    const pending = new Map(), events = []; let next = 0;
    ws.on("message", raw => {
      const frame = JSON.parse(raw);
      if (frame.method === "event") events.push(frame.params);
      else { const request = pending.get(frame.id); pending.delete(frame.id); frame.error ? request.reject(Error(frame.error.data.reason)) : request.resolve(frame.result); }
    });
    return { ws, events, rpc(method, params = {}) { const id = ++next; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params })); }); } };
  }
  return { endpoint, socketPath, http, connect, submitted, reads, selected, opened, get historyReads() { return historyReads; } };
}

test("a private UDS endpoint authenticates without secrets in URLs and never offers a foreign profile", async t => {
  const f = await fixture(t);
  assert.equal(lstatSync(f.socketPath).mode & 0o777, 0o660);
  const status = await f.http("/api/status", { auth: false }); assert.equal(status.status, 200); assert.equal(status.body.auth_mode, "token"); assert.equal(status.body.scisense.bridge_version, 1);
  assert.equal((await f.http("/api/profiles", { auth: false })).status, 401);
  assert.equal((await f.http("/api/profiles?token=secret")).status, 400);
  assert.equal((await f.http("/api/health")).body.status, "ok");
  assert.equal((await f.http("/api/health", { auth: false })).status, 401);
  const own = await f.http("/api/profiles"); assert.equal(own.status, 200); assert.deepEqual(own.body.profiles.map(profile => profile.name), ["default"]);
  assert.equal((await f.http("/api/sessions/foreign-session/messages")).status, 404);
  assert.equal((await f.http("/api/config/raw")).status, 404);
  const foreign = await f.http("/api/profiles?profile=wife"); assert.equal(foreign.body.error, "profile_mismatch");
  await assert.rejects(f.connect({ secret: "f".repeat(43) }));
  await assert.rejects(f.connect({ query: "hermes_canonical=1&token=secret" }));
  await assert.rejects(f.connect({ query: "hermes_canonical=1&profile=wife" }));
  assert.equal(f.opened.size, 0);
});

test("Desktop wire submits only through the bound adapter and receives native events", async t => {
  const f = await fixture(t), c = await f.connect();
  const before = f.historyReads;
  const receipt = await c.rpc("prompt.submit", { session_id: "own-session", submission_id: "own-input", text: "Вчора яблуко", profile: "default" });
  assert.equal(receipt.admission_id, "own-input"); assert.equal(f.historyReads, before); // No pre-admission await can move the date.
  assert.equal(c.events.at(-1).type, "message.complete");
  assert.deepEqual(f.submitted[0], { inputId: "own-input", sessionId: "own-session", text: "Вчора яблуко", imageRefs: [], images: [] });
  for (const extra of [{ api_text: "bypass" }, { uid: "wife" }, { sentAt: "2020-01-01" }, { model_override: {} }, { cwd: "/tmp" }]) {
    await assert.rejects(c.rpc("prompt.submit", { session_id: "own-session", submission_id: "new", text: "own", ...extra }), /desktop_method_forbidden/);
  }
  await assert.rejects(c.rpc("prompt.submit", { session_id: "own-session", submission_id: "new", text: "own", profile: "wife" }), /profile_mismatch/);
  await assert.rejects(c.rpc("terminal.exec", { command: "whoami" }), /desktop_method_forbidden/);
  await assert.rejects(c.rpc("session.resume", { session_id: "foreign" }), /session_changed/);
  assert.equal(f.submitted.length, 1);
  assert.equal((await c.rpc("session.create", { title: "Bot Chat", request_id: "x" })).session_id, "own-session");
  await assert.rejects(c.rpc("session.create", { title: "Other Chat" }), /desktop_method_forbidden/);
  await assert.rejects(c.rpc("session.create", { toolsets: ["terminal"] }), /desktop_method_forbidden/);
  const resumed=await c.rpc("session.resume", { session_id: "own-session", source: "desktop" });
  assert.equal(resumed.session_id, "own-session"); assert.equal(resumed.info.profile_name,"default"); assert.equal(resumed.info.profile_id,ownHome);
  assert.deepEqual(f.reads.at(-1), ["session.resume", { session_id: "own-session" }]);
  await assert.rejects(c.rpc("session.resume", { session_id: "own-session", source: "telegram" }), /desktop_method_forbidden/);
  const listed = await c.rpc("session.list", { title: "Bot Chat", limit: 40, include_hidden: true, profile: "default" });
  assert.equal(listed.sessions[0].session_id, "own-session");
  await assert.rejects(c.rpc("session.list", { title: "Foreign" }), /desktop_method_forbidden/);
  const second = await f.connect({ query: "hermes_canonical=1&profile=default" });
  const reads = await Promise.all(Array.from({ length: 4 }, () => f.http("/api/model/info")));
  assert.ok(reads.every(result => result.status === 200)); // REST has its own serialized lane.
  assert.equal((await second.rpc("gateway.ping")).pong, true);
});

test("photo bytes are bounded, opaque, never path-loaded, and consumed after admission", async t => {
  const f = await fixture(t), c = await f.connect();
  const content = Buffer.from([137,80,78,71,13,10,26,10,1]).toString("base64");
  const image = await c.rpc("image.attach_bytes", { session_id: "own-session", content_base64: content, filename: "photo.png" });
  assert.match(image.path, /^scisense-image:[a-f0-9]{64}$/); assert.equal(image.mime, "image/png");
  await c.rpc("prompt.submit", { session_id: "own-session", submission_id: "photo-input", text: "Фото", attachments: [{ path: image.path, mime: image.mime }] });
  assert.equal(f.submitted[0].images[0].data, content); assert.equal(f.submitted[0].imageRefs[0], image.path.slice(15));
  await c.rpc("prompt.submit", { session_id: "own-session", submission_id: "photo-input", text: "Фото", attachments: [{ path: image.path, mime: image.mime }] });
  assert.equal(f.submitted[1].images, undefined); // Actual adapter handles durable replay.
  await assert.rejects(c.rpc("image.attach", { session_id: "own-session", path: "/etc/passwd" }), /desktop_method_forbidden/);
  await assert.rejects(c.rpc("image.attach_bytes", { session_id: "foreign", content_base64: content, filename: "x.png" }), /invalid_image/);
  await assert.rejects(c.rpc("prompt.submit", { session_id: "own-session", submission_id: "bad", attachments: [{ path: "/etc/passwd", mime: "image/png" }] }), /invalid_image/);
});

test("endpoint shutdown drains its own viewers and removes only its owned socket", async t => {
  const f = await fixture(t), c = await f.connect();
  await c.rpc("gateway.ping"); await f.endpoint.close();
  assert.equal(f.opened.size, 0); assert.equal(existsSync(f.socketPath), false);
});

test("an earlier admission cannot erase a newer identical image upload", async t => {
  let release, started;
  const entered = new Promise(resolve => { started = resolve; }), gate = new Promise(resolve => { release = resolve; });
  let first = true;
  const f = await fixture(t, { beforeSubmit: async () => { if (first) { first = false; started(); await gate; } } });
  const c = await f.connect(), content = Buffer.from([137,80,78,71,13,10,26,10,1]).toString("base64");
  const upload = () => c.rpc("image.attach_bytes", { session_id: "own-session", content_base64: content, filename: "photo.png" });
  const one = await upload(), attachments = [{ path: one.path, mime: one.mime }];
  const pending = c.rpc("prompt.submit", { session_id: "own-session", submission_id: "first-photo", text: "one", attachments });
  await entered; const newer = await upload(); assert.equal(newer.path, one.path); release(); await pending;
  await c.rpc("prompt.submit", { session_id: "own-session", submission_id: "second-photo", text: "two", attachments });
  assert.equal(f.submitted[1].images[0].data, content);
});

test("failed authenticated WebSocket handshakes cannot leak viewer slots", async t => {
  const f = await fixture(t);
  for (let index = 0; index < 3; index++) {
    const code = await new Promise((resolve, reject) => {
      const req = request({ socketPath: f.socketPath, path: "/api/ws?hermes_canonical=1", headers: {
        Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "invalid",
        "Sec-WebSocket-Protocol": protocol + ", hermes-gateway-ticket." + token.toString()
      } }, res => { res.resume(); res.on("end", () => resolve(res.statusCode)); });
      req.on("error", reject); req.end();
    });
    assert.equal(code, 400); assert.equal(f.opened.size, 0);
  }
  const c = await f.connect(); assert.equal((await c.rpc("gateway.ping")).pong, true);
});

test("a rejected half-open upgrade cannot hang endpoint shutdown", async t => {
  const f = await fixture(t);
  const socket = connectSocket({ path: f.socketPath, allowHalfOpen: true }); socket.on("error", () => {});
  t.after(() => socket.destroy());
  await new Promise(resolve => socket.once("connect", resolve));
  const response = new Promise(resolve => socket.once("data", data => resolve(data.toString())));
  socket.write("GET /api/ws?hermes_canonical=1 HTTP/1.1\r\nHost: local\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Protocol: " + protocol + ", hermes-gateway-ticket.wrong-secret\r\n\r\n");
  assert.match(await response, /401/);
  let timer;
  try { await Promise.race([f.endpoint.close(), new Promise((_resolve, reject) => { timer = setTimeout(() => reject(Error("shutdown_timeout")), 500); })]); }
  finally { clearTimeout(timer); }
  assert.equal(f.opened.size, 0);
});

test("the Desktop startup metadata burst stays bounded without disconnecting or admitting a model turn", async t => {
 const f=await fixture(t),c=await f.connect();
 const results=await Promise.all(Array.from({length:24},()=>c.rpc('client.capabilities',{desktop_local:true})));
 assert.ok(results.every(result=>Array.isArray(result.server_requests)));assert.equal(f.submitted.length,0);
 assert.equal((await c.rpc('onboarding.state')).eligible,false);
 assert.equal((await c.rpc('setup.status')).inference_provider,'openai-codex');
 assert.equal((await c.rpc('free_tier.status')).available,false);
 const profiles=await c.rpc('profiles.list',{include_sessions:true});assert.equal(profiles.profiles.length,1);assert.equal(profiles.profiles[0].canonical_session.id,'own-session');
 await assert.rejects(c.rpc('profiles.list',{profile:'wife'}),/profile_mismatch/);
 await assert.rejects(c.rpc('client.capabilities',{shell:true}),/invalid_request/);
 assert.equal((await c.rpc('gateway.ping')).pong,true);
});

test("closing the private listener preserves a replacement at the published socket path", async t => {
 const f=await fixture(t),retired=f.socketPath+'.retired';
 renameSync(f.socketPath,retired);writeFileSync(f.socketPath,'replacement sentinel',{mode:0o600});
 await f.endpoint.close();assert.equal(readFileSync(f.socketPath,'utf8'),'replacement sentinel');assert.equal(existsSync(retired),true);
});

test("raw photo expiry uses elapsed monotonic time even after a wall-clock rollback", async t => {
 let elapsed=0;const f=await fixture(t,{monotonicNow:()=>elapsed}),c=await f.connect();
 const content=Buffer.from([137,80,78,71,13,10,26,10,1]).toString('base64');
 const image=await c.rpc('image.attach_bytes',{session_id:'own-session',content_base64:content,filename:'photo.png'});
 const actualNow=Date.now,earlier=actualNow()-3600000;Date.now=()=>earlier;
 try {
  elapsed=300001;
  await c.rpc('prompt.submit',{session_id:'own-session',submission_id:'expired-photo',text:'own',attachments:[{path:image.path,mime:image.mime}]});
  assert.equal(f.submitted[0].images,undefined);
 } finally {Date.now=actualNow;}
});

test("Desktop photo reads map only own retained native paths; missing photos have an explicit placeholder", async t => {
 const f=await fixture(t),path=ownHome+'/cache/documents/native-inputs/'+'a'.repeat(64)+'/photo.png';
 const found=await f.http('/api/fs/read-data-url?path='+encodeURIComponent(path));
 assert.equal(found.body.missing,false);assert.equal(found.body.dataUrl,'data:image/png;base64,c3ludGhldGlj');
 const missing=await f.http('/api/fs/read-data-url?path='+encodeURIComponent(path.replace('photo.png','deleted.png')));
 assert.equal(missing.body.missing,true);assert.match(missing.body.dataUrl,/^data:image\/svg\+xml;base64,/);
 for(const foreign of ['/etc/passwd',path.replace('/owner/','/wife/'),path.replace('photo.png','../auth.json')]){
  assert.equal((await f.http('/api/fs/read-data-url?path='+encodeURIComponent(foreign))).body.error,'desktop_method_forbidden');
 }
});

test("1.9.10 K8: Desktop submits up to ten photos and refuses the eleventh", async t => {
  const f = await fixture(t), c = await f.connect();
  const upload = n => c.rpc("image.attach_bytes", { session_id: "own-session", content_base64: Buffer.from([137,80,78,71,13,10,26,10,n]).toString("base64"), filename: `photo-${n}.png` });
  const images = []; for (let n = 0; n < 11; n++) images.push(await upload(n));
  const attachments = images.map(image => ({ path: image.path, mime: image.mime }));
  await c.rpc("prompt.submit", { session_id: "own-session", submission_id: "ten-photos", text: "Фото", attachments: attachments.slice(0, 10) });
  assert.equal(f.submitted.at(-1).imageRefs.length, 10);
  await assert.rejects(c.rpc("prompt.submit", { session_id: "own-session", submission_id: "eleven-photos", text: "Фото", attachments }), /invalid_image/);
});
