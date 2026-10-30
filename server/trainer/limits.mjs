export const MODEL = "claude-sonnet-5-5";
export const TOOLS = Object.freeze([
  "food_lookup",
  "read_confirmed_day",
  "read_plan",
  "read_trainer_context",
  "propose_food_draft",
  "propose_context_update",
]);
export const LIMITS = Object.freeze({
  calls: 3,
  outputTokens: 4096,
  deadlineMs: 45000,
  userBytes: 8000,
  payloadBytes: 34000,
  historyBytes: 8000,
  historyMessages: 12,
  mediaTtlMs: 300000,
  retentionMs: 30 * 86400000,
});
export function fail(code, status = 400) {
  throw Object.assign(Error(code), { status });
}
export function requireId(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(value))
    fail("invalid_request");
  return value;
}
export const jsonBytes = (value) =>
  Buffer.byteLength(JSON.stringify(value), "utf8");
export function stableJSON(value) {
  if (Array.isArray(value)) return "[" + value.map(stableJSON).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .filter((k) => value[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + stableJSON(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
