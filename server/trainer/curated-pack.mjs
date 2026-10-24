import { createHash } from "node:crypto";
import { provisionContext } from "./context-store.mjs";
import { fail, stableJSON } from "./limits.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const plain = value => value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const keys = (value, allowed) => plain(value) && Object.keys(value).every(key => allowed.includes(key));
const id = value => typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
const hash = value => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const text = (value, max) => typeof value === "string" && value.trim() && value.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value) && !/data:(image|audio)\//i.test(value);
const reject = () => fail("curated_pack_invalid");

// This pack is private operational input, never a model tool or a profile scan.
// The model receives only the rendered text, not source paths or the registry.
export function buildCuratedPack(input) {
  if (!keys(input, ["revision", "persona", "facts", "sources", "includedFactIds", "omissions"]) || !Number.isSafeInteger(input.revision) || input.revision < 1 || !text(input.persona, 8000) || !Array.isArray(input.sources) || !input.sources.length || input.sources.length > 32 || !Array.isArray(input.facts) || input.facts.length > 200) reject();
  const sourceIds = new Set();
  for (const source of input.sources) {
    if (!keys(source, ["id", "path", "sha256"]) || !id(source.id) || sourceIds.has(source.id) || !hash(source.sha256) || !text(source.path, 240) || source.path.startsWith("/") || source.path.split("/").some(part => !part || part === "." || part === "..") || /(^|[/.\\])(?:auth|secrets?|sessions?|transcripts?|config|env)(?:[/.\\]|$)/i.test(source.path)) reject();
    sourceIds.add(source.id);
  }
  const factIds = new Set();
  for (const fact of input.facts) {
    if (!keys(fact, ["factId", "text", "status", "required", "sourceId"]) || !id(fact.factId) || factIds.has(fact.factId) || !text(fact.text, 1600) || !["confirmed", "unknown", "conflict"].includes(fact.status) || typeof fact.required !== "boolean" || !sourceIds.has(fact.sourceId)) reject();
    factIds.add(fact.factId);
  }
  const includedFactIds = input.includedFactIds ?? input.facts.map(f => f.factId);
  if (!Array.isArray(includedFactIds) || includedFactIds.some(x => !factIds.has(x)) || new Set(includedFactIds).size !== includedFactIds.length) reject();
  const included = new Set(includedFactIds), omissions = input.omissions ?? [];
  if (!Array.isArray(omissions) || omissions.length > input.facts.length) reject();
  const omitted = new Set();
  for (const omission of omissions) {
    if (!keys(omission, ["factId", "reason"]) || !factIds.has(omission.factId) || included.has(omission.factId) || omitted.has(omission.factId) || !text(omission.reason, 400)) reject();
    omitted.add(omission.factId);
  }
  for (const fact of input.facts) {
    if (fact.required && !included.has(fact.factId)) fail("required_fact_missing");
    if (!included.has(fact.factId) && !omitted.has(fact.factId)) fail("omission_required");
  }
  const rendered = [input.persona.trim(), ...input.facts.filter(f => included.has(f.factId)).map(f => `[${f.status}] ${f.text.trim()}`)].join("\n");
  if (Buffer.byteLength(rendered, "utf8") > 8000) fail("context_too_large");
  const registry = { revision: input.revision, persona: input.persona, sources: input.sources, facts: input.facts, includedFactIds, omissions };
  const manifest = { version: 1, revision: input.revision, contextBytes: Buffer.byteLength(rendered, "utf8"), contextSha256: sha(rendered), registrySha256: sha(stableJSON(registry)), sourceHashes: Object.fromEntries(input.sources.map(s => [s.id, s.sha256])), requiredCoverage: 1 };
  return { ...registry, text: rendered, manifest };
}

export function validateCuratedPack(pack, { currentSourceHashes, approvedRegistryHash } = {}) {
  if (!keys(pack, ["revision", "persona", "sources", "facts", "includedFactIds", "omissions", "text", "manifest"])) reject();
  const { text: suppliedText, manifest, ...input } = pack;
  const rebuilt = buildCuratedPack(input);
  if (rebuilt.text !== suppliedText || stableJSON(rebuilt.manifest) !== stableJSON(manifest)) reject();
  // Approval is an external pin, not the self-declared manifest. Rebuilding a
  // smaller registry cannot silently claim that all required facts survived.
  if (!hash(approvedRegistryHash) || manifest.registrySha256 !== approvedRegistryHash) fail("registry_changed", 409);
  if (!plain(currentSourceHashes) || stableJSON(currentSourceHashes) !== stableJSON(manifest.sourceHashes)) fail("source_changed", 409);
  return rebuilt;
}

export function provisionCuratedPack(directory, { pack, key, currentSourceHashes, approvedRegistryHash }) {
  const validated = validateCuratedPack(pack, { currentSourceHashes, approvedRegistryHash });
  provisionContext(directory, { text: validated.text, key });
  return { revision: 0, contextSha256: validated.manifest.contextSha256, requiredCoverage: 1 };
}
