import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { openSync, closeSync, existsSync, lstatSync, realpathSync } from "node:fs";
import { dirname } from "node:path";

const refusal = () => { throw Error("free_stt_ledger_invalid"); };
const reply = (value, status = 200) => Response.json(value, { status });
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== "ESRCH"; } };
// Separate zero-cost limiter. It cannot reserve money, parse food, or open the
// historical Anthropic ledger. This retains the existing shared Groq Free
// policy: 6/minute, 30/UTC day, one unfinished request younger than 65 seconds.
export function openFreeSttLedger(file, { initialize = false, now = Date.now } = {}) {
  const parent = dirname(file), info = lstatSync(parent);
  if (!file.startsWith("/") || realpathSync(parent) !== parent || !info.isDirectory() || info.uid !== process.getuid() || info.mode & 0o077) refusal();
  if (initialize) closeSync(openSync(file, "wx", 0o600));
  if (!existsSync(file)) refusal();
  const identity = lstatSync(file);
  if (realpathSync(file) !== file || !identity.isFile() || identity.nlink !== 1 || identity.uid !== process.getuid() || identity.mode & 0o077) refusal();
  const db = new DatabaseSync(file), nonce = randomUUID(); let closed = false, claimed = false;
  const check = () => {
    if (closed) refusal(); const stat = lstatSync(file);
    if (stat.ino !== identity.ino || stat.dev !== identity.dev || stat.mode & 0o077 || stat.nlink !== 1 || realpathSync(file) !== file) refusal();
  };
  const transaction = fn => { check(); db.exec("BEGIN IMMEDIATE"); try { const value = fn(); db.exec("COMMIT"); return value; } catch (error) { db.exec("ROLLBACK"); throw error; } };
  try {
    db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON;");
    if (initialize) db.exec("CREATE TABLE free_stt_meta(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL,scope TEXT NOT NULL); INSERT INTO free_stt_meta VALUES(1,1,'scisense-groq-free-v1'); CREATE TABLE free_stt_calls(id TEXT PRIMARY KEY,uid TEXT NOT NULL,started INTEGER NOT NULL,finished INTEGER); CREATE INDEX free_stt_time ON free_stt_calls(started); CREATE TABLE free_stt_owner(id INTEGER PRIMARY KEY CHECK(id=1),pid INTEGER NOT NULL,nonce TEXT NOT NULL);");
    if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok") refusal();
    const meta = db.prepare("SELECT version,scope FROM free_stt_meta WHERE id=1").get();
    if (meta?.version !== 1 || meta.scope !== "scisense-groq-free-v1") refusal();
    db.prepare("SELECT id,uid,started,finished FROM free_stt_calls LIMIT 1").get();
    transaction(() => {
      const owner = db.prepare("SELECT pid FROM free_stt_owner WHERE id=1").get(); if (owner && alive(owner.pid)) refusal();
      db.prepare("INSERT OR REPLACE INTO free_stt_owner VALUES(1,?,?)").run(process.pid, nonce); claimed = true;
    });
    const fetch = async request => {
      try {
        check(); const body = await request.json();
        if (!body || typeof body !== "object" || Array.isArray(body) || !/^[A-Za-z0-9-]{16,80}$/.test(body.id || "")) return reply({ error: "invalid_request" }, 400);
        if (body.action === "finish" && Object.keys(body).every(key => ["action", "id"].includes(key))) {
          transaction(() => db.prepare("UPDATE free_stt_calls SET finished=COALESCE(finished,?) WHERE id=?").run(now(), body.id));
          return reply({ ok: true });
        }
        if (body.action !== "reserve" || body.cost !== 0 || !/^[a-f0-9]{64}$/.test(body.uid || "") || Object.keys(body).some(key => !["action", "id", "uid", "cost"].includes(key))) return reply({ error: "budget_disabled" }, 503);
        return transaction(() => {
          if (db.prepare("SELECT 1 FROM free_stt_calls WHERE id=?").get(body.id)) return reply({ error: "request_reused" }, 409);
          const stamp = now(), day = Math.floor(stamp / 86400000) * 86400000;
          const rows = db.prepare("SELECT started,finished FROM free_stt_calls WHERE started>=?").all(Math.min(day, stamp - 65000));
          if (rows.filter(row => row.started > stamp - 60000).length >= 6 || rows.filter(row => row.started >= day).length >= 30 || rows.some(row => row.finished === null && row.started > stamp - 65000)) return reply({ error: "rate_limited" }, 429);
          db.prepare("INSERT INTO free_stt_calls VALUES(?,?,?,NULL)").run(body.id, body.uid, stamp);
          return reply({ ok: true });
        });
      } catch { return reply({ error: "limiter_unavailable" }, 503); }
    };
    return Object.freeze({ binding: { idFromName: name => name, get: () => ({ fetch }) },
      close() { if (closed) return; try { if (claimed) db.prepare("DELETE FROM free_stt_owner WHERE id=1 AND nonce=?").run(nonce); } finally { closed = true; db.close(); } },
    });
  } catch (error) { try { if (claimed) db.prepare("DELETE FROM free_stt_owner WHERE id=1 AND nonce=?").run(nonce); } finally { db.close(); } throw error; }
}
