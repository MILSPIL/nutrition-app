import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCuratedPack, validateCuratedPack, provisionCuratedPack } from "./curated-pack.mjs";
import { openContextStore } from "./context-store.mjs";
const h = s => createHash("sha256").update(s).digest("hex");
const input = () => ({ revision: 1, persona: "Синтетичний тренер. Факти щоденника читає застосунок.", sources: [{ id: "profile", path: "USER.md", sha256: h("source") }], facts: [{ factId: "preference", text: "Синтетична стала перевага", status: "confirmed", required: true, sourceId: "profile" }, { factId: "unknown", text: "Невідомий параметр", status: "unknown", required: true, sourceId: "profile" }, { factId: "optional", text: "Історичне повідомлення", status: "confirmed", required: false, sourceId: "profile" }] });
const current = { profile: h("source") };
test("C05 pack has exact coverage, deterministic hashes and explicit unknown", () => {
 const pack = buildCuratedPack(input());
 assert.deepEqual(validateCuratedPack(pack, { currentSourceHashes: current }), pack);
 assert.equal(pack.manifest.requiredCoverage, 1); assert.match(pack.text, /\[unknown\]/); assert.equal(pack.manifest.contextSha256, h(pack.text));
 assert.deepEqual(buildCuratedPack(input()), pack);
});
test("C05 8000 UTF8 bytes pass and 8001 fail at pack boundary", () => {
 const src = input(), base = buildCuratedPack(src); src.persona += "x".repeat(8000 - Buffer.byteLength(base.text));
 const pack = buildCuratedPack(src); assert.equal(Buffer.byteLength(pack.text), 8000);
 validateCuratedPack(pack, { currentSourceHashes: current });
 assert.throws(() => buildCuratedPack({ ...src, persona: src.persona + "x" }), /context_too_large/);
});
test("C05 missing required fact and source changes reject", () => {
 assert.throws(() => buildCuratedPack({ ...input(), includedFactIds: ["optional"] }), /required_fact_missing/);
 const pack = buildCuratedPack(input());
 assert.throws(() => validateCuratedPack(pack, { currentSourceHashes: { profile: h("changed") } }), /source_changed/);
 const changed = structuredClone(pack); changed.text = changed.text.replace("[unknown]", "[confirmed]");
 assert.throws(() => validateCuratedPack(changed, { currentSourceHashes: current }), /curated_pack_invalid/);
});
test("C05 optional omission is explicit; extra metadata/invalid status/duplicated IDs denied", () => {
 const pack = buildCuratedPack({ ...input(), includedFactIds: ["preference", "unknown"], omissions: [{ factId: "optional", reason: "Не є сталим фактом" }] });
 assert.equal(pack.omissions.length, 1); assert.doesNotMatch(pack.text, /Історичне повідомлення/);
 assert.throws(() => buildCuratedPack({ ...input(), includedFactIds: ["preference", "unknown"] }), /omission_required/);
 for (const mutate of [v => v.facts[0].status = "guessed", v => v.facts.push(v.facts[0]), v => v.facts[0].secret = "synthetic", v => v.sources[0].path = "../auth.json"]) {
  const src = input(); mutate(src); assert.throws(() => buildCuratedPack(src), /curated_pack_invalid/);
 }
});
test("C05 validated pack provisions the existing API context store once", () => {
 const dir = realpathSync(mkdtempSync(join(tmpdir(), "scisense-curated-"))), key = Buffer.alloc(32, 7);
 try { const pack = buildCuratedPack(input()); provisionCuratedPack(dir, { pack, key, currentSourceHashes: current });
 const store = openContextStore(dir, { key }); assert.deepEqual(store.read(), { text: pack.text, revision: 0 });
 assert.throws(() => provisionCuratedPack(dir, { pack, key, currentSourceHashes: current }), /context_exists/);
 } finally { key.fill(0); rmSync(dir, { recursive: true, force: true }); }
});
