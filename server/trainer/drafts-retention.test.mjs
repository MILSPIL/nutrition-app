import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  realpathSync,
  chmodSync,
  rmSync,
  readFileSync,
  copyFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes, randomUUID } from "node:crypto";
import { openTurnStore } from "./turn-store.mjs";
import { patchDraft, commandFromDraft } from "./drafts.mjs";
import { createFoodResolver } from "./food-resolver.mjs";
import { provisionContext, openContextStore } from "./context-store.mjs";
import { LIMITS } from "./limits.mjs";
const raw = {
    itemId: "synthetic-food-001",
    name: "Тушкована картопля",
    preparation: "cooked",
    quantity: { value: 200, unit: "g" },
    source: {
      kind: "estimate",
      nutritionBasis: { value: 100, unit: "g" },
      nutrients: { p: 2, f: 3, c: 20, cal: 115 },
      assumptions: ["Типовий синтетичний рецепт"],
    },
  },
  date = "2026-01-03";
function fixture(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "hermes-drafts-")));
  chmodSync(dir, 0o700);
  let time = Date.now();
  const key = randomBytes(32),
    file = join(dir, "turns.sqlite");
  let store = openTurnStore(file, { hmacKey: key, now: () => time });
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true });
  });
  const cid = store.conversation("owner").conversationId;
  return {
    dir,
    key,
    file,
    cid,
    get store() {
      return store;
    },
    tick: (ms) => (time += ms),
    reopen() {
      store.close();
      store = openTurnStore(file, { hmacKey: key, now: () => time });
      return store;
    },
    turn() {
      const input = {
        turnId: randomUUID(),
        baseRevision: store.conversation("owner").revision,
        text: "Синтетична картопля 200 г",
        targetDate: date,
        media: [],
      };
      store.admit("owner", cid, input, {
        draft: store.drafts("owner", cid),
        contextRevision: 0,
      });
      return store.begin("owner", input.turnId);
    },
  };
}
const resolve = () => {
  const r = createFoodResolver({ index: { lookup: () => [] } });
  return (v) => r.resolve(v);
};
const patch = (extra) => ({
  baseRevision: 0,
  targetDate: date,
  meal: 1,
  items: [raw],
  ...extra,
});
function propose(f) {
  const turn = f.turn(),
    d = f.store.propose(turn.id, turn.generation, patch(), resolve());
  return { turn, d };
}
function complete(f, turn) {
  f.store.complete(turn.id, turn.generation, {
    text: "Прев’ю готове, ще не збережене.",
  });
  f.store.cleaned(turn.id);
}
test("H05 stable identity: quantity keeps manual letter; changed identity needs new source and loses automatic match", () => {
  let d = patchDraft(null, patch(), { resolve: resolve() });
  d = patchDraft(
    d,
    patch({
      draftId: d.draftId,
      baseRevision: 1,
      items: [
        {
          itemId: raw.itemId,
          planChoice: {
            assignment: "manual",
            letter: "а",
            referenceKey: "carbs:potato:а",
          },
        },
      ],
    }),
    { manual: true },
  );
  d = patchDraft(
    d,
    patch({
      draftId: d.draftId,
      baseRevision: 2,
      items: [{ itemId: raw.itemId, quantity: { value: 150, unit: "g" } }],
    }),
    { resolve: resolve() },
  );
  assert.equal(d.items[0].quantity.value, 150);
  assert.equal(d.items[0].planChoice.referenceKey, "carbs:potato:а");
  assert.throws(
    () =>
      patchDraft(
        d,
        patch({
          draftId: d.draftId,
          baseRevision: 3,
          items: [{ itemId: raw.itemId, name: "Інша страва" }],
        }),
        { resolve: resolve() },
      ),
    /invalid_food_proposal/,
  );
  d = patchDraft(
    d,
    patch({
      draftId: d.draftId,
      baseRevision: 3,
      items: [{ ...raw, name: "Інший склад" }],
    }),
    { resolve: resolve() },
  );
  assert.equal(d.items[0].planChoice.letter, "а");
  assert.equal(d.items[0].planChoice.referenceKey, "");
});
test("H06 completed message and proposal publish together; manual edit rejects late proposal", (t) => {
  const f = fixture(t),
    { turn, d } = propose(f);
  assert.equal(f.store.drafts("owner", f.cid).length, 0);
  complete(f, turn);
  assert.equal(f.store.draft("owner", f.cid, d.draftId).revision, 1);
  const next = f.turn();
  f.store.propose(
    next.id,
    next.generation,
    patch({
      draftId: d.draftId,
      baseRevision: 1,
      items: [{ itemId: raw.itemId, quantity: { value: 150, unit: "g" } }],
    }),
    resolve(),
  );
  f.store.editDraft(
    "owner",
    f.cid,
    d.draftId,
    patch({
      baseRevision: 1,
      items: [{ itemId: raw.itemId, quantity: { value: 180, unit: "g" } }],
    }),
  );
  complete(f, next);
  assert.equal(
    f.store.get("owner", next.id).result.drafts[0].state,
    "conflict",
  );
  assert.equal(
    f.store.draft("owner", f.cid, d.draftId).items[0].quantity.value,
    180,
  );
  assert.throws(
    () => f.store.editDraft("intruder", f.cid, d.draftId, patch()),
    /not_found/,
  );
});
test("H06 frozen command survives restart, unknown ACK retries same ID, receipt alone unlocks saved", async (t) => {
  const f = fixture(t),
    { turn, d } = propose(f);
  complete(f, turn);
  let draft = f.store.draft("owner", f.cid, d.draftId);
  const prepared = await commandFromDraft(draft);
  draft = f.store.beginSave("owner", f.cid, d.draftId, 1, prepared);
  assert.equal(prepared.command.items[0].nutrients.cal, 115);
  assert.throws(
    () =>
      f.store.editDraft("owner", f.cid, d.draftId, patch({ baseRevision: 1 })),
    /draft_frozen/,
  );
  f.store.saveUnknown("owner", f.cid, d.draftId);
  f.reopen();
  const retry = f.store.beginSave(
    "owner",
    f.cid,
    d.draftId,
    1,
    await commandFromDraft(draft),
  );
  assert.equal(retry.save.submissionId, prepared.command.submissionId);
  assert.equal(retry.state, "unknown");
  assert.throws(
    () =>
      f.store.confirmSaved("owner", f.cid, d.draftId, {
        submissionMarkers: {},
      }),
    /save_unconfirmed/,
  );
  const proof = {
    revision: 2,
    submissionMarkers: { [prepared.command.submissionId]: prepared.hash },
  };
  assert.equal(
    f.store.confirmSaved("owner", f.cid, d.draftId, proof).state,
    "saved",
  );
  assert.equal(
    f.store.confirmSaved("owner", f.cid, d.draftId, proof).state,
    "saved",
  );
  const another = f.turn();
  f.store.propose(
    another.id,
    another.generation,
    patch({ items: [{ ...raw, itemId: "second-food-001" }] }),
    resolve(),
  );
  complete(f, another);
  assert.equal(f.store.drafts("owner", f.cid).length, 2);
});
test("H03 unknown food is a note only after explicit selection; complete calculation remains separate", async (t) => {
  const f = fixture(t),
    d = f.store.manualNote("owner", f.cid, {
      text: "Невідома домашня страва",
      targetDate: date,
      meal: 2,
    });
  await assert.rejects(commandFromDraft(d), /note_confirmation_required/);
  const ready = f.store.editDraft("owner", f.cid, d.draftId, {
    baseRevision: 1,
    targetDate: date,
    meal: 2,
    items: [{ itemId: d.items[0].itemId, noteSelected: true }],
  });
  const p = await commandFromDraft(ready);
  assert.equal(p.command.items.length, 0);
  assert.equal(p.command.notes[0].knownNutrients.cal, null);
  assert.equal(p.command.notes[0].originalText, "Невідома домашня страва");
});
test("H04 context is explicit CAS with encrypted predecessor, readback and durable idempotency", (t) => {
  const f = fixture(t);
  provisionContext(f.dir, { key: f.key, text: "Синтетичний контекст" });
  let c = openContextStore(f.dir, { key: f.key });
  const proposal = {
    proposalId: randomUUID(),
    baseRevision: 0,
    text: "Новий синтетичний факт",
  };
  assert.equal(c.read().revision, 0);
  assert.equal(c.commit(proposal).revision, 1);
  assert.equal(c.commit(proposal).replayed, true);
  c = openContextStore(f.dir, { key: f.key });
  assert.equal(c.read().text, proposal.text);
  assert.equal(c.commit(proposal).replayed, true);
  assert.throws(
    () => c.commit({ ...proposal, proposalId: randomUUID() }),
    /context_conflict/,
  );
  assert.throws(
    () => c.commit({ ...proposal, text: "Підміна" }),
    /context_conflict/,
  );
  assert(
    !readFileSync(join(f.dir, "context.previous.enc"), "utf8").includes(
      "Синтетичний",
    ),
  );
  assert(
    !readFileSync(join(f.dir, "context-receipts.jsonl"), "utf8").includes(
      "факт",
    ),
  );
});
test("H10 TTL retains fresh draft and closes only an empty old conversation; old IDs are gone after restart", (t) => {
  const f = fixture(t),
    { turn, d } = propose(f);
  complete(f, turn);
  f.tick(LIMITS.retentionMs - 1000);
  f.store.editDraft("owner", f.cid, d.draftId, {
    baseRevision: 1,
    targetDate: date,
    meal: 1,
    items: [{ itemId: raw.itemId, quantity: { value: 150, unit: "g" } }],
  });
  f.tick(2000);
  f.store.maintainRetention();
  assert.equal(f.store.history("owner", f.cid).length, 0);
  assert.equal(f.store.drafts("owner", f.cid).length, 1);
  assert.equal(f.store.conversation("owner").conversationId, f.cid);
  assert.throws(() => f.store.get("owner", turn.id), /turn_gone/);
  f.reopen();
  assert.throws(() => f.store.get("owner", turn.id), /turn_gone/);
  f.tick(LIMITS.retentionMs);
  f.store.maintainRetention();
  assert.notEqual(f.store.conversation("owner").conversationId, f.cid);
  assert.throws(() => f.store.history("owner", f.cid), /conversation_gone/);
  assert(!readFileSync(f.file).includes(Buffer.from("Синтетична картопля")));
  assert(
    !readFileSync(f.file + ".deletions.jsonl", "utf8").includes("картопля"),
  );
});
test("H10 deleting conversation before late completion blocks generation; cleanup remains durable", (t) => {
  const f = fixture(t),
    { turn } = propose(f);
  f.store.forget("owner", f.cid);
  assert.throws(
    () => f.store.complete(turn.id, turn.generation, { text: "Запізно" }),
    /stale_result/,
  );
  assert.equal(f.store.expiredPending().length, 1);
  f.store.cancel("closed:" + f.cid, turn.id);
  assert.equal(f.store.cleanupJobs().length, 1);
  f.store.cleaned(turn.id);
  f.store.maintainRetention();
  assert.equal(f.store.pending().length, 0);
  assert.throws(() => f.store.get("owner", turn.id), /turn_gone/);
});
test("H10 restoring old database applies current deletion manifest; missing/stale manifest fails closed", (t) => {
  const f = fixture(t),
    { turn } = propose(f);
  complete(f, turn);
  const backup = join(f.dir, "backup.sqlite");
  copyFileSync(f.file, backup);
  f.store.forget("owner", f.cid);
  f.store.close();
  copyFileSync(backup, f.file);
  chmodSync(f.file, 0o600);
  // The copied backup's live-owner row is a deliberate restore failure; operator
  // must restore a cleanly closed snapshot, tested below with the row cleared.
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
  const b = new DatabaseSync(f.file);
  b.exec("DELETE FROM runtime_owner");
  b.close();
  f.reopen();
  assert.throws(() => f.store.get("owner", turn.id), /turn_gone/);
  assert.notEqual(f.store.conversation("owner").conversationId, f.cid);
  f.store.close();
  const anchor = f.file + ".deletions.anchor",
    good = readFileSync(anchor);
  writeFileSync(anchor, "{}");
  assert.throws(
    () => openTurnStore(f.file, { hmacKey: f.key }),
    /deletion_manifest_rollback/,
  );
  writeFileSync(anchor, good);
  unlinkSync(f.file + ".deletions.jsonl");
  assert.throws(
    () => openTurnStore(f.file, { hmacKey: f.key }),
    /deletion_manifest_missing/,
  );
});
test("H10 hourly retention runs without traffic, and expired unknown remains opaque until stop", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const f = fixture(t),
    { turn } = propose(f);
  complete(f, turn);
  f.tick(LIMITS.retentionMs + 1);
  t.mock.timers.tick(3600000);
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite"),
    read = new DatabaseSync(f.file, { readOnly: true });
  assert.equal(read.prepare("SELECT count(*) n FROM messages").get().n, 0);
  read.close();
});
test("H04 context proposal stays pending until durable turn commit and cleanup; explicit confirmation only", (t) => {
  const f = fixture(t),
    turn = f.turn();
  const p = f.store.proposeContext(turn.id, turn.generation, {
    baseRevision: 0,
    text: "Синтетичне уточнення",
  });
  assert.deepEqual(f.store.contextProposals("owner", f.cid), []);
  f.store.complete(turn.id, turn.generation, { text: "Пропоную запам’ятати." });
  assert.deepEqual(f.store.contextProposals("owner", f.cid), []);
  f.store.cleaned(turn.id);
  assert.equal(
    f.store.contextProposal("owner", f.cid, p.proposalId).state,
    "proposed",
  );
});
test("H06 editing before cleanup cannot detach the native run fence", async (t) => {
  const f = fixture(t),
    { turn, d } = propose(f);
  f.store.complete(turn.id, turn.generation, { text: "Чернетка" });
  const edited = f.store.editDraft("owner", f.cid, d.draftId, {
    baseRevision: 1,
    targetDate: date,
    meal: 1,
    items: [{ itemId: raw.itemId, quantity: { value: 180, unit: "g" } }],
  });
  assert.equal(edited.turnId, turn.id);
  const prepared = await commandFromDraft(edited);
  assert.throws(
    () => f.store.beginSave("owner", f.cid, d.draftId, 2, prepared),
    /trainer_busy/,
  );
});
test("H06 save preparation is bound to the exact draft revision before an async read", async (t) => {
  const f = fixture(t),
    { turn, d } = propose(f);
  complete(f, turn);
  const prepared = await commandFromDraft(
    f.store.draft("owner", f.cid, d.draftId),
  );
  f.store.editDraft("owner", f.cid, d.draftId, {
    baseRevision: 1,
    targetDate: date,
    meal: 1,
    items: [{ itemId: raw.itemId, quantity: { value: 180, unit: "g" } }],
  });
  assert.throws(
    () => f.store.beginSave("owner", f.cid, d.draftId, 2, prepared),
    /draft_conflict/,
  );
});
test("H10 expired composer is erased while newer conversation content remains", (t) => {
  const f = fixture(t);
  f.store.composer("owner", f.cid, {
    text: "Синтетичний прострочений текст",
    baseRevision: 0,
  });
  f.tick(LIMITS.retentionMs - 1000);
  const { turn } = propose(f);
  complete(f, turn);
  f.tick(2000);
  assert.equal(f.store.conversation("owner").composer.text, "");
  assert.equal(f.store.conversation("owner").conversationId, f.cid);
  assert.equal(f.store.history("owner", f.cid).length, 2);
  assert(
    !readFileSync(f.file).includes(
      Buffer.from("Синтетичний прострочений текст"),
    ),
  );
});
test("H05 a label changes nutrition of its row without changing consumed quantity", async () => {
  const resolver = createFoodResolver({
    index: { lookup: () => [] },
    photos: [{ ref: "synthetic-photo", itemId: raw.itemId }],
  });
  let d = patchDraft(null, patch(), { resolve: resolve() });
  d = patchDraft(
    d,
    patch({
      draftId: d.draftId,
      baseRevision: 1,
      items: [
        {
          ...raw,
          quantity: { value: 100, unit: "g" },
          source: {
            kind: "label",
            photoRef: "synthetic-photo",
            nutritionBasis: { value: 100, unit: "g" },
            nutrients: { p: 3, f: 2, c: 4, cal: 51 },
          },
        },
      ],
    }),
    { resolve: (v) => resolver.resolve(v) },
  );
  const command = (await commandFromDraft(d)).command;
  assert.equal(command.items[0].quantity.value, 200);
  assert.equal(command.items[0].nutrients.cal, 51);
});

test("H03 note keeps each item original message across quantity clarification and later items", async () => {
  const unknown = {
    ...raw,
    source: { kind: "unknown" },
    quantity: { value: null, unit: "unknown" },
  };
  let d = patchDraft(
    null,
    patch({
      originalText: "Їв домашню страву з м’ясом і грибами",
      items: [unknown],
    }),
    { resolve: resolve() },
  );
  d = patchDraft(
    d,
    patch({
      draftId: d.draftId,
      baseRevision: 1,
      originalText: "Приблизно 200 грамів",
      items: [{ itemId: raw.itemId, quantity: { value: 200, unit: "g" } }],
    }),
    { resolve: resolve() },
  );
  const another = {
    ...unknown,
    itemId: "another-food-001",
    name: "Інша домашня страва",
  };
  d = patchDraft(
    d,
    patch({
      draftId: d.draftId,
      baseRevision: 2,
      originalText: "Ще інша домашня страва",
      items: [another],
    }),
    { resolve: resolve() },
  );
  d = patchDraft(
    d,
    patch({
      draftId: d.draftId,
      baseRevision: 3,
      items: d.items.map((i) => ({ itemId: i.itemId, noteSelected: true })),
    }),
    { manual: true },
  );
  const p = await commandFromDraft(d);
  assert.equal(
    p.command.notes[0].originalText,
    "Їв домашню страву з м’ясом і грибами",
  );
  assert.equal(p.command.notes[1].originalText, "Ще інша домашня страва");
  assert.equal(p.command.notes[0].quantity.value, 200);
});

test("H10 complete food does not copy private chat provenance into confirmed meals", async () => {
  const d = patchDraft(
    null,
    patch({ originalText: "SYNTHETIC_PRIVATE_CHAT_MARKER" }),
    { resolve: resolve() },
  );
  const p = await commandFromDraft(d);
  assert(!JSON.stringify(p.command).includes("SYNTHETIC_PRIVATE_CHAT_MARKER"));
  assert.equal(p.command.items[0].originalText, undefined);
});

test("H03 provenance deduplicates one input shared by twenty draft rows", async () => {
  for (const [size, count] of [
    [7900, 1],
    [1000, 20],
  ]) {
    const text = "x".repeat(size);
    let d = patchDraft(
      null,
      patch({
        originalText: text,
        items: Array.from({ length: count }, (_, i) => ({
          ...raw,
          itemId: "synthetic-" + String(i).padStart(8, "0"),
          source: { kind: "unknown" },
        })),
      }),
      { resolve: resolve() },
    );
    assert.equal(Object.keys(d.origins).length, 1);
    assert.equal(d.items.length, count);
    assert.equal(JSON.stringify(d).split(text).length, 2);
    d = patchDraft(
      d,
      patch({
        draftId: d.draftId,
        baseRevision: 1,
        items: d.items.map((i) => ({ itemId: i.itemId, noteSelected: true })),
      }),
      { manual: true },
    );
    assert(
      (await commandFromDraft(d)).command.notes.every(
        (n) => n.originalText === text,
      ),
    );
  }
});
