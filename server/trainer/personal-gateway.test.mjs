import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { openTurnStore } from "./turn-store.mjs";
import { createTrainerGateway } from "./gateway.mjs";
import { createPersonalBackend, nativeMessageProjection } from "./personal-backend.mjs";

test("native failed-turn boundary is a Ukrainian notice instead of a model answer", () => {
  const [message] = nativeMessageProjection({ session_id: "synthetic", messages: [{ role: "assistant", display_kind: "failed_turn", content: "Your request was not processed." }] });
  assert.match(message.content, /Не вдалося обробити повідомлення/);
  assert.doesNotMatch(message.content, /Your request/);
});
test("native timeline uses admission ownership and stable row identity across repeated text", () => {
  const snapshot = { session_id: "synthetic", messages: [
    { role: "user", row_id: 20, message_id: "admission-one", content: "Так" },
    { role: "assistant", row_id: 21, content: "Прев’ю" },
    { role: "user", row_id: 22, message_id: "admission-two", content: "Так" },
    { role: "assistant", row_id: 23, content: "Порада" },
    { role: "user", row_id: 24, platform_message_id: 42, content: "Legacy" },
    { role: "assistant", row_id: 25, content: "Legacy reply" },
  ] };
  const result = nativeMessageProjection(snapshot, id => ({ inputId: { "admission-one": "input-one", "admission-two": "input-two" }[id] }));
  assert.deepEqual(result.map(m => m.turnId), ["input-one", "input-one", "input-two", "input-two", undefined, undefined]);
  assert.equal(new Set(result.map(m => m.id)).size, 6);
  assert.equal(nativeMessageProjection({ ...snapshot, messages: snapshot.messages.slice(1) })[0].id, result[1].id);
});
import { personalQueue } from "./personal-queue.mjs";
import { stableJSON } from "./limits.mjs";
import { buildSnapshot } from "./snapshot.mjs";

function fixture(t, { context = "synthetic", nativeState = "completed", malformedResult = false, drain, stageError, staleBeforeVerify = false, memory, authorize = async () => {}, gatewayOptions = {} } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "scisense-personal-gateway-"))); chmodSync(dir, 0o700);
  let clock = Date.parse("2026-10-24T20:59:59Z"), revision = 0, starts = 0, verifies = 0;
  const store = openTurnStore(join(dir, "turns.sqlite"), { hmacKey: randomBytes(32), now: () => clock });
  const queue = personalQueue(), inputs = new Map(), snapshots = [], sessionId = randomUUID();
  const core = { enqueue(_uid, id, body) { inputs.set(id, body); },
    schedule(uid, _id, callback, { signal }) { return queue.run(uid, async signal => callback({ signal, deadline: clock + 45000,
      execute: async value => {
        const id = [...inputs.keys()].at(-1), native = { admission_id: randomUUID(), ref: { session_id: sessionId } };
        const prepared = await value.prepare({ signal, sessionId });
        starts++;
        snapshots.push(JSON.parse(prepared.apiText));
        // A real tool can overtake the submission RPC ACK.
        await prepared.tools("read_confirmed_day", { dayRef: "today" }, { signal, nativeBinding: { admissionId: native.admission_id, sessionId } });
        await prepared.onAdmission(native); if (staleBeforeVerify) revision++; await prepared.verify();
        if (drain) { drain.entered(); await new Promise(resolve => { if (signal.aborted) resolve(); else signal.addEventListener("abort", resolve, { once: true }); }); await drain.wait; }
        return { state: nativeState, result: malformedResult ? {} : { final_response: "Відповідь тренера" } };
      } }), { signal }); },
    async history() { return { session_id: sessionId, messages: starts ? [{ role: "user", content: [...inputs.values()].at(-1).text }, { role: "assistant", content: "Відповідь тренера" }] : [] }; },
    input() { return { state: starts ? "admitted" : "queued", generation: starts ? 1 : null }; },
    async cancelInput() { return { stopped: true }; },
  };
  let firstStage = true;
  const backend = createPersonalBackend({ uid: "owner", core, stageAttachments: async () => { if (stageError && firstStage) { firstStage = false; throw Error(stageError); } return []; }, tools: { read_confirmed_day: async (_args, ctx) => {
    if (memory) memory.proposal = store.proposeContext(ctx.turn.id, ctx.turn.generation, { baseRevision: ctx.snapshot.contextRevision, text: "Новий синтетичний факт" });
    return {};
  } }, verify: async () => { verifies++; } });
  const g = createTrainerGateway({ ownerUid: "owner", store, backend, now: () => clock, queueWindowMs: 225000,
    snapshotFactory: value => buildSnapshot({ ...value, history: [], maxPayloadBytes: 512000 }),
    media: { describe: () => [], stage() {}, load: () => [], remove() {}, sweep: () => ({ faults: 0 }) }, proxy: { cancel() {}, close() {} },
    authorizeTurn: (uid, signal) => authorize({ uid, signal, advance() { clock += 10000; } }),
    memoryWriteEnabled: !!memory, contextStore: memory ? { commit: (...args) => memory.commit(...args) } : undefined,
    readContext: async () => memory ? memory.value : ({ text: context, revision: 1 }), readDay: async (_uid, targetDate) => ({ targetDate, revision, meals: {}, notes: [] }), readPlan: async () => ({ planContext: {} }),
    ...gatewayOptions,
  });
  t.after(async () => { await g.close(); await queue.close(); store.close(); rmSync(dir, { recursive: true, force: true }); });
  return { g, store, core, queue, snapshots, get starts() { return starts; }, get verifies() { return verifies; }, change() { revision++; clock += 10000; }, tick(ms) { clock += ms; },
    async settle(id) { for (let n = 0; n < 100; n++) { const row = store.get("owner", id); if (!["running", "queued"].includes(row.state)) return row; await sleep(2); } throw Error("fixture_timeout"); } };
}
const body = () => ({ turnId: randomUUID(), baseRevision: 0, text: "Вчора з’їв яблуко", dateContext: { mode: "default" } });

test("personal Gateway takes fresh day after queue and keeps original calendar anchor", async t => {
  const f = fixture(t); let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const first = f.queue.run("wife", async () => { entered(); await gate; });
  const occupied = new Promise(resolve => { entered = resolve; });
  await occupied;
  const input = body(); await f.g.handle("owner", "/turns", "POST", input);
  f.change(); release(); await first;
  assert.equal((await f.settle(input.turnId)).state, "completed");
  assert.equal(f.snapshots[0].day.revision, 1); assert.equal(f.snapshots[0].sentAt, "2026-10-24T20:59:59.000Z");
  assert.equal(f.snapshots[0].targetDate, "2026-10-23"); assert.equal(f.verifies, 1);
  const state = await (await f.g.handle("owner", "/state", "GET")).json();
  assert.equal(state.canonicalHistory, true); assert.equal(state.messages.length, 2); assert.equal(state.latestTurn.nativeInputClaimed, true);
});

test("personal context keeps all 80KB instead of legacy 32KB trimming or rejection", async t => {
  const text = "SYNTHETIC".repeat(9000), f = fixture(t, { context: text }), input = body();
  await f.g.handle("owner", "/turns", "POST", input); assert.equal((await f.settle(input.turnId)).state, "completed");
  assert.equal(f.snapshots[0].context, text); assert.deepEqual(f.snapshots[0].history, []);
});

test("queued cancel does not invoke Native and does not delete canonical history", async t => {
  const f = fixture(t); let release;
  const held = f.queue.run("wife", () => new Promise(resolve => { release = resolve; })); await sleep(1);
  const input = body(); await f.g.handle("owner", "/turns", "POST", input);
  await f.g.handle("owner", `/turns/${input.turnId}/cancel`, "POST", {}); release(); await held;
  assert.equal((await f.settle(input.turnId)).state, "cancelled"); assert.equal(f.starts, 0);
  await assert.rejects(f.g.handle("owner", "/conversation/delete", "POST", {}), /canonical_history_required/);
});

test("known failed Native receipt is failed rather than unknown", async t => {
  const f = fixture(t, { nativeState: "failed" }), input = body();
  await f.g.handle("owner", "/turns", "POST", input); assert.equal((await f.settle(input.turnId)).state, "failed");
});
test("completed Native with a malformed answer is a known failed turn, not a blocked chat", async t => {
  const f = fixture(t, { malformedResult: true }), input = body();
  await f.g.handle("owner", "/turns", "POST", input);
  assert.equal((await f.settle(input.turnId)).state, "failed");
});

test('failed explicit cancellation retains lost-ACK cleanup until Native proof, including no admission ID',async t=>{
 const f=fixture(t,{nativeState:'unknown'}),input=body();
 await f.g.handle('owner','/turns','POST',input);assert.equal((await f.settle(input.turnId)).state,'unknown');
 let nativeState='unknown';f.core.input=()=>({state:nativeState,admissionId:null});
 f.core.cancelInput=async()=>{if(nativeState==='unknown')throw Error('execution_unknown');return{stopped:true};};
 await assert.rejects(f.g.handle('owner',`/turns/${input.turnId}/cancel`,'POST',{}),/execution_unknown/);
 await f.g.handle('owner','/state','GET');assert.equal(f.store.cleanupJobs().length,1);
 nativeState='cancelled';const result=await(await f.g.handle('owner',`/turns/${input.turnId}/cancel`,'POST',{})).json();
 assert.equal(result.cleanupPending,false);assert.equal(result.state,'cancelled');assert.equal(f.store.cleanupJobs().length,0);
});


test("App Gateway keeps shared queue until cancelled native process physically drains", async t => {
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  const f = fixture(t, { drain: { entered, wait } }), input = body();
  await f.g.handle("owner", "/turns", "POST", input); await started;
  let secondPrepared = false;
  const second = f.queue.run("wife", () => { secondPrepared = true; });
  const cancelling = f.g.handle("owner", `/turns/${input.turnId}/cancel`, "POST", {});
  await sleep(20); assert.equal(secondPrepared, false);
  assert.equal(f.queue.state("owner").active, true);
  release(); await cancelling; await second;
  assert.equal(secondPrepared, true);
});


for (const code of ["media_unavailable", "trainer_quota"]) test(`durable pre-dispatch ${code} is failed and permits a new app turn`, async t => {
  const f = fixture(t, { stageError: code }), input = body();
  await f.g.handle("owner", "/turns", "POST", input);
  const failed = await f.settle(input.turnId);
  assert.equal(failed.state, "failed"); assert.equal(failed.error, code); assert.equal(f.starts, 0);
  const next = { ...body(), baseRevision: f.store.conversation("owner").revision };
  await f.g.handle("owner", "/turns", "POST", next);
  assert.equal((await f.settle(next.turnId)).state, "completed"); assert.equal(f.starts, 1);
});


test("native model callback always uses the Gateway day-proof verifier", async t => {
  const f = fixture(t, { staleBeforeVerify: true }), input = body();
  await f.g.handle("owner", "/turns", "POST", input);
  const result = await f.settle(input.turnId);
  assert.equal(result.state, "failed"); assert.equal(result.error, "stale_snapshot");
  assert.equal(f.verifies, 0);
});


test("photo projection keeps literal markers and removes only a paired native suffix", () => {
  const home = "/synthetic/home", path = home + "/cache/documents/native-inputs/" + "a".repeat(64) + "/scisense_synthetic.png";
  const project = content => nativeMessageProjection({ session_id: "synthetic", profileId: home, messages: [{ role: "user", content }] })[0];
  assert.equal(project("[screenshot]").content, "[screenshot]");
  assert.equal(project("[screenshot detail=low]").content, "[screenshot detail=low]");
  const own = project("Буквально [screenshot]\n[screenshot]\n\n[Image attached at: " + path + "]\n[screenshot]");
  assert.equal(own.content, "Буквально [screenshot]\n[screenshot]"); assert.equal(own.photos.length, 1);
  const foreign = "caption\n[Image attached at: /other/home/image.png]\n[screenshot]";
  assert.equal(project(foreign).content, foreign); assert.equal(project(foreign).photos, undefined);
  const row = { role: "user", message_id: "owned-admission", row_id: 5, content: 'SCISENSE-INPUT-V1 synthetic-input-0001 ' + 'a'.repeat(64) + '\n{"schemaVersion":1,"context":"private fixture","message":"Фото"}\n[Image attached at: ' + path + ']\n[screenshot]' };
  const [owned] = nativeMessageProjection({ session_id: 'synthetic', profileId: home, messages: [row] }, () => ({ inputId: 'synthetic-input-0001', text: 'Фото' }));
  assert.equal(owned.content, 'Фото'); assert.equal(owned.photos.length, 1); assert.equal(owned.turnId, 'synthetic-input-0001');
});


function memoryFixture(t, commit) {
  const memory = { value: { text: "Початкові факти", revision: 1, mode: "append", applied: {} }, commit };
  const f = fixture(t, { memory });
  return { ...f, memory, async propose() { const input = body(); await f.g.handle("owner", "/turns", "POST", input); assert.equal((await f.settle(input.turnId)).state, "completed"); return memory.proposal; } };
}

test("context confirmation awaits actual native commit before marking applied", async t => {
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const f = memoryFixture(t, async () => { entered(); await gate; return { revision: 2 }; }), p = await f.propose();
  let returned = false;
  const committing = f.g.handle("owner", `/context/${p.proposalId}/confirm`, "POST", {}).then(value => { returned = true; return value; });
  await started; await sleep(5); assert.equal(returned, false);
  assert.equal(f.store.contextProposal("owner", f.store.conversation("owner").conversationId, p.proposalId).state, "proposed");
  release(); assert.equal((await (await committing).json()).revision, 2);
  assert.equal(f.store.contextProposal("owner", f.store.conversation("owner").conversationId, p.proposalId).state, "applied");
});

test("canonical memory receipt recovers a lost commit ACK without a duplicate write", async t => {
  const f = memoryFixture(t, async p => {
    const clean = { proposalId: p.proposalId, baseRevision: p.baseRevision, text: p.text };
    f.memory.value = { text: "Початкові факти\nНовий синтетичний факт", revision: 2, mode: "append", applied: { [p.proposalId]: createHash("sha256").update(stableJSON(clean)).digest("hex") } };
    throw Error("execution_unknown");
  }), p = await f.propose();
  await assert.rejects(f.g.handle("owner", `/context/${p.proposalId}/confirm`, "POST", {}), /execution_unknown/);
  const state = await (await f.g.handle("owner", "/state", "GET")).json();
  assert.equal(state.contextProposals.find(value => value.proposalId === p.proposalId).state, "applied");
  const context = await (await f.g.handle("owner", "/context", "GET")).json();
  assert.equal(context.mode, "append"); assert.equal(context.applied, undefined);
});

test("failed asynchronous memory commit cannot claim confirmation", async t => {
  const f = memoryFixture(t, async () => { await sleep(1); throw Error("context_unavailable"); }), p = await f.propose();
  await assert.rejects(f.g.handle("owner", `/context/${p.proposalId}/confirm`, "POST", {}), /context_unavailable/);
  const state = await (await f.g.handle("owner", "/state", "GET")).json();
  assert.equal(state.contextProposals.find(value => value.proposalId === p.proposalId).state, "proposed");
});

test("Firebase refresh across midnight keeps the durable admission's original day", async t => {
  const f = fixture(t, { authorize: async ({ uid, advance }) => { assert.equal(uid, "owner"); advance(); } });
  const input = body();
  await f.g.handle("owner", "/turns", "POST", input);
  assert.equal((await f.settle(input.turnId)).state, "completed");
  assert.equal(f.snapshots[0].sentAt, "2026-10-24T20:59:59.000Z");
  assert.equal(f.snapshots[0].targetDate, "2026-10-23");
});

test("denied Firebase delegation stops before Native, context, or model admission", async t => {
  const f = fixture(t, { authorize: async () => { throw Error("data_auth_required"); } });
  const input = body();
  await assert.rejects(f.g.handle("owner", "/turns", "POST", input), /data_auth_required/);
  assert.equal(f.starts, 0); assert.deepEqual(f.snapshots, []);
});

// 1.9.10: a stalled (unknown) turn is closed by the timer tick only after a confirmed Native stop.
// `maintain` is the timer path; optional call keeps the red run a behavioural failure.
const settleTick = g => g.maintain?.({ settleUnknown: true });
async function stalled(t, options = {}) {
  const f = fixture(t, { nativeState: "unknown", gatewayOptions: { unknownGraceMs: 0, ...options } }), input = body();
  await f.g.handle("owner", "/turns", "POST", input);
  assert.equal((await f.settle(input.turnId)).state, "unknown");
  const calls = { status: 0, stop: 0 };
  f.core.status = async () => { calls.status++; return { state: "unknown", admissionId: "synthetic-admission" }; };
  f.core.cancelInput = async () => { calls.stop++; return { stopped: true }; };
  return { f, input, calls };
}
const nextTurn = f => ({ ...body(), baseRevision: f.store.conversation("owner").revision });

test("1.9.10 K1: a stalled turn past its deadline is closed as no reply and a new message is admitted", async t => {
  const { f, input, calls } = await stalled(t);
  f.tick(45001); await settleTick(f.g);
  const row = f.store.get("owner", input.turnId);
  assert.equal(row.state, "failed"); assert.equal(row.error, "trainer_no_reply");
  assert.equal(calls.stop, 1); assert.equal(f.store.cleanupJobs().length, 0);
  await f.g.handle("owner", "/turns", "POST", nextTurn(f));
});

test("1.9.10 K2: an unconfirmed Native stop keeps the block, says why, backs off and retries", async t => {
  const { f, input, calls } = await stalled(t);
  f.core.cancelInput = async () => { calls.stop++; throw Error("execution_unknown"); };
  f.tick(45001); await settleTick(f.g);
  let row = f.store.get("owner", input.turnId);
  assert.equal(row.state, "unknown"); assert.equal(row.error, "trainer_stop_retrying"); assert.equal(calls.stop, 1);
  await assert.rejects(f.g.handle("owner", "/turns", "POST", nextTurn(f)), /trainer_busy/);
  assert.equal((await (await f.g.handle("owner", "/state", "GET")).json()).maintenanceBlocked, false);
  await settleTick(f.g); await settleTick(f.g);
  assert.equal(calls.stop, 1);
  f.core.cancelInput = async () => { calls.stop++; return { stopped: true }; };
  await settleTick(f.g);
  assert.equal(calls.stop, 2);
  row = f.store.get("owner", input.turnId);
  assert.equal(row.state, "failed"); assert.equal(row.error, "trainer_no_reply");
});

test("1.9.10 K2b: a throwing Native status never turns maintenance into a 503 for new messages", async t => {
  const { f, input } = await stalled(t);
  f.core.status = async () => { throw Error("synthetic_native_down"); };
  f.tick(45001); await settleTick(f.g);
  assert.equal(f.store.get("owner", input.turnId).state, "unknown");
  assert.equal((await (await f.g.handle("owner", "/state", "GET")).json()).maintenanceBlocked, false);
});

test("1.9.10 K3: a stalled turn is not touched before deadline plus grace", async t => {
  const { f, input, calls } = await stalled(t, { unknownGraceMs: 30000 });
  f.tick(45001); await settleTick(f.g);
  assert.equal(calls.stop, 0); assert.equal(f.store.get("owner", input.turnId).state, "unknown");
  f.tick(30000); await settleTick(f.g);
  assert.equal(calls.stop, 1); assert.equal(f.store.get("owner", input.turnId).state, "failed");
});

test("1.9.10 K4: a cancelled turn whose Native stop failed is stopped again by maintenance", async t => {
  const f = fixture(t, { nativeState: "unknown", gatewayOptions: { unknownGraceMs: 0 } }), input = body();
  await f.g.handle("owner", "/turns", "POST", input); assert.equal((await f.settle(input.turnId)).state, "unknown");
  let nativeState = "unknown", allow = false;
  f.core.input = () => ({ state: nativeState, admissionId: "synthetic-admission" });
  f.core.status = async () => ({ state: nativeState, admissionId: "synthetic-admission" });
  f.core.cancelInput = async () => { if (!allow) throw Error("execution_unknown"); nativeState = "cancelled"; return { stopped: true }; };
  await assert.rejects(f.g.handle("owner", `/turns/${input.turnId}/cancel`, "POST", {}), /execution_unknown/);
  allow = true;
  await f.g.recover(); await f.g.recover();
  assert.equal(f.store.cleanupJobs().length, 1);
  await settleTick(f.g);
  assert.equal(f.store.cleanupJobs().length, 0); assert.equal(f.store.get("owner", input.turnId).state, "cancelled");
  await f.g.handle("owner", "/turns", "POST", nextTurn(f));
});

test("1.9.10 K5: an answer that arrives during the stop is published, not failed", async t => {
  const { f, input, calls } = await stalled(t);
  f.core.status = async () => (++calls.status === 1 ? { state: "unknown", admissionId: "synthetic-admission" } : { state: "completed", admissionId: "synthetic-admission", result: { final_response: "Пізня відповідь тренера" } });
  f.tick(45001); await settleTick(f.g);
  assert.equal(f.store.get("owner", input.turnId).state, "completed");
});

test("1.9.10 K6: a turn Native never received is closed after two confirmed misses without a stop", async t => {
  const { f, input, calls } = await stalled(t);
  f.core.status = async () => ({ state: "unknown", admissionId: null });
  f.core.cancelInput = async () => { calls.stop++; throw Error("execution_unknown"); };
  f.tick(45001); await settleTick(f.g);
  assert.equal(f.store.get("owner", input.turnId).state, "unknown");
  await settleTick(f.g);
  const row = f.store.get("owner", input.turnId);
  assert.equal(row.state, "failed"); assert.equal(row.error, "trainer_no_reply"); assert.equal(calls.stop, 0);
});

test("1.9.10 K7: startup recovery does not settle a stalled turn", async t => {
  const { f, input, calls } = await stalled(t);
  f.tick(45001); await f.g.recover();
  assert.equal(calls.stop, 0); assert.equal(f.store.get("owner", input.turnId).state, "unknown");
});
