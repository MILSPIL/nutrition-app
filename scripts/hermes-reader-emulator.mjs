import assert from "node:assert/strict";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, terminate } from "firebase/firestore";
import { signInAnonymously, signOut } from "firebase/auth";
import { auth, db } from "../src/firebase.js";
import {
  createFirestoreReader,
  withOwnerToken,
} from "../server/trainer/firestore-reader.mjs";
if (
  process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8088" ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099"
)
  throw Error("isolated_emulator_required");
const env = await initializeTestEnvironment({
  projectId: "demo-scisense",
  firestore: { host: "127.0.0.1", port: 8088 },
});
const user = (await signInAnonymously(auth)).user,
  uid = user.uid,
  token = await user.getIdToken(),
  date = "2026-01-03";
const requests = [];
const reader = createFirestoreReader({
  project: "demo-scisense",
  ownerUid: uid,
  profileId: uid,
  fetcher: (url, init) => {
    assert.ok(
      url.startsWith(
        "https://firestore.googleapis.com/v1/projects/demo-scisense/",
      ),
    );
    requests.push({
      method: url.split(":").at(-1),
      body: JSON.parse(init.body),
    });
    return fetch(
      url.replace("https://firestore.googleapis.com", "http://127.0.0.1:8088"),
      init,
    );
  },
});
try {
  await env.withSecurityRulesDisabled(async (c) => {
    const f = c.firestore();
    await setDoc(doc(f, "users", uid), {
      users: {
        [uid]: {
          name: "Синтетичний",
          portions: {},
          privateUnrelated: "MUST_NOT_ENTER_MODEL",
        },
      },
    });
    await setDoc(doc(f, "releaseCapabilities", uid), {
      notesEnabled: true,
      minimumWriterVersion: 3,
    });
    await setDoc(doc(f, "users", uid, "mealHistory", date), {
      meals: {},
      submissionMarkers: { synthetic: "hash" },
      foodNotes: { "synthetic-note-0001": true },
    });
    await setDoc(doc(f, "users", uid, "foodNotes", "synthetic-note-0001"), {
      state: "active",
      targetDate: date,
      name: "Без оцінки",
      knownNutrients: { p: null, f: null, c: null, cal: null },
    });
  });
  await assert.rejects(reader.readDay(uid, date), /pilot_forbidden/);
  await assert.rejects(
    withOwnerToken("stranger", token, () => reader.readDay(uid, date)),
    /pilot_forbidden/,
  );
  const day = await withOwnerToken(uid, token, () => reader.readDay(uid, date));
  assert.equal(day.incomplete, true);
  assert.equal(day.notes[0].knownNutrients.cal, null);
  assert.equal(day.notesEnabled, true);
  assert.equal(day.submissionMarkers.synthetic, "hash");
  const reads = requests.filter((r) => r.method === "batchGet");
  assert.equal(reads.length, 2);
  assert.equal(reads[0].body.transaction, reads[1].body.transaction);
  const plan = await withOwnerToken(uid, token, () => reader.readPlan(uid));
  assert.ok(plan.catalog.references.length > 50);
  assert.equal(JSON.stringify(plan).includes("MUST_NOT_ENTER_MODEL"), false);
  await assert.rejects(
    withOwnerToken(uid, "invalid-synthetic-token", () =>
      reader.readDay(uid, date),
    ),
    /invalid_token|trusted_read_failed/,
  );
  assert.ok(requests.some((r) => r.method === "rollback"));
  console.log(
    JSON.stringify({
      actualOwnerTokenReadOnlyREST: true,
      snapshotTransaction: true,
      crossOwnerDenied: true,
      notesNullable: true,
      noPrivateExtra: true,
      syntheticOnly: true,
    }),
  );
} finally {
  await env.cleanup();
  await signOut(auth);
  await terminate(db);
}
