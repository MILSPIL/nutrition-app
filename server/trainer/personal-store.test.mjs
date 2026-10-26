import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, chmodSync, symlinkSync, renameSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { personalProfiles } from "./personal-profiles.mjs";
import { openPersonalStore } from "./personal-store.mjs";
const enqueue = (h, uid, id, payload, options = {}) => h.store.enqueue(uid, id, payload, { sessionId: uid === "owner" ? "session-owner" : "session-wife", ...options });
const inputId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const config = () => ({ version: 1, fundingOwner: "owner", profiles: [
  { uid: "owner", profileId: "p-owner", home: "/private/owner", socket: "/private/run-owner/native.sock", canonicalTitle: "Bot Chat" },
  { uid: "wife", profileId: "p-wife", home: "/private/wife", socket: "/private/run-wife/native.sock", canonicalTitle: "Bot Chat" },
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

test("admission lookup isolates accounts and keeps terminal receipts readable", t => {
  const h = make(t); enqueue(h, "owner", inputId, { text: "private input" }); h.store.dispatch("owner", inputId);
  const receipt = { ...baseAdmission, ...h.store.binding("owner", inputId) };
  h.store.admitted("owner", inputId, receipt);
  assert.equal(h.store.byAdmission("wife", receipt.admissionId), undefined);
  assert.equal(h.store.byAdmission("owner", receipt.admissionId).inputId, inputId);
  h.store.settle("owner", inputId, { ...receipt, state: "cancelled", resultRevision: "revision-1" });
  h.reopen();
  assert.equal(h.store.byAdmission("owner", receipt.admissionId).state, "cancelled");
  assert.equal(h.store.byAdmission("wife", receipt.admissionId), undefined);
});

test("same admission identifier across birth sessions is ambiguous without changing either input", t => {
  const h = make(t);
  for (const [id, sessionId] of [[inputId, "birth-1"], [secondId, "birth-2"]]) {
    enqueue(h, "owner", id, { text: id }, { sessionId }); h.store.dispatch("owner", id);
    h.store.admitted("owner", id, { ...baseAdmission, ...h.store.binding("owner", id) });
  }
  assert.throws(() => h.store.byAdmission("owner", baseAdmission.admissionId), /native_receipt_invalid/);
  assert.equal(h.store.read("owner", inputId).state, "admitted");
  assert.equal(h.store.read("owner", secondId).state, "admitted");
});

test("same input is exactly once across retry/channel; another account has no access or fallback", t => {
  const h = make(t), payload = { text: "Приватний раціон власника" };
  assert.equal(enqueue(h, "owner", inputId, payload).replayed, false);
  assert.equal(enqueue(h, "owner", inputId, payload, { channel: "desktop" }).replayed, true);
  assert.throws(() => enqueue(h, "owner", inputId, { text: "Змінено" }), /turn_conflict/);
  assert.throws(() => h.store.read("wife", inputId), /not_found/);
  assert.deepEqual(h.store.queued("wife"), []);
  assert.equal(enqueue(h, "wife", inputId, { text: "Інший приватний раціон" }).replayed, false);
  assert.equal(h.store.read("wife", inputId).sessionId, "session-wife");
  assert.equal(readFileSync(h.file).includes(Buffer.from(payload.text)), false);
  assert.deepEqual(h.store.payload("owner", inputId), payload);
});

test("restart after dispatch/lost ACK remains unknown; lookup miss never permits resend", t => {
  const h = make(t);
  enqueue(h, "owner", inputId, { text: "Запис" }); h.store.dispatch("owner", inputId);
  h.reopen(); assert.equal(h.store.read("owner", inputId).state, "unknown");
  const admission = { ...baseAdmission, ...h.store.binding("owner", inputId) };
  assert.equal(enqueue(h, "owner", inputId, { text: "Запис" }).replayed, true);
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
  const h = make(t); enqueue(h, "owner", inputId, { text: "test" }); h.store.dispatch("owner", inputId);
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
  enqueue(h, "owner", inputId, { text: "Контекст власника" });
  enqueue(h, "wife", secondId, { text: "Контекст дружини" });
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
  const h = make(t); enqueue(h, "owner", inputId, { text: "pending" }); h.store.dispatch("owner", inputId);
  assert.throws(() => openPersonalStore(h.file, { key: h.key, profiles: h.profiles }), /trainer_busy/);
  const changed = config(); changed.profiles[0].profileId = "another-profile";
  h.store.close();
  assert.throws(() => openPersonalStore(h.file, { key: h.key, profiles: personalProfiles(changed) }), /personal_registry_conflict/);
  h.reopen(); assert.equal(h.store.read("owner", inputId).state, "unknown");
});

test("unsafe permissions, symlink and swapped store fail closed", t => {
  const h = make(t); enqueue(h, "owner", inputId, { text: "pending" });
  chmodSync(h.file, 0o644); assert.throws(() => h.store.read("owner", inputId), /trainer_replaced/); chmodSync(h.file, 0o600);
  renameSync(h.file, h.file + ".original"); symlinkSync(h.file + ".original", h.file);
  assert.throws(() => h.store.read("owner", inputId), /trainer_replaced/);
});


test("one native admission cannot acknowledge two different inputs in the same session", t => {
  const h = make(t);
  for (const id of [inputId, secondId]) { enqueue(h, "owner", id, { text: id }); h.store.dispatch("owner", id); }
  const first = { ...baseAdmission, ...h.store.binding("owner", inputId) };
  h.store.admitted("owner", inputId, first);
  assert.throws(() => h.store.admitted("owner", secondId, first), /native_receipt_invalid/);
  assert.throws(() => h.store.admitted("owner", secondId, { ...first, ...h.store.binding("owner", secondId) }), /native_receipt_invalid/);
  assert.equal(h.store.read("owner", secondId).state, "dispatching");
});

test("wrong key refuses before recovery or any new ciphertext is admitted", t => {
  const h = make(t); enqueue(h, "owner", inputId, { text: "pending" }); h.store.dispatch("owner", inputId);
  h.store.close();
  assert.throws(() => openPersonalStore(h.file, { profiles: h.profiles, key: randomBytes(32) }), /personal_key_invalid/);
  const db = new DatabaseSync(h.file);
  try { assert.equal(db.prepare("SELECT state FROM personal_inputs WHERE input_id=?").get(inputId).state, "dispatching"); }
  finally { db.close(); }
  h.reopen(); assert.equal(h.store.read("owner", inputId).state, "unknown");
});

test("native queued ACK may have no execution generation; only a later native claim binds it", t => {
  const h = make(t); enqueue(h, "owner", inputId, { text: "queued" }); h.store.dispatch("owner", inputId);
  const queued = { ...baseAdmission, ...h.store.binding("owner", inputId), generation: null };
  assert.equal(h.store.admitted("owner", inputId, queued).generation, null);
  assert.equal(h.store.admitted("owner", inputId, { ...queued, generation: 1 }).generation, 1);
  assert.throws(() => h.store.admitted("owner", inputId, queued), /native_receipt_invalid/);
});


test("queued receipt cannot become a successful completion without a native claim", t => {
  const h = make(t); enqueue(h, "owner", inputId, { text: "queued" }); h.store.dispatch("owner", inputId);
  const queued = { ...baseAdmission, ...h.store.binding("owner", inputId), generation: null };
  h.store.admitted("owner", inputId, queued);
  assert.throws(() => h.store.settle("owner", inputId, { ...queued, state: "completed", resultRevision: "r1" }), /native_receipt_invalid/);
  assert.equal(h.store.settle("owner", inputId, { ...queued, state: "cancelled", resultRevision: "r1" }).state, "cancelled");
});


test("canonical Bot Chat is resolved per new input; history rotation does not pin future sends", t => {
  const h = make(t);
  enqueue(h, "owner", inputId, { text: "before compression" });
  enqueue(h, "owner", secondId, { text: "after compression" }, { sessionId: "session-owner-new-tip" });
  assert.equal(h.store.read("owner", inputId).sessionId, "session-owner");
  assert.equal(h.store.read("owner", secondId).sessionId, "session-owner-new-tip");
  assert.equal(enqueue(h, "owner", inputId, { text: "before compression" }, { sessionId: "session-owner-new-tip" }).replayed, true);
  h.reopen(); assert.equal(h.store.read("owner", inputId).sessionId, "session-owner");
});

test("unbound queued intent survives restart and binds once after a newer native tip", t => {
  const h = make(t), payload = { text: "Учора з’їв яблуко" };
  h.store.enqueue("owner", inputId, payload); h.reopen();
  assert.equal(h.store.read("owner", inputId).sessionId, "");
  assert.throws(() => h.store.dispatch("owner", inputId), /turn_conflict/);
  h.store.bind("owner", inputId, "compressed-tip");
  assert.deepEqual(h.store.payload("owner", inputId), payload);
  assert.throws(() => h.store.bind("owner", inputId, "different-tip"), /turn_conflict/);
  assert.equal(h.store.bind("owner", inputId, "compressed-tip").sessionId, "compressed-tip");
});

test("physical POST reservations across logical calls, retries and crashes never reset", t => {
  const h = make(t), proof = { kind: "inference", model: "synthetic", originHash: "a".repeat(64) };
  h.store.enqueue("owner", inputId, { text: "synthetic" }); h.store.startBudget("owner", inputId);
  h.store.reservePost("owner", inputId, proof); h.reopen();
  h.store.startBudget("owner", inputId); h.store.reservePost("owner", inputId, { ...proof, kind: "oauth_refresh" });
  assert.equal(h.store.reservePost("owner", inputId, proof).attempt, 3);
  for (let n = 3; n < 12; n++) h.store.reservePost("owner", inputId, proof);
  assert.throws(() => h.store.reservePost("owner", inputId, proof), /trainer_quota/);
  assert.deepEqual(h.store.budget(), { turns: 1, posts: 12 });
  h.store.enqueue("wife", secondId, { text: "synthetic other profile" });
  assert.throws(() => h.store.startBudget("wife", secondId, { maxTurns: 9 }), /invalid_request/);
  h.store.startBudget("wife", secondId);
  assert.throws(() => h.store.reservePost("wife", secondId, proof, { maxPosts: 25 }), /invalid_request/);
  assert.throws(() => h.store.startBudget("wife", secondId, { scope: "new-budget" }), /invalid_request/);
  for (let n = 0; n < 7; n++) {
    const id = `synthetic-budget-${n}`; h.store.enqueue("wife", id, { text: id });
    h.store.startBudget("wife", id);
    for (let i = 0; i < 3; i++) h.store.reservePost("wife", id, proof);
  }
  for (let i = 0; i < 3; i++) h.store.reservePost("wife", secondId, proof);
  h.reopen(); assert.deepEqual(h.store.budget(), { turns: 9, posts: 36 });
  assert.deepEqual(h.store.postBudget("wife", secondId), { used: 3, remaining: 9 });
});

test("normal family use passes the old aggregate pilot caps without erasing accounting", t => {
  const h = make(t), proof = { kind: "inference", model: "synthetic", originHash: "b".repeat(64) };
  for (let n = 0; n < 40; n++) {
    const owner = n % 2 ? "wife" : "owner", id = `normal-use-${n}-synthetic`;
    h.store.enqueue(owner, id, { text: "synthetic family turn" });
    h.store.startBudget(owner, id);
    h.store.reservePost(owner, id, proof);
    h.store.reservePost(owner, id, proof);
    if (n === 19) h.reopen();
  }
  assert.deepEqual(h.store.budget(), { turns: 40, posts: 80 });
  h.reopen();
  assert.deepEqual(h.store.budget(), { turns: 40, posts: 80 });
  const id = "normal-use-last-synthetic";
  h.store.enqueue("owner", id, { text: "next turn remains available" });
  h.store.startBudget("owner", id);
  assert.equal(h.store.reservePost("owner", id, proof).accepted, true);
});
