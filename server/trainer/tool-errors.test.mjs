import test from "node:test";
import assert from "node:assert/strict";
import { safeToolFailure, MODEL_TOOL_ERRORS } from "./tool-errors.mjs";
test("known proposal failures give repair instructions without raw diagnostic details", () => {
  const error = Object.assign(Error("invalid_food_proposal"), {stack:"secret-path",cause:"Bearer secret"});
  const result = safeToolFailure(error);
  assert.equal(result.error, "invalid_food_proposal");assert.match(result.hint,/UUID/);
  assert.doesNotMatch(JSON.stringify(result),/secret|Bearer/);
});
test("unknown or forged errors cannot expose diagnostics or prototype properties", () => {
  for(const message of ["sk-secret", "/private/context.txt", "constructor", "__proto__", undefined, {toString:()=>"invalid_food_source",privateDiagnostic:"secret"}])
    assert.deepEqual(safeToolFailure({message}),{error:"tool_unavailable"});
});
test("draft storage refusals carry exact repair hints for the model", () => {
  const exact = {
    date_draft_conflict: "This date already has an unsaved draft in snapshot.draft. If its state is saving or unknown, ask the user to check that card first. Otherwise edit it: same draftId, its revision as baseRevision; keep its items and meal unless the user asks.",
    draft_frozen: "This draft is being saved and cannot change. Do not propose; ask the user to check that card first, then send the food again.",
    draft_too_large: "Draft data is over 16000 bytes. Propose fewer items or shorter names and assumptions, or ask the user to add the current preview first.",
    invalid_quantity: "quantity is {value, unit}: value is a number above 0 and up to 100000, or null; unit is g, ml, portion, package or unknown.",
    draft_already_proposed: "This draft was already proposed in this turn. Do not propose again; answer the user.",
    invalid_food_query: "query: one food, up to 160 characters and 1-12 words; preparation from the enum.",
  };
  for (const [code, hint] of Object.entries(exact))
    assert.deepEqual(safeToolFailure(Object.assign(Error(code), { status: 409 })), { error: code, hint });
  assert.equal(MODEL_TOOL_ERRORS.size, 23);
  for (const code of MODEL_TOOL_ERRORS) assert.equal(safeToolFailure(Error(code)).error, code);
});
