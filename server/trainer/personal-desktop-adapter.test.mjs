import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createPersonalDesktopAdapter } from "./personal-desktop-adapter.mjs";

function fixture(t, { blockedAdmission = false, failedPreparation = false } = {}) {
  const rows = new Map(), transports = new Map(), admissions = new Map(), posted = [], cancelled = [], authenticated = [];
  const hash = value => createHmac("sha256", "synthetic-test-key").update(JSON.stringify(value)).digest("hex");
  let release, detached = 0, receiptReads = 0, current;
  const barrier = blockedAdmission ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const account = {
    store: {
      hash, conversation: () => ({ conversationId: "own-conversation", revision: 7 }), current: () => current,
      internal(id) { if (!rows.has(id)) throw Error("not_found"); return rows.get(id); },
    },
    backend: { transport(id, value) { assert.equal(transports.has(id), false); transports.set(id, value); return () => transports.delete(id); } },
    gateway: { async handle(uid, route, method, body) {
      assert.equal(uid, "owner");
      if (route.endsWith("/cancel")) { cancelled.push(route); return Response.json({}); }
      assert.equal(route, "/turns"); assert.equal(method, "POST");
      authenticated.push(uid); posted.push(body);
      if (failedPreparation) throw Error("day_unavailable");
      const input = { ...body, media: body.images.map(image => ({ hmac: hash({ image: image.data }) })) };
      const row = { owner: uid, id: body.turnId, input: JSON.stringify(input), state: "queued", run_id: null, session_id: null };
      rows.set(body.turnId, row); current = { turnId: body.turnId };
      void barrier.then(() => {
        row.run_id = "native-" + body.turnId; row.session_id = "own-session"; row.state = "completed";
        transports.get(body.turnId).onAdmission({ admission_id: row.run_id, ref: { session_id: "own-session", profile_id: "own-home" }, status: "terminal" });
      });
      return Response.json({ turnId: body.turnId }, { status: 202 });
    } },
  };
  const core = {
    history: async (uid, channel) => ({ uid, channel, session_id: "own-session" }),
    readNative: async (...args) => args,
    connection: async () => ({ provider: "openai-codex", model: "synthetic" }),
    modelOptions: async () => ({ providers: [] }),
    selectModel: async (uid, selection) => ({ uid, ...selection }),
    status: async (uid, id) => { assert.equal(uid, "owner"); receiptReads++; return { nativeReceipt: { admission_id: rows.get(id).run_id, ref: { session_id: "own-session" }, status: "terminal" } }; },
  };
  const create = channel => createPersonalDesktopAdapter({ uid: "owner", channel, account, core,
    sessions: { async getToken(uid) { authenticated.push(uid); } }, admissions,
    detach: async () => { detached++; } });
  const one = create("desktop:first"); t.after(() => one.close());
  return { one, create, rows, transports, admissions, posted, cancelled, authenticated, release,
    get detached() { return detached; }, get receiptReads() { return receiptReads; } };
}

test("Desktop uses the ordinary app preview admission with a server-chosen date context", async t => {
  const f = fixture(t), inputId = randomUUID();
  const receipt = await f.one.submit({ inputId, sessionId: "own-session", text: "Вчора з’їв яблуко", imageRefs: [], images: [] });
  assert.equal(receipt.ref.session_id, "own-session");
  assert.deepEqual(f.posted[0], { turnId: inputId, baseRevision: 7, text: "Вчора з’їв яблуко", images: [], dateContext: { mode: "default" } });
  assert.deepEqual(f.authenticated, ["owner"]);
  for (const extra of [{ uid: "wife" }, { sentAt: "2020-01-01" }, { api_text: "forged" }, { model_override: {} }, { dateContext: { mode: "pinned" } }])
    await assert.rejects(f.one.submit({ inputId: randomUUID(), sessionId: "own-session", text: "own", images: [], ...extra }), /invalid_request/);
  assert.equal(f.posted.length, 1);
});

test("an exact reconnect reads the original native receipt without raw photos or another admission", async t => {
  const f = fixture(t), id = randomUUID(), image = { type: "image/png", data: Buffer.from([137,80,78,71,13,10,26,10,1]).toString("base64") };
  const ref = f.one.hashImage(image);
  await f.one.submit({ inputId: id, sessionId: "own-session", text: "Фото", imageRefs: [ref], images: [image] });
  const second = f.create("desktop:second"); t.after(() => second.close());
  assert.equal((await second.submit({ inputId: id, sessionId: "own-session", text: "Фото", imageRefs: [ref] })).status, "terminal");
  assert.equal(f.posted.length, 1); assert.equal(f.receiptReads, 1);
  await assert.rejects(second.submit({ inputId: id, sessionId: "own-session", text: "Інший текст", imageRefs: [ref] }), /turn_conflict/);
  await assert.rejects(second.submit({ inputId: id, sessionId: "another-session", text: "Фото", imageRefs: [ref] }), /session_changed/);
  await assert.rejects(second.submit({ inputId: id, sessionId: "own-session", text: "Фото", imageRefs: ["f".repeat(64)] }), /turn_conflict/);
});

test("a socket close leaves durable admission running; another socket waits without resubmitting", async t => {
  const f = fixture(t, { blockedAdmission: true }), id = randomUUID();
  const input = { inputId: id, sessionId: "own-session", text: "own food", images: [] };
  const first = f.one.submit(input).catch(error => error);
  await new Promise(resolve => setImmediate(resolve));
  const second = f.create("desktop:second"); t.after(() => second.close());
  await assert.rejects(second.submit({ ...input, text: "changed" }), /turn_conflict/);
  await f.one.close();
  const resumed = second.submit(input); f.release();
  assert.equal((await resumed).ref.session_id, "own-session");
  await first;
  assert.equal(f.posted.length, 1); assert.equal(f.cancelled.length, 0);
});

test("pre-admission failure releases its unused transport; foreign rows and stale cancel IDs are refused", async t => {
  const bad = fixture(t, { failedPreparation: true }), id = randomUUID();
  await assert.rejects(bad.one.submit({ inputId: id, sessionId: "own-session", text: "own", images: [] }), /day_unavailable/);
  assert.equal(bad.transports.size, 0); assert.equal(bad.admissions.size, 0);
  const f = fixture(t), own = randomUUID();
  f.rows.set(own, { owner: "wife", input: "{}" });
  await assert.rejects(f.one.submit({ inputId: own, sessionId: "own-session", text: "own", images: [] }), /not_found/);
  const valid = randomUUID(); await f.one.submit({ inputId: valid, sessionId: "own-session", text: "own", images: [] });
  await assert.rejects(f.one.cancel("foreign-admission"), /not_found/);
  assert.deepEqual(await f.one.cancel("native-" + valid), { interrupted: true });
  assert.equal(f.cancelled.length, 1);
});
