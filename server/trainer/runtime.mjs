import { readFileSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, createHash } from "node:crypto";
import { openTurnStore } from "./turn-store.mjs";
import { createMediaStore } from "./media.mjs";
import { openContextStore } from "./context-store.mjs";
import { openFoodIndex } from "./food-lookup.mjs";
import { createTrainerTools } from "./tools.mjs";
import { createModelProxy } from "./model-proxy.mjs";
import { createNativeBackend } from "./hermes-native.mjs";
import { createTrainerGateway } from "./gateway.mjs";
import { withOwnerToken, createFirestoreReader } from "./firestore-reader.mjs";
import { MODEL, LIMITS, stableJSON } from "./limits.mjs";
export const TRAINER_CONFIGURATION = Object.freeze({
  version: 1,
  model: MODEL,
  limits: LIMITS,
  policy: { minute: 12, hour: 80, day: 120 },
  hermesConfigSha256: createHash("sha256")
    .update(readFileSync(new URL("./hermes-config.json", import.meta.url)))
    .digest("hex"),
  profileTemplateSha256: createHash("sha256")
    .update(readFileSync(new URL("./profile-template.json", import.meta.url)))
    .digest("hex"),
  isolation: "linux-bubblewrap",
  cpu: 2,
  memoryBytes: 2147483648,
  foodIndexSha256:
    "a8e60fe05956869df3bc9d04371994c5ff8adf0d6014e474457f52191b591ad8",
  hermesCommit: JSON.parse(
    readFileSync(new URL("./hermes-pin.json", import.meta.url)),
  ).commit,
});
export const trainerConfigHash = createHash("sha256")
  .update(stableJSON(TRAINER_CONFIGURATION))
  .digest("hex");
export function validateTrainerActivation(value, manifest, legacy) {
  const stamp = (s) =>
    typeof s === "string" &&
    Number.isFinite(Date.parse(s)) &&
    Date.parse(s) <= Date.now();
  if (
    value?.version !== 1 ||
    value.active !== true ||
    !manifest.liveEnabled ||
    manifest.trainer?.enabled !== true ||
    value.configHash !== trainerConfigHash ||
    value.releaseId !== manifest.releaseId ||
    value.ledgerReceiptId !== legacy.receiptId ||
    value.target !== manifest.origin ||
    value.capMicros !== 5000000 ||
    !manifest.allowedUids.includes(value.ownerUid) ||
    ![value.ownerUid, value.profileId].every(
      (s) => typeof s === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(s),
    ) ||
    !stamp(value.approvedAt) ||
    !stamp(value.pricing?.approvedAt) ||
    value.pricing.model !== MODEL ||
    value.pricing.input !== 2000000 ||
    value.pricing.output !== 10000000 ||
    value.contextMigrationConfirmed !== true ||
    value.singleWriterConfirmed !== true ||
    value.privacyGateClosed !== true
  )
    throw Error("trainer_activation_invalid");
  return value;
}
export const trainerKeys = (key) => {
  if (!Buffer.isBuffer(key) || key.length !== 32)
    throw Error("trainer_key_invalid");
  const derive = (name) =>
    createHmac("sha256", key)
      .update("scisense-trainer-v1:" + name)
      .digest();
  return {
    state: derive("state"),
    context: derive("context"),
    native: derive("native").toString("hex"),
  };
};
// No provisioning here: curated context, deletion anchor, existing ledger and key
// must be supplied by a separately approved cutover. Startup performs recovery.
export function trainerPaths(releaseRoot) {
  return {
    context: "/var/lib/scisense/trainer-context",
    turns: "/var/lib/scisense/trainer/turns.sqlite",
    media: "/run/scisense/trainer-media",
    index: join(releaseRoot, "data/foods-v1-reviewed.sqlite"),
    source: "/opt/scisense/hermes/source",
    sourceManifest: "/opt/scisense/hermes/source-manifest.json",
    profile: "/var/lib/scisense/hermes-profile",
    workDirectory: "/run/scisense/hermes-worker",
    pythonRoot: "/opt/scisense/python",
  };
}
export async function createTrainerRuntime({
  activation,
  budget,
  platformKey,
  anthropicKey,
  project,
  fetcher = fetch,
  releaseRoot = realpathSync(
    join(dirname(fileURLToPath(import.meta.url)), "../.."),
  ),
  paths = trainerPaths(releaseRoot),
  backendFactory = createNativeBackend,
}) {
  const keys = trainerKeys(platformKey),
    reader = createFirestoreReader({
      project,
      ownerUid: activation.ownerUid,
      profileId: activation.profileId,
      fetcher,
    });
  let store, index, proxy, backend, gateway, closing;
  const close = () =>
    (closing ??= (async () => {
      try {
        if (gateway) await gateway.close();
        else
          try {
            await backend?.shutdown();
          } finally {
            proxy?.close();
          }
      } finally {
        try {
          store?.close();
        } finally {
          try {
            index?.close();
          } finally {
            keys.state.fill(0);
            keys.context.fill(0);
          }
        }
      }
    })());
  try {
    const contextStore = openContextStore(paths.context, { key: keys.context });
    store = openTurnStore(paths.turns, { hmacKey: keys.state });
    const media = createMediaStore(paths.media, { hash: store.hash });
    index = openFoodIndex(paths.index, TRAINER_CONFIGURATION.foodIndexSha256);
    const kit = createTrainerTools({ store, index, ...reader, memoryWriteEnabled: activation.memoryWriteEnabled === true });
    proxy = createModelProxy({
      store,
      budget,
      pricing: activation.pricing,
      upstream: (payload, { signal }) =>
        fetcher("https://api.anthropic.com/v1/messages", {
          method: "POST",
          redirect: "error",
          signal,
          headers: {
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
            "x-api-key": anthropicKey,
          },
          body: JSON.stringify(payload),
        }),
    });
    backend = backendFactory({
      source: paths.source,
      sourceManifest: paths.sourceManifest,
      profile: paths.profile,
      workDirectory: paths.workDirectory,
      apiKey: keys.native,
      tools: kit.tools,
      toolSchemas: kit.schemas,
      isolation: "linux-bubblewrap",
      pythonRoot: paths.pythonRoot,
    });
    gateway = createTrainerGateway({
      ownerUid: activation.ownerUid,
      store,
      media,
      proxy,
      backend,
      readContext: () => contextStore.read(),
      ...reader,
      contextStore,
      memoryWriteEnabled: activation.memoryWriteEnabled === true,
      releaseTools: kit.release,
    });
    await gateway.recover();
    return {
      handle(uid, route, method, body, { signal, ownerToken } = {}) {
        return withOwnerToken(uid, ownerToken, () =>
          gateway.handle(uid, route, method, body, { signal }),
        );
      },
      close,
    };
  } catch (error) {
    await close().catch(() => {});
    throw error;
  }
}
