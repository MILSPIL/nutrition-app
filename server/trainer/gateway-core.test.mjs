import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  chmodSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes, randomUUID } from "node:crypto";
import { openTurnStore } from "./turn-store.mjs";
import { createModelProxy, boundedPayload } from "./model-proxy.mjs";
import { buildSnapshot } from "./snapshot.mjs";
import { MODEL, TOOLS } from "./limits.mjs";
import { localBudget } from "../../scripts/phone-lab/sqlite.mjs";

function fixture(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "trainer-core-")));
  chmodSync(dir, 0o700);
  const file = join(dir, "turns.sqlite"),
    key = randomBytes(32);
  let clock = Date.now();
  let store = openTurnStore(file, { hmacKey: key, now: () => clock });
  const budget = localBudget(join(dir, "budget.sqlite"), 5000000, {
    initialize: true,
    hermesPolicy: true,
  });
  const c = store.conversation("pilot");
  t.after(() => {
    store.close();
    budget.close();
    rmSync(dir, { recursive: true });
  });
  return {
    dir,
    file,
    key,
    budget,
    c,
    get store() {
      return store;
    },
    tick(ms) {
      clock += ms;
    },
    reopen() {
      store.close();
      store = openTurnStore(file, { hmacKey: key, now: () => clock });
      return store;
    },
    admit(extra = {}) {
      const input = {
        turnId: randomUUID(),
        text: "Синтетична картопля 200 г",
        targetDate: "2026-01-03",
        baseRevision: store.conversation("pilot").revision,
        media: [],
        ...extra,
      };
      const admitted = store.admit("pilot", c.conversationId, input, {
        synthetic: true,
        history: [],
      });
      return { input, ...admitted };
    },
  };
}
const payload = () => ({
  model: MODEL,
  max_tokens: 128000,
  messages: [{ role: "user", content: [{ type: "text", text: "synthetic" }] }],
  system: "synthetic instructions",
  tools: TOOLS.map((name) => ({
    name,
    description: "synthetic tool",
    input_schema: { type: "object", properties: {} },
  })),
  tool_choice: { type: "auto" },
  stream: false,
});
const pricing = {
  model: MODEL,
  approvedAt: "synthetic-only",
  input: 3000000,
  output: 15000000,
};
function proxy(f, upstream) {
  return createModelProxy({
    store: f.store,
    budget: f.budget.binding,
    pricing,
    upstream,
  });
}

test("durable admission: exact replay, conflict, UID isolation, one global run", (t) => {
  const f = fixture(t),
    a = f.admit();
  assert.equal(a.replayed, false);
  assert.equal(
    f.store.admit("pilot", f.c.conversationId, a.input, {
      differentSnapshot: true,
    }).replayed,
    true,
  );
  assert.throws(
    () =>
      f.store.admit(
        "pilot",
        f.c.conversationId,
        { ...a.input, text: "different" },
        {},
      ),
    /turn_conflict/,
  );
  assert.throws(() => f.store.get("stranger", a.input.turnId), /not_found/);
  const other = f.store.conversation("stranger");
  assert.throws(
    () =>
      f.store.admit(
        "stranger",
        other.conversationId,
        { ...a.input, turnId: randomUUID() },
        {},
      ),
    /trainer_busy/,
  );
  f.reopen();
  assert.equal(f.store.get("pilot", a.input.turnId).state, "failed");
  assert.equal(f.store.get("pilot", a.input.turnId).text, a.input.text);
  assert.equal(f.store.cleanupJobs().length, 1);
});
test("running restart is unknown and cannot silently run again", (t) => {
  const f = fixture(t),
    a = f.admit();
  f.store.begin("pilot", a.input.turnId);
  f.reopen();
  assert.equal(f.store.get("pilot", a.input.turnId).state, "unknown");
  assert.throws(() => f.admit(), /trainer_busy/);
  assert.throws(() => f.store.issueLease(a.input.turnId, 1), /turn_inactive/);
  assert.throws(() => f.store.cleaned(a.input.turnId), /cleanup_unsafe/);
});
test("result commit precedes durable cleanup; replay after lost ACK returns completed once", (t) => {
  const f = fixture(t),
    a = f.admit();
  const r = f.store.begin("pilot", a.input.turnId);
  f.store.bindRun(r.id, r.generation, {
    runId: randomUUID(),
    sessionId: randomUUID(),
  });
  f.store.complete(r.id, r.generation, { text: "Чернетка готова" });
  assert.equal(f.store.cleanupJobs().length, 1);
  f.reopen();
  assert.equal(f.store.get("pilot", r.id).state, "cleanup_pending");
  assert.equal(f.store.history("pilot", f.c.conversationId).length, 2);
  assert.equal(f.store.conversation("pilot").revision, 1);
  assert.throws(() => f.admit(), /trainer_busy/);
  f.store.cleaned(r.id);
  assert.equal(f.admit().replayed, false);
});
test("cancellation revokes generation and rejects late commits and leases", (t) => {
  const f = fixture(t),
    a = f.admit(),
    r = f.store.begin("pilot", a.input.turnId),
    lease = f.store.issueLease(r.id, r.generation);
  f.store.cancel("pilot", r.id);
  assert.throws(() => f.store.consumeLease(lease.token), /turn_inactive/);
  assert.throws(
    () => f.store.complete(r.id, r.generation, { text: "late" }),
    /stale_result/,
  );
  assert.equal(f.store.history("pilot", f.c.conversationId).length, 0);
  assert.equal(f.store.cleanupJobs().length, 1);
});
test("composer CAS survives reload and uses no model calls", (t) => {
  const f = fixture(t);
  assert.deepEqual(
    f.store.composer("pilot", f.c.conversationId, {
      text: "текст чернетки",
      baseRevision: 0,
    }),
    { text: "текст чернетки", revision: 1 },
  );
  assert.throws(
    () =>
      f.store.composer("pilot", f.c.conversationId, {
        text: "stale tab",
        baseRevision: 0,
      }),
    /composer_conflict/,
  );
  f.reopen();
  assert.equal(f.store.conversation("pilot").composer.text, "текст чернетки");
  assert.equal(f.budget.spent(), 0);
});
test("leases are single use and bounded to three calls and the turn deadline", (t) => {
  const f = fixture(t),
    a = f.admit(),
    r = f.store.begin("pilot", a.input.turnId);
  for (let n = 0; n < 3; n++) {
    const l = f.store.issueLease(r.id, r.generation);
    assert.equal(f.store.consumeLease(l.token).call, n + 1);
    assert.throws(() => f.store.consumeLease(l.token), /invalid_lease/);
  }
  assert.throws(() => f.store.issueLease(r.id, r.generation), /call_limit/);
  f.tick(45000);
  assert.throws(() => f.store.assertActive(r.id, r.generation), /turn_expired/);
});
test("actual bounded payload is reserved before upstream, output hard cap is 4096", async (t) => {
  const f = fixture(t),
    a = f.admit(),
    r = f.store.begin("pilot", a.input.turnId);
  let calls = 0;
  const p = proxy(f, async (body) => {
    calls++;
    assert.ok(f.budget.spent() > 0);
    assert.equal(body.max_tokens, 4096);
    return Response.json({ ok: true });
  });
  const l = f.store.issueLease(r.id, r.generation);
  assert.equal((await p.invoke(l.token, payload())).status, 200);
  const spent = f.budget.spent();
  await assert.rejects(() => p.invoke(l.token, payload()), /invalid_lease/);
  assert.equal(f.budget.spent(), spent);
  assert.equal(calls, 1);
});
for (const [name, change] of [
  ["model", (b) => ({ ...b, model: "other" })],
  ["size", (b) => ({ ...b, system: "x".repeat(33000) })],
  [
    "tools",
    (b) => ({ ...b, tools: [...b.tools.slice(1), { name: "terminal" }] }),
  ],
  ["url", (b) => ({ ...b, base_url: "https://evil.invalid" })],
])
  test(
    "invalid " + name + " freezes turn without reserve or upstream",
    async (t) => {
      const f = fixture(t),
        a = f.admit(),
        r = f.store.begin("pilot", a.input.turnId);
      let calls = 0;
      const p = proxy(f, async () => {
        calls++;
        return Response.json({});
      });
      await assert.rejects(
        () =>
          p.invoke(
            f.store.issueLease(r.id, r.generation).token,
            change(payload()),
          ),
        (e) => e.definitelyNotExecuted,
      );
      assert.equal(f.budget.spent(), 0);
      assert.equal(calls, 0);
      assert.equal(f.store.get("pilot", r.id).state, "failed");
      assert.throws(
        () => f.store.issueLease(r.id, r.generation),
        /turn_inactive/,
      );
    },
  );
test("429 freezes the turn, retains reserve, and forbids SDK retry", async (t) => {
  const f = fixture(t),
    a = f.admit(),
    r = f.store.begin("pilot", a.input.turnId);
  let calls = 0;
  const p = proxy(f, async () => {
    calls++;
    return new Response("", { status: 429 });
  });
  await assert.rejects(
    () => p.invoke(f.store.issueLease(r.id, r.generation).token, payload()),
    /upstream_limited/,
  );
  assert.equal(f.store.get("pilot", r.id).state, "failed");
  assert.throws(() => f.store.issueLease(r.id, r.generation), /turn_inactive/);
  assert.equal(calls, 1);
  assert.ok(f.budget.spent() > 0);
});
test("failed upstream retains reservation and freezes ambiguous execution", async (t) => {
  const f = fixture(t),
    a = f.admit(),
    r = f.store.begin("pilot", a.input.turnId);
  const p = proxy(f, async () => {
    throw Error("private detail must not escape");
  });
  await assert.rejects(
    () => p.invoke(f.store.issueLease(r.id, r.generation).token, payload()),
    /upstream_failed/,
  );
  assert.ok(f.budget.spent() > 0);
  assert.equal(f.store.get("pilot", r.id).state, "unknown");
  assert.throws(() => f.store.issueLease(r.id, r.generation), /turn_inactive/);
  assert.equal(
    readFileSync(f.file).includes(Buffer.from("private detail")),
    false,
  );
});
test("cancel during durable reserve does not contact upstream", async (t) => {
  const f = fixture(t),
    a = f.admit(),
    r = f.store.begin("pilot", a.input.turnId);
  let calls = 0;
  const binding = {
    idFromName: (x) => x,
    get: () => ({
      fetch: async (request) => {
        const body = await request.clone().json();
        const result = await f.budget.binding.get().fetch(request);
        if (body.action === "reserve") f.store.cancel("pilot", r.id);
        return result;
      },
    }),
  };
  const p = createModelProxy({
    store: f.store,
    budget: binding,
    pricing,
    upstream: async () => {
      calls++;
      return Response.json({});
    },
  });
  await assert.rejects(
    () => p.invoke(f.store.issueLease(r.id, r.generation).token, payload()),
    /turn_inactive/,
  );
  assert.equal(calls, 0);
  assert.ok(f.budget.spent() > 0);
});
test("mandatory context is not trimmed, history is a deterministic suffix of complete pairs", () => {
  const args = {
    conversationId: "synthetic",
    historyRevision: 1,
    context: "all curated files",
    contextRevision: 1,
    day: {},
    plan: {},
    message: "user",
  };
  const history = Array.from({ length: 20 }, (_, n) => ({
    id: String(n),
    role: n % 2 ? "assistant" : "user",
    content: "message" + n,
  }));
  const s = buildSnapshot({ ...args, history });
  assert.equal(s.history.length, 12);
  assert.equal(s.history[0].id, "8");
  assert.equal(s.history.at(-1).id, "19");
  assert.equal(s.context, args.context);
  assert.throws(
    () => buildSnapshot({ ...args, context: "x".repeat(32000) }),
    /context_too_large/,
  );
});
test("late run acknowledgement after cancel remains addressable for cleanup", (t) => {
  const f = fixture(t),
    a = f.admit(),
    r = f.store.begin("pilot", a.input.turnId);
  f.store.cancel("pilot", r.id);
  const sessionId = randomUUID();
  f.store.bindRun(r.id, r.generation, { runId: randomUUID(), sessionId });
  assert.equal(f.store.cleanupJobs()[0].session_id, sessionId);
});
test("second runtime refuses to race the same store", (t) => {
  const f = fixture(t);
  assert.throws(
    () => openTurnStore(f.file, { hmacKey: f.key }),
    /trainer_in_use/,
  );
});

test("proxy deadline holds even if the upstream ignores abort", async (t) => {
  const f = fixture(t),
    a = f.admit(),
    r = f.store.begin("pilot", a.input.turnId);
  const p = createModelProxy({
    store: f.store,
    budget: f.budget.binding,
    pricing,
    now: () => r.deadline - 20,
    upstream: () => new Promise(() => {}),
  });
  const at = Date.now();
  await assert.rejects(
    () => p.invoke(f.store.issueLease(r.id, r.generation).token, payload()),
    /upstream_timeout/,
  );
  assert.ok(Date.now() - at < 1000);
  assert.equal(f.store.get("pilot", r.id).state, "unknown");
  assert.ok(f.budget.spent() > 0);
});

test("prompt cache controls are removed recursively before reservation/forwarding", () => {
  const b = payload();
  b.system = [
    {
      type: "text",
      text: "x",
      cache_control: { type: "ephemeral", ttl: "1h" },
    },
  ];
  b.messages[0].content[0].cache_control = { type: "ephemeral", ttl: "5m" };
  b.tools[0].cache_control = { type: "unknown" };
  const out = boundedPayload(b);
  assert.equal(JSON.stringify(out.payload).includes("cache_control"), false);
});
test("actual payload budget drops only oldest complete history pairs", () => {
  const b = payload(),
    pair = [
      { role: "user", content: "u".repeat(2000) },
      { role: "assistant", content: "a".repeat(2000) },
    ];
  b.system = "x".repeat(28000);
  b.messages = [...pair, ...b.messages];
  const out = boundedPayload(b, { history: pair });
  assert.equal(out.payload.messages.length, 1);
  assert.equal(out.payload.system.length, 28000);
  assert.throws(
    () =>
      boundedPayload({ ...b, system: "x".repeat(33000) }, { history: pair }),
    /context_too_large/,
  );
});
