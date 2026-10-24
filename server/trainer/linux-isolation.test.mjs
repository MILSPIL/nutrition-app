import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  symlinkSync,
  linkSync,
  rmSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyWritableTree } from "./linux-isolation.mjs";
test("H07 writable profile and worker directories reject symlinks and hardlinks", () => {
  const root = mkdtempSync(join(tmpdir(), "hermes-alias-"));
  try {
    const p = join(root, "profile");
    mkdirSync(p, { mode: 0o700 });
    writeFileSync(join(root, "outside"), "synthetic");
    verifyWritableTree(p);
    symlinkSync(join(root, "outside"), join(p, "alias"));
    assert.throws(() => verifyWritableTree(p), /hermes_profile_alias/);
    rmSync(join(p, "alias"));
    linkSync(join(root, "outside"), join(p, "alias"));
    assert.throws(() => verifyWritableTree(p), /hermes_profile_alias/);
    rmSync(join(p, "alias"));
    writeFileSync(join(p, "SOUL.md"), "synthetic");
    verifyWritableTree(p);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
