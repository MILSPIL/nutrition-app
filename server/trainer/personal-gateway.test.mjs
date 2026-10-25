import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { openTurnStore } from "./turn-store.mjs";
import { createTrainerGateway } from "./gateway.mjs";
import { createPersonalBackend } from "./personal-backend.mjs";
import { personalQueue } from "./personal-queue.mjs";
import { buildSnapshot } from "./snapshot.mjs";

function fixture(t, { context = "synthetic", nativeState = "completed", drain, stageError, staleBeforeVerify = false } = {}) {
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
        return { state: nativeState, result: { final_response: "Відповідь тренера" } };
      } }), { signal }); },
    async history() { return { session_id: sessionId, messages: starts ? [{ role: "user", content: [...inputs.values()].at(-1).text }, { role: "assistant", content: "Відповідь тренера" }] : [] }; },
    input() { return { state: starts ? "admitted" : "queued", generation: starts ? 1 : null }; },
  };
  let firstStage = true;
  const backend = createPersonalBackend({ uid: "owner", core, stageAttachments: async () => { if (stageError && firstStage) { firstStage = false; throw Error(stageError); } return []; }, tools: { read_confirmed_day: async () => ({}) }, verify: async () => { verifies++; } });
  const g = createTrainerGateway({ ownerUid: "owner", store, backend, now: () => clock, queueWindowMs: 225000,
    snapshotFactory: value => buildSnapshot({ ...value, history: [], maxPayloadBytes: 512000 }),
    media: { describe: () => [], stage() {}, load: () => [], remove() {}, sweep: () => ({ faults: 0 }) }, proxy: { cancel() {}, close() {} },
    readContext: async () => ({ text: context, revision: 1 }), readDay: async (_uid, targetDate) => ({ targetDate, revision, meals: {}, notes: [] }), readPlan: async () => ({ planContext: {} }),
  });
  t.after(async () => { await g.close(); await queue.close(); store.close(); rmSync(dir, { recursive: true, force: true }); });
  return { g, store, queue, snapshots, get starts() { return starts; }, get verifies() { return verifies; }, change() { revision++; clock += 10000; },
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
