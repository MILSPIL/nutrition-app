import { attachRetention } from "./retention.mjs";
import { attachDraftStore } from "./drafts.mjs";
import { sameFreshness } from "./day-snapshot.mjs";
import { DatabaseSync } from "node:sqlite";
import {
  openSync,
  closeSync,
  lstatSync,
  realpathSync,
  existsSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { createHmac, randomUUID, randomBytes, createHash } from "node:crypto";
import { LIMITS, fail, requireId, stableJSON } from "./limits.mjs";

const digest = (text) => createHash("sha256").update(text).digest("hex");
const safeError = (value) =>
  /^[a-z_]{1,60}$/.test(value || "") ? value : "trainer_failed";
export function openTurnStore(
  file,
  { hmacKey, now = Date.now, recover = true } = {},
) {
  if (!Buffer.isBuffer(hmacKey) || hmacKey.length < 32)
    fail("trainer_config", 503);
  file = resolve(file);
  const directory = dirname(file),
    dir = lstatSync(directory);
  if (
    !dir.isDirectory() ||
    realpathSync(directory) !== directory ||
    dir.mode & 0o077
  )
    fail("trainer_permissions", 503);
  const fresh = !existsSync(file);
  if (fresh) closeSync(openSync(file, "wx", 0o600));
  const identity = lstatSync(file);
  if (
    !identity.isFile() ||
    identity.isSymbolicLink() ||
    identity.nlink !== 1 ||
    identity.mode & 0o077
  )
    fail("trainer_permissions", 503);
  const db = new DatabaseSync(file),
    nonce = randomUUID();
  let closed = false,
    claimed = false;
  let retention = null,
    inTransaction = false;
  const hash = (value) =>
    createHmac("sha256", hmacKey).update(stableJSON(value)).digest("hex");
  const check = () => {
    if (closed) fail("trainer_unavailable", 503);
    if (!inTransaction) retention?.sync();
    const s = lstatSync(file);
    if (s.ino !== identity.ino || s.dev !== identity.dev)
      fail("trainer_replaced", 503);
  };
  const tx = (fn) => {
    check();
    db.exec("BEGIN IMMEDIATE");
    inTransaction = true;
    try {
      const value = fn();
      db.exec("COMMIT");
      return value;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    } finally {
      inTransaction = false;
    }
  };
  try {
    db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;
   CREATE TABLE IF NOT EXISTS trainer_meta(version INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS runtime_owner(id INTEGER PRIMARY KEY CHECK(id=1),pid INTEGER NOT NULL,nonce TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,owner TEXT UNIQUE NOT NULL,generation INTEGER NOT NULL DEFAULT 1,revision INTEGER NOT NULL DEFAULT 0,composer TEXT NOT NULL DEFAULT '{"text":"","revision":0}',draft TEXT,created INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS turns(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id),payload_hmac TEXT NOT NULL,snapshot_hmac TEXT NOT NULL,snapshot TEXT NOT NULL,input TEXT NOT NULL,state TEXT NOT NULL,generation INTEGER NOT NULL,base_revision INTEGER NOT NULL,created INTEGER NOT NULL,deadline INTEGER NOT NULL,run_id TEXT,session_id TEXT,result TEXT,error TEXT,call_count INTEGER NOT NULL DEFAULT 0,expired INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS leases(token_hash TEXT PRIMARY KEY,turn_id TEXT NOT NULL REFERENCES turns(id),generation INTEGER NOT NULL,call_number INTEGER NOT NULL,deadline INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0,reserve_id TEXT UNIQUE NOT NULL);
   CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id),turn_id TEXT NOT NULL,role TEXT NOT NULL,content TEXT NOT NULL,created INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS call_receipts(reserve_id TEXT PRIMARY KEY,turn_id TEXT NOT NULL REFERENCES turns(id),payload_hmac TEXT NOT NULL,history_ids TEXT NOT NULL,created INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS cleanup_jobs(turn_id TEXT PRIMARY KEY REFERENCES turns(id),session_id TEXT,created INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS first_admissions(turn_id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,payload_hmac TEXT NOT NULL,sent_at TEXT NOT NULL,created INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS turn_days(turn_id TEXT NOT NULL,target_date TEXT NOT NULL,proof TEXT NOT NULL,PRIMARY KEY(turn_id,target_date));
   CREATE TABLE IF NOT EXISTS draft_previews(draft_id TEXT PRIMARY KEY,proof TEXT NOT NULL,stale INTEGER NOT NULL DEFAULT 0);
   CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id,created,id);`);
    if (!db.prepare("SELECT version FROM trainer_meta").get())
      db.prepare("INSERT INTO trainer_meta VALUES(1)").run();
    if (
      db.prepare("SELECT version FROM trainer_meta").get().version !== 1 ||
      db.prepare("PRAGMA quick_check").get().quick_check !== "ok"
    )
      fail("trainer_store_invalid", 503);
    if (
      !db
        .prepare("PRAGMA table_info(turns)")
        .all()
        .some((c) => c.name === "expired")
    )
      db.exec(
        "ALTER TABLE turns ADD COLUMN expired INTEGER NOT NULL DEFAULT 0",
      );
    tx(() => {
      const owner = db.prepare("SELECT * FROM runtime_owner WHERE id=1").get();
      if (owner) {
        let alive = true;
        try {
          process.kill(owner.pid, 0);
        } catch (e) {
          if (e.code === "ESRCH") alive = false;
        }
        if (alive) fail("trainer_in_use", 503);
      }
      db.prepare("INSERT OR REPLACE INTO runtime_owner VALUES(1,?,?)").run(
        process.pid,
        nonce,
      );
      claimed = true;
      if (recover) {
        db.prepare(
          "UPDATE turns SET state='unknown',error='execution_unknown' WHERE state='running'",
        ).run();
        for (const row of db
          .prepare("SELECT id,input FROM turns WHERE state='queued'")
          .all()) {
          const error = JSON.parse(row.input).media?.length
            ? "media_reattach_required"
            : "interrupted_before_start";
          db.prepare("UPDATE turns SET state='failed',error=? WHERE id=?").run(
            error,
            row.id,
          );
          db.prepare(
            "INSERT OR IGNORE INTO cleanup_jobs VALUES(?,NULL,?,0)",
          ).run(row.id, now());
        }
      }
    });
  } catch (e) {
    db.close();
    throw e;
  }
  const conversation = (uid, id) => {
    check();
    if (retention?.closed(id)) fail("conversation_gone", 410);
    const row = db
      .prepare("SELECT * FROM conversations WHERE id=? AND owner=?")
      .get(id, uid);
    if (!row) fail("not_found", 404);
    return row;
  };
  const internal = (id) => {
    check();
    const row = db
      .prepare(
        "SELECT t.*,c.owner,c.generation current_generation,c.revision current_revision FROM turns t JOIN conversations c ON c.id=t.conversation_id WHERE t.id=?",
      )
      .get(id);
    if (!row) fail("not_found", 404);
    return row;
  };
  const own = (uid, id) => {
    const row = internal(id);
    if (row.owner !== uid) fail("not_found", 404);
    return row;
  };
  const view = (row) => {
    if (row.expired) fail("turn_gone", 410);
    const cleanupPending = !!db
      .prepare("SELECT 1 FROM cleanup_jobs WHERE turn_id=?")
      .get(row.id);
    return {
      turnId: row.id,
      conversationId: row.conversation_id,
      state:
        row.state === "completed" && cleanupPending
          ? "cleanup_pending"
          : row.state,
      cleanupPending,
      generation: row.generation,
      targetDate: JSON.parse(row.input).targetDate,
      sentAt: JSON.parse(row.input).sentAt,
      text: JSON.parse(row.input).text,
      error: row.error,
      result: row.result && !cleanupPending ? JSON.parse(row.result) : null,
    };
  };
  const active = (row) => {
    if (row.expired) fail("turn_gone", 410);
    if (row.state !== "running" || row.generation !== row.current_generation)
      fail("turn_inactive", 409);
    if (now() >= row.deadline) fail("turn_expired", 409);
  };
  const payloadHash = (uid, id, input) =>
    hash({
      uid,
      conversationId: id,
      input: {
        ...((({sentAt,targetDate,...request}) => input.dateContext ? request : {...request,targetDate})(input)),
        media: (input.media || []).map(({ expiresAt, ...m }) => m),
      },
    });
  const replay = (uid, id, input) => {
    conversation(uid, id);
    if (retention?.gone(input.turnId)) fail("turn_gone", 410);
    const previous = db
      .prepare("SELECT * FROM turns WHERE id=?")
      .get(input.turnId);
    if (!previous) return null;
    if (previous.conversation_id !== id) fail("not_found", 404);
    if (previous.payload_hmac !== payloadHash(uid, id, input))
      fail("turn_conflict", 409);
    return view(previous);
  };
  const job = (row) =>
    db
      .prepare("INSERT OR IGNORE INTO cleanup_jobs VALUES(?,?,?,0)")
      .run(row.id, row.session_id ?? null, now());
  const drafts = attachDraftStore({
    db,
    tx,
    conversation,
    own,
    internal,
    active,
    now,
  });
  try {
    retention = attachRetention({ db, file, key: hmacKey, now, fresh });
    retention.sync();
  } catch (e) {
    db.prepare("DELETE FROM runtime_owner WHERE id=1 AND nonce=?").run(nonce);
    db.close();
    throw e;
  }
  const pruneMetadata = () => {
    db.prepare("DELETE FROM first_admissions WHERE created<? OR conversation_id IN (SELECT id FROM closed_conversations)").run(now()-LIMITS.retentionMs);
    db.exec("DELETE FROM turn_days WHERE turn_id NOT IN (SELECT id FROM turns WHERE expired=0); DELETE FROM draft_previews WHERE draft_id NOT IN (SELECT id FROM drafts)");
  };
  const preview = d => {
    const row=db.prepare("SELECT proof,stale FROM draft_previews WHERE draft_id=?").get(d.draftId);
    if(!row)return d.save||["saved","saving","unknown"].includes(d.state)?d:{...d,stale:true};
    const freshness=JSON.parse(row.proof);
    return {...d,freshness,stale:row.stale===1||freshness.targetDate!==d.targetDate};
  };
  const retentionTimer = setInterval(() => {
    try {
      retention.sync();
      pruneMetadata();
    } catch {
      /* All public operations recheck and refuse on failure. */
    }
  }, 3600000);
  retentionTimer.unref();
  return {
    ...drafts,
    maintainRetention: () => {retention.sync();pruneMetadata();},
    forget: (...args) => {const result=retention.forget(...args);pruneMetadata();return result;},
    drafts: (uid,cid) => drafts.drafts(uid,cid).map(preview),
    draft: (uid,cid,did) => preview(drafts.draft(uid,cid,did)),
    captureAdmission(uid,cid,input) {
      requireId(input.turnId);
      return tx(()=>{
        const c=conversation(uid,cid);
        if(retention.gone(input.turnId))fail("turn_gone",410);
        const key=payloadHash(uid,cid,input), previous=db.prepare("SELECT * FROM first_admissions WHERE turn_id=?").get(input.turnId);
        if(previous){
          if(previous.conversation_id!==cid)fail("not_found",404);
          if(previous.payload_hmac!==key)fail("turn_conflict",409);
          return previous.sent_at;
        }
        if(c.revision!==input.baseRevision)fail("history_conflict",409);
        const at=now(),sentAt=new Date(at).toISOString();
        db.prepare("INSERT INTO first_admissions VALUES(?,?,?,?,?)").run(input.turnId,cid,key,sentAt,at);
        return sentAt;
      });
    },
    dayProofs(uid,id) {
      own(uid,id);
      return db.prepare("SELECT proof FROM turn_days WHERE turn_id=?").all(id).map(r=>JSON.parse(r.proof));
    },
    recordDayProof(id,generation,proof) {
      return tx(()=>{
        const turn=internal(id);active(turn);if(turn.generation!==generation)fail("stale_result",409);
        const existing=db.prepare("SELECT target_date,proof FROM turn_days WHERE turn_id=?").all(id);
        if(existing.some(r=>{const p=JSON.parse(r.proof);return p.planFingerprint!==proof.planFingerprint||(r.target_date===proof.targetDate&&!sameFreshness(p,proof));}))fail("stale_snapshot",409);
        db.prepare("INSERT OR IGNORE INTO turn_days VALUES(?,?,?)").run(id,proof.targetDate,stableJSON(proof));
      });
    },
    refreshPreview(uid,cid,did,baseRevision,proof) {
      return tx(()=>{
        const d=drafts.draft(uid,cid,did);
        if(d.revision!==baseRevision)fail("draft_conflict",409);
        if(d.targetDate!==proof.targetDate)fail("draft_conflict",409);
        if(["saving","unknown","saved"].includes(d.state))fail("draft_frozen",409);
        db.prepare("INSERT INTO draft_previews VALUES(?,?,0) ON CONFLICT(draft_id) DO UPDATE SET proof=excluded.proof,stale=0").run(did,stableJSON(proof));
        return preview(d);
      });
    },
    stalePreview(uid,cid,did) {
      drafts.draft(uid,cid,did);
      db.prepare("UPDATE draft_previews SET stale=1 WHERE draft_id=?").run(did);
    },
    expiredPending: retention.expiredPending,
    hash,
    replay,
    conversation(uid) {
      if (typeof uid !== "string" || !uid || uid.length > 128)
        fail("unauthorized", 401);
      return tx(() => {
        let c = db
          .prepare("SELECT * FROM conversations WHERE owner=?")
          .get(uid);
        if (!c) {
          const id = randomUUID();
          db.prepare(
            "INSERT INTO conversations(id,owner,created) VALUES(?,?,?)",
          ).run(id, uid, now());
          c = conversation(uid, id);
        }
        return {
          conversationId: c.id,
          revision: c.revision,
          generation: c.generation,
          composer: (({ text, revision }) => ({ text, revision }))(
            JSON.parse(c.composer),
          ),
          draft: c.draft ? JSON.parse(c.draft) : null,
        };
      });
    },
    history(uid, id) {
      conversation(uid, id);
      return db
        .prepare(
          "SELECT id,role,content,created FROM messages WHERE conversation_id=? AND created>=? ORDER BY created,id",
        )
        .all(id, now() - LIMITS.retentionMs);
    },
    composer(uid, id, { text, baseRevision }) {
      if (
        typeof text !== "string" ||
        Buffer.byteLength(text) > LIMITS.userBytes
      )
        fail("message_too_large", 413);
      return tx(() => {
        const c = conversation(uid, id),
          old = JSON.parse(c.composer);
        if (old.revision !== baseRevision) fail("composer_conflict", 409);
        const value = { text, revision: baseRevision + 1, updatedAt: now() };
        db.prepare("UPDATE conversations SET composer=? WHERE id=?").run(
          JSON.stringify(value),
          id,
        );
        return { text: value.text, revision: value.revision };
      });
    },
    admit(uid, id, input, snapshot, {dayProof=snapshot.day?.freshness}={}) {
      requireId(input.turnId);
      return tx(() => {
        if (retention.gone(input.turnId)) fail("turn_gone", 410);
        const c = conversation(uid, id),
          key = payloadHash(uid, id, input);
        const previous = db
          .prepare("SELECT * FROM turns WHERE id=?")
          .get(input.turnId);
        if (previous) {
          if (previous.conversation_id !== id) fail("not_found", 404);
          if (previous.payload_hmac !== key) fail("turn_conflict", 409);
          return { replayed: true, turn: view(previous) };
        }
        if (
          db
            .prepare(
              "SELECT 1 FROM turns WHERE state IN ('queued','running','unknown') LIMIT 1",
            )
            .get() ||
          db.prepare("SELECT 1 FROM cleanup_jobs LIMIT 1").get()
        )
          fail("trainer_busy", 409);
        if (c.revision !== input.baseRevision) fail("history_conflict", 409);
        const anchor=db.prepare("SELECT * FROM first_admissions WHERE turn_id=?").get(input.turnId);
        if(input.dateContext && (!anchor||anchor.payload_hmac!==key||anchor.sent_at!==input.sentAt))fail("admission_conflict",409);
        const at = now();
        db.prepare(
          "INSERT INTO turns(id,conversation_id,payload_hmac,snapshot_hmac,snapshot,input,state,generation,base_revision,created,deadline) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        ).run(
          input.turnId,
          id,
          key,
          hash(snapshot),
          stableJSON(snapshot),
          stableJSON(input),
          "queued",
          c.generation,
          c.revision,
          at,
          at + LIMITS.deadlineMs,
        );
        if(dayProof)db.prepare("INSERT INTO turn_days VALUES(?,?,?)").run(input.turnId,dayProof.targetDate,stableJSON(dayProof));
        // Admission and removal of exactly the sent composer are one durable commit.
        // An edit made in another tab is preserved when it differs from this input.
        const composer = JSON.parse(c.composer);
        if (composer.text.trim() === input.text.trim())
          db.prepare("UPDATE conversations SET composer=? WHERE id=?").run(
            JSON.stringify({
              text: "",
              revision: composer.revision + 1,
              updatedAt: now(),
            }),
            id,
          );
        return { replayed: false, turn: view(own(uid, input.turnId)) };
      });
    },
    get(uid, id) {
      if (retention.gone(id)) fail("turn_gone", 410);
      return view(own(uid, id));
    },
    current(uid, id) {
      conversation(uid, id);
      const row = db
        .prepare(
          "SELECT t.* FROM turns t LEFT JOIN cleanup_jobs j ON j.turn_id=t.id WHERE t.conversation_id=? AND (t.state IN ('queued','running','unknown') OR j.turn_id IS NOT NULL) ORDER BY t.created DESC LIMIT 1",
        )
        .get(id);
      return row
        ? row.expired
          ? {
              turnId: row.id,
              state: "cleanup_pending",
              expired: true,
              error: "retention_cleanup",
              result: null,
            }
          : view(row)
        : null;
    },
    latest(uid, id) {
      conversation(uid, id);
      const row = db
        .prepare(
          "SELECT * FROM turns WHERE conversation_id=? AND expired=0 ORDER BY created DESC,rowid DESC LIMIT 1",
        )
        .get(id);
      return row ? view(row) : null;
    },
    internal,
    begin(uid, id) {
      return tx(() => {
        const row = own(uid, id);
        if (row.state !== "queued") fail("turn_inactive", 409);
        if (now() >= row.deadline) fail("turn_expired", 409);
        db.prepare("UPDATE turns SET state='running' WHERE id=?").run(id);
        return internal(id);
      });
    },
    bindRun(id, generation, { runId, sessionId }) {
      if (
        ![runId, sessionId].every(
          (v) => typeof v === "string" && /^[a-zA-Z0-9_-]{16,100}$/.test(v),
        )
      )
        fail("invalid_request");
      return tx(() => {
        const row = internal(id);
        if (
          !["running", "unknown", "cancelled"].includes(row.state) ||
          row.generation !== generation ||
          row.run_id
        )
          fail("turn_conflict", 409);
        db.prepare("UPDATE turns SET run_id=?,session_id=? WHERE id=?").run(
          runId,
          sessionId,
          id,
        );
        db.prepare("UPDATE cleanup_jobs SET session_id=? WHERE turn_id=?").run(
          sessionId,
          id,
        );
      });
    },
    issueLease(id, generation) {
      return tx(() => {
        const row = internal(id);
        active(row);
        if (row.generation !== generation || row.call_count >= LIMITS.calls)
          fail("call_limit", 429);
        if (
          db
            .prepare("SELECT 1 FROM leases WHERE turn_id=? AND consumed=0")
            .get(id)
        )
          fail("lease_pending", 409);
        const token = randomBytes(32).toString("hex"),
          call = row.call_count + 1,
          reserveId = randomUUID();
        db.prepare("INSERT INTO leases VALUES(?,?,?,?,?,0,?)").run(
          digest(token),
          id,
          generation,
          call,
          row.deadline,
          reserveId,
        );
        db.prepare("UPDATE turns SET call_count=? WHERE id=?").run(call, id);
        return { token, call, deadline: row.deadline };
      });
    },
    consumeLease(token) {
      if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
        fail("invalid_lease", 403);
      return tx(() => {
        const lease = db
          .prepare("SELECT * FROM leases WHERE token_hash=?")
          .get(digest(token));
        if (!lease || lease.consumed) fail("invalid_lease", 403);
        const row = internal(lease.turn_id);
        active(row);
        if (row.generation !== lease.generation) fail("invalid_lease", 403);
        db.prepare("UPDATE leases SET consumed=1 WHERE token_hash=?").run(
          digest(token),
        );
        return {
          turnId: row.id,
          generation: row.generation,
          uid: row.owner,
          reserveId: lease.reserve_id,
          deadline: lease.deadline,
          call: lease.call_number,
        };
      });
    },
    recordCall(lease, payload, historyIds) {
      return tx(() => {
        const row = internal(lease.turnId);
        active(row);
        if (row.generation !== lease.generation) fail("turn_inactive", 409);
        db.prepare("INSERT INTO call_receipts VALUES(?,?,?,?,?)").run(
          lease.reserveId,
          row.id,
          hash(payload),
          JSON.stringify(historyIds),
          now(),
        );
      });
    },
    assertActive(id, generation) {
      const row = internal(id);
      active(row);
      if (row.generation !== generation) fail("turn_inactive", 409);
    },
    complete(id, generation, result) {
      return tx(() => {
        const row = internal(id);
        if (
          row.expired ||
          !["running", "unknown"].includes(row.state) ||
          row.generation !== generation ||
          row.current_generation !== generation
        )
          fail("stale_result", 409);
        if (row.current_revision !== row.base_revision)
          fail("history_conflict", 409);
        const input = JSON.parse(row.input),
          at = now();
        if (
          !result ||
          Object.keys(result).some((k) => k !== "text") ||
          typeof result?.text !== "string" ||
          Buffer.byteLength(result.text) > 16000 ||
          /data:image\/|data:audio\//i.test(result.text)
        )
          fail("invalid_response", 502);
        const draftResults = drafts.publish(row);
        for(const result of draftResults)if(result.state==="applied"){
          const d=drafts.draft(row.owner,row.conversation_id,result.draftId),proof=db.prepare("SELECT proof FROM turn_days WHERE turn_id=? AND target_date=?").get(id,d.targetDate);
          if(proof)db.prepare("INSERT INTO draft_previews VALUES(?,?,0) ON CONFLICT(draft_id) DO UPDATE SET proof=excluded.proof,stale=0").run(d.draftId,proof.proof);
        }
        const committed = {
          ...result,
          ...(draftResults.length ? { drafts: draftResults } : {}),
        };
        db.prepare("INSERT INTO messages VALUES(?,?,?,?,?,?)").run(
          id + "-u",
          row.conversation_id,
          id,
          "user",
          input.text,
          at,
        );
        db.prepare("INSERT INTO messages VALUES(?,?,?,?,?,?)").run(
          id + "-v",
          row.conversation_id,
          id,
          "assistant",
          result.text,
          at,
        );
        db.prepare(
          "UPDATE conversations SET revision=revision+1 WHERE id=?",
        ).run(row.conversation_id);
        db.prepare(
          "UPDATE turns SET state='completed',result=?,error=NULL WHERE id=?",
        ).run(stableJSON(committed), id);
        job(row);
        return view(internal(id));
      });
    },
    fail(id, code, { unknown = false } = {}) {
      return tx(() => {
        const row = internal(id);
        if (!["queued", "running", "unknown"].includes(row.state))
          return view(row);
        db.prepare("UPDATE turns SET state=?,error=? WHERE id=?").run(
          unknown ? "unknown" : "failed",
          safeError(code),
          id,
        );
        if (!unknown) job(row);
        return view(internal(id));
      });
    },
    cancel(uid, id) {
      return tx(() => {
        const row = own(uid, id);
        if (["completed", "cancelled", "failed"].includes(row.state))
          return view(row);
        db.prepare(
          "UPDATE turns SET state='cancelled',error=NULL WHERE id=?",
        ).run(id);
        db.prepare(
          "UPDATE conversations SET generation=generation+1 WHERE id=?",
        ).run(row.conversation_id);
        job(row);
        return row.expired
          ? { turnId: id, state: "cancelled", expired: true }
          : view(internal(id));
      });
    },
    cleanupJobs() {
      check();
      return db.prepare("SELECT * FROM cleanup_jobs ORDER BY created").all();
    },
    cleanupAttempt(id) {
      db.prepare(
        "UPDATE cleanup_jobs SET attempts=attempts+1 WHERE turn_id=?",
      ).run(id);
    },
    cleaned(id) {
      return tx(() => {
        const row = internal(id);
        if (["queued", "running", "unknown"].includes(row.state))
          fail("cleanup_unsafe", 409);
        db.prepare("DELETE FROM cleanup_jobs WHERE turn_id=?").run(id);
      });
    },
    pending() {
      check();
      return db
        .prepare(
          "SELECT id,state,run_id,session_id FROM turns WHERE state IN ('queued','running','unknown')",
        )
        .all();
    },
    close() {
      if (closed) return;
      clearInterval(retentionTimer);
      try {
        if (claimed)
          db.prepare("DELETE FROM runtime_owner WHERE id=1 AND nonce=?").run(
            nonce,
          );
      } finally {
        db.close();
        closed = true;
      }
    },
  };
}
