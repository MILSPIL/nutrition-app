import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("disabled package rejects empty, incomplete and escaping public archives", () => {
  const r = spawnSync("python3", [new URL("./hermes_runtime_package_test.py", import.meta.url).pathname], { encoding: "utf8", timeout: 10000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /Ran 10 tests/);
});
test("native cleanup rejects active ownership and foreign unproven namespace", () => {
  const r = spawnSync("python3", [new URL("./hermes_privacy_test.py", import.meta.url).pathname], { encoding: "utf8", timeout: 15000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /Ran 18 tests/);
});
