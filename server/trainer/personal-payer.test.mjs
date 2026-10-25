import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createPersonalPayer } from "./personal-payer.mjs";

test("outer deadline physically kills a blocked producer before releasing the turn", async () => {
  let child, exited = false;
  const payer = createPersonalPayer({
    spawnWorker: () => { child = spawn(process.execPath, [new URL("../../scripts/hermes-personal-payer-hang-fixture.mjs", import.meta.url).pathname], { stdio: ["pipe", "pipe", "ignore"] }); child.once("exit", () => { exited = true; }); return child; },
    credentials: { restore: () => ({ revision: 1, files: { "auth.json": Buffer.from("synthetic") } }) },
    reservePost: () => { throw Error("must not reserve"); },
  });
  try {
    assert.equal((await payer.start()).provider, "openai-codex");
    const at = Date.now(), signal = new AbortController().signal;
    await assert.rejects(payer.withTurn({ uid: "synthetic", inputId: "synthetic-input", signal, deadline: at + 80 }, invoke => invoke({ model: "synthetic" })), /execution_unknown/);
    assert.equal(exited, true); assert.equal(child.signalCode, "SIGKILL");
    assert.ok(Date.now() - at < 2000);
    // No second explicit payer.start(): a new input must cache the new native
    // identity before it could spend and validate its response.
    const recovered = await payer.withTurn({ uid: "synthetic", inputId: "synthetic-second", signal, deadline: Date.now() + 2000 }, invoke => invoke({ model: "synthetic", success: true }));
    assert.equal(recovered.proof.selectedModel, "synthetic");
  } finally { await payer.close(); }
});


test("aggregate watchdog kills an idle producer between logical model calls", async () => {
  let child;
  const payer = createPersonalPayer({
    spawnWorker: () => child = spawn(process.execPath, [new URL("../../scripts/hermes-personal-payer-hang-fixture.mjs", import.meta.url).pathname], { stdio: ["pipe", "pipe", "ignore"] }),
    credentials: { restore: () => ({ revision: 1, files: {} }) }, reservePost: () => ({ accepted: true }),
  });
  try {
    await payer.start();
    await assert.rejects(payer.withTurn({ uid: "synthetic", inputId: "synthetic-aggregate", signal: new AbortController().signal, deadline: Date.now() + 80 }, async invoke => {
      await invoke({ model: "synthetic", success: true });
      // There is no pending IPC request timer in this interval.
      await new Promise(resolve => child.once("exit", resolve));
    }), /trainer_timeout/);
    assert.equal(child.signalCode, "SIGKILL");
  } finally { await payer.close(); }
});
