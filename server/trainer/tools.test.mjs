import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openTurnStore } from "./turn-store.mjs";
import { createTrainerTools, trainerToolSchemas } from "./tools.mjs";
import { createTrainerGateway } from "./gateway.mjs";
import { TOOLS } from "./limits.mjs";
import { buildPlanCatalog } from "../../src/services/planCatalog.js";
import { modelPlan } from "./snapshot.mjs";
import { commandFromDraft } from "./drafts.mjs";
test("H02 H04 H05 tools use actual lookup values and publish complete draft only on completed turn", async (t) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "hermes-tools-")));
  chmodSync(dir, 0o700);
  const store = openTurnStore(join(dir, "turns.sqlite"), {
    hmacKey: randomBytes(32),
  });
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true });
  });
  const cid = store.conversation("owner").conversationId;
  const input = {
      turnId: randomUUID(),
      baseRevision: 0,
      text: "Картопля 200 г",
      targetDate: "2026-01-03",
      media: [],
    },
    plan = { catalog: buildPlanCatalog() },
    snapshot = {
      plan,
      context: "Синтетичний контекст",
      contextRevision: 0,
      draft: [],
    };
  store.admit("owner", cid, input, snapshot);
  const turn = store.begin("owner", input.turnId),
    ctx = { turn, input, snapshot, signal: new AbortController().signal };
  const candidate = {
    id: "food-synthetic-001",
    name: "Potatoes, boiled",
    preparation: "cooked",
    nutritionBasis: { value: 100, unit: "g" },
    nutrients: { p: 2, f: 0.1, c: 20, cal: 87 },
    source: { kind: "database", recordId: "food-synthetic-001", version: 1 },
  };
  const kit = createTrainerTools({
    store,
    index: { lookup: () => [candidate] },
    readDay: async (uid, date) => ({
      uid,
      date,
      notes: [{ state: "active" }],
      incomplete: true,
    }),
  });
  assert.deepEqual(Object.keys(kit.tools), TOOLS);
  assert.deepEqual(Object.keys(trainerToolSchemas), TOOLS);
  await kit.tools.food_lookup(
    { query: "potatoes", preparation: "cooked" },
    ctx,
  );
  const raw = {
    itemId: "synthetic-potato-001",
    name: "Картопля",
    quantity: { value: 200, unit: "g" },
    preparation: "cooked",
    source: { kind: "database", recordId: candidate.id },
    planMatch: {
      referenceId: "carbs:potato",
      consumedState: "cooked",
      certainty: "matched",
    },
  };
  const d = await kit.tools.propose_food_draft(
    { baseRevision: 0, targetDate: input.targetDate, meal: 1, items: [raw] },
    ctx,
  );
  assert.equal(d.totals.cal, 174);
  assert.equal(d.saved,false);
  assert.equal(store.drafts("owner", cid).length, 0);
  await assert.rejects(
    kit.tools.propose_food_draft(
      {
        baseRevision: 0,
        targetDate: input.targetDate,
        meal: 1,
        items: [{ ...raw, source: { ...raw.source, nutrients: { cal: 0 } } }],
      },
      ctx,
    ),
    /invalid_food_source/,
  );
  assert.equal(
    (await kit.tools.read_confirmed_day({ targetDate: input.targetDate }, ctx))
      .incomplete,
    true,
  );
  assert.equal(
    (await kit.tools.read_trainer_context({}, ctx)).text,
    snapshot.context,
  );
  store.complete(turn.id, turn.generation, { text: "Прев’ю" });
  assert.equal(store.drafts("owner", cid)[0].blocked, true);
  store.cleaned(turn.id);
  assert.equal(store.drafts("owner", cid)[0].blocked, false);
  assert.equal(store.drafts("owner", cid)[0].items[0].nutrients.cal,87);
  assert.equal(store.drafts("owner", cid)[0].items[0].source.recordId,candidate.id);
  await assert.rejects(
    kit.tools.food_lookup({ query: "potato", preparation: "cooked" }, ctx),
    /turn_inactive/,
  );
  kit.release(turn.id);
});
test("H06 gateway derives save from canonical draft and trusts only reread day marker", async (t) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "hermes-save-http-")));
  chmodSync(dir, 0o700);
  const store = openTurnStore(join(dir, "turns.sqlite"), {
    hmacKey: randomBytes(32),
  });
  let proof = { meals: {}, notesEnabled: true };
  const g = createTrainerGateway({
    ownerUid: "owner",
    store,
    media: { sweep: () => ({ faults: 0 }) },
    proxy: { close() {} },
    backend: {},
    readDay: async () => proof,
    readPlan: async () => ({ planContext: {} }),
  });
  t.after(async () => {
    await g.close();
    store.close();
    rmSync(dir, { recursive: true });
  });
  const d = await (
    await g.handle("owner", "/notes", "POST", {
      text: "Невідома їжа",
      targetDate: "2026-01-03",
      meal: 1,
    })
  ).json();
  await g.handle("owner", "/drafts/" + d.draftId, "PUT", {
    baseRevision: 1,
    targetDate: d.targetDate,
    meal: 1,
    items: [{ itemId: d.items[0].itemId, noteSelected: true }],
  });
  const saving = await (
    await g.handle("owner", "/drafts/" + d.draftId + "/save", "POST", {
      baseRevision: 2,
    })
  ).json();
  assert.equal(saving.state, "saving");
  assert.equal(saving.save.command.type, "saveTrainerDraft");
  await assert.rejects(
    g.handle("owner", "/drafts/" + d.draftId + "/receipt", "POST", {
      saved: true,
    }),
    /save_unconfirmed/,
  );
  proof = {
    ...proof,
    revision: 1,
    submissionMarkers: { [saving.save.submissionId]: saving.save.hash },
  };
  const saved = await (
    await g.handle("owner", "/drafts/" + d.draftId + "/receipt", "POST", {})
  ).json();
  assert.equal(saved.state, "saved");
});

async function planMatchFixture(t, catalog = buildPlanCatalog(), food = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "hermes-plan-match-")));
  chmodSync(dir, 0o700);
  const store = openTurnStore(join(dir, "turns.sqlite"), { hmacKey: randomBytes(32) });
  const cid = store.conversation("owner").conversationId;
  const name = food.name || "яблуко", preparation = food.preparation || "raw", itemId = "synthetic-food-item";
  const input = { turnId: randomUUID(), baseRevision: 0, text: `З’їв 150 г ${name}`, targetDate: "2026-10-25",
    media: food.label ? [{ tempRef: "synthetic-label-photo", itemId }] : [] };
  const snapshot = { plan: modelPlan({ catalog }), contextRevision: 0, draft: [],
    sentAt: "2026-10-25T10:00:00Z", targetDate: input.targetDate, dateContext: { mode: "default" } };
  store.admit("owner", cid, input, snapshot);
  const turn = store.begin("owner", input.turnId);
  const candidate = { id: "synthetic-food-001", name: "Synthetic catalog food", preparation,
    nutritionBasis: { value: 100, unit: "g" }, nutrients: { p: 0.3, f: 0.2, c: 14, cal: 52 },
    source: { kind: "database", recordId: "synthetic-food-001", version: 1 } };
  const kit = createTrainerTools({ store, index: { lookup: () => [candidate] },
    readSnapshot: async () => ({ day: { targetDate: input.targetDate, revision: 0, meals: {}, notes: [] }, plan: { catalog } }) });
  t.after(() => { kit.release(turn.id); store.close(); rmSync(dir, { recursive: true }); });
  const ctx = { turn, input, snapshot, signal: new AbortController().signal };
  await kit.tools.food_lookup({ query: "synthetic food", preparation }, ctx);
  const raw = { itemId, name, preparation, quantity: { value: 150, unit: "g" },
    source: food.label ? { kind: "label", photoRef: "synthetic-label-photo", nutritionBasis: candidate.nutritionBasis, nutrients: candidate.nutrients }
      : { kind: "database", recordId: candidate.id },
    planMatch: { referenceId: food.referenceId || "fruits:fruit", consumedState: preparation, certainty: "matched" } };
  return { store, cid, raw, snapshot,
    propose: (item) => kit.tools.propose_food_draft({ baseRevision: 0, dayRef: "today", meal: 1, items: [item] }, ctx),
    complete() { store.complete(turn.id, turn.generation, { text: "Чернетка для перевірки" }); store.cleaned(turn.id); return store.drafts("owner", cid)[0]; },
  };
}

test("H05 catalog family match reaches the save command when the food name differs; manual choices still win", async (t) => {
  const f = await planMatchFixture(t);
  assert.notEqual(f.raw.name, buildPlanCatalog().references.find(r => r.refId === "fruits:fruit").name);
  await f.propose(f.raw);
  let draft = f.complete();
  assert.deepEqual(draft.items[0].planMatch, f.raw.planMatch);
  const prepared = await commandFromDraft(draft);
  const [item] = prepared.command.items;
  assert.equal(item.name, "яблуко");
  assert.equal(item.planAllocation.letter, "з");
  assert.equal(item.planAllocation.status, "allocated");
  assert.equal(item.planAllocation.assignment, "auto");
  assert.equal(item.portion, 37.5);
  assert.equal(item.source.recordId, "synthetic-food-001");
  assert.equal(Object.hasOwn(item, "planMatch"), false);
  for (const letter of ["", "в"]) {
    draft = f.store.editDraft("owner", f.cid, draft.draftId, { baseRevision: draft.revision, targetDate: draft.targetDate, meal: draft.meal,
      items: [{ itemId: f.raw.itemId, planChoice: { assignment: "manual", letter } }] });
    const [manual] = (await commandFromDraft(draft)).command.items;
    assert.equal(manual.planAllocation.assignment, "manual");
    assert.equal(manual.planAllocation.letter || "", letter);
    assert.equal(manual.planAllocation.status, letter ? "allocated" : "unallocated");
  }
});

for (const food of [
  { name: "картопля відварена", preparation: "cooked", referenceId: "carbs:potato", letter: "а", portion: 83.33333333333334 },
  { name: "кефір", preparation: "as_sold", referenceId: "dairy:kefir", label: true, letter: "б", portion: 55.55555555555556 },
]) test(`H05 ${food.name} retains its catalog family through the ${food.label ? "label" : "database"} tool path`, async (t) => {
  const f = await planMatchFixture(t, undefined, food);
  await f.propose(f.raw);
  const draft = f.complete();
  assert.deepEqual(draft.items[0].planMatch, f.raw.planMatch);
  const [item] = (await commandFromDraft(draft)).command.items;
  assert.equal(item.planAllocation.letter, food.letter);
  assert.equal(item.planAllocation.status, "allocated");
  assert.equal(item.planAllocation.assignment, "auto");
  assert.ok(Math.abs(item.portion - food.portion) < 1e-9);
  assert.equal(item.source.kind, food.label ? "label" : "database");
  assert.equal(Object.hasOwn(item.source, "photoRef"), false);
});

test("H05 omitted or uncertain family remains unallocated instead of guessing from a food alias", async (t) => {
  for (const certainty of ["omitted", "uncertain"]) await t.test(certainty, async (t) => {
    const f = await planMatchFixture(t);
    if (certainty === "omitted") delete f.raw.planMatch;
    else f.raw.planMatch.certainty = certainty;
    await f.propose(f.raw);
    const [item] = (await commandFromDraft(f.complete())).command.items;
    assert.deepEqual(item.planAllocation, { version: 1, status: "unallocated", assignment: "auto" });
    assert.equal(item.nutritionStatus, "complete");
  });
});

test("H05 ambiguous family is rejected while a proposal without that match remains valid", async (t) => {
  const catalog = buildPlanCatalog({ globalCustomProducts: { з: [{ name: "фрукти та ягоди", raw: 400 }] } });
  const f = await planMatchFixture(t, catalog);
  assert.ok(f.snapshot.plan.catalog.ambiguousRefIds.includes("fruits:fruit"));
  await assert.rejects(f.propose(f.raw), /invalid_plan_match/);
  delete f.raw.planMatch;
  await f.propose(f.raw);
  const [item] = (await commandFromDraft(f.complete(), { planContext: { globalCustomProducts: { з: [{ name: "фрукти та ягоди", raw: 400 }] } } })).command.items;
  assert.equal(item.planAllocation.status, "unallocated");
});

test("H05 unknown nutrition requires note confirmation without a guessed family", async (t) => {
  const f = await planMatchFixture(t);
  delete f.raw.planMatch;
  f.raw.source = { kind: "unknown" };
  assert.equal((await f.propose(f.raw)).incomplete, true);
  const draft = f.complete();
  assert.equal(draft.items[0].nutritionStatus, "unknown");
  assert.equal(Object.hasOwn(draft.items[0], "planMatch"), false);
  await assert.rejects(commandFromDraft(draft), /note_confirmation_required/);
});
