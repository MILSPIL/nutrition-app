import test from "node:test";
import assert from "node:assert/strict";
import { personalQueue } from "./personal-queue.mjs";
const gate = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test("both accounts share one FIFO; fresh snapshot is read only after queue admission", async () => {
  const queue = personalQueue(), first = gate(), calls = []; let revision = 1, live = 0, peak = 0;
  try {
    const owner = queue.run("owner", async () => { calls.push("owner"); peak = Math.max(peak, ++live); await first.promise; live--; });
    const wife = queue.run("wife", async () => { calls.push(["wife", revision]); peak = Math.max(peak, ++live); live--; });
    await tick();
    assert.deepEqual(calls, ["owner"]);
    assert.deepEqual(queue.state("wife"), { active: false, waiting: 1 });
    assert.equal(JSON.stringify(queue.state("wife")).includes("owner"), false);
    revision = 2; first.resolve(); await Promise.all([owner, wife]);
    assert.deepEqual(calls, ["owner", ["wife", 2]]); assert.equal(peak, 1);
  } finally { first.resolve(); await queue.close(); }
});

test("execution timeout aborts but retains the slot until the worker actually settles", async () => {
  const queue = personalQueue({ deadlineMs: 10 }), cleanup = gate(), aborted = gate(); let wifeStarted = false;
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const owner = queue.run("owner", async signal => {
      signal.addEventListener("abort", () => aborted.resolve(), { once: true });
      await cleanup.promise;
    });
    const ownerRejected = assert.rejects(owner, error => error.message === "trainer_timeout" && !error.definitelyNotExecuted);
    const wife = queue.run("wife", async () => { wifeStarted = true; });
    await aborted.promise;
    assert.equal(wifeStarted, false);
    assert.deepEqual(queue.state("owner"), { active: true, waiting: 0, stopping: true });
    cleanup.resolve(); await Promise.all([ownerRejected, wife]); assert.equal(wifeStarted, true);
  } finally { clearTimeout(keepAlive); cleanup.resolve(); await queue.close(); }
});

test("waiting cancellation never starts native execution; close drains only after active cleanup", async () => {
  const queue = personalQueue(), cleanup = gate(), controller = new AbortController(); let extra = 0;
  const active = queue.run("owner", () => cleanup.promise);
  const waiting = queue.run("wife", () => { extra++; }, { signal: controller.signal });
  const rejected = assert.rejects(waiting, error => error.message === "trainer_cancelled" && error.definitelyNotExecuted);
  controller.abort(); await rejected; assert.equal(extra, 0);
  const activeRejected = assert.rejects(active, error => error.message === "trainer_unavailable" && !error.definitelyNotExecuted);
  let closed = false; const closing = queue.close().then(() => { closed = true; });
  await tick(); assert.equal(closed, false);
  cleanup.resolve(); await activeRejected; await closing;
  await assert.rejects(queue.run("owner", () => {}), /trainer_unavailable/);
});

test("bounded waiting queue rejects excess work without losing the accepted jobs", async () => {
  const queue = personalQueue({ maxWaiting: 1 }), cleanup = gate(); let accepted = false;
  const active = queue.run("owner", () => cleanup.promise);
  const waiting = queue.run("wife", async () => { accepted = true; });
  try { await assert.rejects(queue.run("wife", () => {}), /trainer_queue_full/); }
  finally { cleanup.resolve(); await Promise.all([active, waiting]); await queue.close(); }
  assert.equal(accepted, true);
});
