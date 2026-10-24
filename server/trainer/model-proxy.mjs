import { abortable, boundedOperation } from "./deadline.mjs";
import { createHash } from "node:crypto";
import { LIMITS, MODEL, TOOLS, fail, jsonBytes } from "./limits.mjs";
import { MAX_IMAGE } from "../../workers/meal-parser/src/schema.js";

export function boundedPayload(input, { history = [] } = {}) {
  if (!input || Array.isArray(input) || typeof input !== "object")
    fail("invalid_payload");
  if (
    Object.keys(input).some(
      (k) =>
        ![
          "model",
          "messages",
          "system",
          "tools",
          "tool_choice",
          "max_tokens",
          "stream",
        ].includes(k),
    )
  )
    fail("invalid_payload");
  if (
    input.model !== MODEL ||
    !Array.isArray(input.messages) ||
    !input.messages.length ||
    input.messages.length > 80 ||
    !Array.isArray(input.tools) ||
    input.tools.length !== TOOLS.length
  )
    fail("invalid_payload");
  if (
    new Set(input.tools.map((t) => t.name)).size !== TOOLS.length ||
    input.tools.some((t) => !TOOLS.includes(t.name))
  )
    fail("invalid_tools");
  if (!Number.isSafeInteger(input.max_tokens) || input.max_tokens <= 0)
    fail("invalid_payload");
  if (input.messages.some((m) => !["user", "assistant"].includes(m.role)))
    fail("invalid_payload");
  const stripCache = (v) =>
    Array.isArray(v)
      ? v.map(stripCache)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .filter(([k]) => k !== "cache_control")
              .map(([k, x]) => [k, stripCache(x)]),
          )
        : v;
  const payload = stripCache({
    ...input,
    max_tokens: Math.min(input.max_tokens, LIMITS.outputTokens),
  });
  let images = 0;
  const withoutPixels = (value) => {
    if (Array.isArray(value)) return value.map(withoutPixels);
    if (value && typeof value === "object") {
      if (value.type === "image") {
        const source = value.source;
        if (
          Object.keys(value).some(
            (k) => !["type", "source", "cache_control"].includes(k),
          ) ||
          Object.keys(source || {}).some(
            (k) => !["type", "media_type", "data"].includes(k),
          )
        )
          fail("invalid_image");
        if (
          !source ||
          source.type !== "base64" ||
          !["image/png", "image/jpeg", "image/webp"].includes(
            source.media_type,
          ) ||
          typeof source.data !== "string" ||
          source.data.length > Math.ceil(MAX_IMAGE / 3) * 4 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(source.data)
        )
          fail("invalid_image");
        const bytes = Buffer.from(source.data, "base64");
        if (!bytes.length || bytes.length > MAX_IMAGE || ++images > 2)
          fail("invalid_image");
        return {
          ...value,
          source: { type: "base64", media_type: source.media_type, data: "" },
        };
      }
      if (
        value.type === "base64" ||
        value.type === "image_url" ||
        value.type === "document"
      )
        fail("invalid_image");
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, withoutPixels(v)]),
      );
    }
    return value;
  };
  let bytes = jsonBytes(withoutPixels(payload));
  const text = (m) =>
    typeof m.content === "string"
      ? m.content
      : Array.isArray(m.content) && m.content.every((p) => p.type === "text")
        ? m.content.map((p) => p.text).join("")
        : null;
  for (
    let n = 0;
    bytes > LIMITS.payloadBytes && n + 1 < history.length;
    n += 2
  ) {
    const [user, answer] = history.slice(n, n + 2);
    if (user.role !== "user" || answer.role !== "assistant") break;
    const index = payload.messages.findIndex(
      (m, i) =>
        m.role === "user" &&
        text(m) === user.content &&
        payload.messages[i + 1]?.role === "assistant" &&
        text(payload.messages[i + 1]) === answer.content,
    );
    if (index < 0) continue;
    payload.messages.splice(index, 2);
    images = 0;
    bytes = jsonBytes(withoutPixels(payload));
  }
  if (bytes > LIMITS.payloadBytes) fail("context_too_large", 413);
  return {
    payload,
    textBytes: bytes,
    images,
    historyIds: history
      .filter((h) =>
        payload.messages.some(
          (m) => m.role === h.role && text(m) === h.content,
        ),
      )
      .map((h) => h.id),
  };
}
export function modelReservation({ textBytes, images, payload }, pricing) {
  if (
    pricing?.model !== MODEL ||
    !pricing.approvedAt ||
    !Number.isSafeInteger(pricing.input) ||
    pricing.input <= 0 ||
    !Number.isSafeInteger(pricing.output) ||
    pricing.output <= 0
  )
    fail("budget_disabled", 503);
  const cost = Math.ceil(
    ((textBytes + images * 10000) * pricing.input +
      payload.max_tokens * pricing.output) /
      1000000,
  );
  if (!Number.isSafeInteger(cost) || cost <= 0) fail("budget_disabled", 503);
  return cost;
}
async function readResponse(response, signal) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let size = 0;
  const abort = () => reader.cancel().catch(() => {});
  signal.addEventListener("abort", abort, { once: true });
  try {
    for (;;) {
      if (signal.aborted) fail("upstream_timeout", 504);
      const r = await reader.read();
      if (signal.aborted) fail("upstream_timeout", 504);
      if (r.done) break;
      size += r.value.length;
      if (size > 1024 * 1024) {
        await reader.cancel();
        fail("invalid_response", 502);
      }
      chunks.push(r.value);
    }
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
// The only injected upstream is the fixed server transport. Hermes receives no provider key.
export function createModelProxy({
  store,
  budget,
  pricing,
  upstream,
  now = Date.now,
}) {
  if (typeof upstream !== "function" || !budget?.get)
    fail("trainer_config", 503);
  const active = new Map();
  return {
    cancel(turnId) {
      active.get(turnId)?.abort();
    },
    async invoke(token, input) {
      const lease = store.consumeLease(token);
      if (active.size) fail("trainer_busy", 409);
      const controller = new AbortController();
      active.set(lease.turnId, controller);
      const timer = setTimeout(
        () => controller.abort(),
        Math.max(0, lease.deadline - now()),
      );
      const limiter = budget.get(budget.idFromName("pilot-v1"));
      let reserved = false,
        started = false;
      try {
        const snapshot = JSON.parse(store.internal(lease.turnId).snapshot);
        const history = (snapshot.history || []).map((m) => ({
          ...m,
          content: historyEnvelope(m),
        }));
        const bounded = boundedPayload(input, { history }),
          cost = modelReservation(bounded, pricing);
        store.recordCall(lease, bounded.payload, bounded.historyIds);
        const receipt = await abortable(
          limiter.fetch(
            new Request("https://budget/reserve", {
              method: "POST",
              body: JSON.stringify({
                action: "reserve",
                id: lease.reserveId,
                uid: createHash("sha256").update(lease.uid).digest("hex"),
                cost,
              }),
            }),
          ),
          controller.signal,
        );
        if (!receipt.ok) {
          const code =
            receipt.status === 429 ? "rate_limited" : "limiter_unavailable";
          fail(code, receipt.status === 429 ? 429 : 503);
        }
        reserved = true;
        // A cancel while the durable reserve was fsyncing cannot launch inference.
        store.assertActive(lease.turnId, lease.generation);
        if (controller.signal.aborted) fail("upstream_timeout", 504);
        started = true;
        const response = await abortable(
          upstream(bounded.payload, {
            signal: controller.signal,
            turnId: lease.turnId,
            call: lease.call,
          }),
          controller.signal,
        );
        if (!response.ok) {
          if (response.status === 429) fail("upstream_limited", 429);
          fail("upstream_failed", 502);
        }
        const bytes = await abortable(
          readResponse(response, controller.signal),
          controller.signal,
        );
        store.assertActive(lease.turnId, lease.generation);
        return new Response(bytes, {
          status: 200,
          headers: {
            "Content-Type":
              response.headers.get("content-type") || "application/json",
            "Cache-Control": "no-store",
          },
        });
      } catch (error) {
        // Ambiguous upstream outcomes freeze this turn. Internal SDK retries get no new lease.
        const unknown = started && error.message !== "upstream_limited";
        store.fail(
          lease.turnId,
          unknown ? "execution_unknown" : error.message,
          { unknown },
        );
        throw Object.assign(
          Error(
            [
              "invalid_payload",
              "invalid_tools",
              "invalid_image",
              "context_too_large",
              "budget_disabled",
              "rate_limited",
              "limiter_unavailable",
              "upstream_limited",
              "turn_inactive",
              "turn_expired",
              "upstream_timeout",
            ].includes(error.message)
              ? error.message
              : "upstream_failed",
          ),
          { status: error.status || 502, definitelyNotExecuted: !started },
        );
      } finally {
        clearTimeout(timer);
        active.delete(lease.turnId);
        // Finish changes only concurrency bookkeeping; the conservative cost is never refunded.
        if (reserved)
          try {
            await boundedOperation(() =>
              limiter.fetch(
                new Request("https://budget/finish", {
                  method: "POST",
                  body: JSON.stringify({
                    action: "finish",
                    id: lease.reserveId,
                  }),
                }),
              ),
            );
          } catch {
            /* Persistent ledger fails closed on the next reserve. */
          }
      }
    },
    close() {
      for (const controller of active.values()) controller.abort();
    },
  };
}

export const historyEnvelope = (message) =>
  JSON.stringify({ scisenseHistoryId: message.id, content: message.content });
