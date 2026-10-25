import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, chmodSync, symlinkSync, renameSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { personalProfiles } from "./personal-profiles.mjs";
import { openPersonalStore } from "./personal-store.mjs";
const inputId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const config = () => ({ version: 1, fundingOwner: "owner", profiles: [
  { uid: "owner", profileId: "p-owner", home: "/private/owner", socket: "/private/run-owner/native.sock", sessionId: "session-owner" },
  { uid: "wife", profileId: "p-wife", home: "/private/wife", socket: "/private/run-wife/native.sock", sessionId: "session-wife" },
] });
const make = t => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "scisense-personal-"))); chmodSync(dir, 0o700);
  const key = randomBytes(32), file = join(dir, "outbox.sqlite"), profiles = personalProfiles(config());
  let store = openPersonalStore(file, { key, profiles });
  t.after(() => { store.close(); key.fill(0); rmSync(dir, { recursive: true, force: true }); });
  return { file, dir, key, profiles, get store() { return store; }, reopen(nextProfiles = profiles) {
    store.close(); store = openPersonalStore(file, { key, profiles: nextProfiles }); return store;
  } };
};
const baseAdmission = { sessionId: "session-owner", admissionId: "admission-1", generation: 1, nativeMessageId: null };

test("same input is exactly once across retry/channel; another account has no access or fallback", t => {
  const h = make(t), payload = { text: "Приватний раціон власника" };
  assert.equal(h.store.enqueue("owner", inputId, payload).replayed, false);
  assert.equal(h.store.enqueue("owner", inputId, payload, { channel: "desktop" }).replayed, true);
  assert.throws(() => h.store.enqueue("owner", inputId, { text: "Змінено" }), /turn_conflict/);
  assert.throws(() => h.store.read("wife", inputId), /not_found/);
  assert.deepEqual(h.store.queued("wife"), []);
  assert.equal(h.store.enqueue("wife", inputId, { text: "Інший приватний раціон" }).replayed, false);
  assert.equal(h.store.read("wife", inputId).sessionId, "session-wife");
  assert.equal(readFileSync(h.file).includes(Buffer.from(payload.text)), false);
  assert.deepEqual(h.store.payload("owner", inputId), payload);
});

test("restart after dispatch/lost ACK remains unknown; lookup miss never permits resend", t => {
  const h = make(t);
  h.store.enqueue("owner", inputId, { text: "Запис" }); h.store.dispatch("owner", inputId);
  h.reopen(); assert.equal(h.store.read("owner", inputId).state, "unknown");
  const admission = { ...baseAdmission, ...h.store.binding("owner", inputId) };
  assert.equal(h.store.enqueue("owner", inputId, { text: "Запис" }).replayed, true);
  assert.throws(() => h.store.dispatch("owner", inputId), /turn_conflict/);
  assert.equal(h.store.unknown("owner", inputId).state, "unknown");
  h.store.admitted("owner", inputId, admission);
  const done = { ...admission, state: "completed", nativeMessageId: "native-message-1", resultRevision: "epoch2:revision9" };
  assert.equal(h.store.settle("owner", inputId, done).state, "completed");
  h.reopen(); assert.equal(h.store.read("owner", inputId).nativeMessageId, "native-message-1");
  assert.equal(h.store.settle("owner", inputId, done).state, "completed");
  assert.throws(() => h.store.settle("owner", inputId, { ...done, state: "failed" }), /turn_conflict/);
});

test("receipt cannot cross a profile, session, native message or execution generation", t => {
  const h = make(t); h.store.enqueue("owner", inputId, { text: "test" }); h.store.dispatch("owner", inputId);
  const admission = { ...baseAdmission, ...h.store.binding("owner", inputId) };
  for (const receipt of [{ ...admission, sessionId: "session-wife" }, { ...admission, generation: 0 }, { ...admission, inputId: secondId }, { ...admission, payloadHmac: "wrong-hmac" }])
    assert.throws(() => h.store.admitted("owner", inputId, receipt), /native_receipt_invalid/);
  h.store.admitted("owner", inputId, { ...admission, nativeMessageId: "native-message-1" });
  for (const receipt of [{ ...admission, generation: 2 }, { ...admission, admissionId: "another" }, { ...admission, nativeMessageId: "different-message" }])
    assert.throws(() => h.store.admitted("owner", inputId, receipt), /native_receipt_invalid/);
  assert.throws(() => h.store.settle("owner", inputId, { ...admission, state: "completed", generation: 2, resultRevision: "r1" }), /native_receipt_invalid/);
});

test("ciphertext copying between rows or use of another key cannot expose private input", t => {
  const h = make(t);
  h.store.enqueue("owner", inputId, { text: "Контекст власника" });
  h.store.enqueue("wife", secondId, { text: "Контекст дружини" });
  h.store.close();
  const db = new DatabaseSync(h.file);
  try { db.prepare("UPDATE personal_inputs SET payload=(SELECT payload FROM personal_inputs WHERE uid='owner') WHERE uid='wife'").run(); }
  finally { db.close(); }
  h.reopen(); assert.throws(() => h.store.payload("wife", secondId), /personal_store_invalid/);
  h.store.close();
  assert.throws(() => openPersonalStore(h.file, { profiles: h.profiles, key: randomBytes(32) }), /personal_key_invalid/);
  h.reopen(); assert.deepEqual(h.store.payload("owner", inputId), { text: "Контекст власника" });
});

test("second writer and remapping unfinished work are refused without altering its receipt", t => {
  const h = make(t); h.store.enqueue("owner", inputId, { text: "pending" }); h.store.dispatch("owner", inputId);
  assert.throws(() => openPersonalStore(h.file, { key: h.key, profiles: h.profiles }), /trainer_busy/);
  const changed = config(); changed.profiles[0].sessionId = "another-session";
  h.store.close();
  assert.throws(() => openPersonalStore(h.file, { key: h.key, profiles: personalProfiles(changed) }), /personal_registry_conflict/);
  h.reopen(); assert.equal(h.store.read("owner", inputId).state, "unknown");
});

test("unsafe permissions, symlink and swapped store fail closed", t => {
  const h = make(t); h.store.enqueue("owner", inputId, { text: "pending" });
  chmodSync(h.file, 0o644); assert.throws(() => h.store.read("owner", inputId), /trainer_replaced/); chmodSync(h.file, 0o600);
  renameSync(h.file, h.file + ".original"); symlinkSync(h.file + ".original", h.file);
  assert.throws(() => h.store.read("owner", inputId), /trainer_replaced/);
});


test("one native admission cannot acknowledge two different inputs in the same session", t => {
  const h = make(t);
  for (const id of [inputId, secondId]) { h.store.enqueue("owner", id, { text: id }); h.store.dispatch("owner", id); }
  const first = { ...baseAdmission, ...h.store.binding("owner", inputId) };
  h.store.admitted("owner", inputId, first);
  assert.throws(() => h.store.admitted("owner", secondId, first), /native_receipt_invalid/);
  assert.throws(() => h.store.admitted("owner", secondId, { ...first, ...h.store.binding("owner", secondId) }), /native_receipt_invalid/);
  assert.equal(h.store.read("owner", secondId).state, "dispatching");
});

test("wrong key refuses before recovery or any new ciphertext is admitted", t => {
  const h = make(t); h.store.enqueue("owner", inputId, { text: "pending" }); h.store.dispatch("owner", inputId);
  h.store.close();
  assert.throws(() => openPersonalStore(h.file, { profiles: h.profiles, key: randomBytes(32) }), /personal_key_invalid/);
  const db = new DatabaseSync(h.file);
  try { assert.equal(db.prepare("SELECT state FROM personal_inputs WHERE input_id=?").get(inputId).state, "dispatching"); }
  finally { db.close(); }
  h.reopen(); assert.equal(h.store.read("owner", inputId).state, "unknown");
});

test("native queued ACK may have no execution generation; only a later native claim binds it", t => {
  const h = make(t); h.store.enqueue("owner", inputId, { text: "queued" }); h.store.dispatch("owner", inputId);
  const queued = { ...baseAdmission, ...h.store.binding("owner", inputId), generation: null };
  assert.equal(h.store.admitted("owner", inputId, queued).generation, null);
  assert.equal(h.store.admitted("owner", inputId, { ...queued, generation: 1 }).generation, 1);
  assert.throws(() => h.store.admitted("owner", inputId, queued), /native_receipt_invalid/);
});


test("queued receipt cannot become a successful completion without a native claim", t => {
  const h = make(t); h.store.enqueue("owner", inputId, { text: "queued" }); h.store.dispatch("owner", inputId);
  const queued = { ...baseAdmission, ...h.store.binding("owner", inputId), generation: null };
  h.store.admitted("owner", inputId, queued);
  assert.throws(() => h.store.settle("owner", inputId, { ...queued, state: "completed", resultRevision: "r1" }), /native_receipt_invalid/);
  assert.equal(h.store.settle("owner", inputId, { ...queued, state: "cancelled", resultRevision: "r1" }).state, "cancelled");
});
