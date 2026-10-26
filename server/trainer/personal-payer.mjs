import { createInternalProcess } from "./internal-process.mjs";

// One shared native producer, used only while the global queue owns a turn.
// The profile never receives this process handle or the connection material.
export function createPersonalPayer({ spawnWorker, credentials, reservePost, deadlineMs = 45000, now = Date.now }) {
  let process, active, identity, starting, controlActive = false, closed = false, generation = 0;
  const boot = () => {
    if (closed || active?.cancelled) throw Error("trainer_unavailable");
    if (!process) {
      const restored = credentials.restore();
      process = createInternalProcess({ spawnWorker, deadlineMs,
        setup: { revision: restored.revision, files: Object.fromEntries(Object.entries(restored.files).map(([name, bytes]) => [name, bytes.toString("base64")])) },
        validateIdentity: value => value && typeof value.instanceId === "string" && typeof value.provider === "string" && typeof value.model === "string" && value.supportsTools === true && Number.isSafeInteger(value.contextWindow) && value.contextWindow >= 64000,
        handlers: {
          credentials(message) {
            if (message.action === "beginRefresh") return credentials.beginRefresh(message.refreshId, message.options);
            if (message.action === "requireReauth") return credentials.requireReauth(message.options);
            if (message.action !== "checkpoint" || !message.files || Object.keys(message.files).some(name => !["auth.json", "config.yaml", ".env"].includes(name))) throw Error("invalid_request");
            const files = Object.fromEntries(Object.entries(message.files).map(([name, value]) => {
              if (typeof value !== "string" || value.length > 1400000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw Error("invalid_request");
              return [name, Buffer.from(value, "base64")];
            }));
            return credentials.checkpoint(files, message.options);
          },
          budget(message) {
            if (!active || active.cancelled || now() >= active.deadline || active.signal?.aborted) throw Error("trainer_timeout");
            return reservePost(active.uid, active.inputId, message.proof);
          },
        },
      });
      for (const bytes of Object.values(restored.files)) bytes.fill(0);
    }
    return process;
  };
  function start() {
    if (closed || active?.cancelled || active && process?.unavailable) return Promise.reject(Error("trainer_unavailable"));
    if (starting) return starting;
    const version = generation;
    const task = (async () => {
      let current = process;
      try {
        if (!active && current?.unavailable) {
          await current.close();
          if (closed || version !== generation) throw Error("trainer_unavailable");
          if (process === current) { process = undefined; identity = undefined; }
        }
        if (closed || version !== generation) throw Error("trainer_unavailable");
        current = boot();
        const selected = await current.start();
        if (closed || version !== generation) throw Error("trainer_unavailable");
        return identity ??= Object.freeze(selected);
      } catch (error) {
        current?.abort(); await current?.close();
        if (process === current) { process = undefined; identity = undefined; }
        throw error;
      }
    })();
    starting = task;
    task.finally(() => { if (starting === task) starting = undefined; }).catch(() => {});
    return task;
  }
  async function control(method, parameters, { signal } = {}) {
    if (closed || active || controlActive) throw Error("trainer_busy");
    controlActive = true;
    let current;
    try {
      await start(); current = process;
      const value = await current.call(method, parameters, { signal, timeoutMs: 5000 });
      if (method === "selectModel") {
        generation++;
        await current.close();
        if (process === current) { process = undefined; identity = undefined; }
        const selected = await start();
        current = process;
        if (selected.provider !== parameters.provider || selected.model !== parameters.model) throw Error("connection_model_changed");
        return { ...value, connection: selected };
      }
      return value;
    } catch (error) {
      current?.abort(); await current?.close();
      if (process === current) { process = undefined; identity = undefined; }
      throw error;
    } finally { controlActive = false; }
  }
  return Object.freeze({
    start,
    modelOptions: options => control("modelOptions", {}, options),
    selectModel: (selection, options) => control("selectModel", selection, options),
    async withTurn({ uid, inputId, signal, deadline }, execute) {
      if (closed || active || controlActive || !Number.isFinite(deadline) || deadline <= now() || deadline - now() > deadlineMs) throw Error("trainer_unavailable");
      active = { uid, inputId, signal, deadline };
      let timedOut = false;
      const abort = () => process?.abort();
      const watchdog = setTimeout(() => { timedOut = true; abort(); }, Math.max(1, deadline - now())); watchdog.unref();
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      try {
        await start();
        const armMs = Math.floor(deadline - now());
        if (armMs <= 0) throw Error("trainer_timeout");
        const armed = await boot().call("beginTurn", { turnId: inputId, deadlineUnixMs: Math.floor(deadline), timeoutMs: armMs }, { signal, timeoutMs: armMs });
        if (armed?.armed !== true) { process.abort(); throw Error("trainer_unavailable"); }
        const value = await execute(async (payload, { clientOptions = {}, signal: callbackSignal } = {}) => {
          if (active?.cancelled || signal?.aborted) throw Error("trainer_timeout");
          const remaining = Math.floor(deadline - now());
          if (remaining <= 0) throw Error("trainer_timeout");
          const guardSignal = AbortSignal.any([signal, callbackSignal].filter(Boolean));
          const result = await boot().call("invoke", { payload, clientOptions, timeoutMs: remaining, turnId: inputId, deadlineUnixMs: Math.floor(deadline) }, { signal: guardSignal, timeoutMs: remaining });
          if (result?.proof?.rawTerminalModelVerified !== true || result.proof.selectedModel !== identity?.model || result.proof.selectedProvider !== identity?.provider) { process.abort(); throw Error("model_payload_invalid"); }
          return result;
        });
        if (timedOut || now() >= deadline || signal?.aborted) throw Error("trainer_timeout");
        return value;
      } finally {
        if (process && !process.unavailable && !signal?.aborted) {
          try {
            const remaining = Math.floor(deadline - now());
            if (remaining <= 0 || (await process.call("endTurn", { turnId: inputId }, { signal, timeoutMs: remaining }))?.disarmed !== true) process.abort();
          } catch { process.abort(); }
        }
        clearTimeout(watchdog); signal?.removeEventListener("abort", abort);
        // Aborting synchronous SDK I/O is a physical process kill, not an
        // abandoned Promise. Replacement waits for actual callbacks and exit.
        if (signal?.aborted || process?.unavailable) { await process?.close(); process = undefined; identity = undefined; }
        active = undefined;
      }
    },
    async abortTurn() {
      generation++;
      if (active) active.cancelled = true;
      const previous = process; previous?.abort(); await previous?.close();
      if (process === previous) { process = undefined; identity = undefined; }
    },
    async close() { closed = true; generation++; if (active) active.cancelled = true; const previous = process; await previous?.close(); if (process === previous) { process = undefined; identity = undefined; } },
  });
}
