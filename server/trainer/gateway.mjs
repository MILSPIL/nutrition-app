import { commandFromDraft } from "./drafts.mjs";
import { abortable, boundedOperation } from "./deadline.mjs";
import { buildSnapshot } from "./snapshot.mjs";
import { LIMITS, fail, requireId } from "./limits.mjs";
const reply = (data, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
function inputBody(body) {
  if (
    !body ||
    Object.keys(body).some(
      (k) =>
        !["turnId", "baseRevision", "text", "targetDate", "images"].includes(k),
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
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(body.targetDate || "") ||
    new Date(body.targetDate + "T12:00:00Z").toISOString().slice(0, 10) !==
      body.targetDate
  )
    fail("invalid_date");
  return { ...body, images: body.images ?? [] };
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
  contextStore,
  releaseTools = () => {},
  now = Date.now,
  runDeadlineMs = LIMITS.deadlineMs,
}) {
  if (typeof ownerUid !== "string" || !ownerUid || ownerUid.length > 128)
    fail("trainer_config", 503);
  if (
    !Number.isInteger(runDeadlineMs) ||
    runDeadlineMs < 1 ||
    runDeadlineMs > LIMITS.deadlineMs
  )
    fail("trainer_config", 503);
  const controllers = new Map();
  const running = new Map();
  let closed = false,
    maintenanceFault = false,
    cleanupTask = null;
  async function cleanupOnce() {
    for (const job of store.cleanupJobs()) {
      try {
        store.cleanupAttempt(job.turn_id);
        const turn = store.internal(job.turn_id);
        const proof = await boundedOperation(() => backend.cleanup(turn));
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
  async function execute(uid, id) {
    let turn,
      timer,
      entered = false;
    const controller = new AbortController();
    controllers.set(id, controller);
    try {
      turn = store.begin(uid, id);
      const input = JSON.parse(turn.input);
      timer = setTimeout(
        () => controller.abort(),
        Math.max(0, Math.min(runDeadlineMs, turn.deadline - now())),
      );
      const images = media.load(input.media || []);
      entered = true;
      const result = await abortable(
        backend.start({
          turn,
          signal: controller.signal,
          snapshot: JSON.parse(turn.snapshot),
          input,
          images,
          onWorkerExit: () => proxy.cancel(id),
          onRun: (ids) => store.bindRun(id, turn.generation, ids),
          issueLease: () => store.issueLease(id, turn.generation),
          modelCall: (lease, payload) => proxy.invoke(lease, payload),
        }),
        controller.signal,
      );
      store.complete(id, turn.generation, result);
    } catch (error) {
      const state = store.internal(id).state;
      if (!["cancelled", "completed", "failed", "unknown"].includes(state))
        store.fail(
          id,
          !entered || error?.definitelyNotExecuted
            ? error.message
            : "execution_unknown",
          { unknown: entered && !error?.definitelyNotExecuted },
        );
    } finally {
      clearTimeout(timer);
      controllers.delete(id);
      running.delete(id);
      await cleanup();
    }
  }
  const launch = (uid, id) => {
    const task = Promise.resolve().then(() => execute(uid, id));
    running.set(id, task);
    task.finally(() => running.delete(id)).catch(() => {});
  };
  async function maintain() {
    try {
      store.maintainRetention();
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
  const timer = setInterval(() => {
    void maintain();
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
      const c = store.conversation(uid),
        id = c.conversationId;
      if (route === "/state" && method === "GET")
        return reply({
          ...c,
          drafts: store.drafts(uid, id),
          contextProposals: store.contextProposals(uid, id),
          maintenanceBlocked: maintenanceFault,
          currentTurn: store.current(uid, id),
          messages: store.history(uid, id),
        });
      if (route === "/composer" && method === "PUT") {
        if (
          !body ||
          Object.keys(body).some((k) => !["text", "baseRevision"].includes(k))
        )
          fail("invalid_request");
        return reply(store.composer(uid, id, body));
      }
      if (route === "/turns" && method === "POST") {
        const input = inputBody(body),
          descriptors = media.describe(uid, input.turnId, input.images);
        const storedInput = {
          turnId: input.turnId,
          baseRevision: input.baseRevision,
          text: input.text,
          targetDate: input.targetDate,
          media: descriptors,
        };
        const replay = store.replay(uid, id, storedInput);
        if (replay) return reply(replay);
        const [context, day, plan] = await boundedOperation(
          (s) =>
            Promise.all([
              readContext(uid, s),
              readDay(uid, input.targetDate, s),
              readPlan(uid, s),
            ]),
          5000,
          signal,
        );
        if (signal?.aborted) fail("upstream_timeout", 504);
        const snapshot = buildSnapshot({
          conversationId: id,
          historyRevision: c.revision,
          context: context.text,
          contextRevision: context.revision,
          draft: store.drafts(uid, id).filter((d) => d.state !== "saved"),
          mediaBindings: descriptors.map((p) => ({
            ref: p.tempRef,
            itemId: p.itemId,
          })),
          sentAt: new Date(now()).toISOString(),
          receipts: day.receipts || [],
          day,
          plan,
          message: input.text,
          history: store.history(uid, id),
        });
        const admitted = store.admit(uid, id, storedInput, snapshot);
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
        return reply(store.manualNote(uid, id, body));
      }
      const dmatch = route.match(
        /^\/drafts\/([a-zA-Z0-9-]{16,80})(\/save|\/receipt|\/unknown)?$/,
      );
      if (dmatch) {
        const draft = store.draft(uid, id, dmatch[1]);
        if (method === "PUT" && !dmatch[2])
          return reply(store.editDraft(uid, id, draft.draftId, body));
        if (method === "POST" && dmatch[2] === "/save") {
          if (!body || Object.keys(body).some((k) => k !== "baseRevision"))
            fail("invalid_request");
          if (draft.save) return reply(draft);
          if (body.baseRevision !== draft.revision) fail("draft_conflict", 409);
          const [day, plan] = await boundedOperation(
            (s) =>
              Promise.all([
                readDay(uid, draft.targetDate, s),
                readPlan(uid, s),
              ]),
            5000,
            signal,
          );
          const prepared = await commandFromDraft(draft, {
            planContext: plan.planContext || {},
            meals: day.meals || {},
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
          const proof = await boundedOperation(
            (s) => readDay(uid, draft.targetDate, s),
            5000,
            signal,
          );
          return reply(store.confirmSaved(uid, id, draft.draftId, proof));
        }
        if (method === "POST" && dmatch[2] === "/unknown")
          return reply(store.saveUnknown(uid, id, draft.draftId));
      }
      if (route === "/context" && method === "GET")
        return reply(
          await boundedOperation((s) => readContext(uid, s), 5000, signal),
        );
      const cmatch = route.match(/^\/context\/([a-zA-Z0-9-]{16,80})\/confirm$/);
      if (cmatch && method === "POST") {
        if (!contextStore) fail("context_unavailable", 503);
        const p = store.contextProposal(uid, id, cmatch[1]);
        const saved = contextStore.commit(p);
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
          const stopped = await boundedOperation(() =>
            backend.stop(store.internal(turnId)),
          ).catch(() => null);
          if (stopped?.stopped === true) await cleanup();
          return reply(value);
        }
        if (method === "POST" && match[2] === "/recover") {
          const turn = store.internal(turnId);
          if (turn.state === "unknown") {
            const result = await boundedOperation(() =>
              backend.status(turn, {
                onRun: (ids) => {
                  if (!store.internal(turnId).run_id)
                    store.bindRun(turnId, turn.generation, ids);
                },
              }),
            );
            if (result?.state === "completed")
              store.complete(turnId, turn.generation, result.result);
            else if (["failed", "not_executed"].includes(result?.state))
              store.fail(turnId, "trainer_failed");
            else if (result?.state === "cancelled") store.cancel(uid, turnId);
          }
          await cleanup();
          return reply(store.get(uid, turnId));
        }
      }
      fail("not_found", 404);
    },
    async recover() {
      await maintain();
    },
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
      await cleanup();
      await backend.shutdown?.();
      proxy.close();
    },
  };
}
