import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, realpathSync, chmodSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PERSONAL_LIMITS } from "./personal-limits.mjs";
import { openTurnStore } from "./turn-store.mjs";
import { createTrainerGateway } from "./gateway.mjs";
import { createInternalProcess } from "./internal-process.mjs";

// 1.9.10 S10 (owner decision Р1 = Б): a message may run 180 s; limits derived from 90 s double.
test("1.9.10 K18: the personal processing limit is 180 s and the queue window doubles with it", () => {
  assert.equal(PERSONAL_LIMITS.deadlineMs, 180000);
  assert.equal(PERSONAL_LIMITS.queueWindowMs, 450000);
});
test("1.9.10 K18: the turn store and the gateway accept 180 s and refuse more", t => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "scisense-deadline-"))); chmodSync(dir, 0o700);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = openTurnStore(join(dir, "ok.sqlite"), { hmacKey: randomBytes(32), runDeadlineMs: 180000 });
  t.after(() => store.close());
  assert.throws(() => openTurnStore(join(dir, "over.sqlite"), { hmacKey: randomBytes(32), runDeadlineMs: 180001 }), /trainer_config/);
  const base = { ownerUid: "owner", store, backend: {}, media: { describe: () => [], stage() {}, load: () => [], remove() {}, sweep: () => ({ faults: 0 }) }, proxy: { cancel() {}, close() {} }, queueWindowMs: 450000 };
  const gateway = createTrainerGateway({ ...base, runDeadlineMs: 180000 });
  t.after(() => gateway.close());
  assert.throws(() => createTrainerGateway({ ...base, runDeadlineMs: 180001 }), /trainer_config/);
});
test("1.9.10 K18: the native process RPC defaults to the new limit and refuses more", () => {
  const options = { spawnWorker: () => { throw Error("not started"); }, handlers: {}, validateIdentity: () => true };
  assert.doesNotThrow(() => createInternalProcess({ ...options, deadlineMs: 180000 }));
  assert.throws(() => createInternalProcess({ ...options, deadlineMs: 180001 }), /invalid_request/);
});
test("1.9.10 K18: no trainer limit is still written as 90 s or 225 s in the runtime sources", () => {
  const sources = ["personal-desktop-adapter.mjs", "worker-lock.c", "hermes_personal_payer.py", "hermes_worker_lock.py", "internal-process.mjs"];
  for (const file of sources) assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), "utf8"), /\b(90000|225000)\b/, file);
  assert.doesNotMatch(readFileSync(new URL("../../scripts/hermes-personal-package.py", import.meta.url), "utf8"), /'deadlineMs':90000/);
});
