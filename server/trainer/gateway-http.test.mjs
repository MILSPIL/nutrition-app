import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  sign,
  randomUUID,
  randomBytes,
} from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  chmodSync,
  rmSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { createMealApi } from "../api.mjs";
import { openTurnStore } from "./turn-store.mjs";
import { createMediaStore } from "./media.mjs";
import { createTrainerGateway } from "./gateway.mjs";
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
function token(uid) {
  const at = Math.floor(Date.now() / 1000),
    base = [
      { alg: "RS256", kid: "synthetic" },
      {
        iss: "https://securetoken.google.com/scisense-test",
        aud: "scisense-test",
        sub: uid,
        iat: at - 5,
        auth_time: at - 5,
        exp: at + 600,
      },
    ]
      .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
      .join(".");
  return (
    base +
    "." +
    sign("RSA-SHA256", Buffer.from(base), privateKey).toString("base64url")
  );
}
async function fixture(
  t,
  {
    env = {},
    readContext,
    backend = {},
    deadlineMs = 500,
    runDeadlineMs = 45000,
  } = {},
) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "trainer-http-")));
  chmodSync(dir, 0o700);
  const mediaDir = join(dir, "media");
  mkdirSync(mediaDir, { mode: 0o700 });
  const file = join(dir, "turns.sqlite"),
    store = openTurnStore(file, { hmacKey: randomBytes(32) }),
    media = createMediaStore(mediaDir, { hash: store.hash });
  const calls = {
    context: 0,
    day: 0,
    plan: 0,
    start: 0,
    cleanup: 0,
    stop: 0,
    model: 0,
  };
  let failContext = false,
    failCleanup = false;
  const trainer = createTrainerGateway({
    ownerUid: "pilot",
    store,
    media,
    runDeadlineMs,
    proxy: { cancel() {}, close() {} },
    backend: {
      async start(args) {
        calls.start++;
        args.onRun({ runId: randomUUID(), sessionId: randomUUID() });
        return { text: "Синтетичний результат" };
      },
      async cleanup() {
        calls.cleanup++;
        return { cleaned: !failCleanup };
      },
      async stop() {
        calls.stop++;
        return { stopped: true };
      },
      ...backend,
    },
    readContext: async (...args) => {
      calls.context++;
      if (failContext) throw Error("private read failure");
      return readContext
        ? readContext(...args)
        : { text: "synthetic context", revision: 1 };
    },
    readDay: async () => {
      calls.day++;
      return {};
    },
    readPlan: async () => {
      calls.plan++;
      return {};
    },
  });
  const api = createMealApi({
    env: {
      ALLOWED_ORIGINS: "https://ntzg.pp.ua",
      ALLOWED_UIDS: "pilot,other-valid",
      FIREBASE_PROJECT: "scisense-test",
      TRAINER_OWNER_UID: "pilot",
      TRAINER_ENABLED: "true",
      LIVE_ENABLED: "true",
      ...env,
    },
    keyResolver: publicKey,
    trainer,
    deadlineMs,
    provider: () => {
      throw Error("legacy parser must not run");
    },
  });
  const address = await api.listen(0),
    url = `http://127.0.0.1:${address.port}/meal-api/trainer`;
  t.after(async () => {
    await api.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const send = (route, method = "GET", body, uid = "pilot", signal) =>
    fetch(url + route, {
      method,
      headers: {
        Origin: "https://ntzg.pp.ua",
        Authorization: "Bearer " + token(uid),
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    });
  return {
    send,
    store,
    media,
    calls,
    file,
    mediaDir,
    trainer,
    failContext() {
      failContext = true;
    },
    failCleanup(value = true) {
      failCleanup = value;
    },
  };
}
const input = (extra = {}) => ({
  turnId: randomUUID(),
  text: "Синтетична картопля 200 г",
  targetDate: "2026-01-03",
  baseRevision: 0,
  images: [],
  ...extra,
});
async function settled(f, id) {
  for (let n = 0; n < 100; n++) {
    const v = await (await f.send("/turns/" + id)).json();
    if (!["queued", "running"].includes(v.state)) return v;
    await sleep(5);
  }
  throw Error("synthetic_timeout");
}
test("separate owner binding rejects another valid allowlisted UID before any read", async (t) => {
  const f = await fixture(t);
  for (const route of ["/state", "/turns/" + randomUUID()])
    assert.equal(
      (await f.send(route, "GET", undefined, "other-valid")).status,
      403,
    );
  assert.equal(
    (await f.send("/turns", "POST", input(), "other-valid")).status,
    403,
  );
  assert.deepEqual(f.calls, {
    context: 0,
    day: 0,
    plan: 0,
    start: 0,
    cleanup: 0,
    stop: 0,
    model: 0,
  });
  await assert.rejects(
    () => f.trainer.handle("other-valid", "/state", "GET"),
    /pilot_forbidden/,
  );
});
test("disabled feature is absent; disabled inference allows composer only", async (t) => {
  const off = await fixture(t, { env: { TRAINER_ENABLED: "false" } });
  assert.equal((await off.send("/state")).status, 404);
  const f = await fixture(t, { env: { LIVE_ENABLED: "false" } });
  assert.equal((await f.send("/state")).status, 200);
  assert.equal(
    (await f.send("/composer", "PUT", { text: "чернетка", baseRevision: 0 }))
      .status,
    200,
  );
  assert.equal((await f.send("/turns", "POST", input())).status, 503);
  assert.equal(f.calls.start, 0);
  assert.equal(f.calls.context, 0);
});
test("lost ACK replay uses saved result without rereading changed or unavailable context", async (t) => {
  const f = await fixture(t),
    body = input();
  assert.equal((await f.send("/turns", "POST", body)).status, 202);
  assert.equal((await settled(f, body.turnId)).state, "completed");
  f.failContext();
  const res = await f.send("/turns", "POST", body);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).state, "completed");
  assert.equal(f.calls.context, 1);
  assert.equal(f.calls.start, 1);
  assert.equal(
    (await f.send("/turns", "POST", { ...body, text: "other" })).status,
    409,
  );
});
test("browser cannot supply provider, model, profile, tools, session or URL", async (t) => {
  const f = await fixture(t);
  for (const key of [
    "model",
    "provider",
    "profile",
    "tools",
    "sessionId",
    "base_url",
  ])
    assert.equal(
      (await f.send("/turns", "POST", { ...input(), [key]: "forbidden" }))
        .status,
      400,
    );
  assert.equal(f.calls.context, 0);
  assert.equal(f.calls.start, 0);
});
test("pre-admission timeout releases HTTP slot and cannot later launch inference", async (t) => {
  let release;
  const gate = new Promise((r) => (release = r)),
    f = await fixture(t, { deadlineMs: 30, readContext: () => gate });
  const body = input();
  assert.equal((await f.send("/turns", "POST", body)).status, 504);
  await sleep(5);
  assert.equal((await f.send("/state")).status, 200);
  release({ text: "late context", revision: 1 });
  await sleep(10);
  assert.equal(f.calls.start, 0);
  assert.equal(f.store.pending().length, 0);
});
test("disconnect before admission cancels reads; composer remains usable", async (t) => {
  let release;
  const gate = new Promise((r) => (release = r)),
    f = await fixture(t, { readContext: () => gate }),
    controller = new AbortController();
  const pending = f
    .send("/turns", "POST", input(), "pilot", controller.signal)
    .catch(() => null);
  while (!f.calls.context) await sleep(2);
  controller.abort();
  await pending;
  await sleep(10);
  release({ text: "late", revision: 1 });
  assert.equal(
    (await f.send("/composer", "PUT", { text: "збережено", baseRevision: 0 }))
      .status,
    200,
  );
  assert.equal(f.calls.start, 0);
});
test("failed cleanup is visible, hides ready result and blocks admission until independently retried", async (t) => {
  const f = await fixture(t);
  f.failCleanup();
  const body = input();
  await f.send("/turns", "POST", body);
  const result = await settled(f, body.turnId);
  assert.equal(result.state, "cleanup_pending");
  assert.equal(result.cleanupPending, true);
  assert.equal(result.result, null);
  assert.ok(f.store.internal(body.turnId).result);
  assert.equal(
    (await f.send("/turns", "POST", input({ baseRevision: 1 }))).status,
    409,
  );
  f.failCleanup(false);
  await f.trainer.recover();
  const replay = await (await f.send("/turns", "POST", body)).json();
  assert.equal(replay.state, "completed");
  assert.equal(f.calls.start, 1);
});
test("raw media never enters turn SQLite and is removed after confirmed cleanup", async (t) => {
  const f = await fixture(t),
    data = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      randomBytes(300),
    ]).toString("base64"),
    body = input({ images: [{ type: "image/png", data }] });
  await f.send("/turns", "POST", body);
  assert.equal((await settled(f, body.turnId)).state, "completed");
  assert.equal(readFileSync(f.file).includes(Buffer.from(data)), false);
  assert.deepEqual(readdirSync(f.mediaDir), []);
});
test("coordinator deadline holds if backend ignores abort; cancel stops and releases unknown", async (t) => {
  const f = await fixture(t, {
      runDeadlineMs: 20,
      backend: { start: () => new Promise(() => {}) },
    }),
    body = input();
  await f.send("/turns", "POST", body);
  assert.equal((await settled(f, body.turnId)).state, "unknown");
  assert.equal(
    (await f.send("/turns/" + body.turnId + "/cancel", "POST", {})).status,
    200,
  );
  assert.equal(f.store.cleanupJobs().length, 0);
});

test("reload discovers active turn server-side and cancels it without a second inference", async (t) => {
  const f = await fixture(t, {
      backend: { start: () => new Promise(() => {}) },
    }),
    body = input();
  await f.send("/turns", "POST", body);
  const state = await (await f.send("/state")).json();
  assert.equal(state.currentTurn.turnId, body.turnId);
  assert.equal(
    (await f.send("/turns/" + state.currentTurn.turnId + "/cancel", "POST", {}))
      .status,
    200,
  );
  assert.equal((await (await f.send("/state")).json()).currentTurn, null);
});

test("interrupted metadata write does not block canonical startup cleanup or unrelated expiry", async () => {
  const dir = realpathSync(
    mkdtempSync(join(tmpdir(), "trainer-media-restart-")),
  );
  chmodSync(dir, 0o700);
  const file = join(dir, "turns.sqlite"),
    key = randomBytes(32),
    mediaDir = join(dir, "media");
  mkdirSync(mediaDir, { mode: 0o700 });
  let store = openTurnStore(file, { hmacKey: key });
  const c = store.conversation("pilot"),
    turnId = randomUUID(),
    media = createMediaStore(mediaDir, { hash: store.hash });
  const image = {
      type: "image/png",
      data: Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        randomBytes(40),
      ]).toString("base64"),
    },
    descriptors = media.describe("pilot", turnId, [image]);
  store.admit(
    "pilot",
    c.conversationId,
    {
      turnId,
      baseRevision: 0,
      targetDate: "2026-01-03",
      text: "synthetic",
      media: descriptors,
    },
    {},
  );
  writeFileSync(join(mediaDir, descriptors[0].tempRef + ".json"), "", {
    mode: 0o600,
  });
  store.close();
  store = openTurnStore(file, { hmacKey: key });
  let cleaned = 0;
  const gateway = createTrainerGateway({
    ownerUid: "pilot",
    store,
    media,
    proxy: { close() {} },
    backend: {
      async cleanup() {
        cleaned++;
        return { cleaned: true };
      },
    },
  });
  try {
    await gateway.recover();
    assert.equal(cleaned, 1);
    assert.equal(store.cleanupJobs().length, 0);
    assert.deepEqual(readdirSync(mediaDir), []);
    assert.equal(store.get("pilot", turnId).error, "media_reattach_required");
    const invalid = "a".repeat(64),
      expired = "b".repeat(64);
    writeFileSync(join(mediaDir, invalid + ".json"), "", { mode: 0o600 });
    writeFileSync(
      join(mediaDir, expired + ".json"),
      JSON.stringify({ expiresAt: 1 }),
      { mode: 0o600 },
    );
    writeFileSync(join(mediaDir, expired + ".bin"), "synthetic", {
      mode: 0o600,
    });
    const result = media.sweep();
    assert.deepEqual(result, { removed: 1, faults: 1 });
  } finally {
    await gateway.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
