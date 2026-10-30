// 1.9.9: user-stated numbers count at once, no needless questions, photos at any time, advice with the draft.
// Synthetic owner and conversation; the food numbers are the owner's own breakfast message from 28.10.
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
import { createTrainerTools, TRAINER_POLICY } from "./tools.mjs";
import { createFoodResolver } from "./food-resolver.mjs";
import { commandFromDraft } from "./drafts.mjs";
import { MODEL_TOOL_ERRORS, safeToolFailure } from "./tool-errors.mjs";
import { DRAFT_COMPLETION_TEXT } from "./draft-completion.mjs";
import { personalQueue } from "./personal-queue.mjs";
import { buildSnapshot } from "./snapshot.mjs";
import { itemMacros, itemProblems } from "../../src/services/mealItems.js";

const BREAKFAST = `По продуктах:
- 3 яйця (150 г): 233 ккал, Б 18.9, Ж 15.9, В 1.7
- куряче філе на грилі 100 г: 165 ккал, Б 31.0, Ж 3.6, В 0
- перець болгарський 150 г: 47 ккал, Б 1.5, Ж 0.5, В 9.0
- помідори 150 г: 27 ккал, Б 1.4, Ж 0.3, В 5.9
- салат «Аліканте» 100 г: 18 ккал, Б 1.5, Ж 0.1, В 2.8
- бальзамік 12 г: 12 ккал, Б 0, Ж 0, В 3.0
- молоко 0.5% 125 г: 44 ккал, Б 3.8, Ж 0.6, В 5.9`;
const ROWS = [
  ["Яйця, 3 шт.", 150, { cal: 233, p: 18.9, f: 15.9, c: 1.7 }, "unknown"],
  ["Куряче філе на грилі", 100, { cal: 165, p: 31.0, f: 3.6, c: 0 }, "cooked"],
  ["Перець болгарський", 150, { cal: 47, p: 1.5, f: 0.5, c: 9.0 }, "raw"],
  ["Помідори", 150, { cal: 27, p: 1.4, f: 0.3, c: 5.9 }, "raw"],
  ["Салат «Аліканте»", 100, { cal: 18, p: 1.5, f: 0.1, c: 2.8 }, "unknown"],
  ["Бальзамік", 12, { cal: 12, p: 0, f: 0, c: 3.0 }, "as_sold"],
  ["Молоко 0,5%", 125, { cal: 44, p: 3.8, f: 0.6, c: 5.9 }, "as_sold"],
];
const manual = (name, grams, nutrients, preparation = "unknown", extra = {}) => ({
  itemId: randomUUID(), name, preparation, quantity: { value: grams, unit: "g" },
  source: { kind: "manual", nutritionBasis: { value: grams, unit: "g" }, nutrients, ...extra },
});
const resolver = (photos = []) => createFoodResolver({ index: { lookup: () => [] }, photos });
const EGGS = "3 яйця (150 г): 233 ккал, Б 18.9, Ж 15.9, В 1.7";

// Real trainer tools and turn store; the model is replaced by direct tool calls.
function toolsFixture(t, { text = BREAKFAST, media = [] } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "scisense-199-tools-"))); chmodSync(dir, 0o700);
  const store = openTurnStore(join(dir, "turns.sqlite"), { hmacKey: randomBytes(32) });
  const cid = store.conversation("owner").conversationId;
  const day = { targetDate: "2026-10-28", revision: 0, meals: {}, notes: [] };
  const kit = createTrainerTools({ store, index: { lookup: () => [] }, readSnapshot: async () => ({ day, plan: {} }) });
  const turns = [];
  t.after(() => { for (const id of turns) kit.release(id); store.close(); rmSync(dir, { recursive: true, force: true }); });
  function begin(message = text, files = media) {
    const input = { turnId: randomUUID(), baseRevision: store.conversation("owner").revision, text: message, targetDate: day.targetDate, media: files };
    const snapshot = { plan: {}, contextRevision: 0, draft: store.drafts("owner", cid).filter(d => d.state !== "saved"),
      sentAt: "2026-10-28T08:00:00Z", targetDate: day.targetDate, dateContext: { mode: "default" } };
    store.admit("owner", cid, input, snapshot);
    const turn = store.begin("owner", input.turnId); turns.push(turn.id);
    const ctx = { turn, input, snapshot, signal: new AbortController().signal };
    return {
      ctx,
      propose: (items, extra = {}) => kit.tools.propose_food_draft({ baseRevision: 0, dayRef: "today", meal: 1, items, ...extra }, ctx),
      complete() { store.complete(turn.id, turn.generation, { text: "Синтетична відповідь" }); store.cleaned(turn.id); return store.drafts("owner", cid); },
    };
  }
  return { begin, store, cid };
}

// Real gateway, backend, tools and draft store; only the model is scripted (as personal-draft-append.test.mjs).
function backendFixture(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "scisense-199-backend-"))); chmodSync(dir, 0o700);
  const clock = Date.parse("2026-10-28T08:00:00Z");
  const store = openTurnStore(join(dir, "turns.sqlite"), { hmacKey: randomBytes(32), now: () => clock });
  const queue = personalQueue(), sessionId = randomUUID(), scripts = [], inputs = new Map(), failures = [];
  const core = { enqueue(_uid, id, body) { inputs.set(id, body); },
    schedule(uid, _id, callback, { signal }) { return queue.run(uid, async signal => callback({ signal, deadline: clock + 45000,
      execute: async value => {
        const native = { admission_id: randomUUID(), ref: { session_id: sessionId } };
        const prepared = await value.prepare({ signal, sessionId });
        const call = (name, args) => prepared.tools(name, args, { signal, nativeBinding: { admissionId: native.admission_id, sessionId } });
        await prepared.onAdmission(native);
        try { await scripts.shift()({ call, prepared }); }
        catch (error) { failures.push(error); throw error; }
        await prepared.verify();
        return { state: "completed", result: { final_response: "Синтетична відповідь тренера" } };
      } }), { signal }); },
    async history() { return { session_id: sessionId, messages: [] }; },
    input(_uid, id) { return { state: "admitted", generation: inputs.has(id) ? 1 : null }; },
    async cancelInput() { return { stopped: true }; },
  };
  const readDay = async (_uid, targetDate) => ({ targetDate, revision: 0, meals: {}, notes: [], notesEnabled: true });
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
  return { turn };
}
const proposalCall = { id: "synthetic-draft-call", type: "function", function: { name: "propose_food_draft", arguments: "{}" } };
const completionPayload = (ack, content) => ({ stream: false, messages: [
  { role: "user", content: EGGS },
  { role: "assistant", ...(content !== undefined ? { content } : {}), tool_calls: [proposalCall] },
  { role: "tool", tool_call_id: proposalCall.id, content: JSON.stringify(ack) },
] });

test("K1: the owner's egg numbers count as user-entered food with the owner's portion", () => {
  const item = resolver().resolve(manual("Яйця, 3 шт.", 150, { cal: 233, p: 18.9, f: 15.9, c: 1.7 }), { userText: EGGS });
  assert.equal(item.nutritionStatus, "complete");
  assert.equal(item.source.kind, "manual");
  assert.equal(item.source.label, "Введено вручну");
  assert.equal(item.source.portionOrigin.kind, "user");
  assert.equal(item.estimated, false);
  assert.deepEqual(itemMacros(item), { cal: 233, p: 18.9, f: 15.9, c: 1.7 });
});

test("K1b: a model mass estimate stays an estimate; a single portion basis needs no number 1 in the text", () => {
  const salad = manual("Салат", 100, { cal: 18, p: 1.5, f: 0.1, c: 2.8 }, "unknown",
    { portionOrigin: { kind: "estimate", assumption: "Маса з'їденого не вказана, оцінено одну пачку" } });
  const estimated = resolver().resolve(salad, { userText: "Салат на 100 г: 18 ккал, Б 1.5, Ж 0.1, В 2.8" });
  assert.equal(estimated.nutritionStatus, "complete");
  assert.equal(estimated.source.portionOrigin.kind, "estimate");
  assert.equal(estimated.estimated, true);
  const coffee = { itemId: randomUUID(), name: "Кава", preparation: "as_sold", quantity: { value: 1, unit: "portion" },
    source: { kind: "manual", nutritionBasis: { value: 1, unit: "portion" }, nutrients: { cal: 45, p: 2, f: 1, c: 6 } } };
  const cup = resolver().resolve(coffee, { userText: "кава 45 ккал, Б 2, Ж 1, В 6" });
  assert.equal(cup.source.kind, "manual");
  assert.equal(cup.nutritionStatus, "complete");
});

test("K2: numbers the owner did not write are refused with a repairable code; malformed manual is a form error", () => {
  assert.ok(MODEL_TOOL_ERRORS.has("manual_values_not_in_message"));
  const { hint } = safeToolFailure(Error("manual_values_not_in_message"));
  assert.ok(typeof hint === "string" && hint.length > 0 && hint.length <= 300);
  const r = resolver();
  assert.throws(() => r.resolve(manual("Яйця", 150, { cal: 250, p: 18.9, f: 15.9, c: 1.7 }), { userText: EGGS }), /^Error: manual_values_not_in_message$/);
  assert.throws(() => r.resolve(manual("Філе", 100, { cal: 165, p: 31, f: 3.6, c: 0 }), { userText: "куряче філе 100 г: 165 ккал, Б 31, Ж 3.6" }), /^Error: manual_values_not_in_message$/);
  assert.throws(() => r.resolve(manual("Яйця", 150, { cal: 233, p: 18.9, f: null, c: 1.7 }), { userText: EGGS }), /^Error: invalid_food_source$/);
  assert.throws(() => r.resolve(manual("Яйця", 150, { cal: 233, p: 18.9, f: 15.9, c: 1.7 }, "unknown", { assumptions: ["x"] }), { userText: EGGS }), /^Error: invalid_food_source$/);
  assert.throws(() => r.resolve({ ...manual("Яйця", 150, { cal: 233, p: 18.9, f: 15.9, c: 1.7 }), source: { kind: "manual", nutritionBasis: { value: 150, unit: "unknown" }, nutrients: { cal: 233, p: 18.9, f: 15.9, c: 1.7 } } }, { userText: EGGS }), /^Error: invalid_food_source$/);
});

test("K2b: a correction in a later message may reuse the numbers of the draft it edits, not invented ones", async t => {
  const f = toolsFixture(t, { text: EGGS });
  const first = f.begin(EGGS);
  const eggs = { ...manual("Яйця, 3 шт.", 150, { cal: 1, p: 1, f: 1, c: 1 }), source: { kind: "estimate", estimateReason: "no_matching_source", assumptions: ["Синтетична оцінка"], nutritionBasis: { value: 150, unit: "g" }, nutrients: { cal: 220, p: 18, f: 15, c: 1 } } };
  await first.propose([eggs]);
  const [draft] = first.complete();
  const second = f.begin("яйця варені");
  const fromOrigin = { ...eggs, source: { kind: "manual", nutritionBasis: { value: 150, unit: "g" }, nutrients: { cal: 233, p: 18.9, f: 15.9, c: 1.7 } } };
  const invented = { ...fromOrigin, source: { ...fromOrigin.source, nutrients: { cal: 240, p: 18.9, f: 15.9, c: 1.7 } } };
  // A refused call records nothing, so the same turn may still send the correct numbers.
  await assert.rejects(() => second.propose([invented], { draftId: draft.draftId, baseRevision: draft.revision }), /manual_values_not_in_message/);
  const ack = await second.propose([fromOrigin], { draftId: draft.draftId, baseRevision: draft.revision });
  assert.equal(ack.state, "ready");
  const [edited] = second.complete();
  assert.equal(edited.items[0].source.kind, "manual");
  assert.equal(edited.items[0].nutritionStatus, "complete");
});

test("K3: unknown preparation no longer blocks food whose numbers are already given", () => {
  const r = resolver([{ ref: "synthetic-label", itemId: "synthetic-label-item" }]);
  const label = r.resolve({ itemId: "synthetic-label-item", name: "Салат", preparation: "unknown", quantity: { value: 100, unit: "g" },
    source: { kind: "label", photoRef: "synthetic-label", nutritionBasis: { value: 100, unit: "g" }, nutrients: { p: 1.5, f: 0.1, c: 2.8, cal: 18 } } });
  assert.equal(label.nutritionStatus, "complete");
  const estimate = r.resolve({ itemId: randomUUID(), name: "Омлет", preparation: "unknown", quantity: { value: 150, unit: "g" },
    source: { kind: "estimate", estimateReason: "no_matching_source", assumptions: ["Спосіб приготування не вказано, взято варені"], nutritionBasis: { value: 100, unit: "g" }, nutrients: { p: 13, f: 11, c: 1, cal: 155 } } });
  assert.equal(estimate.nutritionStatus, "complete");
  assert.equal(estimate.incompleteReason, undefined);
  const base = { name: "x", quantity: { value: 100, unit: "g" }, nutritionBasis: { value: 100, unit: "g" }, nutrients: { p: 1, f: 1, c: 1, cal: 17 }, preparation: "unknown" };
  for (const kind of ["label", "manual"]) assert.ok(!itemProblems({ ...base, source: { kind } }).includes("Уточніть спосіб приготування"), kind);
  assert.ok(!itemProblems({ ...base, source: { kind: "estimate", estimateReason: "no_matching_source", assumptions: ["x"] } }).includes("Уточніть спосіб приготування"));
  for (const kind of ["database", "personal"]) assert.ok(itemProblems({ ...base, source: { kind } }).includes("Уточніть спосіб приготування"), kind);
});

test("K4: the whole breakfast from the screenshot is saved as food, with no notes", async t => {
  const f = toolsFixture(t);
  const turn = f.begin();
  const ack = await turn.propose(ROWS.map(([name, grams, n, prep]) => manual(name, grams, n, prep)));
  assert.equal(ack.state, "ready");
  const [draft] = turn.complete();
  assert.equal(draft.items.length, 7);
  assert.ok(draft.items.every(i => i.nutritionStatus === "complete"));
  const prepared = await commandFromDraft(draft);
  assert.deepEqual(prepared.command.notes, []);
  assert.equal(prepared.command.items.length, 7);
  assert.equal(Math.round(prepared.command.items.reduce((sum, i) => sum + itemMacros(i).cal, 0)), 546);
});

test("K5: trainer rules say numbers are data, no needless questions, photos any time and advice with the draft", () => {
  for (const phrase of ["User kcal/PFC are data", "source manual", "no preparation/brand/photo questions", "kJ/kcal", "estimate, don't ask", "paperclip anytime", "advice in the same message"])
    assert.ok(TRAINER_POLICY.includes(phrase), phrase);
  for (const phrase of ["clarify/unknown", "ask size", "already supplies the final acknowledgement"])
    assert.ok(!TRAINER_POLICY.includes(phrase), phrase);
  assert.ok(TRAINER_POLICY.includes("Old drafts: not advice topic; new food on a draft date: append to it."));
  assert.ok(Buffer.byteLength(TRAINER_POLICY) <= 2000);
});

test("K6: the local completion keeps the model's advice and only adds the short Add reminder", async t => {
  const f = backendFixture(t);
  const cases = [
    ["Молодець: білка й овочів достатньо, вуглеводів поки не було.", "Перевір чернетку й натисни «Додати»."],
    [[{ type: "text", text: "Добрий сніданок, багато білка." }], "Перевір чернетку й натисни «Додати»."],
    [undefined, DRAFT_COMPLETION_TEXT],
    ["   ", DRAFT_COMPLETION_TEXT],
  ];
  for (const [content, expected] of cases) {
    const row = await f.turn(EGGS, async ({ call, prepared }) => {
      // An existing source kind keeps this check about the completion text only.
      const eggs = { itemId: randomUUID(), name: "Яйця, 3 шт.", preparation: "cooked", quantity: { value: 150, unit: "g" },
        source: { kind: "estimate", estimateReason: "no_matching_source", assumptions: ["Синтетична оцінка"], nutritionBasis: { value: 150, unit: "g" }, nutrients: { cal: 233, p: 18.9, f: 15.9, c: 1.7 } } };
      const ack = await call("propose_food_draft", { dayRef: "today", baseRevision: 0, meal: 1, items: [eggs] });
      assert.equal(ack.state, "ready", JSON.stringify(ack));
      const plain = await prepared.completeDraft(completionPayload(ack, content), { model: "owner-selected" });
      assert.equal(plain.completion.choices[0].message.content, expected);
      const stream = await prepared.completeDraft({ ...completionPayload(ack, content), stream: true }, { model: "owner-selected" });
      assert.equal(stream.chunks[0].choices[0].delta.content, expected);
      assert.equal(await prepared.completeDraft(completionPayload({ ...ack, revision: ack.revision + 1 }, content), { model: "owner-selected" }), undefined);
    });
    assert.equal(row.state, "completed");
  }
});

test("K7: a photo sent without a row fits any one row; a bound photo fits only its row; a failed call does not block a retry", async t => {
  const media = [{ tempRef: "synthetic-free-photo" }, { tempRef: "synthetic-bound-photo", itemId: "synthetic-bound-row" }];
  const f = toolsFixture(t, { text: "Салат і молоко, ось етикетки", media });
  const turn = f.begin();
  const label = (itemId, photoRef, name) => ({ itemId, name, preparation: "unknown", quantity: { value: 100, unit: "g" },
    source: { kind: "label", photoRef, nutritionBasis: { value: 100, unit: "g" }, nutrients: { p: 1.5, f: 0.1, c: 2.8, cal: 18 } } });
  await assert.rejects(() => turn.propose([label(randomUUID(), "synthetic-bound-photo", "Чуже")]), /label_evidence_missing/);
  await assert.rejects(() => turn.propose([label(randomUUID(), "synthetic-free-photo", "Салат"), label(randomUUID(), "synthetic-free-photo", "Молоко")]), /label_evidence_missing/);
  const ack = await turn.propose([label(randomUUID(), "synthetic-free-photo", "Салат"), label("synthetic-bound-row", "synthetic-bound-photo", "Молоко")]);
  assert.equal(ack.state, "ready");
  const [draft] = turn.complete();
  assert.deepEqual(draft.items.map(i => i.source.kind), ["label", "label"]);
});
