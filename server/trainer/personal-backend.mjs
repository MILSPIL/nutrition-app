import { createHash } from "node:crypto";
import { posix } from "node:path";
import { nativeDraftCompletion, readyDraftAckInPayload } from "./draft-completion.mjs";
import { stableJSON, TOOLS } from "./limits.mjs";
import { MODEL_TOOL_ERRORS, safeToolFailure } from "./tool-errors.mjs";

const answer = value => {
  if (value.state !== "completed" || typeof value.result?.final_response !== "string") throw Object.assign(Error("trainer_failed"), { knownNativeTerminal: ["completed", "failed", "cancelled"].includes(value.state) });
  const text = value.result.final_response;
  // The entire answer is canonical in Native history. This is only a bounded
  // projection receipt required by the legacy draft publication transaction.
  return { text: Buffer.byteLength(text) <= 16000 ? text : "Відповідь тренера збережено в розмові." };
};
export function nativeMessageProjection(snapshot, inputForAdmission = () => undefined) {
  let turnId, input;
  return (snapshot.messages || []).flatMap((message, index) => {
    if (message.role === "user") {
      // Native persists the durable admission ID as platform_message_id. Never
      // infer identity from repeated words or a calendar date.
      const admission = message.message_id ?? message.platform_message_id;
      input = typeof admission === "string" && admission.length > 0 && admission.length <= 256 && !/[\0\r\n]/.test(admission)
        ? inputForAdmission(admission) : undefined;
      turnId = input?.inputId;
    }
    if (!["user", "assistant"].includes(message.role)) return [];
    const content = typeof message.content === "string" ? message.content
      : Array.isArray(message.content) ? message.content.filter(part => part?.type === "text").map(part => part.text || "").join("\n") : "";
    if (!content.trim()) return [];
    const id = "native-" + createHash("sha256").update(stableJSON([snapshot.session_id, message.row_id ?? message.id ?? index, message.role, content])).digest("hex");
    let photos = [], visible = content;
    if (message.role === "assistant" && message.display_kind === "failed_turn")
      visible = "Не вдалося обробити повідомлення. Текст збережений у розмові. Перед повторним надсиланням перевірте щоденник.";
    const root = typeof snapshot.profileId === "string" ? posix.join(snapshot.profileId, "cache/documents/native-inputs") + "/" : "";
    if (message.role === "user" && root) {
      const candidates = [], hint = /^\[Image attached at: ([^\r\n]+)\]$/gm;
      for (const match of content.matchAll(hint)) {
        const relative = match[1].startsWith(root) ? match[1].slice(root.length) : "";
        if (/^[a-f0-9]{64}\/[A-Za-z0-9_.-]{1,160}\.(png|jpe?g|webp|gif)$/.test(relative)) candidates.push({ line: match[0], ref: Buffer.from(relative).toString("base64url") });
      }
      const suffix = content.match(/(?:\n\[screenshot(?: detail=(?:low|high|auto))?\])+$/);
      // Only paired, own-native image hints + the actual trailing marker block
      // are machine presentation. A literal user '[screenshot]' stays intact.
      if (candidates.length && suffix && (suffix[0].match(/\[screenshot/g) || []).length === candidates.length) {
        visible = content.slice(0, suffix.index);
        for (const photo of candidates) visible = visible.replace(photo.line, "");
        visible = visible.replace(/\n+$/, ""); photos = candidates.map(({ ref }) => ({ ref }));
      }
    }
    if (message.role === "user" && typeof input?.text === "string") visible = input.text;
    return [{ id, role: message.role, content: visible, native: true, ...(turnId ? { turnId } : {}), ...(photos.length ? { photos } : {}) }];
  });
}

// Per-account adapter. Shared coordinator owns processes/queue; this adapter
// owns only this account's app leases, drafts and temporary media references.
export function createPersonalBackend({ uid, core, tools, store, releaseTools = () => {}, stageAttachments, verify = async () => {}, problems }) {
  // COACH-PROBLEMS-01 S2: лише код і назва інструмента; збій журналу не змінює хід.
  const problem = (...args) => { try { problems?.record(...args); } catch { /* journal is best effort */ } };
  const execution = new Map(), transports = new Map();
  const backend = {
    canonicalHistory: true,
    transport(inputId, value) {
      if (transports.has(inputId)) throw Error("turn_conflict");
      transports.set(inputId, value);
      return () => { if (transports.get(inputId) === value && !execution.has(inputId)) transports.delete(inputId); };
    },
    schedule(turn, run, { signal }) {
      if (turn.owner !== uid) throw Error("profile_mismatch");
      const input = JSON.parse(turn.input), transport = transports.get(turn.id) ?? {};
      core.enqueue(uid, turn.id, { text: input.text, sentAt: input.sentAt, targetDate: input.targetDate, dateContext: input.dateContext, media: input.media || [] }, { channel: transport.channel ? "desktop" : "web" });
      return core.schedule(uid, turn.id, run, { signal });
    },
    async start(args) {
      if (args.turn.owner !== uid || !args.slot?.execute || execution.has(args.turn.id)) throw Error("turn_conflict");
      const transport = transports.get(args.turn.id) ?? {}, state = { settled: false };
      state.done = new Promise(resolve => { state.finish = resolve; }); execution.set(args.turn.id, state);
      let contextError, boundRun, readyAck;
      const bind = native => {
        const ids = { runId: native.admission_id ?? native.admissionId, sessionId: native.ref?.session_id ?? native.sessionId };
        if (boundRun && (boundRun.runId !== ids.runId || boundRun.sessionId !== ids.sessionId)) throw Error("native_receipt_invalid");
        if (!boundRun) { args.onRun(ids); boundRun = ids; }
      };
      try {
        const value = await args.slot.execute({ channel: transport.channel, expectedSessionId: transport.sessionId,
          prepare: async ({ signal, sessionId, stageAttachments: nativeStage }) => {
            let attachments = [];
            if (stageAttachments) attachments = await stageAttachments(uid, args.turn.id, args.images, { sessionId, signal });
            else if (args.images?.length) {
              if (!nativeStage) throw Error("media_unavailable");
              attachments = await nativeStage(args.images);
            }
            const context = { turn: args.turn, input: args.input, snapshot: args.snapshot, signal };
            return { apiText: JSON.stringify({ ...args.snapshot, history: [] }), attachments,
              verify: async () => { try { await args.verifySnapshot?.(); await verify(args.turn, signal); } catch (error) { contextError = error; throw error; } },
              completeDraft: store ? async (payload, connection) => {
                if (!readyDraftAckInPayload(payload, readyAck)) return;
                store.assertPersonalDraftCompletion(args.turn.id, args.turn.generation, readyAck);
                return nativeDraftCompletion(connection.model, payload.stream === true);
              } : undefined,
              tools: async (name, parameters, { signal, nativeBinding }) => {
                bind(nativeBinding);
                if (!TOOLS.includes(name) || typeof tools[name] !== "function") throw Error("invalid_request");
                // A later tool failure invalidates the shortcut; user/model text
                // cannot manufacture this acknowledgement.
                readyAck = undefined;
                let result;
                // The private process pipe turns unknown errors into trainer_unavailable;
                // a repairable code must reach the model as a result with its hint.
                try { result = await tools[name](parameters, { ...context, signal }); }
                catch (error) { problem("tool_error", error?.message, name); if (MODEL_TOOL_ERRORS.has(error?.message)) return safeToolFailure(error); throw error; }
                if (name === "propose_food_draft" && result?.state === "ready" && result.saved === false && result.incomplete === false) readyAck = structuredClone(result);
                return result;
              },
              onAdmission: async native => {
                bind(native);
                await transport.onAdmission?.(native);
              },
            };
          },
        });
        if (contextError) throw contextError;
        return answer(value);
      } catch (error) {
        // Durable queued means dispatch has never happened. Preserve unknown
        // only when that proof cannot be read or native may have executed.
        let notExecuted = false;
        try { const row = core.input(uid, args.turn.id); notExecuted = row.state === "queued" && !row.admissionId; } catch { /* no proof */ }
        if (notExecuted) throw Object.assign(Error(error?.message || "trainer_unavailable"), { definitelyNotExecuted: true });
        throw error;
      } finally { state.settled = true; state.finish(); }
    },
    async history(owner) {
      if (owner !== uid) throw Error("profile_mismatch");
      return nativeMessageProjection(await core.history(uid), admission => core.displayInputForAdmission
        ? core.displayInputForAdmission(uid, admission) : core.inputForAdmission?.(uid, admission));
    },
    latest(owner, turn) {
      if (!turn || owner !== uid) return turn;
      let input; try { input = core.input(uid, turn.turnId); } catch { return turn; }
      return { ...turn, nativeInputClaimed: Number.isSafeInteger(input.generation) && input.generation > 0 };
    },
    async status(turn) {
      if (turn.owner !== uid) throw Error("profile_mismatch");
      const value = await core.status(uid, turn.id);
      if (value.state === "queued" && !value.admissionId && execution.get(turn.id)?.settled !== false) return { state: "not_executed" };
      return value.state === "completed" ? { state: "completed", result: answer(value) } : { state: value.state };
    },
    async stop(turn, { explicit = false, signal } = {}) {
      if (turn.owner !== uid) throw Error("profile_mismatch");
      await execution.get(turn.id)?.done;
      if (explicit) return core.cancelInput(uid, turn.id, { signal });
      return { stopped: true };
    },
    async cleanup(turn) {
      if (turn.owner !== uid) throw Error("profile_mismatch");
      if (execution.get(turn.id)?.settled === false) return { cleaned: false };
      if (turn.state === "cancelled") {
        let row;
        try { row = core.input(uid, turn.id); }
        catch { return { cleaned: false }; }
        if (row && ["dispatching", "admitted", "unknown"].includes(row.state)) return { cleaned: false };
      }
      releaseTools(turn.id); transports.delete(turn.id); execution.delete(turn.id);
      // Canonical Native sessions/DB/media are never deleted as per-turn cleanup.
      return { cleaned: true };
    },
    async shutdown() { await Promise.allSettled([...execution.values()].map(state => state.done)); },
  };
  return Object.freeze(backend);
}
