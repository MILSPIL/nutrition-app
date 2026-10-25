import test from "node:test";
import assert from "node:assert/strict";
import { safeToolFailure } from "./tool-errors.mjs";
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
