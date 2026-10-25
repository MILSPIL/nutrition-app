import { TRAINER_POLICY } from "./tools.mjs";
import { LIMITS, fail, jsonBytes } from "./limits.mjs";
import { modelDay } from "./day-snapshot.mjs";
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
  mediaBindings = [],
  sentAt,
  targetDate,
  dateContext,
  dateResolution,
  memoryWriteEnabled = false,
  maxPayloadBytes = LIMITS.payloadBytes,
}) {
  if (
    typeof context !== "string" ||
    typeof message !== "string" ||
    Buffer.byteLength(message) > LIMITS.userBytes
  )
    fail("message_too_large", 413);
  if (!Number.isSafeInteger(maxPayloadBytes) || maxPayloadBytes < LIMITS.payloadBytes || maxPayloadBytes > 512000) fail("trainer_config", 503);
  const snapshot = {
    schemaVersion: 1,
    policy: TRAINER_POLICY,
    mediaBindings,
    ...(sentAt ? { sentAt, timeZone: "Europe/Kyiv" } : {}),
    ...(targetDate ? {targetDate, dateContext, dateResolution} : {}),
    memoryWriteEnabled: memoryWriteEnabled === true,
    conversationId,
    historyRevision,
    context,
    contextRevision,
    draft: draft ?? null,
    receipts: receipts ?? [],
    day: modelDay(day),
    plan: modelPlan(plan),
    message,
    history: [],
  };
  if (jsonBytes(snapshot) > maxPayloadBytes) fail("context_too_large", 413);
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
      jsonBytes({ ...snapshot, history: next }) > maxPayloadBytes
    )
      break;
    snapshot.history = next;
  }
  return snapshot;
}

export const PLAN_COLUMNS = Object.freeze(["refId","name","letter","norm","basisState","normSource","coef","source"]);
export function modelPlan(plan) {
  if (!plan?.catalog?.references) return plan;
  if (plan.catalog.overLimit) fail("context_too_large", 413);
  const defaults={normSource:"catalog",coef:1,source:"standard"};
  const rows=plan.catalog.references.map(reference=>{
    const row=PLAN_COLUMNS.map(key=>reference[key]??null);
    while(row.length>5&&row.at(-1)===defaults[PLAN_COLUMNS[row.length-1]])row.pop();
    return row;
  });
  const dictionaries={};
  for(const index of [2,4]){
    const values=[...new Set(rows.map(row=>row[index]))];
    dictionaries[index]=values;
    for(const row of rows)row[index]=values.indexOf(row[index]);
  }
  const ambiguousRefIds=[...new Set(plan.catalog.references.filter(r=>r.ambiguous).map(r=>r.refId))];
  return {catalog:{columns:PLAN_COLUMNS,defaults,dictionaries,rows,...(ambiguousRefIds.length?{ambiguousRefIds}:{})},freeCalorieLimit:plan.catalog.projection?.free};
}
export function decodeModelPlan(plan) {
 const {columns,defaults={},dictionaries={},rows,ambiguousRefIds=[]}=plan.catalog;
 return rows.map(row=>{
  const reference=Object.fromEntries(columns.map((key,i)=>[key,i>=row.length?defaults[key]:dictionaries[i]?dictionaries[i][row[i]]:row[i]]));
  return ambiguousRefIds.includes(reference.refId)?{...reference,ambiguous:true}:reference;
 });
}
