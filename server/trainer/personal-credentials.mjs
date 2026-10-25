import { DatabaseSync } from "node:sqlite";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { chmodSync, existsSync, lstatSync } from "node:fs";
import { dirname } from "node:path";
import { privateDirectory } from "./private-files.mjs";

const fail = code => { throw Error(code); };
const names = new Set(["auth.json", "config.yaml", ".env"]);
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; } };
function material(files) {
  if (!files || typeof files !== "object" || Array.isArray(files) || Object.keys(files).some(name => !names.has(name))) fail("connection_material_invalid");
  const copied = {};
  let size = 0;
  for (const [name, data] of Object.entries(files)) {
    if (!Buffer.isBuffer(data) || (size += data.length) > 1024 * 1024) fail("connection_material_invalid");
    copied[name] = data.toString("base64");
  }
  return copied;
}

// This store belongs only to the trusted payer. Native plaintext is restored
// exclusively to a verified tmpfs by its launcher, never a profile or browser.
export function openPersonalCredentials(file, { key, fundingOwnerUid }) {
  privateDirectory(dirname(file));
  if (!Buffer.isBuffer(key) || key.length !== 32 || typeof fundingOwnerUid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(fundingOwnerUid)) fail("connection_key_invalid");
  if (existsSync(file)) {
    const info = lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.mode & 0o077 || info.uid !== process.getuid()) fail("connection_permissions");
  }
  const secret = Buffer.from(key), nonce = randomUUID();
  let db;
  try { db = new DatabaseSync(file); }
  catch { secret.fill(0); fail("connection_store_unavailable"); }
  let closed = false, claimed = false;
  const aad = Buffer.from("scisense-personal-connection-v1:" + fundingOwnerUid);
  const seal = value => {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", secret, iv); cipher.setAAD(aad);
    const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return JSON.stringify({ version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") });
  };
  const unseal = encoded => {
    try {
      const value = JSON.parse(encoded);
      if (value.version !== 1) throw Error();
      const decipher = createDecipheriv("aes-256-gcm", secret, Buffer.from(value.iv, "base64"));
      decipher.setAAD(aad); decipher.setAuthTag(Buffer.from(value.tag, "base64"));
      const state = JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data, "base64")), decipher.final()]).toString());
      if (state.version !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 0 || !["empty", "ready", "refresh_pending", "reauth_required"].includes(state.phase)) throw Error();
      return state;
    } catch { fail("connection_key_invalid"); }
  };
  const read = () => unseal(db.prepare("SELECT payload FROM connection_state WHERE id=1").get().payload);
  const write = value => db.prepare("UPDATE connection_state SET payload=? WHERE id=1").run(seal(value));
  const transaction = fn => {
    if (closed) fail("connection_closed");
    db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  const summary = value => ({ phase: value.phase, revision: value.revision });
  try {
    chmodSync(file, 0o600);
    db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS connection_state(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS connection_owner(id INTEGER PRIMARY KEY CHECK(id=1),pid INTEGER NOT NULL,nonce TEXT NOT NULL);");
    if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok") fail("connection_store_invalid");
    transaction(() => {
      if (!db.prepare("SELECT 1 FROM connection_state WHERE id=1").get()) db.prepare("INSERT INTO connection_state VALUES(1,?)").run(seal({ version: 1, revision: 0, phase: "empty", files: {} }));
      const state = read(); // Verify key/owner before claiming or recovering anything.
      const owner = db.prepare("SELECT * FROM connection_owner WHERE id=1").get();
      if (owner && alive(owner.pid)) fail("connection_busy");
      db.prepare("INSERT OR REPLACE INTO connection_owner VALUES(1,?,?)").run(process.pid, nonce); claimed = true;
      if (state.phase === "refresh_pending") write({ ...state, phase: "reauth_required", revision: state.revision + 1 });
    });
    return Object.freeze({
      status() { if (closed) fail("connection_closed"); return summary(read()); },
      initialize(files) {
        const data = material(files);
        return transaction(() => { const old = read(); if (old.phase !== "empty") fail("connection_conflict"); const state = { version: 1, phase: "ready", revision: old.revision + 1, files: data }; write(state); return summary(state); });
      },
      // Only the payer's explicit native login completion may call this. A
      // retry or a profile request cannot clear an ambiguous refresh marker.
      reauthorize(files, { expectedRevision } = {}) {
        const data = material(files);
        return transaction(() => {
          const old = read();
          if (old.phase !== "reauth_required" || old.revision !== expectedRevision) fail("connection_conflict");
          const state = { version: 1, phase: "ready", revision: old.revision + 1, files: data }; write(state); return summary(state);
        });
      },
      restore() {
        if (closed) fail("connection_closed"); const state = read();
        if (state.phase !== "ready") fail(state.phase === "empty" ? "connection_unconfigured" : "connection_auth_required");
        return { revision: state.revision, files: Object.fromEntries(Object.entries(state.files).map(([name, data]) => [name, Buffer.from(data, "base64")])) };
      },
      beginRefresh(refreshId, { expectedRevision } = {}) {
        if (typeof refreshId !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(refreshId)) fail("connection_material_invalid");
        return transaction(() => { const old = read(); if (old.revision !== expectedRevision) fail("connection_conflict"); if (old.phase !== "ready") fail("connection_auth_required"); const state = { ...old, phase: "refresh_pending", refreshId, revision: old.revision + 1 }; write(state); return summary(state); });
      },
      checkpoint(files, { expectedRevision, refreshId, rotationCommitted = false } = {}) {
        const data = material(files);
        return transaction(() => {
          const old = read();
          if (old.revision !== expectedRevision) fail("connection_conflict");
          if (old.phase === "empty" || old.phase === "reauth_required") fail("connection_auth_required");
          if (old.phase === "refresh_pending" && (old.refreshId !== refreshId || rotationCommitted !== true)) fail("connection_refresh_uncertain");
          if (old.phase === "ready" && (refreshId !== undefined || rotationCommitted)) fail("connection_conflict");
          const state = { version: 1, phase: "ready", revision: old.revision + 1, files: data }; write(state); return summary(state);
        });
      },
      requireReauth({ expectedRevision } = {}) { return transaction(() => { const old = read(); if (old.revision !== expectedRevision) fail("connection_conflict"); const state = { ...old, phase: "reauth_required", revision: old.revision + 1 }; write(state); return summary(state); }); },
      close() {
        if (closed) return;
        try { if (claimed) db.prepare("DELETE FROM connection_owner WHERE id=1 AND nonce=?").run(nonce); }
        finally { closed = true; try { db.close(); } finally { secret.fill(0); } }
      },
    });
  } catch (error) {
    try { if (claimed) db.prepare("DELETE FROM connection_owner WHERE id=1 AND nonce=?").run(nonce); }
    finally { db.close(); secret.fill(0); }
    throw error;
  }
}
