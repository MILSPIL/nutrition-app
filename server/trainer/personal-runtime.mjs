import { DatabaseSync } from "node:sqlite";
import { createHmac } from "node:crypto";
import { mkdirSync, lstatSync, realpathSync, existsSync, statfsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { createPersonalEphemeralSweeper } from "./personal-ephemeral.mjs";
import { personalProfiles } from "./personal-profiles.mjs";
import { privateRead, privateWrite, privateDirectory } from "./private-files.mjs";
import { openPersonalStore } from "./personal-store.mjs";
import { openPersonalCredentials } from "./personal-credentials.mjs";
import { openTurnStore } from "./turn-store.mjs";
import { createPersonalPayer } from "./personal-payer.mjs";
import { createPersonalProcess } from "./personal-process.mjs";
import { createPersonalCoordinator } from "./personal-coordinator.mjs";
import { createPersonalDesktopAdapter } from "./personal-desktop-adapter.mjs";
import { createPersonalBackend } from "./personal-backend.mjs";
import { createPersonalContext } from "./personal-context.mjs";
import { createFirebaseSessions } from "./firebase-sessions.mjs";
import { createFirestoreReader } from "./firestore-reader.mjs";
import { createTrainerTools } from "./tools.mjs";
import { createTrainerGateway } from "./gateway.mjs";
import { createMediaStore } from "./media.mjs";
import { openFoodIndex } from "./food-lookup.mjs";
import { buildSnapshot } from "./snapshot.mjs";
import { stableJSON } from "./limits.mjs";
import { PERSONAL_LIMITS } from "./personal-limits.mjs";
import { openProblemJournal, disabledProblemJournal, turnProblemRecorder } from "./problem-journal.mjs";

const fail = () => { throw Error("personal_runtime_invalid"); };
const response = value => Response.json(value, { headers: { "Cache-Control": "no-store" } });
const derive = (key, name) => createHmac("sha256", key).update("scisense-personal-runtime-v1:" + name).digest();
const keyValid = key => { if (!Buffer.isBuffer(key) || key.length !== 32) fail(); };
function owned(path, directory = false) {
  const stat = lstatSync(path);
  if (realpathSync(path) !== path || stat.uid !== process.getuid() || stat.mode & 0o077 ||
      (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)) fail();
}
export function personalRuntimePaths(root, profiles, index, { ephemeralRoot } = {}) {
  if (typeof root !== "string" || !root.startsWith("/") || root === "/" || resolve(root) !== root) fail();
  if (ephemeralRoot !== undefined && (typeof ephemeralRoot !== "string" || !ephemeralRoot.startsWith("/") || resolve(ephemeralRoot) !== ephemeralRoot || ephemeralRoot === "/" || ephemeralRoot === root || ephemeralRoot.startsWith(root + "/") || root.startsWith(ephemeralRoot + "/"))) fail();
  return { root, ephemeralRoot, marker: join(root, "provisioned.json"), native: join(root, "native.sqlite"), outbox: join(root, "outbox.sqlite"), index,
    account: uid => { profiles.resolve(uid); const base = join(root, "accounts", uid); return { base, turns: join(base, "turns.sqlite"), session: join(base, "firebase.sqlite"), media: ephemeralRoot ? join(ephemeralRoot, uid) : join(base, "media") }; } };
}
const provisionValue = profiles => ({ version: 1, fundingOwner: profiles.entries()[0].fundingOwner,
  profiles: profiles.entries().map(({ uid, profileId, home, socket }) => ({ uid, profileId, home, socket })) });
function schema(file, checks) {
  let db;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok") fail();
    for (const query of checks) if (!db.prepare(query).get()) fail();
  } catch { fail(); } finally { db?.close(); }
}
function verifyProvision(paths, profiles) {
  owned(paths.root, true); owned(paths.marker);
  if (stableJSON(JSON.parse(privateRead(paths.marker))) !== stableJSON(provisionValue(profiles))) fail();
  owned(paths.native); owned(paths.outbox);
  schema(paths.native, ["SELECT 1 FROM connection_state WHERE id=1", "SELECT COUNT(*) FROM connection_owner"]);
  schema(paths.outbox, ["SELECT 1 FROM personal_meta WHERE id=1 AND version=1", "SELECT COUNT(*) FROM personal_attempts", "SELECT COUNT(*) FROM personal_turn_budgets", "SELECT COUNT(*) FROM personal_inputs", "SELECT COUNT(*) FROM personal_owner"]);
  for (const { uid } of profiles.entries()) {
    const p = paths.account(uid); owned(p.base, true); if (!paths.ephemeralRoot) owned(p.media, true);
    for (const file of [p.session, p.turns, p.turns + ".deletions.anchor", p.turns + ".deletions.jsonl"]) owned(file);
    schema(p.session, ["SELECT 1 FROM connection_state WHERE id=1", "SELECT COUNT(*) FROM connection_owner"]);
    schema(p.turns, ["SELECT 1 FROM trainer_meta WHERE version=1", "SELECT 1 FROM deletion_watermark WHERE id=1",
      ...["runtime_owner", "conversations", "turns", "leases", "messages", "call_receipts", "cleanup_jobs", "first_admissions", "turn_days", "draft_previews", "drafts", "proposals", "save_commands", "context_proposals", "closed_conversations", "tombstones"].map(table => "SELECT COUNT(*) FROM " + table)]);
  }
}
export function preparePersonalEphemeral(paths, profiles) {
  if (!paths.ephemeralRoot) return;
  if (!existsSync(paths.ephemeralRoot)) {
    const parent = dirname(paths.ephemeralRoot), info = lstatSync(parent);
    // The API runtime parent also publishes group-protected Desktop sockets.
    // Only this exact traversal mode is allowed; all media children stay 0700.
    if (realpathSync(parent) !== parent || info.uid !== process.getuid() || !info.isDirectory() || ![0o700, 0o711].includes(info.mode & 0o7777)) fail();
    mkdirSync(paths.ephemeralRoot, { mode: 0o700 });
  }
  owned(paths.ephemeralRoot, true);
  if (statfsSync(paths.ephemeralRoot).type !== 0x01021994) fail();
  for (const { uid } of profiles.entries()) {
    const path = paths.account(uid).media;
    if (!existsSync(path)) mkdirSync(path, { mode: 0o700 });
    owned(path, true);
  }
}
export function closeProvisionResources(resources, keys) {
  let failed = false;
  try {
    for (const resource of [...resources].reverse()) { try { resource.close(); } catch { failed = true; } }
  } finally { for (const value of keys) value.fill(0); }
  if (failed) throw Error("personal_provision_cleanup_failed");
}
// Explicit operator provisioning. Ordinary startup NEVER creates a missing
// ledger, credential vault, profile binding or deletion watermark.
export function provisionPersonalRuntime({ registry, platformKey, root, index, ephemeralRoot }) {
  keyValid(platformKey); const profiles = personalProfiles(registry), paths = personalRuntimePaths(root, profiles, index, { ephemeralRoot });
  if (existsSync(paths.marker)) { verifyProvision(paths, profiles); preparePersonalEphemeral(paths, profiles); return { replayed: true }; }
  if (existsSync(paths.root)) fail();
  privateDirectory(dirname(root)); mkdirSync(root, { mode: 0o700 }); mkdirSync(join(root, "accounts"), { mode: 0o700 });
  const keys = [], resources = [];
  const key = name => { const value = derive(platformKey, name); keys.push(value); return value; };
  try {
    resources.push(openPersonalStore(paths.outbox, { key: key("outbox"), profiles }));
    resources.push(openPersonalCredentials(paths.native, { key: key("native"), fundingOwnerUid: registry.fundingOwner }));
    for (const { uid } of profiles.entries()) {
      const p = paths.account(uid); mkdirSync(p.base, { mode: 0o700 }); if (!ephemeralRoot) mkdirSync(p.media, { mode: 0o700 });
      resources.push(openTurnStore(p.turns, { hmacKey: key("turns:" + uid) }));
      resources.push(openPersonalCredentials(p.session, { key: key("firebase:" + uid), fundingOwnerUid: uid, purpose: "firebase-session" }));
    }
    preparePersonalEphemeral(paths, profiles);
    privateWrite(paths.marker, JSON.stringify(provisionValue(profiles)));
    verifyProvision(paths, profiles); return { replayed: false };
  } finally { closeProvisionResources(resources, keys); }
}

export async function createPersonalRuntime({ registry, platformKey, root, ephemeralRoot, index: indexPath,
  indexSha256 = "a8e60fe05956869df3bc9d04371994c5ff8adf0d6014e474457f52191b591ad8",
  project, firebaseApiKey, dataProfiles, spawnOwner, spawnPayer, fetcher = fetch, verifyToken, releaseId,
  readerFactory = createFirestoreReader, indexFactory = openFoodIndex, payerFactory = createPersonalPayer, onEvent = () => {}, onFatal = () => {} }) {
  keyValid(platformKey);
  if (typeof spawnOwner !== "function" || typeof spawnPayer !== "function") fail();
  const profiles = personalProfiles(registry), paths = personalRuntimePaths(root, profiles, indexPath, { ephemeralRoot });
  verifyProvision(paths, profiles);
  preparePersonalEphemeral(paths, profiles);
  const entries = profiles.entries();
  if (!dataProfiles || Object.keys(dataProfiles).length !== entries.length || entries.some(({ uid }) => !/^[A-Za-z0-9_-]{1,128}$/.test(dataProfiles[uid] || ""))) fail();
  const keys = [], accounts = new Map(), desktop = new Map();
  const key = name => { const value = derive(platformKey, name); keys.push(value); return value; };
  let outbox, credentials, sessions, payer, core, index, sweeper, closing, ready = false;
  // COACH-PROBLEMS-01 S1: знеособлений журнал. Не відкрився: служба працює без нього.
  let problems;
  try { problems = openProblemJournal(join(paths.root, "problems.sqlite"), { release: releaseId }); }
  catch { problems = disabledProblemJournal(); }
  const close = () => closing ??= (async () => {
    let failed = false;
    const wait = async fn => { try { await fn(); } catch { failed = true; } };
    for (const binding of [...desktop.values()]) await wait(() => binding.close());
    for (const account of accounts.values()) await wait(() => account.gateway?.close());
    await wait(() => core?.close()); await wait(() => sessions?.close());
    for (const account of accounts.values()) await wait(() => account.store.close());
    for (const resource of [credentials, outbox, index]) await wait(() => resource?.close());
    sweeper?.close();
    // After gateway.close(): its shutdown cancellations are already recorded.
    await wait(() => problems.close());
    for (const value of keys) value.fill(0);
    if (failed) throw Error("personal_shutdown_incomplete");
  })();
  try {
    if (ephemeralRoot) {
      sweeper = createPersonalEphemeralSweeper(paths, profiles, { onFault() {
        if (ready) { try { onFatal(); } catch {} void close().catch(() => {}); }
      } });
      if (sweeper.faulted) fail();
    }
    outbox = openPersonalStore(paths.outbox, { profiles, key: key("outbox") });
    credentials = openPersonalCredentials(paths.native, { key: key("native"), fundingOwnerUid: registry.fundingOwner });
    const firebaseKeys = new Map(entries.map(({ uid }) => [uid, key("firebase:" + uid)]));
    sessions = createFirebaseSessions({ profiles, project, apiKey: firebaseApiKey, fetcher, verifyToken,
      storeFor: uid => openPersonalCredentials(paths.account(uid).session, { key: firebaseKeys.get(uid), fundingOwnerUid: uid, purpose: "firebase-session" }) });
    index = indexFactory(paths.index, indexSha256);
    for (const { uid } of entries) {
      const p = paths.account(uid), store = openTurnStore(p.turns, { hmacKey: key("turns:" + uid), runDeadlineMs: PERSONAL_LIMITS.deadlineMs, onTransition: turnProblemRecorder(problems) });
      const account = { store }; accounts.set(uid, account);
      account.reader = readerFactory({ project, ownerUid: uid, profileId: dataProfiles[uid], fetcher, getOwnerToken: (uid, signal) => sessions.getToken(uid, signal) });
      account.kit = createTrainerTools({ store, index, ...account.reader, memoryWriteEnabled: true, contextUpdateMode: "append" });
      account.media = createMediaStore(p.media, { hash: store.hash });
    }
    payer = payerFactory({ credentials, spawnWorker: spawnPayer, reservePost: (uid, inputId, proof) => outbox.reservePost(uid, inputId, proof),
      onDiagnostic: value => {
        try { problems.record("payer_failure", value?.code); } catch { /* journal is best effort */ }
        privateWrite(join(paths.root, "last-payer-failure.json"), JSON.stringify(value));
      } });
    core = createPersonalCoordinator({ profiles, outbox, payer, onEvent(uid, channel, event) {
      try { onEvent(uid, channel, event); } catch {}
      try { desktop.get(uid + ":" + channel)?.notify(event); } catch {}
    },
      ownerFactory: (profile, hooks) => createPersonalProcess({ ...hooks, toolSchemas: accounts.get(profile.uid).kit.schemas, spawnWorker: () => spawnOwner(profile) }) });
    for (const { uid } of entries) {
      const account = accounts.get(uid), context = createPersonalContext(uid, core);
      account.backend = createPersonalBackend({ uid, core, store: account.store, tools: account.kit.tools, releaseTools: account.kit.release, problems });
      account.gateway = createTrainerGateway({ ownerUid: uid, store: account.store, problems, media: account.media, backend: account.backend,
        proxy: { cancel() {}, close() {} }, ...account.reader, releaseTools: account.kit.release,
        authorizeTurn: (uid, signal) => sessions.getToken(uid, signal),
        readContext: (_uid, signal) => context.read(signal), contextStore: context, memoryWriteEnabled: true,
        runDeadlineMs: PERSONAL_LIMITS.deadlineMs, queueWindowMs: PERSONAL_LIMITS.queueWindowMs, snapshotFactory: value => buildSnapshot({ ...value, history: [], maxPayloadBytes: 512000 }) });
      await account.gateway.recover();
    }
    // Resolve/auth metadata without HTTP and start each sole authority before
    // the five-second browser read window. Empty login stays explicitly empty.
    if (credentials.status().phase === "ready") await Promise.all(entries.map(({ uid }) => core.history(uid)));
    if (sweeper?.faulted) fail();
    ready = true;
    return Object.freeze({
      problems: Object.freeze({ rows: since => problems.rows(since), status: () => problems.status() }),
      accepts(uid) { try { profiles.resolve(uid); return !closing; } catch { return false; } },
      openDesktop(uid, channel, notify) {
        profiles.resolve(uid);
        const id = uid + ":" + channel;
        if (closing || typeof notify !== "function" || !["desktop:primary", "desktop:secondary", "desktop:read"].includes(channel) || desktop.has(id)) throw Error("desktop_unavailable");
        const account = accounts.get(uid); account.desktopAdmissions ??= new Map();
        const adapter = createPersonalDesktopAdapter({ uid, channel, profileId: profiles.resolve(uid).home, account, core, admissions: account.desktopAdmissions,
          detach: async () => { desktop.delete(id); } });
        desktop.set(id, { notify, close: adapter.close }); return adapter;
      },
      connection(uid) { profiles.resolve(uid); if (closing) throw Error("trainer_unavailable"); return core.connection(uid); },
      modelOptions(uid, options) { profiles.resolve(uid); if (closing) throw Error("trainer_unavailable"); return core.modelOptions(uid, options); },
      selectModel(uid, selection, options) { profiles.resolve(uid); if (closing) throw Error("trainer_unavailable"); return core.selectModel(uid, selection, options); },
      async handle(uid, route, method, body, { signal, ownerToken } = {}) {
        profiles.resolve(uid); if (closing) throw Error("trainer_unavailable");
        if (route === "/capabilities" && method === "GET") return response({ canonicalHistory: true, dataSession: true, fundingOwner: uid === registry.fundingOwner, modelPhase: credentials.status().phase });
        if (route === "/data-session") {
          if (method === "GET") return response(sessions.status(uid));
          if (method === "PUT" && body && Object.keys(body).length === 1 && typeof body.refreshToken === "string") return response(await sessions.connect(uid, body, { ownerToken }));
          if (method === "POST" && body?.action === "disconnect" && Object.keys(body).length === 1) return response(await sessions.disconnect(uid));
          throw Error("invalid_request");
        }
        const photo = route.match(/^\/photos\/([A-Za-z0-9_-]{1,512})(?:\/(thumbnail|original))?$/);
        if (photo) {
          if (method === "GET") return response(await core.photo(uid, photo[1], photo[2] || "thumbnail", { signal }));
          if (method === "POST" && !photo[2] && body?.action === "delete" && Object.keys(body).length === 1) return response(await core.deletePhoto(uid, photo[1], { signal }));
          throw Error("invalid_request");
        }
        // Authenticate a durable reader before admission or a draft mutation.
        // A retry after data_auth_required cannot duplicate an admitted turn.
        if (route.startsWith("/days/") || route.startsWith("/drafts/") || route === "/notes") await sessions.getToken(uid, signal);
        const result = await accounts.get(uid).gateway.handle(uid, route, method, body, { signal });
        if (route === "/state" && method === "GET" && result.ok) return response({ ...await result.json(), dataSession: sessions.status(uid) });
        return result;
      },
      close,
    });
  } catch (error) { await close().catch(() => {}); throw error; }
}
