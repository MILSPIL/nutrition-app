import { fail } from "./limits.mjs";

const refusal = code => Object.assign(Error(code), { status: 409, definitelyNotExecuted: true });
const executionAbort = code => Object.assign(Error(code), { status: 409 });
// One physical native execution across both profiles. The slot stays held until
// execute settles after abort: a timer must never start a second live worker.
export function personalQueue({ deadlineMs = 45000, maxWaiting = 4 } = {}) {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 45000 ||
      !Number.isSafeInteger(maxWaiting) || maxWaiting < 1 || maxWaiting > 4)
    fail("personal_config_invalid", 503);
  let active = null, closed = false;
  const waiting = [];
  const rejectWaiting = (job, reason) => {
    const index = waiting.indexOf(job);
    if (index < 0) return;
    waiting.splice(index, 1);
    job.signal?.removeEventListener("abort", job.abortWaiting);
    job.reject(refusal(reason));
  };
  const pump = () => {
    if (active || closed || !waiting.length) return;
    const job = waiting.shift();
    job.signal?.removeEventListener("abort", job.abortWaiting);
    active = job;
    const timer = setTimeout(() => job.controller.abort(executionAbort("trainer_timeout")), deadlineMs);
    timer.unref?.();
    job.abortActive = () => job.controller.abort(executionAbort("trainer_cancelled"));
    job.signal?.addEventListener("abort", job.abortActive, { once: true });
    if (job.signal?.aborted) job.abortActive();
    // The supplied callback obtains the current SciSense snapshot HERE, after
    // waiting. execute owns native cancellation/settlement before it may return.
    job.running = Promise.resolve().then(async () => {
      if (job.controller.signal.aborted) throw refusal("trainer_cancelled");
      const result = await job.execute(job.controller.signal);
      if (job.controller.signal.aborted) throw job.controller.signal.reason;
      return result;
    }).then(job.resolve, job.reject).finally(() => {
      clearTimeout(timer);
      job.signal?.removeEventListener("abort", job.abortActive);
      active = null;
      pump();
    });
  };
  return Object.freeze({
    run(uid, execute, { signal } = {}) {
      if (closed) return Promise.reject(refusal("trainer_unavailable"));
      if (typeof uid !== "string" || !uid || typeof execute !== "function")
        return Promise.reject(refusal("invalid_request"));
      if (signal?.aborted) return Promise.reject(refusal("trainer_cancelled"));
      if (waiting.length >= maxWaiting) return Promise.reject(refusal("trainer_queue_full"));
      const result = new Promise((resolve, reject) => {
        const job = { uid, execute, signal, resolve, reject, controller: new AbortController() };
        job.abortWaiting = () => rejectWaiting(job, "trainer_cancelled");
        signal?.addEventListener("abort", job.abortWaiting, { once: true });
        waiting.push(job);
      });
      pump();
      return result;
    },
    state(uid) {
      // No other user's identifier, text, or position is disclosed.
      return { active: active?.uid === uid, waiting: waiting.filter(job => job.uid === uid).length,
        ...(active?.uid === uid && active.controller.signal.aborted ? { stopping: true } : {}) };
    },
    async close() {
      closed = true;
      for (const job of [...waiting]) rejectWaiting(job, "trainer_unavailable");
      const running = active;
      running?.controller.abort(executionAbort("trainer_unavailable"));
      await running?.running;
    },
  });
}
