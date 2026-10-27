// 1.9.7 changes only the site: these checks pin the server contract the card relies on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { patchDraft, commandFromDraft } from "./drafts.mjs";
import { createFoodResolver } from "./food-resolver.mjs";
const date = "2026-01-03";
const food = (itemId, name) => ({
  itemId,
  name,
  preparation: "cooked",
  quantity: { value: 200, unit: "g" },
  source: {
    kind: "estimate",
    estimateReason: "no_matching_source",
    nutritionBasis: { value: 100, unit: "g" },
    nutrients: { p: 2, f: 3, c: 20, cal: 115 },
    assumptions: ["Типовий синтетичний рецепт"],
  },
});
const resolver = createFoodResolver({ index: { lookup: () => [] } });
const two = () =>
  patchDraft(
    null,
    { baseRevision: 0, targetDate: date, meal: 1, items: [food("synthetic-a", "Синтетична страва"), food("synthetic-b", "Синтетичне яблуко")] },
    { resolve: (v) => resolver.resolve(v) },
  );
const removal = (d, ids) => ({ draftId: d.draftId, baseRevision: d.revision, targetDate: d.targetDate, meal: d.meal, items: [], removeItemIds: ids });

test("S1 the card's removal body is accepted from the user and keeps the rest", () => {
  const d = two();
  const next = patchDraft(d, removal(d, ["synthetic-b"]), { manual: true });
  assert.deepEqual(next.items.map((i) => i.itemId), ["synthetic-a"]);
  assert.equal(next.revision, d.revision + 1);
});

test("S1 the server refuses to empty a card, so the last product has no button", () => {
  const d = two();
  assert.throws(() => patchDraft(d, removal(d, ["synthetic-a", "synthetic-b"]), { manual: true }), /invalid_food_proposal/);
});

test("S2 a product that got calories after being marked as a note is saved as food", async () => {
  const d = two();
  const marked = patchDraft(d, { ...removal(d, []), items: [{ itemId: "synthetic-a", noteSelected: true }] }, { manual: true });
  const prepared = await commandFromDraft(marked);
  assert.deepEqual(prepared.command.items.map((i) => i.itemId).sort(), ["synthetic-a", "synthetic-b"]);
  assert.deepEqual(prepared.command.notes, []);
  assert.equal("noteSelected" in prepared.command.items[0], false);
});
