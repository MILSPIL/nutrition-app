import test from "node:test";
import assert from "node:assert/strict";
import { createPersonalBackend } from "./personal-backend.mjs";
import { MODEL_TOOL_ERRORS } from "./tool-errors.mjs";
import { fail } from "./limits.mjs";

// The private process pipe collapses unknown tool errors into trainer_unavailable,
// so repairable validation codes must leave the backend as a tool RESULT.
const CODES = ["invalid_food_proposal", "invalid_food_source", "food_source_not_offered", "invalid_plan_match",
  "invalid_date", "invalid_household_measure", "draft_conflict", "date_clarification",
  "date_change_requires_confirmation", "consumption_unconfirmed", "label_evidence_missing",
  "estimate_reason_required", "assumptions_required", "invalid_portion_origin", "brand_is_not_exact",
  "density_not_confirmed", "memory_read_only",
  "date_draft_conflict", "draft_frozen", "draft_too_large", "invalid_quantity", "draft_already_proposed", "invalid_food_query"];

async function toolOutcome(failure) {
  let outcome;
  const core = { enqueue() {}, schedule() {}, input: () => ({ state: "admitted", generation: 1 }) };
  const backend = createPersonalBackend({ uid: "owner", core, tools: { propose_food_draft: async () => failure() } });
  const signal = new AbortController().signal;
  await backend.start({
    turn: { id: "turn-synthetic-0001", owner: "owner", generation: 1 }, input: {}, snapshot: {}, images: [], onRun() {},
    slot: { execute: async value => {
      const prepared = await value.prepare({ signal, sessionId: "session-synthetic" });
      try { outcome = { result: await prepared.tools("propose_food_draft", {}, { signal, nativeBinding: { admissionId: "admission-synthetic", sessionId: "session-synthetic" } }) }; }
      catch (error) { outcome = { thrown: error.message }; }
      return { state: "completed", result: { final_response: "Синтетична відповідь" } };
    } },
  }).catch(() => {});
  return outcome;
}

test("every repairable tool code returns to the model as a result with a repair hint", async () => {
  assert.deepEqual([...MODEL_TOOL_ERRORS].sort(), [...CODES].sort());
  for (const code of CODES) {
    const { result } = await toolOutcome(() => fail(code, 409));
    assert.equal(result?.error, code, code);
    assert.ok(typeof result.hint === "string" && result.hint.length > 0 && result.hint.length < 300, code);
    assert.deepEqual(Object.keys(result).sort(), ["error", "hint"]);
  }
});

test("other tool failures still abort the turn unchanged and never become hints", async () => {
  for (const code of ["turn_inactive", "context_changed", "trainer_unavailable", "invalid_request", "sk-secret /private/x"])
    assert.deepEqual(await toolOutcome(() => { throw Error(code); }), { thrown: code });
});
