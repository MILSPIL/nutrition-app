import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createPersonalCoordinator } from "./personal-coordinator.mjs";
import { openPersonalStore } from "./personal-store.mjs";
import { personalProfiles } from "./personal-profiles.mjs";

function fixture(t, { beforeNative = async () => {}, prepare, loseAck = false, unknownFailure = false, closeGate = Promise.resolve(), botFailure = false, startGate = Promise.resolve(), openGate = Promise.resolve(), onAbort = () => {}, loseAckBeforeModel = false, lookupMiss = false, bindingPatch = {}, staleAck = false, abortFailure = false, payerExtensions = {} } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "scisense-coordinator-"))); chmodSync(dir, 0o700);
  const profiles = personalProfiles({ version: 1, fundingOwner: "owner", profiles: ["owner", "wife"].map(uid => ({ uid, profileId: "p-" + uid, home: "/synthetic/" + uid, socket: "/synthetic/run-" + uid + "/native.sock", canonicalTitle: "Bot Chat" })) });
  const key = randomBytes(32), raw = openPersonalStore(join(dir, "outbox.sqlite"), { profiles, key });
  const outbox = { ...raw, unknown(...args) { if (unknownFailure) throw Error("synthetic-db-fault"); return raw.unknown(...args); } };
  const messages = new Map(), receipts = new Map(), owners = [], modelCalls = [], prepared = [];
  let active, epoch = 1, revision = 0, nativeCalls = 0, tip = 1, failStatus = false;
  const payer = { async start() { await startGate; return { provider: "openai-codex", model: "synthetic", contextWindow: 128000, supportsTools: true, supportsVision: true }; },
    async withTurn(value, execute) { assert.equal(active, undefined); active = value; try { return await execute(async payload => { modelCalls.push({ uid: active.uid, payload }); outbox.reservePost(active.uid, active.inputId, { kind: "inference", model: "synthetic", originHash: "a".repeat(64) }); return { completion: {} }; }); } finally { active = undefined; } },
    async abortTurn() { onAbort(); if (abortFailure) throw Error("synthetic-cleanup-fault"); }, async close() {},
  };
  Object.assign(payer, payerExtensions);
  const core = createPersonalCoordinator({ profiles, outbox, payer, pollMs: 1,
    prepare: async ctx => { prepared.push({ uid: ctx.uid, revision, sentAt: ctx.sentAt }); return prepare ? prepare(ctx) : { apiText: "fresh:" + revision, tools: async () => ({}) }; },
    ownerFactory(profile, hooks) {
      const identity = { profileId: profile.home, instanceId: randomUUID(), authorityEpoch: epoch };
      const session = "session-" + profile.uid;
      const owner = { identity, closed: false, async start() { await openGate; return identity; }, async bot() { if (botFailure && owners.length === 1) throw Error("execution_unknown"); return { session_id: session + "-" + tip, messages: messages.get(profile.uid) ?? [] }; },
        async rpc(_channel, method, params) {
          if (method === "prompt.submit") {
            nativeCalls++; await beforeNative(profile.uid);
            const receipt = { ref: { profile_id: profile.home, session_id: params.session_id }, admission_id: "native-" + params.submission_id, sequence: nativeCalls, authority_epoch: epoch, execution_generation: 1, status: "terminal", outcome: "completed", result: { final_response: "answer:" + profile.uid } };
            receipts.set(receipt.admission_id, receipt); messages.set(profile.uid, [{ role: "user", content: params.text }, { role: "assistant", content: receipt.result.final_response }]);
            if (loseAckBeforeModel) { receipts.set(receipt.admission_id, { ...receipt, status: "unknown", outcome: null, result: undefined }); throw Error("execution_unknown"); }
            await hooks.onModel({ model: "synthetic", messages: [{ role: "user", content: params.api_text }] }, { signal: new AbortController().signal, nativeBinding: { profileId: profile.home, sessionId: params.session_id, inputId: params.submission_id, admissionId: "native-" + params.submission_id, authorityEpoch: epoch, generation: 1, sequence: nativeCalls, inputProof: outbox.binding(profile.uid, params.submission_id).payloadHmac, ...bindingPatch } });
            if (loseAck) throw Error("execution_unknown");
            return staleAck ? { ...receipt, status: "queued", execution_generation: null, result: undefined } : receipt;
          }
          if (method === "prompt.receipt") { if (failStatus) { failStatus = false; throw Error("execution_unknown"); } return receipts.get(params.admission_id); }
          throw Error("invalid_request");
        },
        async lookup(_channel, binding) { return lookupMiss ? null : receipts.get("native-" + binding.inputId) ?? null; },
        async close() { this.closed = true; await closeGate; },
      };
      owners.push(owner); return owner;
    },
  });
  t.after(async () => { await core.close(); outbox.close(); key.fill(0); rmSync(dir, { recursive: true, force: true }); });
  return { core, outbox, owners, prepared, modelCalls, get nativeCalls() { return nativeCalls; }, advanceTip() { tip++; }, change() { revision++; }, failStatus() { failStatus = true; }, nextEpoch() { epoch++; for (const owner of owners) owner.identity.authorityEpoch = epoch; } };
}

test("web and Desktop share native history; another verified UID has isolated tools and model context", async t => {
  const f = fixture(t), id = randomUUID();
  const result = await f.core.submit("owner", id, { text: "private owner" });
  assert.equal(result.state, "completed"); assert.equal(result.result.final_response, "answer:owner");
  assert.deepEqual(await f.core.history("owner", "web"), await f.core.history("owner", "desktop:first"));
  assert.deepEqual((await f.core.history("wife")).messages, []);
  await f.core.submit("wife", randomUUID(), { text: "private wife" }, { channel: "desktop:wife" });
  assert.deepEqual(f.modelCalls.map(c => c.uid), ["owner", "wife"]);
  assert.throws(() => f.core.enqueue("not-registered", randomUUID(), { text: "body has owner uid" }), /pilot_forbidden/);
  await f.core.submit("owner", id, { text: "private owner" }); assert.equal(f.nativeCalls, 2);
});

test("second profile waits; its snapshot is obtained after first native turn settles", async t => {
  let unblock, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const firstGate = new Promise(resolve => { unblock = resolve; });
  const f = fixture(t, { beforeNative: async uid => { if (uid === "owner") { entered(); await firstGate; } } });
  const one = f.core.submit("owner", randomUUID(), { text: "first" }); await started;
  const two = f.core.submit("wife", randomUUID(), { text: "second", sentAt: "2026-10-24T20:59:59.000Z" });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(f.prepared.length, 1);
  f.change(); unblock(); await Promise.all([one, two]);
  assert.deepEqual(f.prepared.map(x => x.revision), [0, 1]); assert.equal(f.prepared[1].sentAt, "2026-10-24T20:59:59.000Z");
});

test("lost ACK after a proven callback recovers a known native receipt without resubmission", async t => {
  const f = fixture(t, { loseAck: true }), id = randomUUID();
  await assert.rejects(f.core.submit("owner", id, { text: "one uncertain input" }), /execution_unknown/);
  assert.equal(f.owners[0].closed, true); assert.equal(f.outbox.read("owner", id).state, "unknown");
  assert.equal((await f.core.submit("owner", id, { text: "one uncertain input" })).state, "completed");
  assert.equal(f.nativeCalls, 1); assert.equal(f.modelCalls.length, 1);
});

test("read failure precedes native admission and does not spend a pilot turn or POST", async t => {
  const f = fixture(t, { prepare: async () => { throw Error("day_unavailable"); } }), id = randomUUID();
  await assert.rejects(f.core.submit("owner", id, { text: "food" }), /day_unavailable/);
  assert.equal(f.nativeCalls, 0); assert.deepEqual(f.outbox.budget(), { turns: 0, posts: 0 });
  assert.equal(f.outbox.read("owner", id).state, "queued");
});


test("outbox I/O failure cannot skip physical cleanup or release queue early", async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture(t, { loseAck: true, unknownFailure: true, closeGate: gate });
  const one = f.core.submit("owner", randomUUID(), { text: "first" }).catch(error => error);
  for (let i = 0; i < 20 && !f.owners[0]?.closed; i++) await new Promise(resolve => setTimeout(resolve, 1));
  const two = f.core.submit("wife", randomUUID(), { text: "second" }).catch(error => error);
  try {
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(f.owners[0].closed, true); assert.equal(f.prepared.length, 1); assert.equal(f.nativeCalls, 1);
  } finally { release(); }
  assert.equal((await one).message, "synthetic-db-fault"); await two;
});


test("pre-dispatch bot failure is drained and evicted before a later input", async t => {
  const f = fixture(t, { botFailure: true });
  await assert.rejects(f.core.submit("owner", randomUUID(), { text: "first" }), /execution_unknown/);
  assert.equal(f.owners[0].closed, true);
  assert.equal((await f.core.submit("owner", randomUUID(), { text: "second" })).state, "completed");
  assert.equal(f.owners.length, 2); assert.equal(f.nativeCalls, 1);
});

test("closed coordinator cannot spawn through history/status, including pending payer startup", async t => {
  let ready;
  const gate = new Promise(resolve => { ready = resolve; });
  const f = fixture(t, { startGate: gate });
  const read = f.core.history("owner").catch(error => error);
  const close = f.core.close(); ready(); await close;
  assert.equal((await read).message, "trainer_unavailable"); assert.equal(f.owners.length, 0);
  await assert.rejects(f.core.history("owner"), /trainer_unavailable/);
  await assert.rejects(f.core.status("owner", randomUUID()), /trainer_unavailable/);
  assert.equal(f.owners.length, 0);
});


test("failed preparation does not pin a queued retry before Bot Chat compression", async t => {
  let fails = true;
  const f = fixture(t, { prepare: async () => { if (fails) throw Error("day_unavailable"); return { apiText: "fresh", tools: async () => ({}) }; } });
  const id = randomUUID(), payload = { text: "one queued input" };
  await assert.rejects(f.core.submit("owner", id, payload), /day_unavailable/);
  assert.equal(f.outbox.read("owner", id).sessionId, "");
  fails = false; f.advanceTip();
  assert.equal((await f.core.submit("owner", id, payload)).sessionId, "session-owner-2");
});

test("concurrent read channels deduplicate profile startup around a retiring owner", async t => {
  let finishClose;
  const closeGate = new Promise(resolve => { finishClose = resolve; });
  const f = fixture(t, { botFailure: true, closeGate });
  const first = f.core.history("owner").catch(error => error);
  for (let i = 0; i < 20 && !f.owners[0]?.closed; i++) await new Promise(resolve => setTimeout(resolve, 1));
  const web = f.core.history("owner", "web"), desktop = f.core.history("owner", "desktop:second");
  finishClose(); await first; await Promise.all([web, desktop]);
  assert.equal(f.owners.length, 2);
});


test("queue abort interrupts pending producer startup before a profile may spawn", async t => {
  let stop;
  const startGate = new Promise((_resolve, reject) => { stop = () => reject(Error("synthetic-start-abort")); });
  const f = fixture(t, { startGate, onAbort: () => stop() }), controller = new AbortController();
  const pending = f.core.submit("owner", randomUUID(), { text: "one queued input" }, { signal: controller.signal }).catch(error => error);
  await new Promise(resolve => setImmediate(resolve)); controller.abort();
  assert.equal((await pending).message, "synthetic-start-abort");
  assert.equal(f.owners.length, 0); assert.equal(f.modelCalls.length, 0);
});


test("lost ACK before model handshake uses readonly input lookup; a miss never resubmits", async t => {
  for (const lookupMiss of [false, true]) {
    const f = fixture(t, { loseAckBeforeModel: true, lookupMiss }), id = randomUUID(), payload = { text: "uncertain before model" };
    await assert.rejects(f.core.submit("owner", id, payload), /execution_unknown/);
    assert.equal((await f.core.submit("owner", id, payload)).state, "unknown");
    assert.equal(f.nativeCalls, 1); assert.equal(f.modelCalls.length, 0);
    assert.equal(f.outbox.read("owner", id).admissionId, lookupMiss ? null : "native-" + id);
  }
});

test("model callback cannot borrow another input/profile/HMAC lease", async t => {
  for (const bindingPatch of [{ inputId: randomUUID() }, { profileId: "/synthetic/wife" }, { inputProof: "b".repeat(64) }]) {
    const f = fixture(t, { bindingPatch });
    await assert.rejects(f.core.submit("owner", randomUUID(), { text: "one real input" }), /execution_unknown/);
    assert.equal(f.modelCalls.length, 0); assert.equal(f.outbox.budget().posts, 0);
  }
});

test("late queued ACK cannot downgrade a proven native model generation", async t => {
  const f = fixture(t, { staleAck: true });
  const result = await f.core.submit("owner", randomUUID(), { text: "native callback overtook ACK" });
  assert.equal(result.state, "completed"); assert.equal(result.generation, 1); assert.equal(f.modelCalls.length, 1);
});

test("terminal birth epoch remains readable after native authority restart", async t => {
  const f = fixture(t), id = randomUUID();
  const result = await f.core.submit("owner", id, { text: "completed" });
  f.nextEpoch(); const recovered = await f.core.status("owner", id);
  assert.equal(recovered.state, "completed"); assert.equal(recovered.resultRevision, result.resultRevision);
});

test("status timeout evicts dead owner so status itself can recover", async t => {
  const f = fixture(t), id = randomUUID(); await f.core.submit("owner", id, { text: "completed" });
  f.failStatus(); await assert.rejects(f.core.status("owner", id), /execution_unknown/);
  assert.equal(f.owners[0].closed, true);
  assert.equal((await f.core.status("owner", id)).state, "completed"); assert.equal(f.owners.length, 2); assert.equal(f.nativeCalls, 1);
});

test("failed physical cleanup quarantines ingress before another profile can run", async t => {
  const f = fixture(t, { loseAck: true, abortFailure: true });
  await assert.rejects(f.core.submit("owner", randomUUID(), { text: "first" }), /owner_shutdown_incomplete/);
  await assert.rejects(f.core.submit("wife", randomUUID(), { text: "second" }));
  await assert.rejects(f.core.history("wife"), /trainer_unavailable/);
  assert.equal(f.nativeCalls, 1);
});


test("abort during retirement invalidates late startup before ownerFactory", async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture(t, { botFailure: true, closeGate: gate });
  const failedRead = f.core.history("owner").catch(error => error);
  for (let i = 0; i < 20 && !f.owners[0]?.closed; i++) await new Promise(resolve => setTimeout(resolve, 1));
  const controller = new AbortController();
  const submit = f.core.submit("owner", randomUUID(), { text: "cancelled while retiring" }, { signal: controller.signal }).catch(error => error);
  await new Promise(resolve => setImmediate(resolve)); controller.abort(); release();
  await failedRead; assert.equal((await submit).message, "trainer_unavailable");
  assert.equal(f.owners.length, 1); assert.equal(f.nativeCalls, 0);
});


test("abandoning a context read does not kill an owner or charge model budget", async t => {
  const f = fixture(t); await f.core.history("owner");
  const owner = f.owners[0]; let release, captured;
  const gate = new Promise(resolve => { release = resolve; });
  owner.contextRead = async options => { captured = options; await gate; return { text: "own context", revision: 1 }; };
  const controller = new AbortController(), reading = f.core.context("owner", { signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve)); controller.abort();
  await assert.rejects(reading, /upstream_timeout/); assert.equal(captured.signal, undefined); assert.equal(owner.closed, false);
  assert.deepEqual(f.outbox.budget(), { turns: 0, posts: 0 }); release();
});

test("timed-out memory commit holds queue until unavailable owner is physically drained", async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture(t, { closeGate: gate }); await f.core.history("owner");
  const owner = f.owners[0]; owner.contextCommit = async () => { owner.unavailable = true; throw Error("execution_unknown"); };
  const committing = f.core.commitContext("owner", {}).catch(error => error);
  for (let n = 0; n < 20 && !owner.closed; n++) await sleep(1);
  const next = f.core.submit("wife", randomUUID(), { text: "next" });
  await sleep(5); assert.equal(f.prepared.length, 0); release();
  assert.equal((await committing).message, "execution_unknown"); assert.equal((await next).state, "completed");
});


test("exhausted physical budget can use only the trusted local draft acknowledgement", async t => {
 let f, localCalls=0, verifies=0; const inputId=randomUUID();
 f=fixture(t,{ beforeNative: async uid => {
   for(let n=0;n<3;n++)f.outbox.reservePost(uid,inputId,{kind:n===0?"oauth_refresh":"inference",model:"synthetic",originHash:"a".repeat(64)});
 }, prepare: async () => ({apiText:"fresh",tools:async()=>({}),verify:async()=>{verifies++;},
   completeDraft:async(payload,connection)=>{localCalls++;assert.equal(connection.model,"synthetic");return {completion:{model:connection.model}};}}) });
 assert.equal((await f.core.submit("owner",inputId,{text:"validated food"})).state,"completed");
 assert.equal(localCalls,1);assert.equal(verifies,2);assert.equal(f.modelCalls.length,0);
 assert.deepEqual(f.outbox.postBudget("owner",inputId),{used:3,remaining:0});
});

test("budget exhaustion alone does not invent a successful food draft", async t => {
 let f;const inputId=randomUUID();
 f=fixture(t,{ beforeNative:async uid=>{for(let n=0;n<3;n++)f.outbox.reservePost(uid,inputId,{kind:"inference",model:"synthetic",originHash:"a".repeat(64)});} });
 await assert.rejects(f.core.submit("owner",inputId,{text:"incomplete or advice"}),/trainer_quota/);
 assert.equal(f.outbox.budget().posts,3);assert.equal(f.outbox.read("owner",inputId).state,"unknown");
});


test("only the funding owner selects models after every physical profile drain", async t => {
  const actions = []; let f;
  f = fixture(t, { payerExtensions: {
    async modelOptions() { return { provider: "openai-codex", model: "synthetic", providers: [] }; },
    async selectModel(value) { assert.ok(f.owners.every(owner => owner.closed)); actions.push(value); return { ok: true, ...value }; },
  } });
  const before = await f.core.history("owner"); await f.core.history("wife");
  await assert.rejects(f.core.selectModel("wife", { provider: "openai-codex", model: "next" }), /model_owner_required/);
  await assert.rejects(f.core.selectModel("owner", { provider: "anthropic", model: "next" }), /model_selection_refused/);
  await assert.rejects(f.core.selectModel("owner", { provider: "openai-codex", model: "next", api_key: "forged" }), /model_selection_refused/);
  assert.equal((await f.core.modelOptions("wife")).provider, "openai-codex");
  await f.core.selectModel("owner", { provider: "openai-codex", model: "next" });
  assert.equal(actions.length, 1); assert.equal(f.owners.length, 2);
  assert.equal((await f.core.history("owner")).session_id, before.session_id);
  assert.equal(f.owners.length, 3); assert.deepEqual(f.outbox.budget(), { turns: 0, posts: 0 });
});

test("model selection waits for an active turn and its physical cleanup", async t => {
  let release, started, changed = false;
  const entered = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture(t, { beforeNative: async () => { started(); await gate; }, payerExtensions: {
    async selectModel() { changed = true; assert.ok(f.owners.every(owner => owner.closed)); return { ok: true }; },
  } });
  const turn = f.core.submit("wife", randomUUID(), { text: "current turn" }); await entered;
  const selection = f.core.selectModel("owner", { provider: "openai-codex", model: "next" });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(changed, false);
  release(); await turn; await selection; assert.equal(changed, true);
  assert.deepEqual(f.outbox.budget(), { turns: 1, posts: 1 });
});
