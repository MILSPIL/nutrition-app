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
  assert.equal(d.items[0].nutrients.cal, 87);
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
