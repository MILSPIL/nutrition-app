import test from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  mkdtempSync,
  realpathSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { stableJSON } from "./limits.mjs";
import {
  createTrainerRuntime,
  TRAINER_CONFIGURATION,
  validateTrainerActivation,
  trainerConfigHash,
  trainerKeys,
} from "./runtime.mjs";
import { createMealApi } from "../api.mjs";
import { provisionContext } from "./context-store.mjs";
const manifest = {
    liveEnabled: true,
    trainer: { enabled: true },
    releaseId: "a".repeat(40),
    allowedUids: ["owner"],
    origin: "https://ntzg.pp.ua",
  },
  legacy = { receiptId: "synthetic-receipt" };
const activation = () => ({
  version: 1,
  active: true,
  configHash: trainerConfigHash,
  releaseId: manifest.releaseId,
  ledgerReceiptId: legacy.receiptId,
  target: manifest.origin,
  capMicros: 5000000,
  ownerUid: "owner",
  profileId: "owner",
  approvedAt: "2026-10-23T00:00:00Z",
  pricing: {
    model: "claude-sonnet-5-5",
    input: 2000000,
    output: 10000000,
    approvedAt: "2026-10-23T00:00:00Z",
  },
  contextMigrationConfirmed: true,
  singleWriterConfirmed: true,
  privacyGateClosed: true,
});
test("H07 trainer activation requires distinct exact release/config/ledger/owner/price gates", () => {
  assert.equal(
    validateTrainerActivation(activation(), manifest, legacy).ownerUid,
    "owner",
  );
  for (const change of [
    { active: false },
    { releaseId: "b".repeat(40) },
    { configHash: "old" },
    { ledgerReceiptId: "new" },
    { ownerUid: "stranger" },
    { profileId: "../other" },
    { capMicros: 5000001 },
    { privacyGateClosed: false },
    { singleWriterConfirmed: false },
    { contextMigrationConfirmed: false },
    { pricing: { ...activation().pricing, input: 3000000 } },
  ])
    assert.throws(
      () =>
        validateTrainerActivation(
          { ...activation(), ...change },
          manifest,
          legacy,
        ),
      /trainer_activation_invalid/,
    );
  assert.throws(() =>
    validateTrainerActivation(
      activation(),
      { ...manifest, liveEnabled: false },
      legacy,
    ),
  );
  assert.throws(() => trainerKeys(Buffer.alloc(31)), /trainer_key_invalid/);
  const k = trainerKeys(Buffer.alloc(32, 1));
  assert.notDeepEqual(k.state, k.context);
  assert.notEqual(k.native, k.state.toString("hex"));
});
test("H04 runtime fails before creating chat state when curated context is not provisioned", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "hermes-factory-")));
  mkdirSync(join(root, "context"), { mode: 0o700 });
  try {
    await assert.rejects(
      createTrainerRuntime({
        activation: activation(),
        budget: {},
        platformKey: randomBytes(32),
        anthropicKey: "synthetic",
        project: "demo-scisense",
        paths: { context: join(root, "context") },
        fetcher: () => {
          throw Error("NO_NETWORK");
        },
      }),
      /context_unavailable/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
// Uses the approved full index when available; clean CI obtains it in the Linux job.
const index = resolve(".agents/runtime/food-data/foods-v1-reviewed.sqlite");
test("H04 actual runtime stores share lifecycle and never infer on state/context reads", async (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "hermes-runtime-"))),
    key = randomBytes(32),
    context = join(root, "context");
  mkdirSync(context, { mode: 0o700 });
  mkdirSync(join(root, "media"), { mode: 0o700 });
  provisionContext(context, {
    text: "Синтетичний контекст",
    key: trainerKeys(key).context,
  });
  let runtime,
    shutdown = 0;
  t.after(async () => {
    await runtime?.close();
    rmSync(root, { recursive: true, force: true });
  });
  // Full dataset is a public artifact outside Git, so use an explicit test fixture
  // for this unit test. Production openFoodIndex remains checksum-enforced.
  if (
    !(() => {
      try {
        readFileSync(index);
        return true;
      } catch {
        return false;
      }
    })()
  )
    return t.skip("full public index is verified in hermes-resource-check");
  runtime = await createTrainerRuntime({
    activation: activation(),
    budget: {
      get: () => ({
        fetch: () => {
          throw Error("NO_RESERVE");
        },
      }),
    },
    platformKey: key,
    anthropicKey: "synthetic",
    project: "demo-scisense",
    paths: {
      context,
      turns: join(root, "turns.sqlite"),
      media: join(root, "media"),
      index,
    },
    fetcher: () => {
      throw Error("NO_NETWORK");
    },
    backendFactory: () => ({
      shutdown: async () => {
        shutdown++;
      },
    }),
  });
  const state = await runtime.handle("owner", "/state", "GET", null, {
    ownerToken: "synthetic",
  });
  assert.equal(state.status, 200);
  const ctx = await runtime.handle("owner", "/context", "GET", null, {
    ownerToken: "synthetic",
  });
  assert.equal((await ctx.json()).text, "Синтетичний контекст");
  await assert.rejects(
    runtime.handle("stranger", "/state", "GET", null, {
      ownerToken: "synthetic",
    }),
    /pilot_forbidden/,
  );
  const api = createMealApi({
    env: {
      FIREBASE_PROJECT: "synthetic-scisense",
      ALLOWED_ORIGINS: "https://ntzg.pp.ua",
      ALLOWED_UIDS: "owner",
      LIVE_ENABLED: "false",
    },
    trainer: runtime,
  });
  await api.close();
  await Promise.all([runtime.close(), runtime.close()]);
  runtime = null;
  assert.equal(shutdown, 1);
});

test("C05 activation binds the exact tested native config and profile template", () => {
  const digest = name => createHash("sha256").update(readFileSync(new URL(name, import.meta.url))).digest("hex");
  assert.equal(TRAINER_CONFIGURATION.hermesConfigSha256, digest("./hermes-config.json"));
  assert.equal(TRAINER_CONFIGURATION.profileTemplateSha256, digest("./profile-template.json"));
  const { hermesConfigSha256, profileTemplateSha256, ...oldConfiguration } = TRAINER_CONFIGURATION;
  const oldHash = createHash("sha256").update(stableJSON(oldConfiguration)).digest("hex");
  assert.throws(() => validateTrainerActivation({ ...activation(), configHash: oldHash }, manifest, legacy), /trainer_activation_invalid/);
});
