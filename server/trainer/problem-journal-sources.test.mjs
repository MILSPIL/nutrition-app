// COACH-PROBLEMS-01, K3 і K5: кожне джерело журналу проходить справжнім шляхом
// (turn-store, гейтвей, персональний бекенд, проводка createPersonalRuntime).
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, chmodSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import { openTurnStore } from "./turn-store.mjs";
import { turnProblemRecorder } from "./problem-journal.mjs";
import { RELEASE, START, ids, throwing, fixture, answer, turnRows } from "./problem-journal-fixture-test.mjs";
import { provisionPersonalRuntime, createPersonalRuntime } from "./personal-runtime.mjs";
import { createPersonalPayer, safePayerDiagnostic } from "./personal-payer.mjs";


test("K3 старт-відновлення: running → turn_unknown execution_unknown, queued → turn_failed interrupted_before_start", async t => {
  const [a, b] = ids(2);
  const f = fixture(t, { script: async ({ admit }) => { await admit(); return answer("ok"); } });
  for (const id of [a, b]) { await f.post(id); await f.settle(id); }
  await f.close();
  const db = new DatabaseSync(f.storeFile);
  db.prepare("UPDATE turns SET state='running' WHERE id=?").run(a);
  db.prepare("UPDATE turns SET state='queued' WHERE id=?").run(b);
  db.close();
  const reopened = openTurnStore(f.storeFile, { hmacKey: f.hmacKey, now: () => START, onTransition: turnProblemRecorder(f.journal) });
  reopened.close();
  assert.deepEqual(turnRows(f.rows()), [["turn_failed", "interrupted_before_start", "", 1], ["turn_unknown", "execution_unknown", "", 1]]);
});

test("K3 відмова черги дає turn_failed trainer_queue_full, не other", async t => {
  const [a, b] = ids(2);
  const f = fixture(t, { maxWaiting: 1, script: async ({ admit }) => { await admit(); return answer("ok"); } });
  let release; const gate = new Promise(resolve => { release = resolve; });
  let entered; const busy = new Promise(resolve => { entered = resolve; });
  const other = f.queue.run("wife", async () => { entered(); await gate; });
  await busy;
  const waiting = f.queue.run("wife", async () => {});
  await f.post(a);
  assert.equal((await f.settle(a)).error, "trainer_queue_full");
  release(); await other; await waiting;
  await f.post(b); await f.settle(b);
  assert.deepEqual(turnRows(f.rows()), [["turn_failed", "trainer_queue_full", "", 1]]);
});

test("K3 збій після старту: turn_unknown execution_unknown; unknown→failed дає рівно два записи; повтор переходу запису не дає", async t => {
  const [a] = ids(1);
  const f = fixture(t, { nativeStatus: { state: "failed" }, script: async ({ admit }) => { await admit(); throw Error("trainer_timeout"); } });
  await f.post(a);
  assert.equal((await f.settle(a)).state, "unknown");
  f.store.fail(a, "execution_unknown", { unknown: true });
  assert.deepEqual(turnRows(f.rows()), [["turn_unknown", "execution_unknown", "", 1]]);
  await f.g.handle("owner", `/turns/${a}/recover`, "POST", {});
  assert.equal(f.store.get("owner", a).state, "failed");
  f.store.fail(a, "trainer_failed");
  f.store.cancel("owner", a, "user_cancel");
  assert.deepEqual(turnRows(f.rows()), [["turn_failed", "trainer_failed", "", 1], ["turn_unknown", "execution_unknown", "", 1]]);
});

test("K3 причини скасування: user_cancel, expired, native_cancelled, shutdown; без причини other", async t => {
  const [a, b, c, d, e] = ids(5);
  let mode = "hold";
  const f = fixture(t, { nativeStatus: { state: "cancelled" }, script: async ({ admit, signal }) => {
    await admit();
    if (mode === "fail") throw Error("trainer_timeout");
    await new Promise(resolve => signal.aborted ? resolve() : signal.addEventListener("abort", resolve, { once: true }));
    throw Error("trainer_cancelled");
  } });
  // user_cancel: кнопка «Скасувати».
  await f.post(a);
  for (let n = 0; n < 200 && f.store.get("owner", a).state !== "running"; n++) await sleep(2);
  await f.g.handle("owner", `/turns/${a}/cancel`, "POST", {});
  await f.settle(a);
  // native_cancelled: recover бачить cancelled у Native.
  mode = "fail";
  await f.post(b); await f.settle(b);
  await f.g.handle("owner", `/turns/${b}/recover`, "POST", {});
  // expired: ретеншн позначив завислий хід.
  await f.post(c); await f.settle(c);
  const db = new DatabaseSync(f.storeFile); db.prepare("UPDATE turns SET expired=1 WHERE id=?").run(c); db.close();
  await f.g.recover();
  // Виклик без причини.
  await f.post(d); await f.settle(d);
  f.store.cancel("owner", d);
  await f.g.recover();
  // shutdown: зупинка служби з ходом у роботі.
  mode = "hold";
  await f.post(e);
  for (let n = 0; n < 200 && f.store.get("owner", e).state !== "running"; n++) await sleep(2);
  await f.close();
  const cancelled = f.rows().filter(([category]) => category === "turn_cancelled").map(([, code, , count]) => [code, count]);
  assert.deepEqual(cancelled, [["expired", 1], ["native_cancelled", 1], ["other", 1], ["shutdown", 1], ["user_cancel", 1]]);
});

test("K3 tool_error: ремонтна і неремонтна помилка з назвою інструмента; помилка до try не рахується", async t => {
  const [a, b] = ids(2);
  let step = 0;
  const f = fixture(t, {
    tools: { propose_food_draft: async () => { throw Error("invalid_food_proposal"); }, read_plan: async () => { throw Error("synthetic_unlisted_fault"); } },
    script: async ({ admit, call }) => {
      await admit();
      if (step++ === 0) {
        assert.deepEqual(Object.keys(await call("propose_food_draft", {})), ["error", "hint"]);
        await assert.rejects(call("not_a_tool", {}), /invalid_request/);
        return answer("ok");
      }
      await call("read_plan", {});
      return answer("unreachable");
    } });
  await f.post(a); assert.equal((await f.settle(a)).state, "completed");
  await f.post(b); await f.settle(b);
  assert.deepEqual(f.rows().filter(([category]) => category === "tool_error"), [
    ["tool_error", "invalid_food_proposal", "propose_food_draft", 1],
    ["tool_error", "other", "read_plan", 1],
  ]);
});

// Проводка createPersonalRuntime: як personal-runtime.test.mjs.
function runtimeFixture(t, { releaseId = RELEASE } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "problem-runtime-"))); chmodSync(base, 0o700);
  const root = join(base, "state"), platformKey = randomBytes(32);
  const registry = { version: 1, fundingOwner: "owner", profiles: ["owner", "wife"].map(uid => ({ uid, profileId: "native-" + uid, home: join(base, uid), socket: join(base, "run-" + uid, "native.sock"), canonicalTitle: "Bot Chat" })) };
  let payerOptions, runtime;
  const config = { registry, platformKey, root, index: join(base, "index"), project: "scisense-test", firebaseApiKey: "synthetic-public-api-key", releaseId,
    dataProfiles: { owner: "firestore-a", wife: "firestore-b" }, verifyToken: async () => "owner", fetcher: async () => { throw Error("unexpected_fetch"); },
    spawnOwner: () => { throw Error("unexpected-native"); }, spawnPayer: () => { throw Error("unexpected-payer"); }, indexFactory: () => ({ close() {} }),
    readerFactory: () => ({ readDay: async () => ({}), readPlan: async () => ({}) }),
    payerFactory: options => { payerOptions = options; return createPersonalPayer(options); } };
  provisionPersonalRuntime(config);
  t.after(async () => { await runtime?.close().catch(() => {}); platformKey.fill(0); rmSync(base, { recursive: true, force: true }); });
  return { root, config, get payerOptions() { return payerOptions; }, async open() { runtime = await createPersonalRuntime(config); return runtime; } };
}
const diagnostic = code => safePayerDiagnostic({ code, stage: "sdk", posts: 1, responses: [{ success: false, status: 429, sse: false, finished: true, abandoned: false, failed: true, hasModels: true, modelMatches: true, terminalSeen: false, terminalModelSeen: false }] });

test("K3 payer_failure: onDiagnostic з проводки createPersonalRuntime пише в журнал першим; журнал закривається з рантаймом", async t => {
  const f = runtimeFixture(t), runtime = await f.open();
  assert.deepEqual(runtime.problems.status(), { ok: true, writeErrors: 0 });
  f.payerOptions.onDiagnostic(diagnostic("trainer_quota"));
  f.payerOptions.onDiagnostic(diagnostic("trainer_quota"));
  assert.deepEqual(runtime.problems.rows("2000-01-01").map(r => [r.release, r.category, r.code, r.tool, r.count]), [[RELEASE, "payer_failure", "trainer_quota", "", 2]]);
  await runtime.close();
  assert.equal(runtime.problems.status().ok, false);
  const db = new DatabaseSync(join(f.root, "problems.sqlite"), { readOnly: true });
  assert.deepEqual(db.prepare("SELECT category,code,count FROM problems").all().map(r => ({ ...r })), [{ category: "payer_failure", code: "trainer_quota", count: 2 }]);
  db.close();
});

test("K5 (б) журнал не відкривається на старті: служба стартує, journal.ok=false", async t => {
  const f = runtimeFixture(t);
  mkdirSync(join(f.root, "problems.sqlite"), { mode: 0o700 });
  const runtime = await f.open();
  assert.equal(runtime.accepts("owner"), true);
  assert.deepEqual(runtime.problems.status(), { ok: false, writeErrors: 0 });
  assert.deepEqual(runtime.problems.rows("2000-01-01"), []);
  f.payerOptions.onDiagnostic(diagnostic("trainer_quota"));
});

test("K5 (а) запис падає щоразу: служба працює, writeErrors>0", async t => {
  const f = runtimeFixture(t), runtime = await f.open();
  const db = new DatabaseSync(join(f.root, "problems.sqlite")); db.exec("DROP TABLE problems"); db.close();
  f.payerOptions.onDiagnostic(diagnostic("trainer_quota"));
  assert.equal(runtime.problems.status().ok, true);
  assert.ok(runtime.problems.status().writeErrors > 0);
});

// Один і той самий сценарій з робочим журналом і з журналом, що кидає.
async function scenario(t, journal) {
  const [a, b, c] = ids(3);
  let step = 0;
  const f = fixture(t, { journal, nativeStatus: { state: "failed" },
    tools: { propose_food_draft: async () => { throw Error("invalid_food_proposal"); } },
    script: async ({ admit, call }) => {
      await admit();
      if (step++ === 0) { await call("propose_food_draft", {}); return answer("Відповідь тренера"); }
      throw Error("trainer_timeout");
    } });
  const out = [];
  const read = async response => { out.push([response.status, (await response.text()).replaceAll(f.store.conversation("owner").conversationId, "C")]); };
  await read(await f.post(a)); await f.settle(a);
  await read(await f.g.handle("owner", `/turns/${a}`, "GET"));
  await read(await f.post(b)); await f.settle(b);
  await read(await f.g.handle("owner", `/turns/${b}/recover`, "POST", {}));
  await read(await f.post(c)); await f.settle(c);
  await read(await f.g.handle("owner", `/turns/${c}/cancel`, "POST", {}).catch(error => Response.json({ thrown: error.message })));
  await read(await f.g.handle("owner", `/turns/${c}`, "GET"));
  return { out, rows: journal === throwing ? null : f.rows() };
}

test("K5 (а) хід побайтово той самий з робочим журналом і з журналом, що кидає", async t => {
  const good = await scenario(t, undefined), bad = await scenario(t, throwing);
  assert.ok(good.rows.length >= 3);
  assert.deepEqual(bad.out, good.out);
});

test("K3 turn_cause: збій після старту дає turn_unknown execution_unknown плюс turn_cause зі справжнім кодом", async t => {
  const [a, b] = ids(2);
  let step = 0;
  const f = fixture(t, { nativeStatus: { state: "failed" }, script: async ({ admit }) => { if (step++ === 0) { await admit(); throw Error("trainer_timeout"); } throw Error("synthetic_unlisted_fault"); } });
  await f.post(a); assert.equal((await f.settle(a)).state, "unknown");
  await f.g.handle("owner", `/turns/${a}/recover`, "POST", {});
  await f.post(b); await f.settle(b);
  assert.deepEqual(f.rows().filter(([category]) => category === "turn_cause"), [
    ["turn_cause", "other", "", 1],
    ["turn_cause", "trainer_timeout", "", 1],
  ]);
  assert.deepEqual(turnRows(f.rows()).filter(([category]) => category === "turn_unknown"), [["turn_unknown", "execution_unknown", "", 1]]);
});

const item = (source, extra = {}) => ({ itemId: randomUUID(), name: "synthetic", quantity: { value: 1, unit: "portion" }, preparation: "unknown", source, ...extra });
test("K3 food_*: лише успішний propose_food_draft і лише нові позиції (з name)", async t => {
  const [a] = ids(1);
  let fail = false;
  const f = fixture(t, {
    tools: { propose_food_draft: async () => { if (fail) throw Error("invalid_food_proposal"); return { state: "ready", saved: false, incomplete: true }; } },
    script: async ({ admit, call }) => {
      await admit();
      await call("propose_food_draft", { baseRevision: 0, dayRef: "today", meal: 1, removeItemIds: [randomUUID()], items: [
        item({ kind: "estimate", estimateReason: "no_matching_source", assumptions: ["a"] }),
        item({ kind: "estimate", estimateReason: "recipe_estimate", assumptions: ["a"], portionOrigin: { kind: "estimate", assumption: "a" } }),
        item({ kind: "unknown" }),
        item({ kind: "database", recordId: "r", portionOrigin: { kind: "estimate", assumption: "a" } }),
        item({ kind: "database", recordId: "r", portionOrigin: { kind: "user" } }),
        { itemId: randomUUID(), quantity: { value: 2, unit: "g" } },
      ] });
      fail = true;
      await call("propose_food_draft", { baseRevision: 0, dayRef: "today", meal: 1, items: [item({ kind: "unknown" })] });
      return answer("ok");
    } });
  await f.post(a); assert.equal((await f.settle(a)).state, "completed");
  assert.deepEqual(f.rows().filter(([category]) => category.startsWith("food_")), [
    ["food_estimate", "no_matching_source", "propose_food_draft", 1],
    ["food_estimate", "recipe_estimate", "propose_food_draft", 1],
    ["food_total", "item", "propose_food_draft", 5],
    ["food_unknown", "unknown", "propose_food_draft", 1],
  ]);
});

test("K3 food_portion_estimate за нормалізованим результатом, не за параметрами моделі", async t => {
  const [a] = ids(1);
  // Модель не дала portionOrigin, сервер оцінив вагу сам; модель написала estimate, а сервер знайшов масу в тексті (user).
  // Несиметрично: за параметрами вийшло б 1, за нормалізованим результатом 2.
  const serverEstimated = [item({ kind: "database", recordId: "r" }), item({ kind: "database", recordId: "r" })];
  const userStated = item({ kind: "database", recordId: "r", portionOrigin: { kind: "estimate", assumption: "a" } });
  const f = fixture(t, {
    tools: { propose_food_draft: async () => ({ state: "ready", saved: false, incomplete: false, assumptions: [
      ...serverEstimated.map(({ itemId }) => ({ itemId, portionOrigin: { kind: "estimate", assumption: "s" } })),
      { itemId: userStated.itemId, portionOrigin: { kind: "user" } },
      { itemId: randomUUID(), portionOrigin: { kind: "estimate", assumption: "s" } },
    ] }) },
    script: async ({ admit, call }) => {
      await admit();
      await call("propose_food_draft", { baseRevision: 0, dayRef: "today", meal: 1, items: [...serverEstimated, userStated] });
      return answer("ok");
    } });
  await f.post(a); assert.equal((await f.settle(a)).state, "completed");
  assert.deepEqual(f.rows().filter(([category]) => category === "food_portion_estimate"), [["food_portion_estimate", "estimate", "propose_food_draft", 2]]);
});
