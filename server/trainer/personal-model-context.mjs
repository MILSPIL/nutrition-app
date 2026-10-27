import { stableJSON } from "./limits.mjs";

const marker = /^SCISENSE-INPUT-V1 ([A-Za-z0-9-]{16,80}) ([a-f0-9]{64})\n/;
export const nativeInputText = (binding, payload) =>
  `SCISENSE-INPUT-V1 ${binding.inputId} ${binding.payloadHmac}\n${payload.text}`;

// Native retains api_content in canonical history. Only the request copy is
// projected: old app snapshots must never become current facts on later turns.
function jsonPrefix(value) {
  if (value[0] !== "{") return;
  let depth = 0, quoted = false, escaped = false;
  for (let index = 0; index < value.length; index++) {
    const c = value[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      if (--depth === 0) {
        try { return { value: JSON.parse(value.slice(0, index + 1)), suffix: value.slice(index + 1) }; }
        catch { return; }
      }
    }
  }
}
const mediaSuffix = value => value === "" || /^(?:\n+(?:\[screenshot(?: detail=(?:low|high|auto))?\]|\[Image attached at: [^\r\n]+\]))+\n?$/.test(value);
const frameTail = value => {
  if (mediaSuffix(value)) return { suffix: value, next: "" };
  // Native merges adjacent plain user rows on its request copy with two LF.
  // Search only after the exact signed source text/JSON was consumed, so a
  // literal marker inside that source cannot be mistaken for another input.
  const at = value.indexOf("\n\nSCISENSE-INPUT-V1 ");
  if (at >= 0 && mediaSuffix(value.slice(0, at))) return { suffix: value.slice(0, at), next: value.slice(at + 2) };
};

export function projectPersonalModelRequest(payload, { current, snapshot, resolve, contextWindow }) {
  if (!Array.isArray(payload?.messages) || typeof snapshot !== "string" || !Number.isSafeInteger(contextWindow) || contextWindow < 64000)
    throw Error("model_payload_invalid");
  let currentCount = 0;
  const project = content => {
    if (typeof content !== "string") return content;
    const match = content.match(marker);
    if (!match) {
      // A legacy unsigned Desktop row may be merged before a signed app row.
      // A marker is structural only when its account-owned proof resolves.
      for (const candidate of content.matchAll(/\n\n(SCISENSE-INPUT-V1 ([A-Za-z0-9-]{16,80}) ([a-f0-9]{64})\n)/g)) {
        let owned; try { owned = resolve(candidate[2]); } catch { continue; }
        if (owned?.proof === candidate[3]) return content.slice(0, candidate.index) + "\n\n" + project(content.slice(candidate.index + 2));
      }
      return content;
    }
    let owned;
    try { owned = resolve(match[1]); } catch { throw Error("native_receipt_invalid"); }
    if (!owned || owned.proof !== match[2] || typeof owned.text !== "string") throw Error("native_receipt_invalid");
    const body = content.slice(match[0].length);
    let tail;
    if (body.startsWith(owned.text)) tail = frameTail(body.slice(owned.text.length));
    // Native strips the outer text part before provider dispatch. The signed
    // source and fresh snapshot keep the exact original text, including spaces.
    if (!tail && body.startsWith(owned.text.trimEnd())) tail = frameTail(body.slice(owned.text.trimEnd().length));
    if (!tail) {
      const parsed = jsonPrefix(body), value = parsed?.value;
      if (!value || value.schemaVersion !== 1 || value.message !== owned.text || typeof value.context !== "string" ||
          owned.sentAt && value.sentAt !== owned.sentAt || owned.targetDate && value.targetDate !== owned.targetDate || !(tail = frameTail(parsed.suffix)))
        throw Error("native_receipt_invalid");
    }
    if (match[1] === current.inputId) {
      if (match[2] !== current.payloadHmac) throw Error("native_receipt_invalid");
      currentCount++;
      return match[0] + snapshot + tail.suffix + (tail.next ? "\n\n" + project(tail.next) : "");
    }
    // Preserve the actual words and their original calendar anchor. Current
    // context/day/plan remain complete in the single latest trusted snapshot.
    const anchor = { message: owned.text, ...(owned.sentAt ? { sentAt: owned.sentAt } : {}), ...(owned.targetDate ? { targetDate: owned.targetDate } : {}) };
    return "SCISENSE-HISTORY-V1\n" + JSON.stringify(anchor) + tail.suffix + (tail.next ? "\n\n" + project(tail.next) : "");
  };
  const messages = payload.messages.map(message => {
    if (message?.role !== "user") return message;
    const content = Array.isArray(message.content)
      ? message.content.map(part => part?.type === "text" ? { ...part, text: project(part.text) } : part)
      : project(message.content);
    return { ...message, content };
  });
  if (currentCount !== 1) throw Error("native_receipt_invalid");
  const projected = { ...payload, messages };
  // Transport bound, not a tokenizer estimate. Never truncate mandatory facts
  // or images to fit: refuse before spending a provider POST instead.
  const textOnly = messages.map(message => ({ ...message, content: Array.isArray(message.content)
    ? message.content.map(part => part?.type === "image_url" ? { type: "image_url" } : part) : message.content }));
  if (Buffer.byteLength(stableJSON({ ...projected, messages: textOnly })) > Math.min(1048576, contextWindow * 3)) throw Error("context_too_large");
  return projected;
}
