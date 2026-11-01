import { commandFromDraft } from "./drafts.mjs";
import { abortable, boundedOperation } from "./deadline.mjs";
import { buildSnapshot } from "./snapshot.mjs";
import { createHash } from "node:crypto";
import { LIMITS, fail, requireId, stableJSON } from "./limits.mjs";
import { validateDateContext, turnDateContext } from "./date-context.mjs";
import { loadConfirmed, sameFreshness } from "./day-snapshot.mjs";
const reply = (data, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
function inputBody(body) {
  if (
    !body ||
    Object.keys(body).some(
      (k) =>
        !["turnId", "baseRevision", "text", "targetDate", "dateContext", "images"].includes(k),
    )
  )
    fail("invalid_request");
  requireId(body.turnId);
  if (
    !Number.isSafeInteger(body.baseRevision) ||
    body.baseRevision < 0 ||
    typeof body.text !== "string" ||
    !body.text.trim() ||
    Buffer.byteLength(body.text) > LIMITS.userBytes
  )
    fail("invalid_request");
  const dateContext=validateDateContext(body.dateContext,body.targetDate);
  return {turnId:body.turnId,baseRevision:body.baseRevision,text:body.text,dateContext,images:body.images??[]};
}
// The transport authenticates owner before reading a body. The coordinator never
// accepts provider/model/profile/session/tool configuration from the browser.
export function createTrainerGateway({
  ownerUid,
  store,
  media,
  proxy,
  backend,
  readContext,
  readDay,
  readPlan,
  readSnapshot,
  contextStore,
  memoryWriteEnabled = false,
  releaseTools = () => {},
  now = Date.now,
  runDeadlineMs = LIMITS.deadlineMs,
  snapshotFactory = buildSnapshot,
  queueWindowMs = LIMITS.deadlineMs,
  authorizeTurn = async () => {},
  unknownGraceMs = 30000,
  settleStopMs = Math.min(90000, runDeadlineMs),
}) {
  if (typeof ownerUid !== "string" || !ownerUid || ownerUid.length > 128)
    fail("trainer_config", 503);
  if (
    !Number.isInteger(runDeadlineMs) ||
    runDeadlineMs < 1 ||
    runDeadlineMs > 180000
  )
    fail("trainer_config", 503);
  if (
    !Number.isInteger(unknownGraceMs) ||
    unknownGraceMs < 0 ||
    !Number.isInteger(settleStopMs) ||
    settleStopMs < 1 ||
    settleStopMs > runDeadlineMs
  )
    fail("trainer_config", 503);
  const fresh=(uid,date,signal)=>boundedOperation(s=>loadConfirmed({readSnapshot,readDay,readPlan},uid,date,s),5000,signal);
  async function verifyTurn(turn,signal) {
    const snapshot=JSON.parse(turn.snapshot),proofs=store.dayProofs?.(turn.owner,turn.id)||[];
    for(const proof of proofs) {
      const value=await fresh(turn.owner,proof.targetDate,signal);
      if(!sameFreshness(proof,value.day.freshness))fail("stale_snapshot",409);
    }
    if(readContext&&snapshot.contextRevision!==undefined){
      const context=await boundedOperation(s=>readContext(turn.owner,s),5000,signal);
      if(context.revision!==snapshot.contextRevision)fail("stale_snapshot",409);
    }
  }
  async function contextValue(uid, conversationId, signal) {
    const value = await boundedOperation(s => readContext(uid, s), 5000, signal);
    if (backend.canonicalHistory && value.applied && typeof value.applied === "object") {
      for (const proposal of store.contextProposals(uid, conversationId)) {
        if (proposal.state === "applied") continue;
        const proof = createHash("sha256").update(stableJSON({ proposalId: proposal.proposalId, baseRevision: proposal.baseRevision, text: proposal.text })).digest("hex");
        if (value.applied[proposal.proposalId] === proof) store.contextApplied(uid, conversationId, proposal.proposalId);
      }
    }
    return { text: value.text, revision: value.revision, ...(value.mode === "append" ? { mode: "append" } : {}) };
  }
  const controllers = new Map();
  const running = new Map();
  let closed = false,
    maintenanceFault = false,
    cleanupTask = null;
  // Cancelled turns Native confirmed twice it never received (settleCancelled).
  const nativeMissing = new Set();
  async function cleanupOnce() {
    for (const job of store.cleanupJobs()) {
      try {
        store.cleanupAttempt(job.turn_id);
        const turn = store.internal(job.turn_id);
        const proof = await boundedOperation(() =>
          backend.cleanup(turn, { nativeMissing: nativeMissing.has(turn.id) }),
        );
        if (proof?.cleaned !== true) continue;
        media.remove(JSON.parse(turn.input).media || []);
        store.cleaned(turn.id);
        releaseTools(turn.id);
      } catch {
        /* A durable job remains for independent timer/startup recovery. */
      }
    }
  }
  function cleanup() {
    if (!cleanupTask)
      cleanupTask = cleanupOnce().finally(() => {
        cleanupTask = null;
      });
    return cleanupTask;
  }
  async function execute(uid, id, slot) {
    let turn,
      timer,
      entered = false,
      physical;
    const controller = controllers.get(id) ?? new AbortController();
    controllers.set(id, controller);
    const signal = slot ? AbortSignal.any([controller.signal, slot.signal]) : controller.signal;
    try {
      if (slot) {
        const waiting = store.internal(id), input = JSON.parse(waiting.input), c = store.conversation(uid);
        const [context, confirmed] = await boundedOperation(s => Promise.all([readContext(uid, s), fresh(uid, input.targetDate, s)]), 5000, signal);
        const previous = JSON.parse(waiting.snapshot), { day, plan } = confirmed;
        const snapshot = snapshotFactory({ conversationId: waiting.conversation_id, historyRevision: c.revision,
          context: context.text, contextRevision: context.revision, draft: store.drafts(uid, c.conversationId).filter(d => d.state !== "saved"),
          receipts: day.receipts || [], day, plan, message: input.text, history: [], mediaBindings: previous.mediaBindings,
          sentAt: input.sentAt, targetDate: input.targetDate, dateContext: input.dateContext, dateResolution: previous.dateResolution, memoryWriteEnabled });
        store.prepareQueued(uid, id, snapshot, { deadline: slot.deadline, dayProof: day.freshness });
      }
      turn = store.begin(uid, id);
      const input = JSON.parse(turn.input);
      timer = setTimeout(
        () => controller.abort(),
        Math.max(0, Math.min(runDeadlineMs, turn.deadline - now())),
      );
      const images = media.load(input.media || []);
      entered = true;
      physical = backend.start({
          turn,
          signal,
          slot,
          snapshot: JSON.parse(turn.snapshot),
          input,
          images,
          onWorkerExit: () => proxy.cancel(id),
          onRun: (ids) => store.bindRun(id, turn.generation, ids),
          issueLease: () => store.issueLease(id, turn.generation),
          assertDraftCompletion: (ack) => store.assertDraftCompletion(id, turn.generation, ack),
          verifySnapshot: () => verifyTurn(turn, signal),
          modelCall: (lease, payload) => proxy.invoke(lease, payload),
        });
      const result = await abortable(physical, signal);
      try {
        await verifyTurn(turn,signal);
      } catch (error) {
        // The backend already returned. A failed final read must not turn that
        // known execution into an unknown run or publish an unchecked result.
        if(error?.message==="stale_snapshot")throw error;
        fail("day_unavailable",503);
      }
      store.complete(id, turn.generation, result);
    } catch (error) {
      const state = store.internal(id).state;
      if (!["cancelled", "completed", "failed", "unknown"].includes(state))
        store.fail(
          id,
          !entered || error?.definitelyNotExecuted || error?.knownNativeTerminal || ["stale_snapshot","day_unavailable"].includes(error?.message)
            ? error.message
            : "execution_unknown",
          { unknown: entered && !error?.definitelyNotExecuted && !error?.knownNativeTerminal && !["stale_snapshot","day_unavailable"].includes(error?.message) },
        );
    } finally {
      clearTimeout(timer);
      // The shared scheduler slot covers real native shutdown, not merely
      // abortable() settling. Otherwise another profile could execute while
      // this owner's process and payer callbacks are still draining.
      if (slot && physical) await Promise.resolve(physical).catch(() => {});
      await cleanup();
    }
  }
  const launch = (uid, id) => {
    const controller = new AbortController(); controllers.set(id, controller);
    const task = Promise.resolve().then(() => backend.schedule
      ? backend.schedule(store.internal(id), slot => execute(uid, id, slot), { signal: controller.signal })
      : execute(uid, id)).catch(async error => {
        // Scheduler failure happened before execute/admission. Execution errors
        // are already classified by execute, including unknown Native results.
        const turn = store.internal(id);
        if (turn.state === "queued") store.fail(id, error?.message || "trainer_unavailable");
        await cleanup();
      }).finally(() => { running.delete(id); controllers.delete(id); });
    running.set(id, task);
  };
  // A known Native answer for an unknown turn. A stale day or context is a
  // known failure; any other error propagates to the caller.
  async function publishCompleted(turnId, turn, result, signal) {
    try {
      await verifyTurn(turn, signal);
      store.complete(turnId, turn.generation, result);
    } catch (error) {
      if (["stale_snapshot", "day_unavailable"].includes(error?.message))
        store.fail(turnId, error.message);
      else throw error;
    }
  }
  // Shared by HTTP /recover and settleStalled.
  const readNativeStatus = (turn) =>
    boundedOperation(() =>
      backend.status(turn, {
        onRun: (ids) => {
          if (!store.internal(turn.id).run_id)
            store.bindRun(turn.id, turn.generation, ids);
        },
      }),
    );
  // Only a terminal Native state changes the turn; unknown, native_missing or
  // anything else leaves it as it is.
  async function applyNativeStatus(turnId, turn, result, signal) {
    if (result?.state === "completed")
      await publishCompleted(turnId, turn, result.result, signal);
    else if (["failed", "not_executed"].includes(result?.state))
      store.fail(turnId, "trainer_failed");
    else if (result?.state === "cancelled") store.cancel(turn.owner, turnId);
  }
  async function maintain() {
    try {
      store.maintainRetention();
      contextStore?.maintainRetention?.();
      for (const expired of store.expiredPending()) {
        proxy.cancel(expired.id);
        controllers.get(expired.id)?.abort();
        const proof = await boundedOperation(() =>
          backend.stop(store.internal(expired.id)),
        ).catch(() => null);
        if (proof?.stopped === true) store.cancel(expired.owner, expired.id);
      }
      await cleanup();
      maintenanceFault = media.sweep().faults > 0;
    } catch {
      maintenanceFault = true;
    }
  }
  // Stalled-turn settlement (1.9.10). Runs only from the timer, never from
  // startup recover() or /conversation/delete, because one Native stop can take
  // settleStopMs. Failures stay per turn and never set maintenanceFault.
  const SETTLE_RETRY_MS = 60000;
  const retryAt = new Map(), missing = new Map();
  let settleTask = null;
  const nativeStatus = (turn) => readNativeStatus(turn).catch(() => undefined);
  const nativeStop = (turn) =>
    boundedOperation(
      (signal) => backend.stop(turn, { explicit: true, signal }),
      settleStopMs,
    ).then((proof) => proof?.stopped === true, () => false);
  // S1: an unknown turn past deadline + grace. It is closed only after Native
  // confirms the stop, otherwise a new input would queue behind the old one.
  async function settleUnknown(id) {
    let turn = store.internal(id);
    if (turn.state !== "unknown" || turn.expired) return;
    if (now() < turn.deadline + unknownGraceMs || now() < (retryAt.get(id) ?? 0)) return;
    const status = await nativeStatus(turn);
    if (status?.state === "native_missing") {
      // Native never received this input, so there is nothing to stop.
      const count = (missing.get(id) ?? 0) + 1;
      if (count < 2) { missing.set(id, count); return; }
      missing.delete(id);
      if (store.internal(id).state === "unknown") store.fail(id, "trainer_no_reply");
      return;
    }
    missing.delete(id);
    if (["completed", "failed", "not_executed", "cancelled"].includes(status?.state)) {
      turn = store.internal(id);
      if (turn.state === "unknown") await applyNativeStatus(id, turn, status);
      return;
    }
    if (!(await nativeStop(store.internal(id)))) {
      if (store.internal(id).state === "unknown")
        store.fail(id, "trainer_stop_retrying", { unknown: true });
      retryAt.set(id, now() + SETTLE_RETRY_MS);
      return;
    }
    retryAt.delete(id);
    // The answer may have landed between the first status and the stop. After
    // the stop the outbox says cancelled, which is not the user's cancel.
    const after = await nativeStatus(store.internal(id));
    turn = store.internal(id);
    if (turn.state !== "unknown") return;
    if (after?.state === "completed") await publishCompleted(id, turn, after.result);
    else store.fail(id, "trainer_no_reply");
  }
  // S2: a cancelled turn whose Native stop was never confirmed keeps its
  // cleanup job; repeat the stop so the outbox becomes terminal. An input
  // Native never received has nothing to stop: after two confirmed misses the
  // cleanup in settleOnce's finally may release its job.
  async function settleCancelled(job) {
    const turn = store.internal(job.turn_id);
    if (turn.state !== "cancelled" || turn.expired || job.attempts < 2) return;
    if (now() < (retryAt.get(turn.id) ?? 0)) return;
    if ((await nativeStatus(turn))?.state === "native_missing") {
      const count = (missing.get(turn.id) ?? 0) + 1;
      if (count < 2) missing.set(turn.id, count);
      else { missing.delete(turn.id); nativeMissing.add(turn.id); }
      return;
    }
    missing.delete(turn.id);
    if (await nativeStop(turn)) retryAt.delete(turn.id);
    else retryAt.set(turn.id, now() + SETTLE_RETRY_MS);
  }
  function forgetSettled() {
    const unknown = new Set(), held = new Set();
    for (const row of store.pending()) if (row.state === "unknown") unknown.add(row.id);
    for (const job of store.cleanupJobs()) held.add(job.turn_id);
    for (const id of missing.keys())
      if (!unknown.has(id) && !held.has(id)) missing.delete(id);
    for (const id of retryAt.keys())
      if (!unknown.has(id) && !held.has(id)) retryAt.delete(id);
    for (const id of nativeMissing) if (!held.has(id)) nativeMissing.delete(id);
  }
  async function settleOnce() {
    try {
      for (const row of store.pending()) {
        if (closed) return;
        if (row.state !== "unknown") continue;
        try { await settleUnknown(row.id); }
        catch { /* stale_result or a race: the turn is retried next tick */ }
      }
      for (const job of store.cleanupJobs()) {
        if (closed) return;
        try { await settleCancelled(job); }
        catch { /* the durable job remains for the next tick */ }
      }
    } catch {
      /* a store read failed; the next tick starts over */
    } finally {
      // A failed job is removed in the same tick, so the chat unblocks at once.
      if (!closed) {
        try { await cleanup(); } catch { /* the durable job remains */ }
        try { forgetSettled(); } catch { /* pruned next tick */ }
      }
    }
  }
  function settleStalled() {
    if (closed) return Promise.resolve();
    if (!settleTask)
      settleTask = settleOnce().finally(() => {
        settleTask = null;
      });
    return settleTask;
  }
  const timer = setInterval(() => {
    void maintain().then(settleStalled);
  }, 30000);
  timer.unref();
  return {
    async handle(uid, route, method, body, { signal } = {}) {
      if (uid !== ownerUid) fail("pilot_forbidden", 403);
      if (
        closed ||
        (maintenanceFault && route === "/turns" && method === "POST")
      )
        fail("trainer_unavailable", 503);
      if (backend.canonicalHistory && route === "/conversation/delete") fail("canonical_history_required", 409);
      const c = store.conversation(uid),
        id = c.conversationId;
      if (route === "/state" && method === "GET") {
        if (backend.canonicalHistory) await contextValue(uid, id, signal);
        return reply({
          ...c,
          drafts: store.drafts(uid, id),
          contextProposals: store.contextProposals(uid, id),
          maintenanceBlocked: maintenanceFault,
          currentTurn: store.current(uid, id),
          latestTurn: backend.latest ? backend.latest(uid, store.latest(uid, id)) : store.latest(uid, id),
          messages: backend.history ? await backend.history(uid) : store.history(uid, id),
          ...(backend.canonicalHistory ? { canonicalHistory: true } : {}),
        });
      }
      if (route === "/composer" && method === "PUT") {
        if (
          !body ||
          Object.keys(body).some((k) => !["text", "baseRevision"].includes(k))
        )
          fail("invalid_request");
        return reply(store.composer(uid, id, body));
      }
      if (route === "/turns" && method === "POST") {
        const input = inputBody(body), descriptors=media.describe(uid,input.turnId,input.images);
        const requestInput={turnId:input.turnId,baseRevision:input.baseRevision,text:input.text,dateContext:input.dateContext,media:descriptors};
        const replay=store.replay(uid,id,requestInput);
        if(replay)return reply(replay);
        // Capture once, durably, before context/Firestore I/O or any queue wait.
        const sentAt=store.captureAdmission(uid,id,requestInput);
        await boundedOperation(s => authorizeTurn(uid, s), 5000, signal);
        const drafts=store.drafts(uid,id).filter(d=>d.state!=="saved");
        const resolved=turnDateContext({text:input.text,dateContext:input.dateContext,sentAt,drafts});
        const storedInput={...requestInput,sentAt,targetDate:resolved.targetDate};
        const [context,confirmed]=await boundedOperation(s=>Promise.all([
          readContext(uid,s),fresh(uid,resolved.targetDate,s),
        ]),5000,signal);
        if(signal?.aborted)fail("upstream_timeout",504);
        const {day,plan}=confirmed;
        const snapshot=snapshotFactory({conversationId:id,historyRevision:c.revision,
          context:context.text,contextRevision:context.revision,draft:drafts,
          mediaBindings:descriptors.map(p=>({ref:p.tempRef,itemId:p.itemId})),
          sentAt,targetDate:resolved.targetDate,dateContext:input.dateContext,dateResolution:resolved.dateResolution,memoryWriteEnabled,
          receipts:day.receipts||[],day,plan,message:input.text,history:store.history(uid,id)});
        const admitted = store.admit(uid, id, storedInput, snapshot, {dayProof:day.freshness,queueWindowMs});
        if (!admitted.replayed) {
          try {
            media.stage(descriptors, input.images);
            launch(uid, input.turnId);
          } catch {
            store.fail(input.turnId, "media_unavailable");
            await cleanup();
          }
        }
        return reply(
          store.get(uid, input.turnId),
          admitted.replayed ? 200 : 202,
        );
      }
      const dayRoute=route.match(/^\/days\/(\d{4}-\d{2}-\d{2})$/);
      if(dayRoute&&method==="GET"){const value=await fresh(uid,dayRoute[1],signal);return reply({...value.day,catalog:value.plan.catalog});}
      if (route === "/notes" && method === "POST") {
        if (
          !body ||
          Object.keys(body).some(
            (k) =>
              !["text", "targetDate", "meal", "noteId", "itemId"].includes(k),
          )
        )
          fail("invalid_request");
        if (body.noteId) {
          const day = await boundedOperation(
            (s) => readDay(uid, body.targetDate, s),
            5000,
            signal,
          );
          const note = day.notes?.find(
            (n) => n.noteId === body.noteId && n.state === "active",
          );
          if (!note || note.itemId !== body.itemId) fail("note_conflict", 409);
        }
        const value=await fresh(uid,body.targetDate,signal),note=store.manualNote(uid,id,body);
        return reply(store.refreshPreview(uid,id,note.draftId,note.revision,value.day.freshness));
      }
      const dmatch = route.match(
        /^\/drafts\/([a-zA-Z0-9-]{16,80})(\/save|\/receipt|\/unknown|\/refresh)?$/,
      );
      if (dmatch) {
        const draft = store.draft(uid, id, dmatch[1]);
        if(method==="PUT"&&!dmatch[2]) {
          const value=await fresh(uid,body?.targetDate||draft.targetDate,signal);
          const edited=store.editDraft(uid,id,draft.draftId,body);
          return reply(store.refreshPreview(uid,id,edited.draftId,edited.revision,value.day.freshness));
        }
        if(method==="PUT"&&dmatch[2]==="/refresh") {
          if(!body||Object.keys(body).some(k=>k!=="baseRevision")||body.baseRevision!==draft.revision)fail("draft_conflict",409);
          const value=await fresh(uid,draft.targetDate,signal);
          return reply(store.refreshPreview(uid,id,draft.draftId,body.baseRevision,value.day.freshness));
        }
        if (method === "POST" && dmatch[2] === "/save") {
          if (!body || Object.keys(body).some((k) => k !== "baseRevision"))
            fail("invalid_request");
          if (draft.save) return reply(draft);
          if (body.baseRevision !== draft.revision) fail("draft_conflict", 409);
          if(!draft.freshness||draft.stale)fail("stale_preview",409);
          const {day,plan}=await fresh(uid,draft.targetDate,signal);
          if(!sameFreshness(draft.freshness,day.freshness)){
            store.stalePreview(uid,id,draft.draftId);fail("stale_preview",409);
          }
          const prepared = await commandFromDraft(draft, {
            planContext: plan.planContext || {},
            meals: day.meals || {},
            dayRevision: day.revision,
            now,
          });
          if (prepared.command.notes?.length && !day.notesEnabled)
            fail("notes_disabled", 409);
          return reply(
            store.beginSave(
              uid,
              id,
              draft.draftId,
              body.baseRevision,
              prepared,
            ),
          );
        }
        if (method === "POST" && dmatch[2] === "/receipt") {
          if (!draft.save && draft.lastRejected) return reply(draft);
          const proof = await boundedOperation(
            (s) => readDay(uid, draft.targetDate, s),
            5000,
            signal,
          );
          if (
            draft.save &&
            proof?.rejectedSubmissions?.[draft.save.submissionId]
          )
            return reply(
              store.confirmRejected(
                uid,
                id,
                draft.draftId,
                draft.save.submissionId,
                proof,
              ),
            );
          return reply(store.confirmSaved(uid, id, draft.draftId, proof));
        }
        if (method === "POST" && dmatch[2] === "/unknown")
          return reply(store.saveUnknown(uid, id, draft.draftId));
      }
      if (route === "/context" && method === "GET")
        return reply(await contextValue(uid, id, signal));
      const cmatch = route.match(/^\/context\/([a-zA-Z0-9-]{16,80})\/confirm$/);
      if (cmatch && method === "POST") {
        if (!memoryWriteEnabled) fail("memory_read_only",409);
        if (!contextStore) fail("context_unavailable", 503);
        const p = store.contextProposal(uid, id, cmatch[1]);
        const saved = await contextStore.commit(p, { signal });
        store.contextApplied(uid, id, p.proposalId);
        return reply({ revision: saved.revision, proposalId: p.proposalId });
      }
      if (route === "/conversation/delete" && method === "POST") {
        if (body?.conversationId !== id) fail("conversation_conflict", 409);
        store.forget(uid, id);
        await maintain();
        return reply({ deleted: true });
      }
      const match = route.match(
        /^\/turns\/([a-zA-Z0-9-]{16,80})(\/cancel|\/recover)?$/,
      );
      if (match) {
        const turnId = match[1];
        store.get(uid, turnId);
        if (method === "GET" && !match[2]) return reply(store.get(uid, turnId));
        if (method === "POST" && match[2] === "/cancel") {
          const value = store.cancel(uid, turnId);
          proxy.cancel(turnId);
          controllers.get(turnId)?.abort();
          const stopped = await boundedOperation(signal =>
            backend.stop(store.internal(turnId), { explicit: true, signal }),
          );
          if (stopped?.stopped !== true) fail("execution_unknown", 409);
          if (stopped?.stopped === true) await cleanup();
          return reply(value.expired ? value : store.get(uid, turnId));
        }
        if (method === "POST" && match[2] === "/recover") {
          const turn = store.internal(turnId);
          if (turn.state === "unknown")
            await applyNativeStatus(turnId, turn, await readNativeStatus(turn), signal);
          await cleanup();
          return reply(store.get(uid, turnId));
        }
      }
      fail("not_found", 404);
    },
    async recover() {
      await maintain();
    },
    settleStalled,
    async close() {
      closed = true;
      clearInterval(timer);
      for (const id of running.keys()) {
        const t = store.internal(id);
        store.cancel(t.owner, id);
        proxy.cancel(id);
        controllers.get(id)?.abort();
        await boundedOperation(() => backend.stop(t)).catch(() => null);
      }
      await Promise.allSettled(running.values());
      try { await cleanup(); }
      finally { try { await backend.shutdown?.(); } finally { proxy.close(); } }
    },
  };
}
