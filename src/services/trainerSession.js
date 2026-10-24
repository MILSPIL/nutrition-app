import { newId } from "./mealItems";
// One lifetime per authenticated owner/open panel. No chat content in browser storage.
export function createTrainerSession({
  api,
  commit,
  onChange = () => {},
  onSaved = () => {},
}) {
  let closed = false,
    writing = null,
    polling = null,
    version = 0,
    mutation = false,
    composerTimer,
    mediaTimer;
  const controllers = new Set();
  let state = {
    server: null,
    text: "",
    dirty: false,
    composerState: "loading",
    composerBase: null,
    composerConflict: false,
    busy: false,
    error: "",
    admission: null,
  };
  const emit = (patch) => {
    if (closed) return;
    state = { ...state, ...patch };
    onChange(state);
  };
  const admit = (value) => {
    clearTimeout(mediaTimer);
    emit({ admission: value });
    if (value?.input.images.length) {
      const expiresAt = value.expiresAt || Date.now() + 300000;
      emit({ admission: { ...value, expiresAt } });
      mediaTimer = setTimeout(
        () => {
          const pending = state.admission;
          if (pending?.input.turnId === value.input.turnId)
            emit({
              admission: {
                ...pending,
                lostMedia: true,
                input: { ...pending.input, images: [] },
              },
            });
        },
        Math.max(0, expiresAt - Date.now()),
      );
    }
  };
  const call = async (fn) => {
    if (closed) throw Error("context_changed");
    const c = new AbortController();
    controllers.add(c);
    try {
      const r = await fn(c.signal);
      if (closed) throw Error("context_changed");
      return r;
    } finally {
      controllers.delete(c);
    }
  };
  const fault = (e) => {
    if (!closed && e.message !== "context_changed")
      emit({ error: e.message || "trainer_unavailable" });
  };
  async function refresh() {
    if (polling) return polling;
    if (mutation) return state.server;
    const v = version;
    polling = call((s) => api.state(s))
      .then((server) => {
        if (v !== version) return state.server;
        const changed =
          state.server && state.server.conversationId !== server.conversationId;
        if (changed) {
          emit({
            server,
            text: "",
            dirty: false,
            composerState: "saved",
            composerConflict: false,
            admission: null,
            error: "conversation_gone",
          });
          return server;
        }
        const keep = state.dirty || writing || state.composerConflict;
        emit({
          server,
          ...(!keep
            ? {
                text: server.composer.text,
                composerBase: server.composer.revision,
                dirty: false,
                composerState: "saved",
              }
            : {}),
        });
        return server;
      })
      .catch((e) => {
        fault(e);
        throw e;
      })
      .finally(() => {
        polling = null;
      });
    return polling;
  }
  async function flush() {
    clearTimeout(composerTimer);
    if (writing) {
      await writing;
      if (state.dirty) return flush();
      return;
    }
    if (!state.server) throw Error("trainer_unavailable");
    if (state.composerConflict) throw Error("composer_conflict");
    if (!state.dirty) return;
    const text = state.text,
      baseRevision = state.composerBase ?? state.server.composer.revision;
    emit({ composerState: "saving" });
    writing = call((s) => api.composer({ text, baseRevision }, s))
      .then((composer) => {
        version++;
        emit({
          server: { ...state.server, composer },
          composerBase: composer.revision,
          dirty: state.text !== text,
          composerState: state.text === text ? "saved" : "unsaved",
        });
      })
      .catch((e) => {
        emit({
          composerState: "error",
          composerConflict: e.message === "composer_conflict",
        });
        fault(e);
        throw e;
      })
      .finally(() => {
        writing = null;
      });
    await writing;
    if (state.dirty) return flush();
  }
  function type(text) {
    emit({ text, dirty: true, composerState: "unsaved" });
    clearTimeout(composerTimer);
    composerTimer = setTimeout(() => {
      void flush().catch(() => {});
    }, 600);
  }
  async function operate(fn) {
    if (mutation) throw Error("trainer_busy");
    mutation = true;
    version++;
    emit({ busy: true, error: "" });
    try {
      return await fn();
    } catch (e) {
      fault(e);
      throw e;
    } finally {
      mutation = false;
      emit({ busy: false });
      await refresh().catch(() => {});
    }
  }
  async function send({
    text = state.text,
    images = [],
    targetDate,
    dateContext,
    turnId = newId(),
  }) {
    return operate(async () => {
      if (state.admission) throw Error("admission_unknown");
      if (state.server?.currentTurn) throw Error("trainer_busy");
      if (!text.trim()) throw Error("empty_transcript");
      if (new TextEncoder().encode(text).length > 8000)
        throw Error("message_too_large");
      if (text !== state.text) type(text);
      await flush();
      const input = {
        turnId,
        baseRevision: state.server.revision,
        text,
        ...(dateContext ? { dateContext } : { targetDate }),
        images: images.map(({ type, data, itemId }) => ({
          type,
          data,
          ...(itemId ? { itemId } : {}),
        })),
      };
      admit({ input, state: "sending" });
      try {
        await call((s) => api.send(input, s));
        emit({
          admission: null,
          dirty: false,
          text: "",
          composerState: "saved",
        });
        return input.turnId;
      } catch (e) {
        if (closed) throw Error("context_changed");
        if (e.status && e.status < 500) {
          emit({ admission: null });
          throw e;
        }
        admit({ ...state.admission, state: "unknown" });
        throw Error("admission_unknown");
      }
    });
  }
  async function checkAdmission(resend = false) {
    return operate(async () => {
      const turnId = state.admission?.input.turnId;
      if (!turnId) return;
      try {
        await call((s) => api.turn(turnId, s));
        emit({
          admission: null,
          dirty: false,
          text: "",
          composerState: "saved",
        });
      } catch (e) {
        if (e.status !== 404) throw e;
        let pending=state.admission;
        if(!pending||pending.input.turnId!==turnId)throw Error('context_changed');
        if(pending.expiresAt<=Date.now()&&pending.input.images.length){
          pending={...pending,lostMedia:true,input:{...pending.input,images:[]}};
          emit({admission:pending});
        }
        if (!resend) {
          emit({ admission: { ...pending, state: "not_received" } });
          return;
        }
        if (pending.lostMedia) throw Error("media_reattach_required");
        await call((s) => api.send(pending.input, s));
        emit({
          admission: null,
          dirty: false,
          text: "",
          composerState: "saved",
        });
      }
    });
  }
  async function save(draft) {
    return operate(async () => {
      let prepared;
      try {
        prepared = await call((s) =>
          api.prepareSave(draft.draftId, draft.revision, s),
        );
        if (prepared.state !== "saved")
          await commit(prepared.save.command, prepared.targetDate);
        if (closed) throw Error("context_changed");
        await call((s) => api.receipt(draft.draftId, s));
        onSaved(prepared.targetDate, prepared);
      } catch (e) {
        if (prepared?.save && !closed) {
          const proof = await call((s) => api.receipt(draft.draftId, s)).catch(
            () => null,
          );
          if (proof?.state === "saved") {
            onSaved(prepared.targetDate, proof);
            return;
          }
          if (
            proof?.state === "ready" &&
            proof.lastRejected === prepared.save.submissionId
          )
            throw Error("plan_conflict");
          await call((s) => api.unknown(draft.draftId, s)).catch(() => {});
        }
        throw e;
      }
    });
  }
  return {
    get: () => state,
    refresh,
    flush,
    type,
    send,
    checkAdmission,
    recompose() {
      const pending = state.admission;
      if (pending?.state !== "not_received" || !pending.lostMedia)
        throw Error("admission_unknown");
      clearTimeout(mediaTimer);
      emit({ admission: null, error: "" });
      type(pending.input.text);
    },
    save,
    clearError: () => emit({ error: "" }),
    async chooseComposer(useMine) {
      if (writing) await writing.catch(() => {});
      const server = await call((s) => api.state(s));
      version++;
      emit({
        server,
        composerConflict: false,
        composerBase: server.composer.revision,
        ...(useMine
          ? { dirty: true }
          : {
              text: server.composer.text,
              dirty: false,
              composerState: "saved",
            }),
      });
      if (useMine) await flush();
    },
    edit: (draft, patch) =>
      operate(() =>
        call((s) =>
          api.edit(
            draft.draftId,
            {
              baseRevision: draft.revision,
              targetDate: draft.targetDate,
              meal: draft.meal,
              items: [],
              ...patch,
            },
            s,
          ),
        ),
      ),
    refreshDraft: (draft) => operate(() => call((s) => api.refreshDraft(draft.draftId, draft.revision, s))),
    note: (body) => operate(() => call((s) => api.note(body, s))),
    recover: (id) => operate(() => call((s) => api.recover(id, s))),
    cancel: (id) => operate(() => call((s) => api.cancel(id, s))),
    remember: (id) => operate(() => call((s) => api.remember(id, s))),
    context: () => call((s) => api.context(s)),
    forget: () =>
      operate(async () => {
        await call((s) => api.forget(state.server.conversationId, s));
        emit({
          text: "",
          dirty: false,
          composerConflict: false,
          admission: null,
        });
      }),
    close() {
      closed = true;
      version++;
      clearTimeout(composerTimer);
      clearTimeout(mediaTimer);
      controllers.forEach((c) => c.abort());
      controllers.clear();
      state = {
        server: null,
        text: "",
        dirty: false,
        composerState: "closed",
        busy: false,
        error: "",
        admission: null,
      };
    },
  };
}
