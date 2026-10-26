import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { personalQueue } from "./personal-queue.mjs";
import { abortable } from "./deadline.mjs";
import { TOOLS, requireId, stableJSON } from "./limits.mjs";
import { PERSONAL_LIMITS } from "./personal-limits.mjs";

const uncertain = () => Error("execution_unknown");
const signature = value => stableJSON([value.provider, value.model, value.contextWindow, value.supportsVision]);

// This is the ONLY mutation ingress for web and Desktop. A transport may read
// its own owner, but cannot forward arbitrary native RPCs, model overrides or
// executable policy. The native store remains canonical; outbox is a receipt.
export function createPersonalCoordinator({ profiles, outbox, payer, ownerFactory, prepare, onEvent = () => {}, now = Date.now, queue = personalQueue(), pollMs = 25 }) {
  const owners = new Map(), running = new Map(), slots = new WeakSet(), startups = new Set(), openings = new Map(), generations = new Map();
  let active, changing = false, closed = false;
  const key = (uid, inputId) => uid + ":" + inputId;
  async function retire(uid, record) {
    if (!record) return;
    record.retiring ??= Promise.resolve().then(() => record.owner.close());
    try { await record.retiring; }
    catch { closed = true; throw Error("owner_shutdown_incomplete"); }
    if (owners.get(uid) === record) owners.delete(uid);
  }
  function ownerFor(uid) {
    if (closed || changing) return Promise.reject(Error(closed ? "trainer_unavailable" : "trainer_busy"));
    if (openings.has(uid)) return openings.get(uid);
    const task = openOwner(uid, generations.get(uid) ?? 0); openings.set(uid, task);
    startups.add(task); task.finally(() => { startups.delete(task); if (openings.get(uid) === task) openings.delete(uid); }).catch(() => {});
    return task;
  }
  async function openOwner(uid, version, preparingSelection) {
    const valid = () => !closed && !preparingSelection?.signal.aborted && (!changing || preparingSelection) && version === (generations.get(uid) ?? 0);
    const profile = profiles.resolve(uid), connecting = payer.start();
    const connection = await (preparingSelection ? abortable(connecting, preparingSelection.signal) : connecting);
    if (!valid()) throw Error("trainer_unavailable");
    let record = owners.get(uid);
    if (record?.retiring) { await retire(uid, record); record = undefined; }
    if (!valid()) throw Error("trainer_unavailable");
    if (record && record.signature !== signature(connection)) {
      if (active) throw Error("trainer_busy");
      await retire(uid, record); record = undefined;
    }
    if (!valid()) throw Error("trainer_unavailable");
    if (!record) {
      const owner = ownerFactory(profile, {
        connection,
        onModel(payload, options) {
          if (!active || active.uid !== uid || active.owner !== owner || !active.invoke) throw uncertain();
          callbackBinding(uid, record, options.nativeBinding);
          return (async () => {
            await active.verify?.();
            // Once the real physical budget is exhausted, only a validated
            // ready-draft acknowledgement may complete without another POST.
            const local = outbox.postBudget(uid, active.inputId).remaining === 0
              ? await active.completeDraft?.(payload, record.connection) : undefined;
            const result = local ?? await active.invoke(payload, { ...options, signal: AbortSignal.any([options.signal, active.signal].filter(Boolean)) });
            await active.verify?.();
            return result;
          })();
        },
        onTool(name, arguments_, { signal, nativeBinding }) {
          if (!TOOLS.includes(name) || !active || active.uid !== uid || active.owner !== owner || !active.tools) throw uncertain();
          callbackBinding(uid, record, nativeBinding);
          return active.tools(name, arguments_, { signal: AbortSignal.any([signal, active.signal].filter(Boolean)), nativeBinding });
        },
        onEvent: (channel, event) => onEvent(uid, channel, event),
      });
      record = { owner, connection, signature: signature(connection) };
      owners.set(uid, record);
      record.ready = owner.start().then(identity => {
        if (identity.profileId !== profile.home) throw Error("profile_mismatch");
        record.identity = identity;
      }).catch(async error => { await retire(uid, record); throw error; });
    }
    preparingSelection?.track(uid, record);
    await (preparingSelection ? abortable(record.ready, preparingSelection.signal) : record.ready);
    if (!valid()) { await retire(uid, record); throw Error("trainer_unavailable"); }
    return record;
  }
  function callbackBinding(uid, record, value) {
    const binding = outbox.binding(uid, active.inputId), row = outbox.read(uid, active.inputId);
    if (!value || value.profileId !== profiles.resolve(uid).home || value.inputId !== binding.inputId || value.sessionId !== binding.sessionId ||
        value.inputProof !== binding.payloadHmac || value.authorityEpoch !== record.identity.authorityEpoch ||
        !Number.isSafeInteger(value.sequence) || value.sequence < 1 || !Number.isSafeInteger(value.generation) || value.generation < 1 ||
        !["dispatching", "admitted"].includes(row.state)) throw uncertain();
    outbox.admitted(uid, active.inputId, { ...binding, admissionId: value.admissionId, generation: value.generation, nativeMessageId: null });
  }
  function receipt(uid, inputId, record, value) {
    const binding = outbox.binding(uid, inputId), profile = profiles.resolve(uid);
    if (!value || value.ref?.profile_id !== profile.home || value.ref.session_id !== binding.sessionId ||
        !Number.isSafeInteger(value.authority_epoch) || value.authority_epoch < 1 || value.authority_epoch > record.identity.authorityEpoch || !Number.isSafeInteger(value.sequence) || value.sequence < 1 ||
        !["queued", "started", "terminal", "unknown"].includes(value.status)) throw Error("native_receipt_invalid");
    const proof = { ...binding, admissionId: value.admission_id, generation: value.execution_generation, nativeMessageId: null };
    const existing = outbox.read(uid, inputId);
    if (value.status === "queued" && value.execution_generation === null && existing.generation !== null && existing.admissionId === value.admission_id) return existing;
    outbox.admitted(uid, inputId, proof);
    if (value.status === "terminal") {
      const state = value.outcome === "completed" ? "completed" : ["interrupted", "cancelled", "discarded"].includes(value.outcome) ? "cancelled" : "failed";
      const resultRevision = createHash("sha256").update(stableJSON([value.ref, value.admission_id, value.execution_generation, value.outcome, value.result ?? null, value.usage ?? {}])).digest("hex");
      outbox.settle(uid, inputId, { ...proof, state, resultRevision });
    } else if (value.status === "unknown") outbox.unknown(uid, inputId);
    return outbox.read(uid, inputId);
  }
  async function execute(slot, context) {
    if (!slots.delete(slot) || closed) throw Error("turn_conflict");
    const { uid, inputId, signal, deadline } = slot;
    let record, dispatched = false, stopping, staged = false;
    const abort = () => {
      generations.set(uid, (generations.get(uid) ?? 0) + 1);
      const candidate = record ?? owners.get(uid); candidate?.owner.abort?.();
      stopping ??= Promise.allSettled([payer.abortTurn(), retire(uid, candidate)]);
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    try {
      const row = outbox.read(uid, inputId);
      if (row.state !== "queued") throw Error("turn_conflict");
      record = await ownerFor(uid);
      const channel = row.channel === "desktop" ? context.channel : "web";
      if (typeof channel !== "string" || !/^(web|desktop)(:[A-Za-z0-9_-]{1,80})?$/.test(channel)) throw Error("invalid_request");
      const bot = await record.owner.bot(channel, { signal, timeoutMs: Math.max(1, Math.floor(deadline - now())) });
      const sessionId = row.sessionId || bot.session_id;
      if (context.expectedSessionId && context.expectedSessionId !== sessionId) throw Error("session_changed");
      if (row.sessionId) await record.owner.rpc(channel, "session.resume", { session_id: sessionId }, { signal, timeoutMs: Math.max(1, Math.floor(deadline - now())) });
      const payload = outbox.payload(uid, inputId);
      const prepared = await context.prepare({ uid, inputId, payload, sentAt: payload.sentAt ?? row.sentAt, signal, deadline, sessionId,
        stageAttachments: images => {
          staged = true;
          return record.owner.stageImages(inputId, images, { signal, timeoutMs: Math.max(1, Math.floor(deadline - now())) });
        } });
      if (signal.aborted || now() >= deadline) throw Error("trainer_timeout");
      if (!prepared || typeof prepared.apiText !== "string" || Buffer.byteLength(prepared.apiText) > 1024 * 1024 || typeof prepared.tools !== "function") throw Error("model_payload_invalid");
      outbox.startBudget(uid, inputId);
      outbox.bind(uid, inputId, sessionId);
      outbox.dispatch(uid, inputId); dispatched = true;
      return await payer.withTurn({ uid, inputId, signal, deadline }, async invoke => {
        active = { uid, inputId, owner: record.owner, invoke, tools: prepared.tools, verify: prepared.verify, completeDraft: prepared.completeDraft, signal };
        let native = await record.owner.rpc(channel, "prompt.submit", {
          session_id: sessionId, submission_id: inputId, text: payload.text, api_text: `SCISENSE-INPUT-V1 ${inputId} ${outbox.binding(uid, inputId).payloadHmac}\n` + prepared.apiText,
          ...(prepared.attachments?.length ? { attachments: prepared.attachments } : {}),
        }, { signal, timeoutMs: Math.max(1, Math.floor(deadline - now())) });
        if (native.status === "terminal") native = await record.owner.rpc(channel, "prompt.receipt", { session_id: sessionId, admission_id: native.admission_id, include_result: true }, { signal, timeoutMs: Math.max(1, Math.floor(deadline - now())) });
        receipt(uid, inputId, record, native);
        await prepared.onAdmission?.(native);
        while (["queued", "started"].includes(native.status)) {
          await sleep(pollMs, undefined, { signal });
          native = await record.owner.rpc(channel, "prompt.receipt", { session_id: sessionId, admission_id: native.admission_id, include_result: true },
            { signal, timeoutMs: Math.max(1, Math.floor(deadline - now())) });
          receipt(uid, inputId, record, native);
        }
        if (native.status === "unknown") throw uncertain();
        return { ...outbox.read(uid, inputId), nativeReceipt: native, result: native.result ?? null };
      });
    } catch (error) {
      try { if (dispatched) outbox.unknown(uid, inputId); }
      finally {
        // Startup/RPC/read failures also retire dead cached processes. A full
        // or replaced outbox must never prevent independent OS cleanup.
        const cleanup = await Promise.allSettled([payer.abortTurn(), retire(uid, record)]);
        if (cleanup.some(result => result.status === "rejected")) { closed = true; throw Error("owner_shutdown_incomplete"); }
      }
      throw error;
    } finally {
      signal.removeEventListener("abort", abort); await stopping;
      try {
        if (staged && record && !record.owner.exited) {
          try { await record.owner.clearStaged(inputId, { timeoutMs: 5000 }); }
          catch { await retire(uid, record); }
        }
      } finally { active = undefined; }
    }
  }
  async function schedule(uid, inputId, callback, { signal } = {}) {
    if (closed) throw Error("trainer_unavailable");
    profiles.resolve(uid); requireId(inputId);
    return queue.run(uid, async signal => {
      const slot = Object.freeze({ uid, inputId, signal, deadline: now() + PERSONAL_LIMITS.deadlineMs }); slots.add(slot);
      try { return await callback({ signal, deadline: slot.deadline, execute: context => execute(slot, context) }); }
      finally { slots.delete(slot); }
    }, { signal });
  }
  return Object.freeze({
    // Trusted app admission already captured original sentAt. A Desktop facade
    // constructs it itself; raw client api_text/sentAt/profile are never copied.
    enqueue(uid, inputId, payload, { channel = "web" } = {}) {
      if (closed || typeof payload?.text !== "string" || !payload.text.trim() || Buffer.byteLength(payload.text) > 8000) throw Error("invalid_request");
      return outbox.enqueue(uid, inputId, payload, { channel });
    },
    schedule,
    input: (uid, inputId) => outbox.read(uid, inputId),
    async submit(uid, inputId, payload, { channel = "web", signal, prepare: prepareInput = prepare, expectedSessionId } = {}) {
      const enqueued = this.enqueue(uid, inputId, payload, { channel: channel === "web" ? "web" : "desktop" });
      if (enqueued.state !== "queued") return this.status(uid, inputId);
      const id = key(uid, inputId);
      if (!running.has(id)) {
        const task = schedule(uid, inputId, slot => slot.execute({ prepare: prepareInput, channel, expectedSessionId }), { signal });
        running.set(id, task); task.finally(() => running.delete(id)).catch(() => {});
      }
      return running.get(id);
    },
    async status(uid, inputId) {
      if (closed) throw Error("trainer_unavailable");
      const row = outbox.read(uid, inputId);
      if (row.state === "queued") return row;
      if (!row.admissionId && row.state !== "unknown") return row;
      const record = await ownerFor(uid);
      try {
        const native = row.admissionId
          ? await record.owner.rpc("web", "prompt.receipt", { session_id: row.sessionId, admission_id: row.admissionId, include_result: true })
          : await record.owner.lookup("web", outbox.binding(uid, inputId));
        if (!native) return row; // Miss never permits resubmission.
        return { ...receipt(uid, inputId, record, native), nativeReceipt: native, result: native.result ?? null };
      } catch (error) { await retire(uid, record); throw error; }
    },
    // Native history includes messages from BOTH channels; the app turn store
    // is never used as an independent editable assistant conversation.
    async history(uid, channel = "web") {
      const record = await ownerFor(uid);
      try { return { ...await record.owner.bot(channel), profileId: record.identity.profileId, instanceId: record.identity.instanceId }; }
      catch (error) { await retire(uid, record); throw error; }
    },
    async readNative(uid, channel, method, params = {}, { signal } = {}) {
      const allowed = {
        "session.resume": ["session_id", "defer_history", "omit_messages", "cols", "display_projection"],
        "session.info": ["session_id"],
        "session.events.since": ["session_id", "last_sequence", "last_seen", "replay_epoch"],
        "prompt.receipt": ["session_id", "admission_id", "include_result"],
      };
      if (!Object.hasOwn(allowed, method) || !params || Array.isArray(params) ||
          Object.keys(params).some(key => !allowed[method].includes(key))) throw Error("desktop_method_forbidden");
      const record = await ownerFor(uid);
      try {
        const bot = await record.owner.bot(channel);
        if (params.session_id !== bot.session_id) throw Error("session_changed");
        const reading = record.owner.rpc(channel, method, params, { timeoutMs: 5000 });
        return await (signal ? abortable(reading, signal) : reading);
      } catch (error) { if (record.owner.unavailable) await retire(uid, record); throw error; }
    },
    async context(uid, { signal } = {}) {
      const record = await ownerFor(uid);
      // Abandoning a read must not kill an authority executing a model turn.
      const reading = record.owner.contextRead({ timeoutMs: 5000 });
      try { return await (signal ? abortable(reading, signal) : reading); }
      catch (error) { if (record.owner.unavailable) await retire(uid, record); throw error; }
    },
    async photo(uid, reference, variant, { signal } = {}) {
      const record = await ownerFor(uid);
      const reading = record.owner.photoRead(reference, variant, { timeoutMs: 5000 });
      try { return await (signal ? abortable(reading, signal) : reading); }
      catch (error) { if (record.owner.unavailable) await retire(uid, record); throw error; }
    },
    deletePhoto(uid, reference, { signal } = {}) {
      profiles.resolve(uid);
      // No unlink while native replay or another model turn may read it.
      return queue.run(uid, async signal => {
        const record = await ownerFor(uid);
        try { return await record.owner.photoDelete(reference, { signal, timeoutMs: 5000 }); }
        catch (error) { if (record.owner.unavailable) await retire(uid, record); throw error; }
      }, { signal });
    },
    commitContext(uid, proposal, { signal } = {}) {
      profiles.resolve(uid);
      return queue.run(uid, async signal => {
        const record = await ownerFor(uid);
        try { return await record.owner.contextCommit(proposal, { signal, timeoutMs: 5000 }); }
        catch (error) { if (record.owner.unavailable) await retire(uid, record); throw error; }
      }, { signal });
    },
    connection(uid) { profiles.resolve(uid); if (closed || changing) throw Error("trainer_busy"); return payer.start(); },
    modelOptions(uid, { signal } = {}) {
      profiles.resolve(uid);
      return queue.run(uid, signal => payer.modelOptions({ signal }), { signal });
    },
    selectModel(uid, selection, { signal } = {}) {
      const profile = profiles.resolve(uid);
      if (uid !== profile.fundingOwner) return Promise.reject(Error("model_owner_required"));
      if (!selection || Object.keys(selection).length !== 2 || typeof selection.model !== "string" ||
          !selection.model || selection.model.length > 160 || /[\0\r\n]/.test(selection.model) || selection.provider !== "openai-codex")
        return Promise.reject(Error("model_selection_refused"));
      return queue.run(uid, async signal => {
        changing = true;
        const deadline = now() + PERSONAL_LIMITS.deadlineMs;
        const preparing = new Map(owners), draining = new Map();
        let payerDrain;
        const stopOwners = () => {
          for (const [uid, record] of preparing) {
            if (draining.has(record)) continue;
            try { record.owner.abort?.(); } catch {} // close still proves physical exit.
            const task = retire(uid, record); draining.set(record, task); task.catch(() => {});
          }
        };
        const stop = () => {
          if (!payerDrain) {
            payerDrain = Promise.resolve().then(() => payer.abortTurn());
            payerDrain.catch(() => {});
          }
          stopOwners();
        };
        const preparation = { signal, track(uid, record) { preparing.set(uid, record); if (signal.aborted) stop(); } };
        signal.addEventListener("abort", stop, { once: true });
        if (signal.aborted) stop();
        try {
          signal.throwIfAborted();
          for (const { uid } of profiles.entries()) generations.set(uid, (generations.get(uid) ?? 0) + 1);
          await Promise.allSettled([...startups]);
          const retired = await Promise.allSettled([...owners.entries()].map(([uid, record]) => retire(uid, record)));
          if (retired.some(result => result.status === "rejected")) throw Error("owner_shutdown_incomplete");
          signal.throwIfAborted();
          const selected = await payer.selectModel({ provider: selection.provider, model: selection.model }, { signal });
          // A model change retires every authority. Prepare their native chat
          // before reopening the five-second context-read window, just as at
          // initial runtime startup. Keep all read ingress fenced meanwhile.
          const warming = profiles.entries().map(({ uid }) => {
              const task = (async () => {
                signal.throwIfAborted();
                const record = await openOwner(uid, generations.get(uid) ?? 0, preparation);
                signal.throwIfAborted();
                const remaining = Math.floor(deadline - now());
                if (remaining <= 0) throw Error("trainer_timeout");
                await abortable(record.owner.bot("web", { signal, timeoutMs: remaining }), signal);
                signal.throwIfAborted();
              })();
              startups.add(task);
              task.finally(() => startups.delete(task)).catch(() => {});
              return task;
          });
          const results = await Promise.allSettled(warming);
          const failed = results.find(result => result.status === "rejected");
          if (failed || signal.aborted) {
            stopOwners();
            throw signal.aborted ? signal.reason : failed.reason;
          }
          return selected;
        } finally {
          if (signal.aborted) stop();
          signal.removeEventListener("abort", stop);
          try {
            const drained = await Promise.allSettled([...draining.values(), ...(payerDrain ? [payerDrain] : [])]);
            if (drained.some(result => result.status === "rejected")) { closed = true; throw Error("owner_shutdown_incomplete"); }
          } finally { changing = false; }
        }
      }, { signal });
    },
    state: uid => queue.state(profiles.resolve(uid).uid),
    async close() {
      closed = true;
      const results = await Promise.allSettled([queue.close(), payer.close(), ...[...owners.entries()].map(([uid, record]) => retire(uid, record))]);
      await Promise.allSettled([...startups]);
      const remaining = await Promise.allSettled([...owners.entries()].map(([uid, record]) => retire(uid, record)));
      if ([...results, ...remaining].some(result => result.status === "rejected")) throw Error("owner_shutdown_incomplete");
      owners.clear();
    },
  });
}
