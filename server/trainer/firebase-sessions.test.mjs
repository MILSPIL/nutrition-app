import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, realpathSync, chmodSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openPersonalCredentials } from "./personal-credentials.mjs";
import { createFirebaseSessions } from "./firebase-sessions.mjs";
const project = "synthetic-firebase", apiKey = "synthetic-public-api-key";
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "scisense-firebase-session-"))); chmodSync(root, 0o700);
  const key = randomBytes(32), vaults = new Map(), calls = [], rejects = new Set(); let clock = 2000000000000, fail = false, foreign = false, verifierCalls = 0, checkpointFault = false, closeFault = false;
  const closed = [];
  const jwt = (uid, ttl = 3600) => "synthetic." + Buffer.from(JSON.stringify({ sub: uid, aud: project, iss: `https://securetoken.google.com/${project}`, exp: clock / 1000 + ttl })).toString("base64url") + ".signature";
  const profiles = { resolve(uid) { if (!["owner", "wife"].includes(uid)) throw Error("pilot_forbidden"); return { uid }; } };
  const storeFor = uid => { const vault = openPersonalCredentials(join(root, uid + ".sqlite"), { key, fundingOwnerUid: uid, purpose: "firebase-session" }); vaults.set(uid, vault); return { ...vault, checkpoint(...args) { if (checkpointFault) { checkpointFault = false; throw Error("synthetic_io_fault"); } return vault.checkpoint(...args); }, close() { closed.push(uid); vault.close(); if (closeFault && uid === "owner") throw Error("synthetic_io_fault"); } }; };
  const fetcher = async (url, options) => {
    const form = new URLSearchParams(options.body), refresh = form.get("refresh_token");
    calls.push({ url, method: options.method, refresh });
    if (fail) throw Error("Bearer synthetic-do-not-publish");
    const uid = foreign ? "wife" : refresh.includes("wife") ? "wife" : "owner";
    return Response.json({ token_type: "Bearer", user_id: uid, project_id: "1234567890", expires_in: "3600", refresh_token: refresh + "-rotated", id_token: jwt(uid) });
  };
  const verifyToken = async request => { verifierCalls++; const id = request.headers.get("Authorization").slice(7); if (rejects.has(id)) throw Error("unauthorized"); return JSON.parse(Buffer.from(id.split(".")[1], "base64url").toString()).sub; };
  const make = () => createFirebaseSessions({ profiles, project, apiKey, storeFor, fetcher, verifyToken, now: () => clock });
  const sessions = make(); t.after(async () => { if (closeFault) await sessions.close().catch(() => {}); else await sessions.close(); for (const value of vaults.values()) value.close(); key.fill(0); rmSync(root, { recursive: true, force: true }); });
  return { root, key, sessions, vaults, calls, jwt, rejects, closed, failCheckpoint() { checkpointFault = true; }, failClose() { closeFault = true; }, get verifierCalls() { return verifierCalls; }, advance() { clock += 3600 * 1000; }, fail() { fail = true; }, foreign() { foreign = true; }, make,
    connect: uid => sessions.connect(uid, { refreshToken: "synthetic-refresh-token-" + uid }, { ownerToken: jwt(uid) }) };
}

test("per-UID verified delegated session is encrypted and never returned to UI", async t => {
  const f = fixture(t);
  assert.deepEqual(await f.connect("owner"), { phase: "connected" });
  assert.deepEqual(f.sessions.status("owner"), { phase: "connected" });
  assert.deepEqual(f.sessions.status("wife"), { phase: "reauth_required" });
  const id = await f.sessions.getToken("owner"); assert.equal(id, f.jwt("owner"));
  const bytes = readFileSync(join(f.root, "owner.sqlite"));
  assert.equal(bytes.includes(Buffer.from("synthetic-refresh-token")), false); assert.equal(bytes.includes(Buffer.from(id)), false);
  assert.equal(f.calls.length, 1); assert.equal(f.verifierCalls, 2);
  await assert.rejects(f.sessions.getToken("foreign"), /pilot_forbidden/);
});

test("a refresh token for another user cannot be bound by an authenticated account", async t => {
  const f = fixture(t); f.foreign();
  await assert.rejects(f.connect("owner"), /^Error: data_auth_required$/);
  assert.equal(f.vaults.get("owner").status().phase, "empty");
  assert.equal(f.calls.length, 1);
});

test("JWT signature verifier rejection prevents the refresh exchange", async t => {
  const f = fixture(t); f.rejects.add(f.jwt("owner"));
  await assert.rejects(f.connect("owner"), /data_auth_required/);
  assert.equal(f.calls.length, 0);
});

test("concurrent readers serialize refresh and persist its rotated chain before use", async t => {
  const f = fixture(t); await f.connect("owner"); f.advance();
  const values = await Promise.all([f.sessions.getToken("owner"), f.sessions.getToken("owner"), f.sessions.getToken("owner")]);
  assert.ok(values.every(value => value === f.jwt("owner"))); assert.equal(f.calls.length, 2);
  const material = f.vaults.get("owner").restore();
  try { assert.equal(JSON.parse(material.files["session.json"].toString()).refreshToken, "synthetic-refresh-token-owner-rotated-rotated"); }
  finally { material.files["session.json"].fill(0); }
  assert.equal(f.vaults.get("owner").status().phase, "ready");
});

test("uncertain refresh stops rather than retries the previous chain", async t => {
  const f = fixture(t); await f.connect("owner"); f.advance(); f.fail();
  await assert.rejects(f.sessions.getToken("owner"), /^Error: data_auth_required$/);
  assert.equal(f.vaults.get("owner").status().phase, "reauth_required");
  await assert.rejects(f.sessions.getToken("owner"), /^Error: data_auth_required$/); assert.equal(f.calls.length, 2);
});

test("disconnect and service restart preserve account isolation and revocation", async t => {
  const f = fixture(t); await f.connect("owner"); await f.connect("wife");
  await f.sessions.disconnect("owner"); await f.sessions.close();
  const next = f.make(); t.after(() => next.close());
  await assert.rejects(next.getToken("owner"), /data_auth_required/); assert.equal(await next.getToken("wife"), f.jwt("wife"));
  assert.equal(f.calls.length, 2);
});

test("credential purpose domains cannot decrypt each other's ciphertext", t => {
  const f = fixture(t), file = join(f.root, "purpose.sqlite");
  const vault = openPersonalCredentials(file, { key: f.key, fundingOwnerUid: "owner", purpose: "firebase-session" });
  vault.initialize({ "session.json": Buffer.from('{"synthetic":"private"}') }); vault.close();
  const before = readFileSync(file);
  assert.throws(() => openPersonalCredentials(file, { key: f.key, fundingOwnerUid: "owner" }), /connection_key_invalid/);
  assert.deepEqual(readFileSync(file), before);
});


test("uncertain reconnect of the same refresh chain durably requires sign-in", async t => {
  const f = fixture(t); await f.connect("owner"); f.fail();
  await assert.rejects(f.sessions.connect("owner", { refreshToken: "synthetic-refresh-token-owner-rotated" }, { ownerToken: f.jwt("owner") }), /data_auth_required/);
  assert.equal(f.vaults.get("owner").status().phase, "reauth_required");
  await assert.rejects(f.sessions.getToken("owner"), /data_auth_required/); assert.equal(f.calls.length, 2);
});


test("failed checkpoint cannot resend a refresh-pending chain on reconnect", async t => {
  const f = fixture(t); await f.connect("owner"); f.failCheckpoint();
  const body = { refreshToken: "synthetic-refresh-token-owner-rotated" }, options = { ownerToken: f.jwt("owner") };
  await assert.rejects(f.sessions.connect("owner", body, options), /synthetic_io_fault/);
  assert.equal(f.vaults.get("owner").status().phase, "refresh_pending");
  await assert.rejects(f.sessions.connect("owner", body, options), /data_auth_required/);
  assert.equal(f.calls.length, 2);
});

test("shutdown closes both UID vaults even when the first close fails", async t => {
  const f = fixture(t); await f.connect("owner"); await f.connect("wife"); f.failClose();
  await assert.rejects(f.sessions.close(), /^Error: data_session_close_failed$/);
  assert.deepEqual(f.closed, ["owner", "wife"]);
  await assert.rejects(f.sessions.getToken("wife"), /data_auth_required/);
});
