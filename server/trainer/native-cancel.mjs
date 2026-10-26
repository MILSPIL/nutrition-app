// Trusted control path only. A lost execution is never resubmitted. In
// particular, resolving an unknown head must not start another pending input.
export async function cancelNativeInput({ owner, binding, accept, signal }) {
  const call = (method, params) => owner.rpc("web", method, params, { signal, timeoutMs: 5000 });
  const read = async () => {
    const value = binding.admissionId
      ? await call("prompt.receipt", { session_id: binding.sessionId, admission_id: binding.admissionId, include_result: true })
      : await owner.lookup("web", binding, { signal, timeoutMs: 5000 });
    if (!value) throw Error("execution_unknown");
    accept(value);
    binding = { ...binding, admissionId: value.admission_id };
    return value;
  };
  let value = await read();
  if (value.status === "queued") {
    await call("prompt.cancel", { session_id: binding.sessionId, admission_id: binding.admissionId });
    value = await read();
  }
  if (value.status === "started") {
    await call("session.interrupt", { session_id: binding.sessionId, execution_generation: value.execution_generation });
    value = await read();
  }
  if (value.status === "unknown") {
    const snapshot = await call("session.resume", { session_id: binding.sessionId });
    if (snapshot.session_id !== binding.sessionId || !Array.isArray(snapshot.pending)) throw Error("native_receipt_invalid");
    if (snapshot.pending.some(row => row.admission_id !== binding.admissionId)) throw Error("native_queue_pending");
    await call("prompt.resolve_unknown", { session_id: binding.sessionId, admission_id: binding.admissionId, execution_generation: value.execution_generation });
    value = await read();
  }
  if (value.status === "started") throw Object.assign(Error("execution_unknown"), { needsNativeRestart: true });
  if (value.status !== "terminal") throw Error("execution_unknown");
  return value;
}
