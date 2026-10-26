import { stableJSON, requireId } from "./limits.mjs";
import { validateImages } from "./media.mjs";
import { abortable } from "./deadline.mjs";

// The caller is an operator-bound transport, never an HTTP body/profile selector.
// All mutations still enter the account's ordinary AppGateway and global core.
export function createPersonalDesktopAdapter({ uid, channel, profileId, account, core, admissions, detach }) {
  let closed = false;
  const check = () => { if (closed) throw Error("trainer_unavailable"); };
  const hashImage = image => {
    check();
    validateImages([image]);
    return account.store.hash({ image: Buffer.from(image.data, "base64").toString("base64") });
  };
  const knownTurn = id => {
    try {
      return account.store.internal(id);
    } catch (error) { if (error.message === "not_found" || error.status === 404) return; throw error; }
  };
  async function nativeReceipt(id) {
    const result = await core.status(uid, id);
    if (result.nativeReceipt) return result.nativeReceipt;
    throw Error(result.state === "unknown" ? "execution_unknown" : "trainer_unavailable");
  }
  const ownedTurn = id => {
    const row = knownTurn(id);
    if (row && row.owner !== uid) throw Error("not_found");
    return row;
  };
  return Object.freeze({
    uid, channel, profileId,
    hashImage,
    history() { check(); return core.history(uid, channel); },
    read(method, params, options) { check(); return core.readNative(uid, channel, method, params, options); },
    photo(reference, variant = "original", options) { check(); return core.photo(uid, reference, variant, options); },
    connection() { check(); return core.connection(uid); },
    modelOptions(options) { check(); return core.modelOptions(uid, options); },
    selectModel(selection, options) { check(); return core.selectModel(uid, selection, options); },
    async submit(value, { signal } = {}) {
      check();
      if (!value || Array.isArray(value) || Object.keys(value).some(key => !["inputId", "sessionId", "text", "imageRefs", "images"].includes(key))) throw Error("invalid_request");
      let { inputId, sessionId, text, imageRefs = [], images } = value;
      requireId(inputId);
      if (typeof sessionId !== "string" || !sessionId || sessionId.length > 160 ||
          typeof text !== "string" || Buffer.byteLength(text) > 8000 || !Array.isArray(imageRefs) ||
          imageRefs.length > 2 || imageRefs.some(ref => !/^[a-f0-9]{64}$/.test(ref))) throw Error("invalid_request");
      text = text.trim() || (imageRefs.length ? "Фото їжі" : "");
      if (!text) throw Error("invalid_request");
      const fingerprint = stableJSON([sessionId, text, imageRefs]);
      if (admissions.has(inputId) && admissions.get(inputId).fingerprint !== fingerprint) throw Error("turn_conflict");
      const previous = ownedTurn(inputId);
      if (previous) {
        if (previous.session_id && previous.session_id !== sessionId) throw Error("session_changed");
        const original = JSON.parse(previous.input);
        if (original.text !== text || stableJSON((original.media || []).map(image => image.hmac)) !== stableJSON(imageRefs)) throw Error("turn_conflict");
        // Same immutable app intent. A reconnect never admits/resubmits it,
        // even if original raw uploads or the old socket have disappeared.
        if (previous.run_id) return nativeReceipt(inputId);
        if (!admissions.has(inputId)) throw Error(previous.error || "execution_unknown");
      } else if (!admissions.has(inputId)) {
        if (!Array.isArray(images) || images.length !== imageRefs.length ||
            stableJSON(images.map(hashImage)) !== stableJSON(imageRefs)) throw Error("media_missing");
        const view = account.store.conversation(uid);
        let resolveReceipt;
        const pending = { promise: new Promise(resolve => { resolveReceipt = resolve; }), receipt: undefined, initializing: true, fingerprint };
        admissions.set(inputId, pending);
        let releaseTransport;
        try {
          releaseTransport = account.backend.transport(inputId, { channel, sessionId, onAdmission(value) {
            pending.receipt = value; resolveReceipt(value);
          } });
          const response = await account.gateway.handle(uid, "/turns", "POST", {
            turnId: inputId, baseRevision: view.revision, text, images, dateContext: { mode: "default" },
          }, { signal });
          if (!response.ok) throw Error("trainer_unavailable");
        } catch (error) {
          pending.error = error; resolveReceipt(null); admissions.delete(inputId);
          if (!ownedTurn(inputId)) releaseTransport?.();
          throw error;
        } finally { pending.initializing = false; }
      }
      const pending = admissions.get(inputId);
      if (!pending) return nativeReceipt(inputId);
      const waiting = (async () => {
        const deadline = Date.now() + 225000;
        while (!pending.receipt) {
          check(); signal?.throwIfAborted();
          if (pending.error) throw pending.error;
          const row = ownedTurn(inputId);
          if (!row && !pending.initializing) throw Error("execution_unknown");
          if (row && !["queued", "running", "unknown"].includes(row.state)) {
            if (row.run_id) return nativeReceipt(inputId);
            throw Error(row.error || "trainer_failed");
          }
          if (Date.now() >= deadline) throw Error("execution_unknown");
          await Promise.race([pending.promise, new Promise(resolve => setTimeout(resolve, 25))]);
        }
        return pending.receipt;
      })();
      try { return await (signal ? abortable(waiting, signal) : waiting); }
      finally {
        // Do not abandon/cancel an admitted native turn when its socket closes.
        // Its receipt and original date are durable; later retry reads them.
        if (pending.receipt || !["queued", "running", "unknown"].includes(ownedTurn(inputId)?.state)) admissions.delete(inputId);
      }
    },
    async cancel(admissionId) {
      check();
      const view = account.store.conversation(uid), current = account.store.current(uid, view.conversationId);
      if (!current) return { interrupted: false };
      const row = ownedTurn(current.turnId);
      if (admissionId && row?.run_id !== admissionId) throw Error("not_found");
      const response = await account.gateway.handle(uid, `/turns/${current.turnId}/cancel`, "POST", {});
      if (!response.ok) throw Error("trainer_unavailable");
      return { interrupted: true };
    },
    async close() { if (closed) return; closed = true; await detach(); },
  });
}
