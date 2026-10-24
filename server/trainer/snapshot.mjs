import { LIMITS, fail, jsonBytes } from "./limits.mjs";
// A bounded suffix of complete user/assistant pairs. Mandatory facts are never trimmed.
export function buildSnapshot({
  conversationId,
  historyRevision,
  context,
  contextRevision,
  draft,
  receipts,
  day,
  plan,
  message,
  history = [],
}) {
  if (
    typeof context !== "string" ||
    typeof message !== "string" ||
    Buffer.byteLength(message) > LIMITS.userBytes
  )
    fail("message_too_large", 413);
  const snapshot = {
    schemaVersion: 1,
    conversationId,
    historyRevision,
    context,
    contextRevision,
    draft: draft ?? null,
    receipts: receipts ?? [],
    day,
    plan,
    message,
    history: [],
  };
  if (jsonBytes(snapshot) > LIMITS.payloadBytes) fail("context_too_large", 413);
  const pairs = [];
  for (let n = 0; n < history.length; ) {
    const user = history[n],
      answer = history[n + 1];
    if (user?.role === "user" && answer?.role === "assistant") {
      pairs.push([user, answer]);
      n += 2;
    } else n++;
  }
  for (let n = pairs.length - 1; n >= 0; n--) {
    const pair = pairs[n].map(({ id, role, content }) => ({
      id,
      role,
      content,
    }));
    const next = [...pair, ...snapshot.history];
    if (
      next.length > LIMITS.historyMessages ||
      jsonBytes(next) > LIMITS.historyBytes ||
      jsonBytes({ ...snapshot, history: next }) > LIMITS.payloadBytes
    )
      break;
    snapshot.history = next;
  }
  return snapshot;
}
