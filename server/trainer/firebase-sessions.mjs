import { randomUUID } from "node:crypto";
import { createFirebaseAuthenticator } from "../../workers/meal-parser/src/auth.js";
import { abortable } from "./deadline.mjs";
const required = () => Error("data_auth_required");
const token = value => typeof value === "string" && value.length >= 16 && value.length <= 16384 && !/[\s\0]/.test(value);
async function boundedJSON(response) {
  const reader = response.body?.getReader(); if (!reader) throw required();
  const parts = []; let size = 0;
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; if ((size += value.length) > 65536) throw required(); parts.push(Buffer.from(value)); }
    return JSON.parse(Buffer.concat(parts).toString());
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

// A normal Firebase user session, not a service-account/admin grant. The token
// can technically exercise that user's Firebase rules. Only this fixed reader
// receives it; model/tools/Desktop have no access to its value or HTTP API.
export function createFirebaseSessions({ profiles, project, apiKey, storeFor,
  fetcher = fetch, now = Date.now, verifyToken = createFirebaseAuthenticator({ now }) }) {
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project) || typeof apiKey !== "string" || !/^[A-Za-z0-9_-]{16,160}$/.test(apiKey)) throw Error("data_session_config_invalid");
  const stores = new Map(), locks = new Map(), controllers = new Set(); let closed = false, closing;
  const store = uid => { profiles.resolve(uid); if (closed) throw required(); if (!stores.has(uid)) stores.set(uid, storeFor(uid)); return stores.get(uid); };
  function serial(uid, fn) {
    profiles.resolve(uid); if (closed) return Promise.reject(required());
    const task = (locks.get(uid) ?? Promise.resolve()).catch(() => {}).then(() => { if (closed) throw required(); return fn(store(uid)); });
    locks.set(uid, task); task.finally(() => { if (locks.get(uid) === task) locks.delete(uid); }).catch(() => {}); return task;
  }
  async function checked(uid, idToken, expiresIn) {
    if (!token(idToken)) throw required();
    let actual, claims;
    try {
      actual = await verifyToken(new Request("https://ntzg.pp.ua/session", { headers: { Authorization: `Bearer ${idToken}` } }), { FIREBASE_PROJECT: project });
      claims = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());
    } catch { throw required(); }
    if (actual !== uid || claims.sub !== uid || claims.aud !== project || claims.iss !== `https://securetoken.google.com/${project}` || !Number.isFinite(claims.exp)) throw required();
    const lifetime = Number(expiresIn); if (!Number.isInteger(lifetime) || lifetime < 1 || lifetime > 86400) throw required();
    const expiresAt = Math.min(claims.exp * 1000, now() + lifetime * 1000);
    if (expiresAt <= now()) throw required();
    return { idToken, expiresAt };
  }
  async function exchange(uid, refreshToken) {
    if (!token(refreshToken)) throw required();
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 5000); controllers.add(controller);
    try {
      const response = await fetcher(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, { method: "POST", redirect: "error", signal: controller.signal,
        headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString() });
      if (!response.ok) throw required();
      const value = await boundedJSON(response);
      if (value.user_id !== uid || value.token_type !== "Bearer" || !token(value.refresh_token)) throw required();
      return { version: 1, uid, project, refreshToken: value.refresh_token, ...await checked(uid, value.id_token, value.expires_in) };
    } catch { throw required(); }
    finally { clearTimeout(timer); controllers.delete(controller); }
  }
  const files = value => ({ "session.json": Buffer.from(JSON.stringify(value)) });
  function restore(uid, vault) {
    const restored = vault.restore(); let value;
    try { value = JSON.parse(restored.files["session.json"].toString()); }
    catch { throw required(); }
    finally { for (const bytes of Object.values(restored.files)) bytes.fill(0); }
    if (value?.version !== 1 || value.uid !== uid || value.project !== project || !token(value.refreshToken) || !token(value.idToken) || !Number.isFinite(value.expiresAt)) throw required();
    return { revision: restored.revision, value };
  }
  const write = (vault, value, options) => { const data = files(value); try { return vault.checkpoint(data, options); } finally { data["session.json"].fill(0); } };
  return Object.freeze({
    status(uid) { const value = store(uid).status(); return { phase: value.phase === "ready" ? "connected" : "reauth_required" }; },
    async connect(uid, { refreshToken } = {}, { ownerToken } = {}) {
      return serial(uid, async vault => {
        // The bearer proof and the exchanged refresh token must independently
        // resolve to the same already verified SciSense UID.
        await checked(uid, ownerToken, 3600);
        const old = vault.status(); if (old.phase === "refresh_pending") throw required();
        let refresh;
        // Reconnecting the same chain is itself a rotation. Persist its pending
        // marker before sending it, just as a timed refresh does.
        if (old.phase === "ready" && restore(uid, vault).value.refreshToken === refreshToken) {
          const refreshId = randomUUID(), pending = vault.beginRefresh(refreshId, { expectedRevision: old.revision });
          refresh = { expectedRevision: pending.revision, refreshId, rotationCommitted: true };
        }
        let value;
        try { value = await exchange(uid, refreshToken); }
        catch (error) { if (refresh) { const current = vault.status(); vault.requireReauth({ expectedRevision: current.revision }); } throw error; }
        const data = files(value);
        try {
          if (refresh) vault.checkpoint(data, refresh);
          else if (old.phase === "empty") vault.initialize(data);
          else if (old.phase === "ready") vault.checkpoint(data, { expectedRevision: old.revision });
          else if (old.phase === "reauth_required") vault.reauthorize(data, { expectedRevision: old.revision });
          else throw required();
        } finally { data["session.json"].fill(0); }
        return { phase: "connected" };
      });
    },
    async getToken(uid, signal) {
      if (signal?.aborted) throw required();
      const task = serial(uid, async vault => {
        let saved;
        try { saved = restore(uid, vault); } catch { throw required(); }
        if (saved.value.expiresAt > now() + 60000) return saved.value.idToken;
        const refreshId = randomUUID(), pending = vault.beginRefresh(refreshId, { expectedRevision: saved.revision });
        try {
          const value = await exchange(uid, saved.value.refreshToken);
          write(vault, value, { expectedRevision: pending.revision, refreshId, rotationCommitted: true });
          return value.idToken;
        } catch {
          try { const current = vault.status(); if (current.phase === "refresh_pending") vault.requireReauth({ expectedRevision: current.revision }); } catch { /* pending restart fails closed */ }
          throw required();
        }
      });
      return signal ? abortable(task, signal) : task;
    },
    async disconnect(uid) { return serial(uid, vault => { const old = vault.status(); vault.clear({ expectedRevision: old.revision }); return { phase: "disconnected" }; }); },
    close() {
      return closing ??= (async () => {
        closed = true; for (const controller of controllers) controller.abort(); await Promise.allSettled(locks.values());
        let failed = false;
        try { for (const vault of stores.values()) { try { vault.close(); } catch { failed = true; } } }
        finally { stores.clear(); }
        if (failed) throw Error("data_session_close_failed");
      })();
    },
  });
}
