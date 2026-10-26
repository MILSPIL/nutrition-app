import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createPersonalPayer, safePayerDiagnostic } from "./personal-payer.mjs";

test("payer diagnostics retain fixed metadata only and reject free text", () => {
  const response = { success: true, status: 200, sse: true, finished: true, abandoned: false, failed: false,
    hasModels: false, modelMatches: false, terminalSeen: true, terminalModelSeen: false, body: "private synthetic body" };
  const message = { code: "model_payload_invalid", stage: "proof", posts: 1, responses: [response], grant: "synthetic-secret" };
  const safe = safePayerDiagnostic(message);
  assert.equal(safe.responses[0].terminalModelSeen, false);
  assert.equal(JSON.stringify(safe).includes("private"), false);
  assert.equal(JSON.stringify(safe).includes("secret"), false);
  for (const change of [{ stage: "private text" }, { code: "Bearer synthetic" }, { posts: 4 }, { responses: [{ ...response, success: "secret" }] }])
    assert.throws(() => safePayerDiagnostic({ ...message, ...change }), /invalid_request/);
});

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


test("coordinator abort after a healthy turn clears closed producer before the next input", async () => {
  const children = [];
  const payer = createPersonalPayer({
    spawnWorker: () => { const child = spawn(process.execPath, [new URL("../../scripts/hermes-personal-payer-hang-fixture.mjs", import.meta.url).pathname], { stdio: ["pipe", "pipe", "ignore"] }); children.push(child); return child; },
    credentials: { restore: () => ({ revision: 1, files: {} }) }, reservePost: () => ({ accepted: true }),
  });
  const execute = id => payer.withTurn({ uid: "synthetic", inputId: id, signal: new AbortController().signal, deadline: Date.now() + 2000 }, invoke => invoke({ model: "synthetic", success: true }));
  try {
    await payer.start(); await execute("first"); await payer.abortTurn();
    assert.equal(children[0].signalCode, "SIGKILL");
    assert.equal((await execute("second")).proof.selectedModel, "synthetic");
    assert.equal(children.length, 2);
  } finally { await payer.close(); }
});


test("concurrent startup after idle exit creates one replacement and close is final", async () => {
  const children = [];
  const payer = createPersonalPayer({
    spawnWorker: () => { const child = spawn(process.execPath, [new URL("../../scripts/hermes-personal-payer-hang-fixture.mjs", import.meta.url).pathname], { stdio: ["pipe", "pipe", "ignore"] }); children.push(child); return child; },
    credentials: { restore: () => ({ revision: 1, files: {} }) }, reservePost: () => ({ accepted: true }),
  });
  try {
    await payer.start();
    await new Promise(resolve => { children[0].once("exit", resolve); children[0].kill("SIGKILL"); });
    const [one, two] = await Promise.all([payer.start(), payer.start()]);
    assert.equal(one, two); assert.equal(children.length, 2);
    await payer.close(); await assert.rejects(payer.start(), /trainer_unavailable/);
    assert.equal(children.length, 2);
  } finally { await payer.close(); }
});


test("a replacement with a mismatching selected identity is physically retired before reuse", async () => {
  const children = [];
  const payer = createPersonalPayer({
    spawnWorker: () => {
      const child = spawn(process.execPath, [new URL("../../scripts/hermes-personal-payer-hang-fixture.mjs", import.meta.url).pathname],
        { env: { ...process.env, SCISENSE_SYNTHETIC_SETUP_MODEL: children.length === 1 ? "unexpected" : "synthetic" }, stdio: ["pipe", "pipe", "ignore"] });
      children.push(child); return child;
    },
    credentials: { restore: () => ({ revision: 1, files: {} }) }, reservePost: () => { throw Error("no POST allowed"); },
  });
  try {
    await payer.start();
    await assert.rejects(payer.selectModel({ provider: "openai-codex", model: "synthetic" }), /connection_model_changed/);
    assert.ok(children[1].exitCode !== null || children[1].signalCode !== null);
    assert.equal((await payer.start()).model, "synthetic");
    assert.equal(children.length, 3);
  } finally { await payer.close(); }
});
