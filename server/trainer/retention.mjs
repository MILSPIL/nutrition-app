import { existsSync } from "node:fs";
import { createHmac } from "node:crypto";
import { privateRead, privateWrite, privateAppend } from "./private-files.mjs";
import { fail, LIMITS, stableJSON } from "./limits.mjs";
// Keep this journal and its high-water anchor OUTSIDE SQLite backups. Restoring
// the database without the current pair is deliberately refused.
export function attachRetention({ db, file, key, now, fresh }) {
  const log = file + ".deletions.jsonl",
    anchor = file + ".deletions.anchor";
  const mac = (v) =>
    createHmac("sha256", key).update(stableJSON(v)).digest("hex");
  db.exec(`CREATE TABLE IF NOT EXISTS deletion_watermark(id INTEGER PRIMARY KEY CHECK(id=1),seq INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS closed_conversations(id TEXT PRIMARY KEY,owner_hmac TEXT NOT NULL,at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS tombstones(kind TEXT NOT NULL,id TEXT NOT NULL,owner_hmac TEXT NOT NULL,payload_hmac TEXT NOT NULL,state TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(kind,id));`);
  if (!db.prepare("SELECT 1 FROM deletion_watermark").get())
    db.prepare("INSERT INTO deletion_watermark VALUES(1,0)").run();
  if (!existsSync(log) || !existsSync(anchor)) {
    if (!fresh || existsSync(log) || existsSync(anchor))
      fail("deletion_manifest_missing", 503);
    privateWrite(log, "");
    privateWrite(
      anchor,
      JSON.stringify({ seq: 0, head: "", hmac: mac({ seq: 0, head: "" }) }),
    );
  }
  const load = () => {
    let rows, a;
    try {
      rows = privateRead(log)
        .toString()
        .split("\n")
        .filter(Boolean)
        .map(JSON.parse);
      a = JSON.parse(privateRead(anchor));
    } catch {
      fail("deletion_manifest_invalid", 503);
    }
    let head = "",
      seq = 0;
    for (const r of rows) {
      const { hmac, ...body } = r;
      if (
        body.seq !== ++seq ||
        body.previous !== head ||
        hmac !== mac(body) ||
        !["turn", "draft", "context", "conversation", "composer"].includes(
          body.kind,
        )
      )
        fail("deletion_manifest_invalid", 503);
      head = hmac;
    }
    if (
      a.hmac !== mac({ seq: a.seq, head: a.head }) ||
      a.seq > seq ||
      (a.seq ? rows[a.seq - 1]?.hmac : "") !== a.head ||
      db.prepare("SELECT seq FROM deletion_watermark").get().seq > seq
    )
      fail("deletion_manifest_rollback", 503);
    if (a.seq < seq)
      privateWrite(
        anchor,
        JSON.stringify({ seq, head, hmac: mac({ seq, head }) }),
      );
    return rows;
  };
  let rows = load(),
    busy = false;
  const append = (record) => {
    const body = {
        seq: rows.length + 1,
        previous: rows.at(-1)?.hmac || "",
        ...record,
      },
      row = { ...body, hmac: mac(body) };
    privateAppend(log, JSON.stringify(row) + "\n");
    const a = { seq: row.seq, head: row.hmac };
    privateWrite(anchor, JSON.stringify({ ...a, hmac: mac(a) }));
    rows.push(row);
    return row;
  };
  const ownerHash = (owner) => mac({ owner });
  function wipeTurn(id) {
    const t = db.prepare("SELECT * FROM turns WHERE id=?").get(id);
    if (!t) return;
    const input = JSON.parse(t.input);
    db.prepare(
      "UPDATE turns SET snapshot='{}',input=?,result=NULL,expired=1 WHERE id=?",
    ).run(JSON.stringify({ media: input.media || [] }), id);
    db.prepare("DELETE FROM messages WHERE turn_id=?").run(id);
    db.prepare("DELETE FROM proposals WHERE turn_id=?").run(id);
    db.prepare("DELETE FROM context_proposals WHERE turn_id=?").run(id);
    // Keep opaque native execution/cleanup identity until the worker has stopped.
    if (
      !["queued", "running", "unknown"].includes(t.state) &&
      !db.prepare("SELECT 1 FROM cleanup_jobs WHERE turn_id=?").get(id)
    ) {
      db.prepare("DELETE FROM leases WHERE turn_id=?").run(id);
      db.prepare("DELETE FROM call_receipts WHERE turn_id=?").run(id);
      db.prepare("DELETE FROM turns WHERE id=?").run(id);
    }
  }
  function apply(r) {
    if (r.kind === "conversation") {
      db.prepare(
        "INSERT OR IGNORE INTO closed_conversations VALUES(?,?,?)",
      ).run(r.id, r.owner_hmac, r.at);
      db.prepare(
        'UPDATE conversations SET owner=?,composer=\'{"text":"","revision":0}\',draft=NULL,generation=generation+1 WHERE id=? AND owner NOT LIKE \'closed:%\'',
      ).run("closed:" + r.id, r.id);
      for (const t of db
        .prepare("SELECT * FROM turns WHERE conversation_id=?")
        .all(r.id)) {
        db.prepare("INSERT OR IGNORE INTO tombstones VALUES(?,?,?,?,?,?)").run(
          "turn",
          t.id,
          r.owner_hmac,
          t.payload_hmac,
          t.state,
          r.at,
        );
        wipeTurn(t.id);
      }
      db.prepare("DELETE FROM drafts WHERE conversation_id=?").run(r.id);
      db.prepare("DELETE FROM messages WHERE conversation_id=?").run(r.id);
      db.prepare("DELETE FROM context_proposals WHERE conversation_id=?").run(
        r.id,
      );
      db.prepare(
        "UPDATE save_commands SET command=NULL WHERE conversation_id=?",
      ).run(r.id);
    } else {
      db.prepare("INSERT OR IGNORE INTO tombstones VALUES(?,?,?,?,?,?)").run(
        r.kind,
        r.id,
        r.owner_hmac,
        r.payload_hmac || "",
        r.state || "expired",
        r.at,
      );
      if (r.kind === "composer") {
        const c = db
          .prepare("SELECT composer FROM conversations WHERE id=?")
          .get(r.conversationId);
        if (c && JSON.parse(c.composer).revision <= r.revision)
          db.prepare("UPDATE conversations SET composer=? WHERE id=?").run(
            JSON.stringify({
              text: "",
              revision: r.revision + 1,
              updatedAt: r.at,
            }),
            r.conversationId,
          );
      }
      if (r.kind === "turn") wipeTurn(r.id);
      if (r.kind === "draft") {
        db.prepare("DELETE FROM drafts WHERE id=?").run(r.id);
        db.prepare(
          "UPDATE save_commands SET command=NULL WHERE draft_id=?",
        ).run(r.id);
      }
      if (r.kind === "context")
        db.prepare("DELETE FROM context_proposals WHERE id=?").run(r.id);
    }
    db.prepare("UPDATE deletion_watermark SET seq=max(seq,?) WHERE id=1").run(
      r.seq,
    );
  }
  function synchronize(extra) {
    if (busy) return;
    busy = true;
    db.exec("BEGIN IMMEDIATE");
    try {
      // Recheck the external chain before every public operation. A replaced/missing
      // manifest is an error, never a reason to skip deletion or start a fresh log.
      rows = load();
      const watermark = db
        .prepare("SELECT seq FROM deletion_watermark")
        .get().seq;
      for (const r of rows) if (r.seq > watermark) apply(r);
      const cutoff = now() - LIMITS.retentionMs;
      for (const c of db
        .prepare("SELECT * FROM conversations WHERE owner NOT LIKE 'closed:%'")
        .all()) {
        const composer = JSON.parse(c.composer);
        if (composer.text && (composer.updatedAt || c.created) <= cutoff)
          apply(
            append({
              kind: "composer",
              id: c.id + ":" + composer.revision,
              conversationId: c.id,
              revision: composer.revision,
              owner_hmac: ownerHash(c.owner),
              payload_hmac: mac(composer.text),
              at: now(),
            }),
          );
      }
      const record = (kind, r) => {
        if (
          db
            .prepare("SELECT 1 FROM tombstones WHERE kind=? AND id=?")
            .get(kind, r.id)
        )
          return;
        apply(
          append({
            kind,
            id: r.id,
            owner_hmac: ownerHash(r.owner),
            payload_hmac: r.payload_hmac || "",
            state: r.state || "expired",
            at: now(),
          }),
        );
      };
      for (const r of db
        .prepare(
          "SELECT t.*,c.owner FROM turns t JOIN conversations c ON c.id=t.conversation_id WHERE t.created<=?",
        )
        .all(cutoff))
        record("turn", r);
      for (const r of db
        .prepare(
          "SELECT d.id,c.owner FROM drafts d JOIN conversations c ON c.id=d.conversation_id WHERE d.updated<=?",
        )
        .all(cutoff))
        record("draft", r);
      for (const r of db
        .prepare(
          "SELECT p.id,c.owner FROM context_proposals p JOIN conversations c ON c.id=p.conversation_id WHERE p.created<=?",
        )
        .all(cutoff))
        record("context", r);
      for (const r of db.prepare("SELECT id FROM turns WHERE expired=1").all())
        wipeTurn(r.id);
      if (extra) extra();
      for (const c of db
        .prepare(
          "SELECT * FROM conversations WHERE created<=? AND owner NOT LIKE 'closed:%'",
        )
        .all(cutoff)) {
        if (
          db
            .prepare(
              "SELECT 1 FROM turns WHERE conversation_id=? AND state IN ('queued','running','unknown')",
            )
            .get(c.id) ||
          db
            .prepare("SELECT 1 FROM drafts WHERE conversation_id=?")
            .get(c.id) ||
          db.prepare("SELECT 1 FROM messages WHERE conversation_id=?").get(c.id)
        )
          continue;
        const composer = JSON.parse(c.composer);
        if (composer.text && (composer.updatedAt || c.created) > cutoff)
          continue;
        apply(
          append({
            kind: "conversation",
            id: c.id,
            owner_hmac: ownerHash(c.owner),
            at: now(),
          }),
        );
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    } finally {
      busy = false;
    }
  }
  return {
    sync: () => synchronize(),
    forget(uid, id) {
      synchronize(() => {
        const c = db
          .prepare("SELECT owner FROM conversations WHERE id=?")
          .get(id);
        if (c?.owner !== uid) fail("not_found", 404);
        apply(
          append({
            kind: "conversation",
            id,
            owner_hmac: ownerHash(uid),
            at: now(),
          }),
        );
      });
    },
    gone(id, kind = "turn") {
      return !!db
        .prepare("SELECT 1 FROM tombstones WHERE kind=? AND id=?")
        .get(kind, id);
    },
    closed(id) {
      return !!db
        .prepare("SELECT 1 FROM closed_conversations WHERE id=?")
        .get(id);
    },
    expiredPending() {
      return db
        .prepare(
          "SELECT turns.id,owner,state FROM turns JOIN conversations ON conversations.id=turns.conversation_id WHERE expired=1 AND state IN ('queued','running','unknown')",
        )
        .all();
    },
  };
}
