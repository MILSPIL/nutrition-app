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
import { createTrainerTools } from "./tools.mjs";
import { personalQueue } from "./personal-queue.mjs";
import { buildSnapshot } from "./snapshot.mjs";

// Real gateway snapshot, real trainer tools and real draft store; only the model is scripted.
function fixture(t, { notes = [] } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "scisense-draft-append-"))); chmodSync(dir, 0o700);
  const clock = Date.parse("2026-10-24T10:00:00Z");
  const store = openTurnStore(join(dir, "turns.sqlite"), { hmacKey: randomBytes(32), now: () => clock });
  const queue = personalQueue(), sessionId = randomUUID(), scripts = [], inputs = new Map(), failures = [];
  const core = { enqueue(_uid, id, body) { inputs.set(id, body); },
    schedule(uid, _id, callback, { signal }) { return queue.run(uid, async signal => callback({ signal, deadline: clock + 45000,
      execute: async value => {
        const native = { admission_id: randomUUID(), ref: { session_id: sessionId } };
        const prepared = await value.prepare({ signal, sessionId });
        const call = (name, args) => prepared.tools(name, args, { signal, nativeBinding: { admissionId: native.admission_id, sessionId } });
        await prepared.onAdmission(native);
        try { await scripts.shift()({ call, snapshot: JSON.parse(prepared.apiText) }); }
        catch (error) { failures.push(error); throw error; }
        await prepared.verify();
        return { state: "completed", result: { final_response: "Синтетична відповідь тренера" } };
      } }), { signal }); },
    async history() { return { session_id: sessionId, messages: [] }; },
    input(_uid, id) { return { state: "admitted", generation: inputs.has(id) ? 1 : null }; },
    async cancelInput() { return { stopped: true }; },
  };
  const readDay = async (_uid, targetDate) => ({ targetDate, revision: 0, meals: {}, notes, notesEnabled: true });
  const readPlan = async () => ({ planContext: {} });
  const kit = createTrainerTools({ store, index: { lookup: () => [] }, readDay, readPlan });
  const backend = createPersonalBackend({ uid: "owner", core, tools: kit.tools, store, releaseTools: kit.release });
  const g = createTrainerGateway({ ownerUid: "owner", store, backend, now: () => clock, queueWindowMs: 225000,
    snapshotFactory: value => buildSnapshot({ ...value, history: [], maxPayloadBytes: 512000 }),
    media: { describe: () => [], stage() {}, load: () => [], remove() {}, sweep: () => ({ faults: 0 }) }, proxy: { cancel() {}, close() {} },
    readContext: async () => ({ text: "synthetic", revision: 1 }), readDay, readPlan });
  t.after(async () => { await g.close(); await queue.close(); store.close(); rmSync(dir, { recursive: true, force: true }); });
  async function turn(text, script) {
    scripts.push(script);
    const state = await (await g.handle("owner", "/state", "GET")).json();
    const input = { turnId: randomUUID(), baseRevision: state.revision, text, dateContext: { mode: "default" } };
    await g.handle("owner", "/turns", "POST", input);
    for (let n = 0; n < 200; n++) { const row = store.get("owner", input.turnId); if (failures.length) throw failures.pop(); if (!["running", "queued"].includes(row.state)) return row; await sleep(5); }
    throw Error("fixture_timeout");
  }
  const drafts = async () => (await (await g.handle("owner", "/state", "GET")).json()).drafts;
  const note = body => g.handle("owner", "/notes", "POST", body);
  return { turn, drafts, note };
}
const item = (name, value = 100) => ({ itemId: randomUUID(), name, preparation: "as_sold", quantity: { value, unit: "g" },
  source: { kind: "estimate", estimateReason: "recipe_estimate", assumptions: ["Синтетична оцінка"], nutritionBasis: { value: 100, unit: "g" }, nutrients: { p: 10, f: 5, c: 1, cal: 89 } } });

test("new food for a date with an unsaved draft is appended to it instead of silently vanishing", async t => {
  const f = fixture(t);
  assert.equal((await f.turn("З’їв 100 г синтетичного яблука", async ({ call }) => {
    assert.equal((await call("propose_food_draft", { dayRef: "today", baseRevision: 0, meal: 1, items: [item("Синтетичне яблуко")] })).itemCount, 1);
  })).state, "completed");
  const [first] = await f.drafts();
  assert.equal(first.items.length, 1);
  assert.equal((await f.turn("З’їв ще 100 г синтетичного сиру", async ({ call, snapshot }) => {
    const cheese = item("Синтетичний сир");
    assert.deepEqual(Object.keys(await call("propose_food_draft", { dayRef: "today", baseRevision: 0, meal: 2, items: [cheese] })), ["error", "hint"]);
    const refused = await call("propose_food_draft", { dayRef: "today", baseRevision: 0, meal: 2, items: [cheese] });
    assert.equal(refused.error, "date_draft_conflict");
    const open = snapshot.draft.find(d => d.draftId === first.draftId);
    assert.ok(open && Number.isSafeInteger(open.revision), "snapshot exposes the conflicting draft");
    const ack = await call("propose_food_draft", { draftId: open.draftId, baseRevision: open.revision, dayRef: "today", meal: open.meal, items: [cheese] });
    assert.equal(ack.itemCount, 2);
  })).state, "completed");
  const all = await f.drafts();
  assert.equal(all.length, 1);
  assert.equal(all[0].draftId, first.draftId);
  assert.deepEqual(all[0].items.map(i => i.name).sort(), ["Синтетичне яблуко", "Синтетичний сир"]);
  assert.equal(all[0].meal, 1);
  assert.notEqual(all[0].state, "conflict");
});

test("a repairable refusal does not block a corrected retry of the same draft in the same turn", async t => {
  const f = fixture(t);
  await f.turn("З’їв 100 г синтетичного яблука", async ({ call }) => {
    await call("propose_food_draft", { dayRef: "today", baseRevision: 0, meal: 1, items: [item("Синтетичне яблуко")] });
  });
  const [first] = await f.drafts();
  const apple = first.items[0].itemId;
  assert.equal((await f.turn("Яблуко було 150 г, я з’їв його", async ({ call }) => {
    const edit = value => call("propose_food_draft", { draftId: first.draftId, baseRevision: first.revision, dayRef: "today", meal: 1, items: [{ itemId: apple, quantity: { value, unit: "g" } }] });
    const refused = await edit(-5);
    assert.deepEqual(Object.keys(refused), ["error", "hint"]);
    assert.equal(refused.error, "invalid_quantity");
    const ack = await edit(150);
    assert.equal(ack.draftId, first.draftId);
    assert.equal(ack.itemCount, 1);
  })).state, "completed");
  assert.equal((await f.drafts())[0].items[0].quantity.value, 150);
});

test("a saved note's card takes no second food: the trainer gets a repair hint instead of a card that cannot be added", async t => {
  const noteId = "note-synthetic-000001", itemId = randomUUID();
  const f = fixture(t, { notes: [{ noteId, itemId, state: "active", targetDate: "2026-10-24", text: "Синтетичний перекус" }] });
  assert.equal((await f.note({ text: "Синтетичний перекус", targetDate: "2026-10-24", meal: 1, noteId, itemId })).status, 200);
  const [card] = await f.drafts();
  assert.equal(card.noteId, noteId);
  assert.equal((await f.turn("З’їв ще 100 г синтетичного сиру", async ({ call, snapshot }) => {
    const open = snapshot.draft.find(d => d.draftId === card.draftId);
    assert.equal(open?.noteId, noteId, "snapshot shows that the card resolves a note");
    const refused = await call("propose_food_draft", { draftId: open.draftId, baseRevision: open.revision, dayRef: "today", meal: open.meal, items: [item("Синтетичний сир")] });
    assert.deepEqual(Object.keys(refused), ["error", "hint"]);
    assert.equal(refused.error, "note_draft_single");
  })).state, "completed");
  const [after] = await f.drafts();
  assert.equal(after.items.length, 1);
  assert.equal(after.items[0].itemId, itemId);
});

test("a second new draft for the same date in one turn is refused with a hint instead of vanishing at publish", async t => {
  const f = fixture(t);
  assert.equal((await f.turn("Сніданок синтетичне яблуко, обід синтетичний сир", async ({ call }) => {
    assert.equal((await call("propose_food_draft", { dayRef: "today", baseRevision: 0, meal: 1, items: [item("Синтетичне яблуко")] })).itemCount, 1);
    const refused = await call("propose_food_draft", { dayRef: "today", baseRevision: 0, meal: 2, items: [item("Синтетичний сир")] });
    assert.deepEqual(Object.keys(refused), ["error", "hint"]);
    assert.equal(refused.error, "date_draft_in_turn");
  })).state, "completed");
  const all = await f.drafts();
  assert.equal(all.length, 1);
  assert.deepEqual(all[0].items.map(i => i.name), ["Синтетичне яблуко"]);
  assert.notEqual(all[0].state, "conflict");
});
