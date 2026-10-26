// Local UI acknowledgement after a validated draft, never a provider request.
import { stableJSON } from "./limits.mjs";
import { MODEL } from "./limits.mjs";
export const DRAFT_COMPLETION_TEXT = "Підготував чернетку. Перевір її та натисни «Додати», щоб зберегти.";
export function draftCompletionResponse(stream) {
  const message = { id: "scisense_local_draft_completion", type: "message", role: "assistant", model: MODEL,
    content: [{ type: "text", text: DRAFT_COMPLETION_TEXT }], stop_reason: "end_turn", stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 } };
  if (!stream) return new Response(JSON.stringify(message), { headers: { "content-type": "application/json" } });
  const events = [
    ["message_start", { type: "message_start", message: { ...message, content: [], stop_reason: null } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: DRAFT_COMPLETION_TEXT } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 0 } }],
    ["message_stop", { type: "message_stop" }],
  ];
  return new Response(events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join(""),
    { headers: { "content-type": "text/event-stream" } });
}

// Canonical Native assistant message produced locally from a trusted ready ACK.
export function nativeDraftCompletion(model, stream) {
  const base = { id: "scisense_local_draft_completion", object: "chat.completion", created: 0, model,
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
  return stream
    ? { chunks: [{ ...base, object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content: DRAFT_COMPLETION_TEXT }, finish_reason: "stop" }] }] }
    : { completion: { ...base, choices: [{ index: 0, message: { role: "assistant", content: DRAFT_COMPLETION_TEXT }, finish_reason: "stop" }] } };
}

export function readyDraftAckInPayload(payload, ack) {
  const messages = payload?.messages;
  if (!ack || !Array.isArray(messages) || !messages.length) return false;
  const last = messages.at(-1);
  if (last?.role !== "tool" || typeof last.tool_call_id !== "string" || typeof last.content !== "string") return false;
  let value; try { value = JSON.parse(last.content); } catch { return false; }
  if (stableJSON(value) !== stableJSON(ack)) return false;
  const assistant = messages.findLast(message => message.role === "assistant");
  const call = assistant?.tool_calls?.at(-1);
  return call?.id === last.tool_call_id && call.function?.name === "propose_food_draft";
}
