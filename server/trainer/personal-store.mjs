import { DatabaseSync } from "node:sqlite";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from "node:crypto";
import { closeSync, existsSync, lstatSync, openSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { privateDirectory, privateRead, syncDirectory } from "./private-files.mjs";
import { fail, requireId, stableJSON } from "./limits.mjs";

const terminal = new Set(["completed", "failed", "cancelled"]);
const nativeId = value => typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\0\r\n]/.test(value);
const livePid = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== "ESRCH"; } };

// The durable dispatch intent is committed BEFORE a native send. After a lost
// ACK, absence from native lookup means unknown, never permission to resend.
// This store holds app receipts/opaque input, not a second editable chat history.
export function openPersonalStore(file, { profiles, key, now = Date.now } = {}) {
  if (!profiles?.resolve || !Buffer.isBuffer(key) || key.length !== 32) fail("personal_config_invalid", 503);
  file = resolve(file);
  privateDirectory(dirname(file));
  if (!existsSync(file)) { closeSync(openSync(file, "wx", 0o600)); syncDirectory(dirname(file)); }
  privateRead(file);
  const identity = lstatSync(file), secret = Buffer.from(key), nonce = randomUUID();
  let closed = false, claimed = false;
  const db = new DatabaseSync(file);
  const check = () => {
    if (closed) fail("trainer_unavailable", 503);
    const current = lstatSync(file);
    if (current.ino !== identity.ino || current.dev !== identity.dev || current.isSymbolicLink() || current.nlink !== 1 || current.mode & 0o077)
      fail("trainer_replaced", 503);
  };
  const tx = fn => {
    check(); db.exec("BEGIN IMMEDIATE");
    try { const value = fn(); db.exec("COMMIT"); return value; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  const digest = value => createHmac("sha256", secret).update(stableJSON(value)).digest("hex");
  const aad = row => Buffer.from(stableJSON([row.uid, row.profile_id, row.session_id, row.input_id, row.payload_hmac]));
  const seal = (row, payload) => {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", secret, iv);
    cipher.setAAD(aad(row));
    const data = Buffer.concat([cipher.update(stableJSON(payload)), cipher.final()]);
    return JSON.stringify({ version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") });
  };
  const unseal = row => {
    try {
      const box = JSON.parse(row.payload);
      if (box.version !== 1) throw Error();
      const decipher = createDecipheriv("aes-256-gcm", secret, Buffer.from(box.iv, "base64"));
      decipher.setAAD(aad(row)); decipher.setAuthTag(Buffer.from(box.tag, "base64"));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(box.data, "base64")), decipher.final()]).toString());
    } catch { fail("personal_store_invalid", 503); }
  };
  const owned = (uid, inputId) => {
    check(); requireId(inputId);
    const profile = profiles.resolve(uid), row = db.prepare("SELECT * FROM personal_inputs WHERE uid=? AND input_id=?").get(uid, inputId);
    if (!row || row.profile_id !== profile.profileId) fail("not_found", 404);
    return row;
  };
  const view = row => ({ inputId: row.input_id, state: row.state, sentAt: row.sent_at, channel: row.channel,
    sessionId: row.session_id, admissionId: row.admission_id, nativeMessageId: row.message_id,
    generation: row.generation, error: row.error, resultRevision: row.result_revision });
  try {
    db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS personal_meta(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL,key_check TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS personal_attempts(uid TEXT NOT NULL,input_id TEXT NOT NULL,attempt INTEGER NOT NULL,kind TEXT NOT NULL,scope TEXT NOT NULL,PRIMARY KEY(uid,input_id,attempt));
      CREATE TABLE IF NOT EXISTS personal_turn_budgets(uid TEXT NOT NULL,input_id TEXT NOT NULL,scope TEXT NOT NULL,PRIMARY KEY(uid,input_id));
      CREATE TABLE IF NOT EXISTS personal_owner(id INTEGER PRIMARY KEY CHECK(id=1),pid INTEGER NOT NULL,nonce TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS personal_inputs(uid TEXT NOT NULL,input_id TEXT NOT NULL,profile_id TEXT NOT NULL,
        session_id TEXT NOT NULL,payload_hmac TEXT NOT NULL,payload TEXT NOT NULL,channel TEXT NOT NULL,
        sent_at TEXT NOT NULL,state TEXT NOT NULL,admission_id TEXT,message_id TEXT,generation INTEGER,
        result_revision TEXT,error TEXT,PRIMARY KEY(uid,input_id));
      CREATE UNIQUE INDEX IF NOT EXISTS personal_native_admission ON personal_inputs(profile_id,session_id,admission_id) WHERE admission_id IS NOT NULL;`);
    if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok") fail("personal_store_invalid", 503);
    tx(() => {
      const sentinel = { uid: "key-check", profile_id: "key-check", session_id: "key-check", input_id: "key-check", payload_hmac: "key-check" };
      const meta = db.prepare("SELECT * FROM personal_meta WHERE id=1").get();
      if (meta) {
        try {
          if (meta.version !== 1 || unseal({ ...sentinel, payload: meta.key_check }).check !== "scisense-personal-store-v1") throw Error();
        } catch { fail("personal_key_invalid", 503); }
      } else {
        if (db.prepare("SELECT 1 FROM personal_inputs LIMIT 1").get()) fail("personal_store_invalid", 503);
        db.prepare("INSERT INTO personal_meta VALUES(1,1,?)").run(seal(sentinel, { check: "scisense-personal-store-v1" }));
      }
      const owner = db.prepare("SELECT * FROM personal_owner WHERE id=1").get();
      if (owner && livePid(owner.pid)) fail("trainer_busy", 409);
      db.prepare("INSERT OR REPLACE INTO personal_owner VALUES(1,?,?)").run(process.pid, nonce);
      claimed = true;
      for (const row of db.prepare("SELECT uid,profile_id,session_id FROM personal_inputs WHERE state IN ('queued','dispatching','admitted','unknown')").all()) {
        const profile = profiles.resolve(row.uid);
        if (row.profile_id !== profile.profileId) fail("personal_registry_conflict", 503);
      }
      db.prepare("UPDATE personal_inputs SET state='unknown',error='execution_unknown' WHERE state='dispatching'").run();
    });
    return Object.freeze({
      // sessionId comes from an owner lookup by canonical Bot Chat TITLE. It
      // is the input's birth target, never a persisted pin for future inputs.
      enqueue(uid, inputId, payload, { channel = "web", sessionId } = {}) {
        const profile = profiles.resolve(uid); requireId(inputId);
        if (sessionId !== undefined && !nativeId(sessionId) || !["web", "desktop"].includes(channel) || !payload || typeof payload !== "object" ||
            Array.isArray(payload) || Buffer.byteLength(stableJSON(payload)) > 32000) fail("invalid_request");
        const hash = digest(payload);
        return tx(() => {
          const old = db.prepare("SELECT * FROM personal_inputs WHERE uid=? AND input_id=?").get(uid, inputId);
          if (old) {
            if (old.profile_id !== profile.profileId || old.payload_hmac !== hash)
              fail("turn_conflict", 409);
            return { ...view(old), replayed: true };
          }
          const row = { uid, input_id: inputId, profile_id: profile.profileId, session_id: sessionId ?? "", payload_hmac: hash };
          db.prepare("INSERT INTO personal_inputs(uid,input_id,profile_id,session_id,payload_hmac,payload,channel,sent_at,state) VALUES(?,?,?,?,?,?,?,?,'queued')")
            .run(uid, inputId, row.profile_id, row.session_id, hash, seal(row, payload), channel, new Date(now()).toISOString());
          return { ...view(owned(uid, inputId)), replayed: false };
        });
      },
      read(uid, inputId) { return view(owned(uid, inputId)); },
      // Correlation proof supplied only to the trusted native adapter. It is
      // an app HMAC, NOT Hermes' independently computed native payload_digest.
      binding(uid, inputId) {
        const row = owned(uid, inputId);
        return { inputId: row.input_id, sessionId: row.session_id, payloadHmac: row.payload_hmac };
      },
      payload(uid, inputId) { return unseal(owned(uid, inputId)); },
      // A queued intent is durable before waiting. Its immutable birth target
      // is resolved exactly once AFTER taking the global slot (compression may
      // have advanced Bot Chat while the user waited).
      bind(uid, inputId, sessionId) {
        if (!nativeId(sessionId)) fail("invalid_request");
        return tx(() => {
          const row = owned(uid, inputId);
          if (row.state !== "queued" || row.session_id && row.session_id !== sessionId) fail("turn_conflict", 409);
          if (!row.session_id) {
            const payload = unseal(row), bound = { ...row, session_id: sessionId };
            db.prepare("UPDATE personal_inputs SET session_id=?,payload=? WHERE uid=? AND input_id=?").run(sessionId, seal(bound, payload), uid, inputId);
          }
          return view(owned(uid, inputId));
        });
      },
      startBudget(uid, inputId, options = {}) {
        if (Object.keys(options).length) fail("invalid_request");
        const scope = "hermes-personal-b3", maxTurns = 8;
        return tx(() => {
          owned(uid, inputId);
          const old = db.prepare("SELECT * FROM personal_turn_budgets WHERE uid=? AND input_id=?").get(uid, inputId);
          if (old) { if (old.scope !== scope) fail("turn_conflict", 409); return; }
          if (db.prepare("SELECT COUNT(*) AS n FROM personal_turn_budgets WHERE scope=?").get(scope).n >= maxTurns) fail("trainer_quota", 429);
          db.prepare("INSERT INTO personal_turn_budgets VALUES(?,?,?)").run(uid, inputId, scope);
        });
      },
      reservePost(uid, inputId, { kind, model, originHash }, options = {}) {
        if (Object.keys(options).length) fail("invalid_request");
        const scope = "hermes-personal-b3", maxPosts = 24;
        if (!["inference", "oauth_refresh"].includes(kind) || typeof model !== "string" || !model || !/^[a-f0-9]{64}$/.test(originHash)) fail("invalid_request");
        return tx(() => {
          owned(uid, inputId);
          if (db.prepare("SELECT scope FROM personal_turn_budgets WHERE uid=? AND input_id=?").get(uid, inputId)?.scope !== scope) fail("turn_conflict", 409);
          const count = db.prepare("SELECT COUNT(*) AS n FROM personal_attempts WHERE uid=? AND input_id=?").get(uid, inputId).n;
          if (count >= 3 || db.prepare("SELECT COUNT(*) AS n FROM personal_attempts WHERE scope=?").get(scope).n >= maxPosts) fail("trainer_quota", 429);
          db.prepare("INSERT INTO personal_attempts VALUES(?,?,?,?,?)").run(uid, inputId, count + 1, kind, scope);
          return { accepted: true, attempt: count + 1 };
        });
      },
      postBudget(uid, inputId) {
        owned(uid, inputId);
        const scope = "hermes-personal-b3";
        const used = db.prepare("SELECT COUNT(*) AS n FROM personal_attempts WHERE uid=? AND input_id=?").get(uid, inputId).n;
        const total = db.prepare("SELECT COUNT(*) AS n FROM personal_attempts WHERE scope=?").get(scope).n;
        return { used, remaining: Math.max(0, Math.min(3 - used, 24 - total)) };
      },
      budget() {
        const scope = "hermes-personal-b3";
        check(); return { turns: db.prepare("SELECT COUNT(*) AS n FROM personal_turn_budgets WHERE scope=?").get(scope).n,
          posts: db.prepare("SELECT COUNT(*) AS n FROM personal_attempts WHERE scope=?").get(scope).n };
      },
      dispatch(uid, inputId) {
        return tx(() => {
          const row = owned(uid, inputId);
          if (row.state !== "queued" || !row.session_id) fail("turn_conflict", 409);
          db.prepare("UPDATE personal_inputs SET state='dispatching' WHERE uid=? AND input_id=?").run(uid, inputId);
          return view(owned(uid, inputId));
        });
      },
      admitted(uid, inputId, receipt) {
        return tx(() => {
          const row = owned(uid, inputId);
          if (!receipt || receipt.inputId !== row.input_id || receipt.payloadHmac !== row.payload_hmac ||
              receipt.sessionId !== row.session_id || !nativeId(receipt.admissionId) ||
              receipt.generation !== null && (!Number.isSafeInteger(receipt.generation) || receipt.generation < 1) ||
              receipt.nativeMessageId != null && !nativeId(receipt.nativeMessageId) ||
              row.admission_id && row.admission_id !== receipt.admissionId ||
              row.generation != null && row.generation !== receipt.generation ||
              row.message_id && receipt.nativeMessageId != null && row.message_id !== receipt.nativeMessageId) fail("native_receipt_invalid", 502);
          const reused = db.prepare("SELECT input_id FROM personal_inputs WHERE profile_id=? AND session_id=? AND admission_id=? AND input_id<>?")
            .get(row.profile_id, row.session_id, receipt.admissionId, row.input_id);
          if (reused) fail("native_receipt_invalid", 502);
          if (terminal.has(row.state)) return view(row);
          if (!["dispatching", "unknown", "admitted"].includes(row.state)) fail("turn_conflict", 409);
          db.prepare("UPDATE personal_inputs SET state='admitted',admission_id=?,generation=?,message_id=COALESCE(?,message_id),error=NULL WHERE uid=? AND input_id=?")
            .run(receipt.admissionId, receipt.generation, receipt.nativeMessageId ?? null, uid, inputId);
          return view(owned(uid, inputId));
        });
      },
      settle(uid, inputId, receipt) {
        return tx(() => {
          const row = owned(uid, inputId);
          if (!receipt || receipt.inputId !== row.input_id || receipt.payloadHmac !== row.payload_hmac ||
              receipt.sessionId !== row.session_id || receipt.admissionId !== row.admission_id ||
              !nativeId(row.admission_id) || receipt.generation !== row.generation || !terminal.has(receipt.state) ||
              receipt.state === "completed" && (!Number.isSafeInteger(receipt.generation) || receipt.generation < 1) ||
              receipt.nativeMessageId != null && !nativeId(receipt.nativeMessageId) ||
              !nativeId(receipt.resultRevision) ||
              row.message_id && receipt.nativeMessageId != null && row.message_id !== receipt.nativeMessageId) fail("native_receipt_invalid", 502);
          if (terminal.has(row.state)) {
            if (row.state !== receipt.state || row.result_revision !== receipt.resultRevision) fail("turn_conflict", 409);
            return view(row);
          }
          db.prepare("UPDATE personal_inputs SET state=?,result_revision=?,message_id=COALESCE(?,message_id),error=NULL WHERE uid=? AND input_id=?")
            .run(receipt.state, receipt.resultRevision, receipt.nativeMessageId ?? null, uid, inputId);
          return view(owned(uid, inputId));
        });
      },
      unknown(uid, inputId) {
        return tx(() => {
          const row = owned(uid, inputId);
          if (!terminal.has(row.state) && row.state !== "queued")
            db.prepare("UPDATE personal_inputs SET state='unknown',error='execution_unknown' WHERE uid=? AND input_id=?").run(uid, inputId);
          return view(owned(uid, inputId));
        });
      },
      queued(uid) {
        check(); profiles.resolve(uid);
        return db.prepare("SELECT * FROM personal_inputs WHERE uid=? AND state='queued' ORDER BY sent_at,input_id").all(uid).map(view);
      },
      pending(uid) {
        check(); profiles.resolve(uid);
        return db.prepare("SELECT * FROM personal_inputs WHERE uid=? AND state IN ('dispatching','admitted','unknown') ORDER BY sent_at,input_id").all(uid).map(view);
      },
      close() {
        if (closed) return;
        try { if (claimed) db.prepare("DELETE FROM personal_owner WHERE id=1 AND nonce=?").run(nonce); }
        finally { closed = true; try { db.close(); } finally { secret.fill(0); } }
      },
    });
  } catch (error) {
    try { if (claimed) db.prepare("DELETE FROM personal_owner WHERE id=1 AND nonce=?").run(nonce); }
    finally { db.close(); secret.fill(0); }
    throw error;
  }
}
