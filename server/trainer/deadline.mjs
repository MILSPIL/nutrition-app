import { fail } from "./limits.mjs";
// A transport ignoring AbortSignal still cannot hold the coordinator indefinitely.
export function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(Object.assign(Error("upstream_timeout"), { status: 504 }));
    };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(
      (v) => {
        cleanup();
        resolve(v);
      },
      (e) => {
        cleanup();
        reject(e);
      },
    );
    if (signal.aborted) abort();
  });
}
export async function boundedOperation(task, ms = 5000, parentSignal) {
  if (!Number.isFinite(ms) || ms <= 0) fail("upstream_timeout", 504);
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), ms);
  try {
    const signal = parentSignal
      ? AbortSignal.any([parentSignal, controller.signal])
      : controller.signal;
    if (signal.aborted) fail("upstream_timeout", 504);
    return await abortable(task(signal), signal);
  } finally {
    clearTimeout(timer);
  }
}
