import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { createPersonalProcess } from "./personal-process.mjs";

function fixture({ command = () => {}, deadlineMs = 100, spawnFailure = false, missingStream = false, remote = false, onModel = async () => ({ completion: {} }) } = {}) {
  const child = new EventEmitter(), packets = [], kills = [];
  child.pid = spawnFailure || remote ? undefined : 123456;
  if (remote) child.requiresPhysicalDrain = true;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough({ highWaterMark: 1024 });
  const reply = value => child.stdout.write(JSON.stringify(value) + "\n");
  child.stdin = new Writable({ write(chunk, _encoding, done) {
    const value = JSON.parse(chunk.toString()); packets.push(value);
    if (value.type === "setup" && !spawnFailure) queueMicrotask(() => reply({ type: "result", id: value.id, result: { profileId: "/synthetic/profile", instanceId: "synthetic", authorityEpoch: 1 } }));
    else command(value, reply);
    done();
  } });
  child.kill = signal => { kills.push(signal); return true; };
  if (missingStream) child.stdout = null;
  const owner = createPersonalProcess({ spawnWorker: () => { if (spawnFailure) queueMicrotask(() => child.emit("error", Error("synthetic spawn failure"))); return child; },
    connection: {}, toolSchemas: {}, onModel, onTool: async () => ({}), deadlineMs });
  return { owner, child, packets, kills, reply, exit: () => child.emit("exit", 0, null) };
}

test("stdout EOF and close do not release physical owner before exit", async () => {
  const f = fixture(); await f.owner.start();
  let finished = false; const closing = f.owner.close().then(() => { finished = true; });
  f.child.stdout.end(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(finished, false); assert.equal(f.owner.exited, false);
  f.exit(); await closing; assert.equal(f.owner.exited, true);
});

test("lost reply kills owned worker and keeps the receipt uncertain until physical exit", async () => {
  const f = fixture({ deadlineMs: 5 }); await f.owner.start();
  const pending = assert.rejects(f.owner.rpc("web", "prompt.submit", {}), /^Error: execution_unknown$/);
  await new Promise(resolve => setTimeout(resolve, 20)); await pending;
  assert.deepEqual(f.kills, ["SIGKILL"]); assert.equal(f.owner.exited, false);
  const close = f.owner.close(); f.exit(); await close;
  await assert.rejects(f.owner.bot("web"), /trainer_unavailable/);
});

test("malformed native protocol never leaks raw body into public error", async () => {
  const f = fixture(); await f.owner.start();
  const pending = assert.rejects(f.owner.rpc("web", "session.resume", {}), /^Error: execution_unknown$/);
  await new Promise(resolve => setImmediate(resolve));
  f.child.stdout.write('Bearer synthetic-never-publish\n'); await pending;
  assert.equal(f.kills.length, 1); const close = f.owner.close(); f.exit(); await close;
});

test("spawn failure is known not-started and close cannot wait for a nonexistent exit", async () => {
  const f = fixture({ spawnFailure: true });
  await assert.rejects(f.owner.start(), /execution_unknown/);
  assert.deepEqual(await f.owner.close(), { notStarted: true });
});

test("model error is redacted and native events stay on their own channel", async () => {
  const f = fixture({ onModel: async () => { throw Error("Bearer synthetic-secret"); } }); await f.owner.start();
  f.reply({ type: "model", id: "a".repeat(32), payload: {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.packets.at(-1), { type: "reply", id: "a".repeat(32), error: "trainer_unavailable" });
  const close = f.owner.close(); f.exit(); await close;
});

test("physical process exit aborts any parent-owned model request", async () => {
  let signal;
  const f = fixture({ onModel: async (_body, options) => { signal = options.signal; return {}; } }); await f.owner.start();
  f.reply({ type: "model", id: "b".repeat(32), payload: {} });
  assert.equal(signal.aborted, false); f.exit(); assert.equal(signal.aborted, true);
  await f.owner.close();
});

test("owned child with missing stdio is still physically reaped", async () => {
  const f = fixture({ missingStream: true });
  await assert.rejects(f.owner.start(), /trainer_unavailable/);
  assert.deepEqual(f.kills, ["SIGKILL"]); assert.equal(f.owner.exited, false);
  let closed = false; const close = f.owner.close().then(() => { closed = true; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(closed, false);
  f.exit(); await close; assert.equal(f.owner.exited, true);
});

test("native stderr is drained without retaining private logs or blocking replies", async () => {
  const f = fixture({ command: (value, reply) => { if (value.type === "bot") reply({ type: "result", id: value.id, result: { session_id: "synthetic" } }); } });
  await f.owner.start();
  for (let index = 0; index < 64; index++) {
    if (!f.child.stderr.write(Buffer.alloc(65536, 120))) await new Promise(resolve => f.child.stderr.once("drain", resolve));
  }
  assert.equal(f.child.stderr.readableLength, 0);
  assert.equal((await f.owner.bot("web")).session_id, "synthetic");
  const close = f.owner.close(); f.exit(); await close;
});

test("close before start resolves the same terminal lifecycle without spawning", async () => {
  const f = fixture();
  assert.deepEqual(await f.owner.close(), { notStarted: true });
  assert.deepEqual(await f.owner.waitForExit(), { notStarted: true });
  assert.equal(f.owner.exited, true); assert.deepEqual(f.packets, []);
  await assert.rejects(f.owner.start(), /trainer_unavailable/);
});

test("native callback cancellation aborts parent work and close waits for its real settlement", async () => {
  let signal, settle;
  const f = fixture({ onModel: (_body, options) => { signal = options.signal; return new Promise(resolve => { settle = resolve; }); } });
  await f.owner.start();
  f.reply({ type: "model", id: "c".repeat(32), payload: {} });
  f.reply({ type: "cancel", id: "c".repeat(32) });
  assert.equal(signal.aborted, true); assert.deepEqual(f.kills, ["SIGKILL"]);
  f.exit(); let closed = false; const close = f.owner.close().then(() => { closed = true; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(closed, false);
  settle({}); await close; assert.equal(closed, true);
});

test("per-callback deadline aborts a listening parent even without native cancel", async () => {
  let signal;
  const f = fixture({ deadlineMs: 10, onModel: (_body, options) => { signal = options.signal; return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(Error("trainer_timeout")), { once: true })); } });
  await f.owner.start(); f.reply({ type: "model", id: "d".repeat(32), payload: {} });
  await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(signal.aborted, true);
  assert.ok(f.kills.length >= 1); const close = f.owner.close(); f.exit(); await close;
});


for (const code of ["media_quota", "media_unsupported", "media_conflict", "media_unavailable", "invalid_image"]) test(`typed photo failure survives the private process pipe: ${code}`, async () => {
  const f = fixture({ command: (value, reply) => { if (value.type === "stageImages") reply({ type: "result", id: value.id, error: code }); } });
  await f.owner.start();
  await assert.rejects(f.owner.stageImages("synthetic-input-0001", []), error => error.message === code);
  const closing = f.owner.close(); f.exit(); await closing;
});


test("private process rejects a frame above the bounded 48MiB photo envelope", async () => {
  const f = fixture(); await f.owner.start();
  const pending = assert.rejects(f.owner.rpc("web", "session.resume", {}), /execution_unknown/);
  await new Promise(resolve => setImmediate(resolve));
  f.child.stdout.write(Buffer.alloc(48 * 1024 * 1024 + 1, 120)); await pending;
  assert.deepEqual(f.kills, ["SIGKILL"]); const closing = f.owner.close(); f.exit(); await closing;
});

for (const missingStream of [false, true]) test(`remote activation ${missingStream ? "with invalid stdio" : "error"} waits for physical drain without a pid`, async () => {
  const f = fixture({ remote: true, spawnFailure: !missingStream, missingStream });
  await assert.rejects(f.owner.start(), /trainer_unavailable|execution_unknown/);
  assert.equal(f.owner.exited, false);
  let drained = false;
  const closing = f.owner.close().then(() => { drained = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(drained, false);
  f.exit(); await closing;
  assert.equal(f.owner.exited, true);
});
