import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openPersonalCredentials } from "./personal-credentials.mjs";
const files = { "auth.json": Buffer.from('{"synthetic":"never-plaintext-token"}'), "config.yaml": Buffer.from("synthetic model") };
const key = Buffer.alloc(32, 7), uid = "synthetic-owner";
function fixture() { const root = realpathSync(mkdtempSync(join(tmpdir(), "scisense-credentials-"))), file = join(root, "state.sqlite"); return { root, file, open: (options = {}) => openPersonalCredentials(file, { key, fundingOwnerUid: uid, ...options }), remove: () => rmSync(root, { recursive: true, force: true }) }; }

test("credentials remain encrypted at rest and round-trip only to trusted caller", () => {
  const f = fixture(); let store = f.open();
  try {
    assert.deepEqual(store.status(), { phase: "empty", revision: 0 }); store.initialize(files);
    assert.equal(readFileSync(f.file).includes(Buffer.from("never-plaintext-token")), false);
    store.close(); store = f.open(); assert.deepEqual(store.restore().files, files);
    assert.throws(() => store.initialize(files), /connection_conflict/);
  } finally { store.close(); f.remove(); }
});
test("wrong key or funding owner cannot change ciphertext or claim the store", () => {
  const f = fixture(); const store = f.open();
  try { store.initialize(files); store.close(); const before = readFileSync(f.file);
    for (const options of [{ key: Buffer.alloc(32, 8) }, { fundingOwnerUid: "another-owner" }]) {
      assert.throws(() => f.open(options), /connection_key_invalid/); assert.deepEqual(readFileSync(f.file), before);
    }
  } finally { store.close(); f.remove(); }
});
test("ambiguous refresh is durably blocked after restart and never restores old chain", () => {
  const f = fixture(); let store = f.open();
  try { store.initialize(files); store.beginRefresh("synthetic-refresh-id", { expectedRevision: store.status().revision });
    assert.throws(() => store.restore(), /connection_auth_required/);
    assert.throws(() => store.checkpoint(files, { expectedRevision: store.status().revision }), /connection_refresh_uncertain/);
    store.close(); store = f.open(); assert.equal(store.status().phase, "reauth_required");
    assert.throws(() => store.restore(), /connection_auth_required/);
    assert.throws(() => store.checkpoint(files, { expectedRevision: store.status().revision, refreshId: "synthetic-refresh-id", rotationCommitted: true }), /connection_auth_required/);
    assert.throws(() => store.reauthorize(files, { expectedRevision: -1 }), /connection_conflict/);
    const fresh = { "auth.json": Buffer.from("synthetic-fresh-native-login") };
    store.reauthorize(fresh, { expectedRevision: store.status().revision });
    assert.deepEqual(store.restore().files, fresh);
  } finally { store.close(); f.remove(); }
});
test("only the matching committed refresh may publish rotated auth", () => {
  const f = fixture(); const store = f.open();
  try { store.initialize(files); store.beginRefresh("synthetic-refresh-id", { expectedRevision: store.status().revision });
    assert.throws(() => store.beginRefresh("another-refresh-id", { expectedRevision: store.status().revision }), /connection_auth_required/);
    assert.throws(() => store.checkpoint(files, { expectedRevision: store.status().revision, refreshId: "wrong-refresh-id", rotationCommitted: true }), /connection_refresh_uncertain/);
    const rotated = { ...files, "auth.json": Buffer.from("synthetic-rotated") };
    store.checkpoint(rotated, { expectedRevision: store.status().revision, refreshId: "synthetic-refresh-id", rotationCommitted: true });
    assert.deepEqual(store.restore().files, rotated); assert.equal(store.status().phase, "ready");
  } finally { store.close(); f.remove(); }
});
test("live writer and invalid material cannot be overwritten by another payer", () => {
  const f = fixture(); const store = f.open();
  try { assert.throws(() => f.open(), /connection_busy/);
    assert.throws(() => store.initialize({ "../auth.json": Buffer.from("forbidden") }), /connection_material_invalid/);
    assert.throws(() => store.initialize({ "auth.json": "plaintext-string" }), /connection_material_invalid/);
    assert.equal(store.status().phase, "empty");
  } finally { store.close(); f.remove(); }
});

test("stale snapshots cannot rewind a rotated chain or revoke a newer login", () => {
  const f = fixture(); const store = f.open();
  try {
    store.initialize(files); const old = store.restore();
    const refresh = store.beginRefresh("synthetic-refresh-id", { expectedRevision: old.revision });
    store.checkpoint({ "auth.json": Buffer.from("synthetic-rotated") }, { expectedRevision: refresh.revision, refreshId: "synthetic-refresh-id", rotationCommitted: true });
    const current = store.restore();
    assert.throws(() => store.checkpoint(old.files, { expectedRevision: old.revision }), /connection_conflict/);
    assert.throws(() => store.beginRefresh("another-refresh-id", { expectedRevision: old.revision }), /connection_conflict/);
    assert.throws(() => store.requireReauth({ expectedRevision: old.revision }), /connection_conflict/);
    assert.deepEqual(store.restore(), current);
  } finally { store.close(); f.remove(); }
});
