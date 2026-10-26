import { StringDecoder } from "node:string_decoder";
import { randomUUID } from "node:crypto";

// Same bounded native-photo replay envelope as hermes_personal_ipc.MAX_BYTES.
const MAX_BYTES = 48 * 1024 * 1024;
const errors = new Set(["trainer_unavailable", "trainer_timeout", "trainer_quota", "connection_auth_required",
  "connection_model_changed", "model_payload_invalid", "execution_unknown", "personal_owner_conflict",
  "personal_channel_limit", "personal_channel_invalid", "profile_mismatch", "not_found",
  "owner_shutdown_incomplete", "owner_channel_close_failed", "invalid_request", "conflict", "connection_conflict", "connection_unconfigured", "connection_busy", "permission_denied", "admission_conflict", "invalid_image", "media_unavailable", "media_unsupported", "media_conflict", "media_quota", "media_missing", "context_unavailable", "context_conflict", "context_too_large", "invalid_context_proposal",
  "invalid_date", "date_clarification", "date_change_requires_confirmation", "consumption_unconfirmed", "day_unavailable",
  "invalid_food_query", "invalid_food_source", "invalid_food_proposal", "food_source_not_offered", "assumptions_required", "brand_is_not_exact", "invalid_plan_match"]);
const failure = code => Error(errors.has(code) ? code : "trainer_unavailable");

// spawnWorker is an operator-owned OS-isolated launcher. It must expose only
// this profile's HOME, no network or grant, and return an owned lifecycle.
// Remote launchers set requiresPhysicalDrain=true and emit exit only after
// independently proving their captured service cgroup has no live descendants.
// This transport is internal: public ingress must use the admission coordinator.
export function createInternalProcess({ spawnWorker, setup, handlers, validateIdentity, validateEvent = () => false, onEvent = () => {}, deadlineMs = 90000, exitGraceMs = 5000 }) {
  if (typeof spawnWorker !== "function" || !handlers || Object.values(handlers).some(handler => typeof handler !== "function") || typeof validateIdentity !== "function" ||
    !Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 90000 ||
    !Number.isInteger(exitGraceMs) || exitGraceMs < 1 || exitGraceMs > 60000) throw failure("invalid_request");
  let child, identity, starting, closing, exited, dead = false, disconnected = false;
  let resolveExit, exitTimer;
  const pending = new Map(), activeCallbacks = new Map(), callbackTasks = new Set(), lifetime = new AbortController();
  const exitedPromise = new Promise(resolve => { resolveExit = resolve; });
  const rejectAll = () => {
    for (const { reject, timer, removeAbort } of pending.values()) { clearTimeout(timer); removeAbort(); reject(failure("execution_unknown")); }
    pending.clear();
  };
  const kill = () => { try { child?.kill("SIGKILL"); } catch {} };
  const fault = () => {
    disconnected = true;
    lifetime.abort();
    rejectAll();
    kill(); // A replacement remains forbidden until the physical exit event.
  };
  const send = value => {
    if (dead || disconnected || !child?.stdin?.writable) throw failure("execution_unknown");
    const encoded = JSON.stringify(value) + "\n";
    if (Buffer.byteLength(encoded) > MAX_BYTES) throw failure("model_payload_invalid");
    // At most sixteen requests/callbacks may be in flight. Avoid unbounded
    // Writable buffering if a stopped reader cannot accept even this one frame.
    if (child.stdin.writableLength + Buffer.byteLength(encoded) > MAX_BYTES * 2) throw failure("trainer_unavailable");
    child.stdin.write(encoded, error => { if (error) fault(); });
  };
  async function callback(message) {
    const id = message.id;
    if (typeof id !== "string" || !/^[a-f0-9]{32}$/.test(id) || activeCallbacks.size >= 16 || activeCallbacks.has(id)) return fault();
    const controller = new AbortController();
    activeCallbacks.set(id, controller);
    const callbackMs = Number.isInteger(message.timeoutMs) && message.timeoutMs > 0 ? Math.min(message.timeoutMs, deadlineMs) : deadlineMs;
    const timer = setTimeout(() => { controller.abort(); fault(); }, callbackMs); timer.unref();
    const signal = AbortSignal.any([lifetime.signal, controller.signal]);
    try {
      const result = await handlers[message.type](message, { signal });
      send({ type: "reply", id, result });
    } catch (error) {
      try { send({ type: "reply", id, error: errors.has(error?.message) ? error.message : "trainer_unavailable" }); }
      catch { fault(); }
    } finally { clearTimeout(timer); activeCallbacks.delete(id); }
  }
  function packet(message) {
    if (!message || typeof message !== "object" || Array.isArray(message)) return fault();
    if (message.type === "result") {
      const request = pending.get(message.id);
      if (!request) return fault();
      pending.delete(message.id); clearTimeout(request.timer); request.removeAbort();
      if (message.error) request.reject(failure(message.error));
      else request.resolve(message.result);
    } else if (Object.hasOwn(handlers, message.type)) {
      const task = callback(message); callbackTasks.add(task);
      task.finally(() => callbackTasks.delete(task)).catch(() => {});
    } else if (message.type === "cancel") {
      activeCallbacks.get(message.id)?.abort();
      // A native timeout cannot leave a model/tool request alive in the parent
      // while this profile admits more turns. Keep it quarantined until drain.
      fault();
    } else if (message.type === "event") {
      if (!validateEvent(message)) return fault();
      try { onEvent(message.channel, message.event); } catch { fault(); }
    } else fault();
  }
  function request(type, value, { signal, timeoutMs = deadlineMs } = {}) {
    if (dead || disconnected || closing || !child || signal?.aborted || pending.size >= 16) return Promise.reject(failure("trainer_unavailable"));
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > deadlineMs) return Promise.reject(failure("invalid_request"));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const abort = () => fault();
      const timer = setTimeout(fault, timeoutMs); timer.unref();
      signal?.addEventListener("abort", abort, { once: true });
      pending.set(id, { resolve, reject, timer, removeAbort: () => signal?.removeEventListener("abort", abort) });
      try { send({ ...value, type, id }); } catch (error) { fault(); }
    });
  }
  function start() {
    if (starting) return starting;
    starting = (async () => {
      if (closing) throw failure("trainer_unavailable");
      child = spawnWorker();
      // Subscribe to physical lifecycle before validating stdio. A real child
      // with a bad launcher configuration must still be killed AND reaped.
      if (typeof child?.once === "function") {
        child.once("exit", (code, signal) => { dead = true; lifetime.abort(); exited = { code, signal }; clearTimeout(exitTimer); rejectAll(); resolveExit(exited); });
        child.once("error", () => {
          if (!child.pid && child.requiresPhysicalDrain !== true) { dead = true; resolveExit({ notStarted: true }); }
          fault();
        });
      }
      if (!child?.stdout || !child?.stdin || typeof child.kill !== "function" || typeof child.once !== "function") {
        if (!child?.pid && child?.requiresPhysicalDrain !== true) { dead = true; resolveExit({ notStarted: true }); }
        throw failure("trainer_unavailable");
      }
      const decoder = new StringDecoder("utf8"); let buffer = "", bufferedBytes = 0;
      // Native stdout is redirected to stderr. Drain a pipe without retaining
      // private text; otherwise a full log pipe can block an ACK or a turn.
      if (child.stderr) { child.stderr.on("error", () => {}); child.stderr.resume(); }
      child.stdin.on("error", fault);
      child.stdout.on("error", fault);
      child.stdout.on("data", chunk => {
        if (disconnected || dead) return;
        bufferedBytes += chunk.length; buffer += decoder.write(chunk);
        try {
          let newline;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
            const bytes = Buffer.byteLength(line) + 1; bufferedBytes -= bytes;
            if (!line || bytes > MAX_BYTES) return fault();
            packet(JSON.parse(line));
            if (disconnected) return;
          }
          if (bufferedBytes > MAX_BYTES) fault();
        } catch { fault(); }
      });
      child.stdout.once("end", () => { if (!dead) { disconnected = true; rejectAll(); if (!closing) kill(); } });
      identity = await request("setup", setup);
      if (!validateIdentity(identity)) { fault(); throw failure("trainer_unavailable"); }
      return identity;
    })().catch(error => { if (!child) { dead = true; resolveExit({ notStarted: true }); } fault(); throw failure(error?.message); });
    return starting;
  }
  return Object.freeze({
    start,
    async call(type, value = {}, options) { await start(); return request(type, value, options); },
    get exited() { return dead; },
    get unavailable() { return dead || disconnected; },
    abort: fault,
    waitForExit() { return exitedPromise; },
    close() {
      return closing ??= (async () => {
        if (!child) { dead = true; resolveExit({ notStarted: true }); return { notStarted: true }; }
        if (!dead) {
          try { send({ type: "close" }); child.stdin.end(); } catch { kill(); }
          exitTimer = setTimeout(kill, exitGraceMs); exitTimer.unref();
        }
        // A protocol ACK or stdout EOF is never proof that DB writers exited.
        const result = await exitedPromise;
        await Promise.allSettled([...callbackTasks]);
        return result;
      })();
    },
  });
}
