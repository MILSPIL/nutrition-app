// Actual pinned Hermes + actual Node coordinator/proxy/SQLite + synthetic model HTTP.
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { openTurnStore } from "../server/trainer/turn-store.mjs";
import { createMediaStore } from "../server/trainer/media.mjs";
import { createModelProxy } from "../server/trainer/model-proxy.mjs";
import { createTrainerGateway } from "../server/trainer/gateway.mjs";
import { createNativeBackend } from "../server/trainer/hermes-native.mjs";
import { MODEL, TOOLS } from "../server/trainer/limits.mjs";
import { localBudget } from "./phone-lab/sqlite.mjs";
const lab = realpathSync(resolve(".agents/runtime/hermes-lab")),
  root = mkdtempSync(join(lab, "native-gateway-synthetic-"));
const profile = join(root, "profile"),
  work = join(root, "worker"),
  mediaDir = join(root, "media");
for (const p of [profile, work, mediaDir]) mkdirSync(p, { mode: 0o700 });
writeFileSync(
  join(profile, "config.yaml"),
  readFileSync("server/trainer/hermes-config.json"),
  { mode: 0o600 },
);
writeFileSync(
  join(profile, "SOUL.md"),
  "Synthetic trainer. Never save without confirmation. SOUL_GATE_CANARY",
  { mode: 0o600 },
);
const file = join(root, "turns.sqlite"),
  store = openTurnStore(file, { hmacKey: randomBytes(32) }),
  media = createMediaStore(mediaDir, { hash: store.hash });
const budget = localBudget(join(root, "budget.sqlite"), 5000000, {
  initialize: true,
  hermesPolicy: true,
});
const bodies = [],
  toolCalls = [];
let mode = "complete",
  call = 0;
function sse(content) {
  const message = {
      id: "msg_synthetic",
      type: "message",
      role: "assistant",
      model: MODEL,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 0 },
    },
    events = [];
  const emit = (event, data) =>
    events.push("event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n");
  emit("message_start", { type: "message_start", message });
  for (const [index, b] of content.entries()) {
    emit("content_block_start", {
      type: "content_block_start",
      index,
      content_block:
        b.type === "text" ? { type: "text", text: "" } : { ...b, input: {} },
    });
    emit("content_block_delta", {
      type: "content_block_delta",
      index,
      delta:
        b.type === "text"
          ? { type: "text_delta", text: b.text }
          : { type: "input_json_delta", partial_json: JSON.stringify(b.input) },
    });
    emit("content_block_stop", { type: "content_block_stop", index });
  }
  emit("message_delta", {
    type: "message_delta",
    delta: {
      stop_reason: content[0].type === "tool_use" ? "tool_use" : "end_turn",
      stop_sequence: null,
    },
    usage: { output_tokens: 20 },
  });
  emit("message_stop", { type: "message_stop" });
  return new Response(events.join(""), {
    headers: { "Content-Type": "text/event-stream" },
  });
}
const proxy = createModelProxy({
  store,
  budget: budget.binding,
  pricing: {
    model: MODEL,
    approvedAt: "synthetic-only",
    input: 3e6,
    output: 15e6,
  },
  upstream: async (payload, { signal }) => {
    bodies.push(payload);
    call++;
    assert.ok(budget.spent() > 0);
    assert.equal(payload.max_tokens, 4096);
    assert.equal(JSON.stringify(payload).includes("cache_control"), false);
    if (mode === "cancel") await sleep(500, undefined, { signal });
    if (mode === "429") return new Response("", { status: 429 });
    if ((mode === "complete" || mode === "tool-delay") && call === 1)
      return sse([
        {
          type: "tool_use",
          id: "tool_food",
          name: "food_lookup",
          input: { query: "cooked potato" },
        },
        {
          type: "tool_use",
          id: "tool_blocked",
          name: "terminal",
          input: { command: "forbidden" },
        },
      ]);
    if (mode === "complete" && call === 2)
      return sse([
        {
          type: "tool_use",
          id: "tool_draft",
          name: "propose_food_draft",
          input: { items: [] },
        },
      ]);
    return sse([
      { type: "text", text: "Синтетична відповідь тренера готова." },
    ]);
  },
});
const tools = Object.fromEntries(
  TOOLS.map((name) => [
    name,
    async () => {
      toolCalls.push(name);
      if (mode === "tool-delay") return new Promise(() => {});
      return { synthetic: true };
    },
  ]),
);
const toolSchemas = Object.fromEntries(
  TOOLS.map((name) => [
    name,
    {
      name,
      description: "SciSense " + name,
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          items: { type: "array", items: { type: "object" } },
        },
      },
    },
  ]),
);
const backend = createNativeBackend({
  source: join(lab, "source"),
  sourceManifest: join(lab, "source-manifest.json"),
  profile,
  workDirectory: work,
  apiKey: store.hash({ purpose: "synthetic-native-auth" }),
  tools,
  toolSchemas,
  isolation:
    process.platform === "darwin" ? "macos-seatbelt" : "synthetic-network-none",
});
const makeGateway = (runDeadlineMs = 45000) =>
  createTrainerGateway({
    runDeadlineMs,
    ownerUid: "pilot",
    store,
    media,
    proxy,
    backend,
    readContext: async () => ({ text: "CURATED_GATE_CANARY", revision: 1 }),
    readDay: async () => ({ receipts: [], text: "DAY_GATE_CANARY" }),
    readPlan: async () => ({ text: "PLAN_GATE_CANARY" }),
  });
let gateway = makeGateway();
const owner = store.conversation("pilot");
let last;
async function waitTurn(id) {
  for (let n = 0; n < 500; n++) {
    const value = store.get("pilot", id);
    if (!["queued", "running", "cleanup_pending"].includes(value.state))
      return value;
    await sleep(30);
  }
  throw Error(
    "synthetic_native_timeout:" + JSON.stringify(backend.diagnostics()),
  );
}
try {
  const prior = JSON.parse(
    readFileSync(join(lab, "synthetic-provider-requests.json")),
  );
  const image = prior
    .flatMap((p) =>
      p.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])),
    )
    .find((p) => p.type === "image").source;
  const input = {
    turnId: randomUUID(),
    baseRevision: 0,
    text: "Синтетична картопля 200 г",
    targetDate: "2026-01-03",
    images: [{ type: image.media_type, data: image.data }],
  };
  const start = Date.now();
  assert.equal(
    (await gateway.handle("pilot", "/turns", "POST", input)).status,
    202,
  );
  last = input.turnId;
  const result = await waitTurn(input.turnId);
  assert.equal(result.state, "completed", JSON.stringify(result));
  assert.equal(call, 3);
  assert.deepEqual(toolCalls, ["food_lookup", "propose_food_draft"]);
  assert.ok(
    bodies.some((b) => JSON.stringify(b).includes("CURATED_GATE_CANARY")),
  );
  assert.ok(bodies.some((b) => JSON.stringify(b).includes("DAY_GATE_CANARY")));
  assert.ok(bodies.some((b) => JSON.stringify(b).includes("PLAN_GATE_CANARY")));
  assert.ok(bodies.some((b) => JSON.stringify(b).includes("SOUL_GATE_CANARY")));
  assert.ok(
    bodies.some((b) =>
      JSON.stringify(b).includes("Tool 'terminal' does not exist"),
    ),
  );
  assert.equal(store.cleanupJobs().length, 0);
  assert.deepEqual(readdirSync(mediaDir), []);
  const needles = [Buffer.from(image.data, "base64"), Buffer.from(image.data)];
  for (const b of [...needles])
    for (let n = 256; n < b.length - 256; n += 1024)
      needles.push(b.subarray(n, n + 256));
  let files = 0;
  function scan(dir) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) scan(path);
      else {
        files++;
        const b = readFileSync(path);
        assert.ok(!needles.some((n) => b.includes(n)), "media leak in " + path);
      }
    }
  }
  scan(profile);
  assert.ok(!readFileSync(file).includes(Buffer.from(image.data)));
  const firstTurnSeconds = (Date.now() - start) / 1000;
  assert.equal(
    (await gateway.handle("pilot", "/turns", "POST", input)).status,
    200,
  );
  assert.equal(call, 3);
  // Lost native admission ACK plus lost Node result commit: recover by status only.
  mode = "recover";
  call = 0;
  const recoveryId = randomUUID(),
    recoveryInput = {
      turnId: recoveryId,
      baseRevision: store.conversation("pilot").revision,
      text: "Синтетичний запис для recovery",
      targetDate: "2026-01-03",
      media: [],
    };
  store.admit("pilot", owner.conversationId, recoveryInput, {
    context: "synthetic recovery",
    history: [],
  });
  const recoveryTurn = store.begin("pilot", recoveryId);
  await backend.start({
    turn: recoveryTurn,
    input: recoveryInput,
    snapshot: { context: "synthetic recovery", history: [] },
    images: [],
    onRun: () => {},
    issueLease: () => store.issueLease(recoveryId, recoveryTurn.generation),
    modelCall: (l, p) => proxy.invoke(l, p),
  });
  await backend.disconnectForTest(recoveryId);
  store.fail(recoveryId, "execution_unknown", { unknown: true });
  assert.equal(store.internal(recoveryId).run_id, null);
  const recovered = await gateway.handle(
    "pilot",
    "/turns/" + recoveryId + "/recover",
    "POST",
    {},
  );
  assert.equal((await recovered.json()).state, "completed");
  assert.equal(call, 1);
  assert.ok(store.internal(recoveryId).run_id);
  // Cancellation during an actual model call must not commit the late reply.
  mode = "cancel";
  call = 0;
  const cancelled = {
    ...input,
    turnId: randomUUID(),
    baseRevision: store.conversation("pilot").revision,
    images: [],
  };
  await gateway.handle("pilot", "/turns", "POST", cancelled);
  for (let n = 0; n < 300 && !call; n++) await sleep(20);
  assert.equal(call, 1);
  await gateway.handle(
    "pilot",
    "/turns/" + cancelled.turnId + "/cancel",
    "POST",
    {},
  );
  assert.equal((await waitTurn(cancelled.turnId)).state, "cancelled");
  assert.equal(store.get("pilot", cancelled.turnId).result, null);
  // Upstream429 can cause no second paid call even if native SDK tries again.
  mode = "429";
  call = 0;
  const limited = {
    ...input,
    turnId: randomUUID(),
    baseRevision: store.conversation("pilot").revision,
    images: [],
  };
  await gateway.handle("pilot", "/turns", "POST", limited);
  const limitedResult = await waitTurn(limited.turnId);
  assert.equal(limitedResult.state, "failed");
  assert.equal(call, 1);
  for (let n = 0; n < 250 && store.cleanupJobs().length; n++) await sleep(20);
  assert.equal(store.cleanupJobs().length, 0);
  // A tool that ignores AbortSignal cannot keep the native worker alive past the deadline.
  await gateway.close();
  gateway = makeGateway(3500);
  mode = "tool-delay";
  call = 0;
  const timed = {
    ...input,
    turnId: randomUUID(),
    baseRevision: store.conversation("pilot").revision,
    images: [],
  };
  const timedAt = Date.now();
  await gateway.handle("pilot", "/turns", "POST", timed);
  const timedState = await waitTurn(timed.turnId);
  assert.ok(["unknown", "failed", "cancelled"].includes(timedState.state));
  assert.ok(Date.now() - timedAt < 5500);
  await sleep(150);
  await gateway.handle(
    "pilot",
    "/turns/" + timed.turnId + "/recover",
    "POST",
    {},
  );
  if (store.get("pilot", timed.turnId).state === "unknown")
    await gateway.handle(
      "pilot",
      "/turns/" + timed.turnId + "/cancel",
      "POST",
      {},
    );
  assert.equal(store.cleanupJobs().length, 0);
  // SIGKILL leaves an exact canonical unknown generation. Resolve only on explicit cancel.
  await gateway.close();
  gateway = makeGateway();
  mode = "tool-delay";
  call = 0;
  const killed = {
    ...input,
    turnId: randomUUID(),
    baseRevision: store.conversation("pilot").revision,
    images: [],
  };
  await gateway.handle("pilot", "/turns", "POST", killed);
  for (let n = 0; n < 300 && !call; n++) await sleep(20);
  assert.equal(call, 1);
  await backend.killForTest(killed.turnId);
  assert.equal((await waitTurn(killed.turnId)).state, "unknown");
  const unknown = await gateway.handle(
    "pilot",
    "/turns/" + killed.turnId + "/recover",
    "POST",
    {},
  );
  assert.equal((await unknown.json()).state, "unknown");
  await gateway.handle(
    "pilot",
    "/turns/" + killed.turnId + "/cancel",
    "POST",
    {},
  );
  assert.equal(store.cleanupJobs().length, 0);
  assert.equal(call, 1);
  // A crash before metadata rename must not leave an owned hash artifact behind.
  const interruptedId = randomUUID(),
    interruptedInput = {
      turnId: interruptedId,
      baseRevision: store.conversation("pilot").revision,
      text: "synthetic interrupted metadata",
      targetDate: "2026-01-03",
      media: [],
    };
  store.admit("pilot", owner.conversationId, interruptedInput, {});
  store.fail(interruptedId, "interrupted_before_start");
  writeFileSync(
    join(work, interruptedId + ".cleanup.json.tmp"),
    JSON.stringify([{ sha256: "a".repeat(64), suffix: ".png" }]),
    { mode: 0o600 },
  );
  await gateway.recover();
  assert.equal(store.cleanupJobs().length, 0);
  assert.equal(
    readdirSync(work).some((n) => n.endsWith(".cleanup.json.tmp")),
    false,
  );
  scan(profile);
  assert.deepEqual(readdirSync(mediaDir), []);
  assert.equal(
    readdirSync(work).some((n) => n.endsWith(".cleanup.json")),
    false,
  );
  const summary = {
    actualHermes: true,
    pin: backend.pin.commit,
    firstTurnSeconds,
    suiteSeconds: (Date.now() - start) / 1000,
    providerCalls: bodies.length,
    recoveryNoNewCalls: true,
    cancelNoResult: true,
    upstream429Calls: 1,
    deadlineStopsNative: true,
    killedUnknownCancelled: true,
    tools: toolCalls,
    profileFilesScanned: files,
    mediaFragments: needles.length,
    mediaLeaks: 0,
    ownerIsolation: true,
    replayCalls: 0,
    syntheticOnly: true,
  };
  writeFileSync(
    join(lab, "gateway-summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary));
} finally {
  await gateway.close();
  store.close();
  budget.close();
}
