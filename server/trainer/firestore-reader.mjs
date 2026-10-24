import { AsyncLocalStorage } from "node:async_hooks";
import { buildPlanCatalog } from "../../src/services/planCatalog.js";
import { foodNotesSummary } from "../../src/services/foodNotes.js";
import { validDate } from "./drafts.mjs";
import { fail } from "./limits.mjs";
const scope = new AsyncLocalStorage();
export function withOwnerToken(uid, token, fn) {
  if (typeof token !== "string" || !token || token.length > 16000)
    fail("invalid_token", 401);
  return scope.run({ uid, token }, fn);
}
function decode(v, depth = 0) {
  if (
    depth > 30 ||
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).length !== 1
  )
    fail("trusted_read_invalid", 503);
  if ("nullValue" in v) return null;
  if ("booleanValue" in v && typeof v.booleanValue === "boolean")
    return v.booleanValue;
  if ("stringValue" in v && typeof v.stringValue === "string")
    return v.stringValue;
  if ("timestampValue" in v && typeof v.timestampValue === "string")
    return v.timestampValue;
  if ("integerValue" in v || "doubleValue" in v) {
    const n = Number(v.integerValue ?? v.doubleValue);
    if (!Number.isFinite(n)) fail("trusted_read_invalid", 503);
    return n;
  }
  if (v.arrayValue) {
    const values = v.arrayValue.values || [];
    if (!Array.isArray(values) || values.length > 2000)
      fail("trusted_read_invalid", 503);
    return values.map((x) => decode(x, depth + 1));
  }
  if (v.mapValue) {
    return Object.fromEntries(
      Object.entries(v.mapValue.fields || {}).map(([k, x]) => [
        k,
        decode(x, depth + 1),
      ]),
    );
  }
  fail("trusted_read_invalid", 503);
}
// Firebase ID tokens are validated by the HTTP transport first and stay in an
// async request scope. No token is saved, supplied to Hermes, or obtained by ADC.
export function createFirestoreReader({
  project,
  ownerUid,
  profileId,
  fetcher = fetch,
}) {
  if (
    !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project) ||
    ![ownerUid, profileId].every(
      (s) => typeof s === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(s),
    )
  )
    fail("trainer_config", 503);
  const database = `projects/${project}/databases/(default)`,
    base = `https://firestore.googleapis.com/v1/${database}/documents`;
  async function request(method, body, signal, auth) {
    const response = await fetcher(base + ":" + method, {
      method: "POST",
      redirect: "error",
      signal,
      headers: {
        Authorization: "Bearer " + auth.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      await response.body?.cancel();
      fail(
        response.status === 401 ? "invalid_token" : "trusted_read_failed",
        response.status === 401 ? 401 : 503,
      );
    }
    const reader = response.body.getReader(),
      chunks = [];
    let size = 0;
    try {
      for (;;) {
        const r = await reader.read();
        if (r.done) break;
        size += r.value.length;
        if (size > 2 * 1024 * 1024) {
          await reader.cancel();
          fail("trusted_read_invalid", 503);
        }
        chunks.push(r.value);
      }
    } finally {
      reader.releaseLock();
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      fail("trusted_read_invalid", 503);
    }
  }
  async function transaction(uid, signal, fn) {
    const auth = scope.getStore();
    if (uid !== ownerUid || auth?.uid !== uid) fail("pilot_forbidden", 403);
    const bound = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
      : AbortSignal.timeout(5000);
    const begin = await request(
      "beginTransaction",
      { options: { readOnly: {} } },
      bound,
      auth,
    );
    if (
      typeof begin.transaction !== "string" ||
      !begin.transaction ||
      begin.transaction.length > 4000
    )
      fail("trusted_read_invalid", 503);
    async function get(paths) {
      const names = paths.map((p) => database + "/documents/" + p);
      const rows = await request(
        "batchGet",
        { documents: names, transaction: begin.transaction },
        bound,
        auth,
      );
      if (!Array.isArray(rows)) fail("trusted_read_invalid", 503);
      const values = new Map();
      for (const r of rows) {
        const name = r.found?.name || r.missing;
        if (!names.includes(name) || values.has(name))
          fail("trusted_read_invalid", 503);
        values.set(
          name,
          r.found
            ? Object.fromEntries(
                Object.entries(r.found.fields || {}).map(([k, v]) => [
                  k,
                  decode(v),
                ]),
              )
            : null,
        );
      }
      if (values.size !== names.length) fail("trusted_read_invalid", 503);
      return names.map((n) => values.get(n));
    }
    try {
      return await fn(get);
    } finally {
      await request(
        "rollback",
        { transaction: begin.transaction },
        AbortSignal.timeout(2000),
        auth,
      ).catch(() => {});
    }
  }
  return {
    readDay(uid, date, signal) {
      if (!validDate(date)) fail("invalid_date");
      return transaction(uid, signal, async (get) => {
        const [raw, cap] = await get([
          `users/${uid}/mealHistory/${date}`,
          `releaseCapabilities/${uid}`,
        ]);
        const day = raw || { meals: {}, revision: 0 },
          ids = Object.keys(day.foodNotes || {});
        if (
          ids.length > 1000 ||
          ids.some((id) => !/^[-a-zA-Z0-9_]{17,161}$/.test(id))
        )
          fail("trusted_read_invalid", 503);
        const notes = ids.length
          ? await get(ids.map((id) => `users/${uid}/foodNotes/${id}`))
          : [];
        if (
          notes.some((n) => !n || n.state !== "active" || n.targetDate !== date)
        )
          fail("note_conflict", 409);
        const summary = foodNotesSummary(
          notes.map((n, i) => ({ ...n, noteId: ids[i] })),
        );
        return {
          ...day,
          ...summary,
          notesEnabled:
            cap?.notesEnabled === true && cap.minimumWriterVersion === 3,
        };
      });
    },
    readPlan(uid, signal) {
      return transaction(uid, signal, async (get) => {
        const [root] = await get([`users/${uid}`]),
          profile = root?.users?.[profileId];
        if (!profile) fail("profile_missing", 409);
        const planContext = {
          profile: {
            portions: profile.portions || {},
            customProducts: profile.customProducts || {},
            hiddenProducts: profile.hiddenProducts || [],
          },
          globalCustomProducts: root.globalCustomProducts || {},
          productOverrides: root.productOverrides || {},
        };
        return { planContext, catalog: buildPlanCatalog(planContext) };
      });
    },
  };
}
