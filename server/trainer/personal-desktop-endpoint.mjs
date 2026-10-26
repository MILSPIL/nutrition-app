import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { chmodSync, chownSync, lstatSync, unlinkSync, mkdtempSync, linkSync, rmdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { WebSocketServer } from "ws";
import { validateImages } from "./media.mjs";

const MAX_FRAME = 8 * 1024 * 1024;
const SOURCE_PIN = "3f2afed3eb813cb00bd381d29b084d0e01de048f";
const protocol = "hermes-gateway-v1", ticketPrefix = "hermes-gateway-ticket.";
const error = reason => Object.assign(Error(reason), { reason });
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
const digest = value => createHash("sha256").update(value).digest();
const safeReason = value => /^[a-z][a-z_]{1,63}$/.test(value || "") ? value : "trainer_unavailable";
const json = (res, status, value) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); res.end(JSON.stringify(value)); };

// One operator-bound endpoint per verified UID. It only listens on its private
// Unix socket; SSH principal/group and a separate secret protect each account.
// It NEVER exposes native mutation RPCs or accepts a caller-selected identity.
export function createPersonalDesktopEndpoint({ runtime, uid, token, socketPath, socketGid, title = "Тренер", monotonicNow = () => performance.now() }) {
  if (!runtime?.accepts(uid) || !Buffer.isBuffer(token) || !(/^[A-Za-z0-9_-]{43,128}$/).test(token.toString()) ||
      typeof socketPath !== "string" || !socketPath.startsWith("/") || socketPath.includes("\0") || Buffer.byteLength(dirname(socketPath))+14>103 || typeof monotonicNow!=="function" ||
      !Number.isInteger(socketGid) || socketGid < 0) throw error("desktop_configuration_invalid");
  const tokenHash = digest(token), viewers = new Map(), sockets = new Set(), rawSockets = new Set();
  let listening = false, closed = false, closing, socketIdentity, privateDirectory, privateIdentity;
  let restPending = 0, restTail = Promise.resolve(), rpcBytes = 0;
  const authorized = candidate => typeof candidate === "string" && candidate.length <= 172 && timingSafeEqual(digest(candidate), tokenHash);
  // Native Desktop uses auth_required for its OAuth login gate. This private
  // route uses its existing token mode, with authentication enforced below.
  const status = { version: "0.22.5", auth_required: false, auth_mode: "token", gateway_running: true, desktop_protocol: protocol,
    scisense: { bridge_version: 1, protocol, engine_commit: SOURCE_PIN } };
  const scoped = (params, home) => {
    if (!params || typeof params !== "object" || Array.isArray(params)) throw error("invalid_request");
    const { profile, ...body } = params;
    if (profile !== undefined && profile !== "default" && profile !== home) throw error("profile_mismatch");
    return body;
  };
  // Native canonical identity stays unchanged. Only the Desktop-facing name
  // is the single alias advertised by this per-account endpoint.
  const infoView = info => ({ ...info, profile_name: "default", cwd: "", project: null, branch: "" });
  const snapshotView = snapshot => ({ ...snapshot, ...(snapshot.info ? { info: infoView(snapshot.info) } : {}) });
  const eventView = frame => frame?.method === "event" && frame.params?.type === "session.info"
    ? { ...frame, params: { ...frame.params, payload: infoView(frame.params.payload) } } : frame;
  const temporary = new Map();
  function erase(entry) { entry.data.fill(0); }
  function sweep() {
    const now = monotonicNow();
    for (const [key, entry] of temporary) if (entry.until <= now) { erase(entry); temporary.delete(key); }
  }
  const sweepTimer = setInterval(sweep, 5000); sweepTimer.unref();
  async function withReader(fn) {
    if (closed || restPending >= 16) throw error("trainer_busy");
    restPending++;
    const task = restTail.then(async () => {
      if (closed) throw error("trainer_unavailable");
      const lane = "desktop:read", adapter = runtime.openDesktop(uid, lane, () => {});
      viewers.set(lane, adapter);
      try { return await fn(adapter); } finally { viewers.delete(lane); await adapter.close(); }
    });
    restTail = task.catch(() => {});
    try { return await task; } finally { restPending--; }
  }
  async function rpc(adapter, method, params) {
    const p = scoped(params, adapter.profileId);
    if (method === "client.capabilities") {
      if (!exact(p, ["server_requests", "desktop_local"]) || Object.values(p).some(v => typeof v !== "boolean")) throw error("invalid_request");
      // Client tools and local file/shell access are unavailable on this bridge.
      return { server_requests: [] };
    }
    if (method === "onboarding.state") {
      if (!exact(p, ["assume_fresh"])) throw error("invalid_request");
      return { run: false, eligible: false, session_id: null, run_id: null };
    }
    if (["setup.status", "setup.runtime_check"].includes(method)) {
      if (!exact(p, ["provider"]) || p.provider !== undefined && p.provider !== "openai-codex") throw error("desktop_method_forbidden");
      const c = await adapter.connection();
      return method === "setup.status" ? { provider_configured: true, ready: true, free_tier_account: false,
        free_tier_route: false, other_providers: false, inference_provider: c.provider, profile: "default", ok: true } :
        { ok: true, provider: c.provider, model: c.model, source: "scisense-personal", free_tier_route: false, profile: "default" };
    }
    if (method === "free_tier.status") {
      if (Object.keys(p).length) throw error("invalid_request");
      return { has_guest: false, enabled: false, available: false, notice_pending: false, model: "", label: "" };
    }
    if (method === "profiles.list") {
      if (!exact(p, ["include_sessions"])) throw error("desktop_method_forbidden");
      const h = await adapter.history(), c = await adapter.connection();
      return { bot_mode_protocol: false, install_id: digest(adapter.profileId).toString("hex"), profiles: [{
        name: "default", path: adapter.profileId, is_default: true, display_name: title, model: c.model, provider: c.provider,
        description: "Особистий тренер SciSense", skill_count: 0, has_avatar: false,
        ui_meta: { "hermes-bots": { title } }, canonical_session: { id: h.session_id, resolved_id: h.session_id, title: "Bot Chat", root_title: "Bot Chat" },
      }] };
    }
    if (method === "model.options") {
      if (!exact(p, ["explicit_only", "refresh", "include_unconfigured"]) || p.include_unconfigured === true) throw error("desktop_method_forbidden");
      return adapter.modelOptions();
    }
    if (method === "config.get") {
      if (!exact(p, ["key"])) throw error("desktop_method_forbidden");
      if (p.key === "language") return { value: "uk" };
      if (p.key === "provider") { const c = await adapter.connection(); return { model: c.model, provider: c.provider }; }
      if (p.key === "profile") return { home: adapter.profileId, display: title };
      throw error("desktop_method_forbidden");
    }
    if (method === "session.create") {
      if (!exact(p, ["request_id", "source", "title", "hidden", "follow_profile_config", "cols"]) ||
          p.title !== undefined && p.title !== "Bot Chat") throw error("desktop_method_forbidden");
      return snapshotView(await adapter.history());
    }
    if (method === "session.list") {
      if (!exact(p, ["title", "limit", "include_hidden", "scope"]) ||
          p.title !== undefined && p.title !== "Bot Chat" ||
          p.scope !== undefined && !["stored", "live"].includes(p.scope) ||
          p.limit !== undefined && (!Number.isInteger(p.limit) || p.limit < 1 || p.limit > 200)) throw error("desktop_method_forbidden");
      const history = await adapter.history();
      return { sessions: [{ id: history.session_id, session_id: history.session_id, title: "Bot Chat", hidden: true,
        source: "gui", running: history.running, message_count: history.messages.length }], scope: p.scope ?? "stored" };
    }
    if (method === "gateway.ping") { if (Object.keys(p).length) throw error("invalid_request"); return { pong: true }; }
    if (method === "gateway.describe") {
      if (Object.keys(p).length) throw error("invalid_request");
      const history = await adapter.history();
      return { profile_id: history.profileId, authority_epoch: history.authority_epoch,
        capabilities: ["durable-admission-v1", "event-replay-v1"], desktop_protocol: protocol };
    }
    if (method === "image.attach_bytes") {
      const history = await adapter.history();
      if (!exact(p, ["session_id", "content_base64", "filename"]) || p.session_id !== history.session_id ||
          typeof p.filename !== "string" || p.filename.length > 512 ||
          typeof p.content_base64 !== "string" || p.content_base64.length > 7 * 1024 * 1024) throw error("invalid_image");
      sweep();
      const bytes = Buffer.from(p.content_base64, "base64");
      const type = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png" :
        bytes[0] === 255 && bytes[1] === 216 ? "image/jpeg" : bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP" ? "image/webp" : "invalid";
      const image = { type, data: p.content_base64 };
      try {
        validateImages([image]);
        const ref = adapter.hashImage(image);
        if (!temporary.has(ref) && temporary.size >= 2) throw error("media_quota");
        const old = temporary.get(ref); if (old) erase(old);
        temporary.set(ref, { data: bytes, type, sessionId: history.session_id, until: monotonicNow() + 295000 });
        return { attached: true, path: "scisense-image:" + ref, mime: type, filename: "photo" };
      } catch (fault) { bytes.fill(0); throw fault; }
    }
    if (method === "prompt.submit") {
      if (!exact(p, ["session_id", "submission_id", "input_id", "text", "attachments"]) || typeof p.session_id !== "string" ||
          p.submission_id && p.input_id && p.submission_id !== p.input_id || !Array.isArray(p.attachments ?? [])) throw error("desktop_method_forbidden");
      const attachments = p.attachments ?? [];
      if (attachments.length > 2 || attachments.some(a => !exact(a, ["path", "mime"]) || !/^scisense-image:[a-f0-9]{64}$/.test(a.path))) throw error("invalid_image");
      const refs = attachments.map(a => a.path.slice(15)); sweep();
      const captured = refs.map(ref => temporary.get(ref));
      const staged = refs.map((ref, index) => {
        const image = captured[index];
        if (!image) return undefined; // A terminal retry needs only its HMAC.
        if (image.sessionId !== p.session_id || image.type !== attachments[index].mime) throw error("media_conflict");
        return { type: image.type, data: image.data.toString("base64") };
      });
      const receipt = await adapter.submit({ inputId: p.submission_id ?? p.input_id, sessionId: p.session_id,
        text: p.text ?? "", imageRefs: refs, images: staged.every(Boolean) ? staged : undefined });
      for (let index = 0; index < refs.length; index++) {
        const entry = captured[index];
        if (entry && temporary.get(refs[index]) === entry) { erase(entry); temporary.delete(refs[index]); }
      }
      return receipt;
    }
    if (method === "session.interrupt" || method === "prompt.cancel") {
      const history = await adapter.history();
      if (!exact(p, ["session_id", "admission_id", "execution_generation"]) || p.session_id !== history.session_id ||
          !Number.isSafeInteger(p.execution_generation) || p.execution_generation !== history.execution_generation) throw error("session_changed");
      return adapter.cancel(p.admission_id);
    }
    if (method === "session.resume" && Object.hasOwn(p, "source")) {
      // CanonicalDesktopProtocol turns a warm activate into this exact hint.
      // It is a viewer label, never a source or launch-policy selection.
      if (p.source !== "desktop") throw error("desktop_method_forbidden");
      const { source, ...read } = p;
      return snapshotView(await adapter.read(method, read));
    }
    const result = await adapter.read(method, p);
    return method === "session.resume" ? snapshotView(result) : method === "session.info" ? infoView(result) : result;
  }
  async function readBody(req) {
    let total = 0; const chunks = [];
    for await (const chunk of req) { total += chunk.length; if (total > 4096) throw error("invalid_request"); chunks.push(chunk); }
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
  }
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://unix");
      // Secrets in URLs are never accepted, even with valid header auth.
      if (url.searchParams.has("token") || url.searchParams.has("ticket")) return json(res, 400, { error: "credentials_in_url" });
      if (url.pathname === "/api/status" && req.method === "GET") return json(res, 200, status);
      if (closed || !authorized(req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : req.headers["x-hermes-session-token"])) return json(res, 401, { error: "authentication_required" });
      if (url.pathname === "/api/health" && req.method === "GET") return json(res, runtime.accepts(uid) ? 200 : 503, { status: runtime.accepts(uid) ? "ok" : "unavailable" });
      const body = req.method === "POST" ? await readBody(req) : {};
      const result = await withReader(async adapter => {
        scoped({ profile: url.searchParams.get("profile") ?? undefined }, adapter.profileId);
        const connection = () => adapter.connection();
        if (req.method === "POST" && url.pathname === "/api/model/set") {
          if (!exact(body, ["scope", "provider", "model"]) || body.scope !== "main") throw error("desktop_method_forbidden");
          const selected = await adapter.selectModel({ provider: body.provider, model: body.model });
          return { ok: true, provider: selected.connection.provider, model: selected.connection.model };
        }
        if (req.method !== "GET") throw error("desktop_method_forbidden");
        if (url.pathname === "/api/profiles/active") return { active: "default", profile: "default" };
        if (url.pathname === "/api/cron/jobs") return { jobs: [] };
        if (url.pathname === "/api/audio/voice-live/status") return { enabled: false, available: false };
        if (url.pathname === "/api/fs/read-data-url") {
          const path = url.searchParams.get("path"), prefix = adapter.profileId + "/cache/documents/native-inputs/";
          const relative = typeof path === "string" && path.startsWith(prefix) ? path.slice(prefix.length) : "";
          if (!/^[a-f0-9]{64}\/[A-Za-z0-9_.-]{1,160}\.(png|jpe?g|webp|gif)$/.test(relative)) throw error("desktop_method_forbidden");
          try {
            const photo = await adapter.photo(Buffer.from(relative).toString("base64url"));
            return { dataUrl: "data:" + photo.type + ";base64," + photo.data, missing: false };
          } catch (fault) {
            if (fault.message !== "media_missing") throw fault;
            const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="180"><rect width="360" height="180" rx="12" fill="#f1f3f5"/><text x="180" y="96" text-anchor="middle" fill="#6b7280" font-family="sans-serif" font-size="22">Фото недоступне</text></svg>';
            return { dataUrl: "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64"), missing: true };
          }
        }
        if (url.pathname === "/api/model/options") return adapter.modelOptions();
        if (url.pathname === "/api/model/info") { const c = await connection(); return { model: c.model, provider: c.provider, effective_context_length: c.contextWindow, capabilities: { supports_tools: c.supportsTools, supports_vision: c.supportsVision } }; }
        if (url.pathname === "/api/profiles") { const c = await connection(); return { profiles: [{ name: "default", display_name: title, bot_title: title, path: adapter.profileId, model: c.model, provider: c.provider, is_default: true, skill_count: 0, has_env: false }] }; }
        if (["/api/config", "/api/config/defaults"].includes(url.pathname)) { const c = await connection(); return { model: { default: c.model, provider: c.provider }, agent: { max_turns: 8 }, stt: { enabled: false }, display: { language: "uk" } }; }
        if (!url.pathname.startsWith("/api/sessions") && !url.pathname.startsWith("/api/profiles/sessions")) throw error("endpoint_not_found");
        const history = await adapter.history();
        const row = { id: history.session_id, session_id: history.session_id,
          started_at: history.metadata?.started_at, last_active: history.metadata?.last_activity_at ?? history.metadata?.started_at,
          title: "Bot Chat", source: "gui", profile: "default", hidden: true, message_count: history.messages.length, running: history.running, model: (await connection()).model };
        const slice = rows => ({ sessions: rows, total: rows.length, limit: 40, offset: 0, profiles_truncated: { default: false } });
        if (["/api/sessions", "/api/profiles/sessions"].includes(url.pathname)) return slice(url.searchParams.get("source") === "cron" ? [] : [row]);
        if (url.pathname === "/api/profiles/sessions/sidebar") return { recents: slice([row]), cron: slice([]), messaging: slice([]) };
        const session = url.pathname.match(/^\/api\/sessions\/([^/]+)(?:\/(messages|info))?$/);
        if (session) {
          if (decodeURIComponent(session[1]) !== history.session_id) throw error("not_found");
          return session[2] === "messages" ? { session_id: history.session_id, messages: history.messages, total: history.messages.length, limit: history.messages.length, offset: 0 } : row;
        }
        throw error("endpoint_not_found");
      });
      if (!res.destroyed) json(res, 200, result);
    } catch (fault) { if (!res.destroyed) {
      const reason=safeReason(fault.reason||fault.message);
      if(reason==="endpoint_not_found")json(res,404,{error:reason,detail:"No such API endpoint",message:"Цей розділ недоступний для профілю тренера."});
      else json(res,reason==="not_found"?404:409,{error:reason});
    } }
  });
  server.on("connection", socket => { rawSockets.add(socket); socket.once("close", () => rawSockets.delete(socket)); });
  server.requestTimeout = 10000; server.headersTimeout = 10000; server.maxConnections = 12;
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME, perMessageDeflate: false,
    handleProtocols: protocols => protocols.has(protocol) ? protocol : false });
  server.on("upgrade", (req, socket, head) => {
    try {
      const url = new URL(req.url, "http://unix"), offered = String(req.headers["sec-websocket-protocol"] || "").split(",").map(v => v.trim());
      const ticket = offered.find(p => p.startsWith(ticketPrefix))?.slice(ticketPrefix.length);
      if (closed || url.pathname !== "/api/ws" || [...url.searchParams.keys()].some(key => !["hermes_canonical", "profile"].includes(key)) ||
          url.searchParams.size !== new Set(url.searchParams.keys()).size || url.searchParams.get("hermes_canonical") !== "1" ||
          !offered.includes(protocol) || !authorized(ticket)) throw error("authentication_required");
      if (url.searchParams.has("profile") && url.searchParams.get("profile") !== "default") throw error("profile_mismatch");
      wss.handleUpgrade(req, socket, head, ws => {
        // A rejected/abandoned HTTP handshake never reserves a Native viewer.
        // ws calls this only after its key/version/socket checks have passed.
        const lane = ["desktop:primary", "desktop:secondary"].find(lane => !viewers.has(lane));
        if (!lane) { ws.close(1013); return; }
        const send = frame => {
          if (ws.readyState !== 1) return;
          const data = JSON.stringify(eventView(frame));
          if (Buffer.byteLength(data) > MAX_FRAME || ws.bufferedAmount > 4 * 1024 * 1024) ws.close(1013);
          else ws.send(data);
        };
        let adapter;
        try { adapter = runtime.openDesktop(uid, lane, send); }
        catch { ws.close(1013); return; }
        viewers.set(lane, adapter); sockets.add(ws); let pending = 0;
        ws.on("error", () => {});
        ws.on("close", () => { sockets.delete(ws); viewers.delete(lane); void adapter.close(); });
        void adapter.history().then(history => send({ jsonrpc: "2.0", method: "event", params: { type: "gateway.ready", payload: {
          instance_id: history.instanceId, profile_id: history.profileId, authority_epoch: history.authority_epoch,
          desktop_protocol: protocol, heartbeat: true,
        } } }), () => ws.close(1013));
        ws.on("message", (data, binary) => {
          let frame;
          try {
            if (binary) throw error("invalid_request");
            frame = JSON.parse(data.toString());
            if (!exact(frame, ["jsonrpc", "id", "method", "params"]) || frame.jsonrpc !== "2.0" ||
                !["string", "number"].includes(typeof frame.id) || typeof frame.method !== "string") throw error("invalid_request");
          } catch { ws.close(1008); return; }
          const bytes = data.length;
          if (pending >= 32 || rpcBytes + bytes > 16 * 1024 * 1024) {
            send({ jsonrpc: "2.0", id: frame.id, error: { code: -32000, message: "trainer_busy", data: { reason: "trainer_busy" } } }); return;
          }
          pending++; rpcBytes += bytes;
          rpc(adapter, frame.method, frame.params ?? {}).then(result => send({ jsonrpc: "2.0", id: frame.id, result }), fault =>
            send({ jsonrpc: "2.0", id: frame.id, error: { code: (fault.reason || fault.message) === "desktop_method_forbidden" ? -32601 : -32000, message: safeReason(fault.reason || fault.message), data: { reason: safeReason(fault.reason || fault.message) } } })).finally(() => { pending--; rpcBytes -= bytes; });
        });
      });
    } catch { socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n", () => socket.destroy()); }
  });
  return Object.freeze({
    async listen() {
      if (closed || listening) throw error("desktop_configuration_invalid");
      // libuv auto-unlinks its bind pathname on close without an inode check.
      // Bind inside a private generation directory; publish a hard link only
      // after permissions are set. Auto-unlink can never remove a replacement
      // at the public path; that alias has a separate exact-inode cleanup.
      const parent = dirname(socketPath), parentInfo = lstatSync(parent);
      if (realpathSync(parent)!==parent || !parentInfo.isDirectory() || parentInfo.uid!==process.getuid() || parentInfo.mode&0o022) throw error("desktop_configuration_invalid");
      privateDirectory = mkdtempSync(join(parent,".d-")); chmodSync(privateDirectory,0o700);
      privateIdentity = lstatSync(privateDirectory);
      const privatePath = join(privateDirectory,"s");
      try {
        await new Promise((resolve, reject) => { server.once("error", reject); server.listen(privatePath, () => { server.off("error", reject); resolve(); }); });
        const info = lstatSync(privatePath);
        if (!info.isSocket() || info.uid !== process.getuid()) throw error("desktop_configuration_invalid");
        chownSync(privatePath, process.getuid(), socketGid); chmodSync(privatePath, 0o660);
        linkSync(privatePath,socketPath);
        socketIdentity={ino:info.ino,dev:info.dev};listening=true;
      } catch (fault) { await this.close(); throw fault; }
      return { socketPath };
    },
    close() { return closing ??= (async () => {
      closed = true; clearInterval(sweepTimer); for (const entry of temporary.values()) erase(entry); temporary.clear();
      for (const ws of sockets) ws.terminate();
      await Promise.allSettled([...viewers.values()].map(adapter => adapter.close())); viewers.clear();
      wss.close();
      const stopped = new Promise(resolve => server.close(resolve));
      for (const socket of rawSockets) socket.destroy();
      server.closeAllConnections();
      await stopped; await restTail;
      if (listening) { try {
        const info = lstatSync(socketPath);
        if (info.isSocket() && info.ino === socketIdentity.ino && info.dev === socketIdentity.dev) unlinkSync(socketPath);
      } catch (fault) { if (fault.code !== "ENOENT") throw fault; } }
      if(privateDirectory){
        const info=lstatSync(privateDirectory);
        if(info.isDirectory()&&info.ino===privateIdentity.ino&&info.dev===privateIdentity.dev)rmdirSync(privateDirectory);
      }
      tokenHash.fill(0);
    })(); },
  });
}
