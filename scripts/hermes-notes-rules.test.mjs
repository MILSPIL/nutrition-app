import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDocFromServer,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
let env;
const owner = "owner-notes",
  date = "2026-01-03",
  id = "submission-synthetic_item-synthetic",
  hash = "a".repeat(64),
  stamp = (v = 3) => ({ writerVersion: v, writerNonce: randomUUID() });
const note = () => ({
  noteId: id,
  itemId: "item-synthetic",
  name: "Синтетична страва",
  quantity: { value: null, unit: "unknown" },
  nutritionBasis: { value: 100, unit: "g" },
  knownNutrients: { p: null, f: 2, c: null, cal: 50 },
  provenance: { kind: "unknown" },
  originalText: "Страва",
  originDraft: "draft-synthetic",
  targetDate: date,
  meal: 1,
  state: "active",
  submissionId: "submission-synthetic",
  commandHash: hash,
  createdAt: "2026-01-03T10:00:00Z",
  ...stamp(),
});
const db = (uid = owner) =>
  env
    .authenticatedContext(uid, {
      email: uid + "@example.test",
      email_verified: true,
    })
    .firestore();
async function seed(path, data) {
  return env.withSecurityRulesDisabled((c) =>
    setDoc(doc(c.firestore(), ...path), data),
  );
}
before(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8088")
    throw Error("isolated_emulator_required");
  env = await initializeTestEnvironment({
    projectId: "demo-hermes-notes",
    firestore: {
      host: "127.0.0.1",
      port: 8088,
      rules: await readFile("firestore.rules", "utf8"),
    },
  });
});
after(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(["users", owner], { users: {}, trainerId: null, ...stamp() });
  await seed(["releaseCapabilities", owner], {
    notesEnabled: true,
    minimumWriterVersion: 3,
  });
});
function batch(database, n = note(), withDay = true) {
  const b = writeBatch(database);
  b.set(doc(database, "users", owner, "foodNotes", id), n);
  if (withDay)
    b.set(doc(database, "users", owner, "mealHistory", date), {
      meals: {},
      revision: 1,
      foodNotes: { [id]: { itemId: n.itemId, submissionId: n.submissionId } },
      submissionMarkers: { [n.submissionId]: hash },
      writerVersion: 3,
      writerNonce: n.writerNonce,
    });
  return b;
}
test("owner note and day marker together pass; note alone or invalid shape fails atomically", async () => {
  await assertFails(batch(db(), note(), false).commit());
  for (const patch of [
    { knownNutrients: { p: -1, f: null, c: null, cal: null } },
    { quantity: { value: null, unit: "kg" } },
    { owner: "other" },
    { name: "" },
    { state: "resolved" },
    { writerVersion: 2 },
  ]) {
    await assertFails(batch(db(), { ...note(), ...patch }).commit());
    assert.equal(
      (
        await getDocFromServer(doc(db(), "users", owner, "mealHistory", date))
      ).exists(),
      false,
    );
  }
  await assertSucceeds(batch(db()).commit());
});
test("capability cannot be self-enabled, notes off and old writer deny, other owners keep v2", async () => {
  await assertFails(
    setDoc(doc(db(), "releaseCapabilities", owner), {
      notesEnabled: true,
      minimumWriterVersion: 2,
    }),
  );
  await seed(["releaseCapabilities", owner], {
    notesEnabled: false,
    minimumWriterVersion: 2,
  });
  await assertFails(batch(db()).commit());
  await assertSucceeds(
    setDoc(doc(db(), "users", owner, "mealHistory", date), {
      meals: {},
      ...stamp(2),
    }),
  );
  await seed(["releaseCapabilities", owner], {
    notesEnabled: true,
    minimumWriterVersion: 3,
  });
  await assertFails(
    setDoc(doc(db(), "users", owner, "mealHistory", date), {
      meals: {},
      ...stamp(2),
    }),
  );
  await assertSucceeds(
    setDoc(doc(db("other"), "users", "other"), { users: {}, ...stamp(2) }),
  );
});
test("cross-owner denied; only consented trainer reads notes and cannot write", async () => {
  await batch(db()).commit();
  const path = ["users", owner, "foodNotes", id];
  await assertFails(getDocFromServer(doc(db("stranger"), ...path)));
  await assertFails(batch(db("stranger")).commit());
  const created = Timestamp.fromMillis(1000),
    accepted = Timestamp.fromMillis(2000);
  await seed(["trainerRequests", owner], {
    clientId: owner,
    clientEmail: owner + "@example.test",
    clientName: "Синтетичний",
    trainerId: "trainer",
    trainerEmail: "trainer@example.test",
    trainerName: "Тренер",
    status: "accepted",
    generation: 1,
    revision: 2,
    createdAt: created,
    acceptedAt: accepted,
  });
  await seed(["users", owner], {
    users: {},
    trainerId: "trainer",
    trainerEmail: "trainer@example.test",
    ...stamp(),
  });
  await assertSucceeds(getDocFromServer(doc(db("trainer"), ...path)));
  await assertFails(batch(db("trainer")).commit());
  await seed(["users", owner], { users: {}, trainerId: null, ...stamp() });
  await assertFails(getDocFromServer(doc(db("trainer"), ...path)));
});

test("new note cannot reuse a previous marker; a legacy unstamped day can be upgraded atomically", async () => {
  const n = note();
  await seed(["users", owner, "mealHistory", date], { meals: {}, revision: 1 });
  await assertSucceeds(batch(db(), n).commit());
  // A standalone note cannot exploit an earlier day nonce+marker even when the
  // owner intentionally copied both from that day.
  const later = {
    ...n,
    itemId: "another-synthetic",
    noteId: "submission-synthetic_another-synthetic",
  };
  await seed(["users", owner, "mealHistory", date], {
    meals: {},
    foodNotes: { [later.noteId]: { itemId: later.itemId } },
    submissionMarkers: { [n.submissionId]: hash },
    writerVersion: 3,
    writerNonce: n.writerNonce,
  });
  await assertFails(
    setDoc(doc(db(), "users", owner, "foodNotes", later.noteId), later),
  );
});
test("conversion without a complete new food item is denied atomically", async () => {
  await batch(db()).commit();
  const nonce = randomUUID(),
    submissionId = "resolve-synthetic";
  const tombstone = {
    noteId: id,
    itemId: "item-synthetic",
    targetDate: date,
    state: "resolved",
    submissionId,
    commandHash: hash,
    resolvedAt: "2026-01-03T11:00:00Z",
    mealKey: "1",
    group: "voice",
    itemIndex: 0,
    writerVersion: 3,
    writerNonce: nonce,
  };
  const database = db(),
    b = writeBatch(database);
  b.set(doc(database, "users", owner, "foodNotes", id), tombstone);
  b.set(doc(database, "users", owner, "mealHistory", date), {
    meals: { 1: { voice: [] } },
    foodNotes: {},
    submissionMarkers: { [submissionId]: hash },
    writerVersion: 3,
    writerNonce: nonce,
  });
  await assertFails(b.commit());
  assert.equal(
    (await getDocFromServer(doc(db(), "users", owner, "foodNotes", id))).data()
      .state,
    "active",
  );
});

test("terminal rejection is immutable and excludes late or stale writer success, across owners", async () => {
  const path = ["users", owner, "mealHistory", date],
    base = {
      meals: {},
      revision: 0,
      rejectedSubmissions: { "rejected-command": hash },
      ...stamp(),
    };
  await assertSucceeds(setDoc(doc(db(), ...path), base));
  for (const patch of [
    { rejectedSubmissions: {} },
    { rejectedSubmissions: { "rejected-command": "b".repeat(64) } },
    { submissionMarkers: { "rejected-command": hash } },
  ])
    await assertFails(
      setDoc(doc(db(), ...path), { ...base, ...patch, ...stamp() }),
    );
  await assertFails(
    setDoc(doc(db("stranger"), ...path), { ...base, ...stamp() }),
  );
  await assertSucceeds(
    setDoc(doc(db(), ...path), {
      ...base,
      submissionMarkers: { "different-command": hash },
      ...stamp(),
    }),
  );
  await assertFails(
    setDoc(doc(db(), ...path), { ...base, submissionMarkers: {}, ...stamp() }),
  );
});
test("concurrent terminal rejection and success cannot both survive", async () => {
  const path = ["users", owner, "mealHistory", date],
    database = db();
  const results = await Promise.allSettled([
    setDoc(doc(database, ...path), {
      meals: {},
      rejectedSubmissions: { "race-command": hash },
      ...stamp(),
    }),
    setDoc(doc(database, ...path), {
      meals: {},
      submissionMarkers: { "race-command": hash },
      ...stamp(),
    }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const saved = (await getDocFromServer(doc(database, ...path))).data();
  assert.notEqual(
    !!saved.rejectedSubmissions?.["race-command"],
    !!saved.submissionMarkers?.["race-command"],
  );
});
