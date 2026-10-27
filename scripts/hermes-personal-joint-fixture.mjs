// Actual native owner + native Codex SDK producer + durable encrypted parent.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { deflateSync, crc32 } from "node:zlib";
import { createPersonalProcess } from "../server/trainer/personal-process.mjs";
import { createPersonalPayer } from "../server/trainer/personal-payer.mjs";
import { createPersonalCoordinator } from "../server/trainer/personal-coordinator.mjs";
import { openPersonalCredentials } from "../server/trainer/personal-credentials.mjs";
import { openPersonalStore } from "../server/trainer/personal-store.mjs";
import { personalProfiles } from "../server/trainer/personal-profiles.mjs";
import { openTurnStore } from "../server/trainer/turn-store.mjs";
import { createTrainerGateway } from "../server/trainer/gateway.mjs";
import { createPersonalBackend } from "../server/trainer/personal-backend.mjs";
import { createTrainerTools } from "../server/trainer/tools.mjs";
import { buildSnapshot } from "../server/trainer/snapshot.mjs";
import { stableJSON } from "../server/trainer/limits.mjs";
import { PERSONAL_LIMITS } from "../server/trainer/personal-limits.mjs";
import { createMediaStore } from "../server/trainer/media.mjs";
const setup = JSON.parse(readFileSync(process.argv[2])), root = setup.env.SCISENSE_FIXTURE_ROOT;
const key = randomBytes(32), homes = ["owner", "wife"].map(uid => join(root, "joint-" + uid));
for (const home of homes) mkdirSync(home, { mode: 0o700 });
const profiles = personalProfiles({ version: 1, fundingOwner: "owner", profiles: ["owner", "wife"].map((uid, index) => ({ uid, profileId: "p-" + uid,
  home: homes[index], socket: join(root, "run-" + uid, "native.sock"), canonicalTitle: "Bot Chat" })) });
const outbox = openPersonalStore(join(root, "joint-outbox.sqlite"), { profiles, key });
const credentials = openPersonalCredentials(join(root, "joint-credentials.sqlite"), { key, fundingOwnerUid: "owner" });
const token = "synthetic." + Buffer.from(JSON.stringify({ exp: 4102444800 })).toString("base64url") + ".signature";
credentials.initialize({ "auth.json": Buffer.from(JSON.stringify({ version: 1, providers: { "openai-codex": { tokens: { access_token: token, refresh_token: "synthetic-refresh" } } } })),
  "config.yaml": Buffer.from(JSON.stringify({ model: { provider: "openai-codex", default: "synthetic-model" }, auth: { adopt_external_logins: false },
    model_overrides: { "openai-codex": { "synthetic-model": { supports_tools: true, supports_vision: true, context_window: 128000 } } } })) });
let payerCount = 0, toolCalls = 0, core, app, appStore, stage = "open", checks = 0;
const make = () => {
  const payer = createPersonalPayer({ credentials, reservePost: (uid, inputId, proof) => outbox.reservePost(uid, inputId, proof),
    spawnWorker: () => {
      const home = join(root, "synthetic-payer-" + ++payerCount); mkdirSync(home, { mode: 0o700 });
      return spawn(setup.command, setup.args, { cwd: root, env: { ...setup.env, HERMES_HOME: home,
        SCISENSE_IPC_WORKER: join(dirname(new URL(import.meta.url).pathname), "hermes-personal-payer-fixture.py") }, stdio: ["pipe", "pipe", "ignore"] });
    },
  });
  return createPersonalCoordinator({ profiles, outbox, payer,
    ownerFactory: (profile, hooks) => createPersonalProcess({ ...hooks, toolSchemas: setup.toolSchemas,
      spawnWorker: () => spawn(setup.command, setup.args, { cwd: root, env: { ...setup.env, HERMES_HOME: profile.home }, stdio: ["pipe", "pipe", "ignore"] }),
    }),
    prepare: async ({ uid }) => ({ apiText: "fresh-snapshot. Покажи синтетичний день через read_confirmed_day.", tools: async name => {
      assert.equal(uid, "owner"); assert.equal(name, "read_confirmed_day"); toolCalls++;
      return { targetDate: "2026-10-25", totals: { cal: 123, p: 10, f: 3, c: 14 } };
    } }),
  });
};
try {
  core = make(); const inputId = randomUUID(), payload = { text: "Покажи синтетичний підсумок." };
  stage = "native-submit";
  const first = await core.submit("owner", inputId, payload);
  assert.equal(first.state, "completed"); assert.equal(first.result.final_response, "Спільний native діалог збережений."); checks++;
  assert.equal(toolCalls, 1); assert.deepEqual(outbox.budget(), { turns: 1, posts: 2 }); checks++;
  stage = "canonical-context";
  assert.equal((await core.context("owner")).text, ""); checks++;
  const source = "SYNTHETIC-PERSONAL-CONTEXT ".repeat(4000), contextRoot = join(homes[0], "personal-context");
  writeFileSync(join(contextRoot, "sources/context.md"), source, { mode: 0o600 });
  writeFileSync(join(contextRoot, "sources.json"), JSON.stringify({ version: 1, profileHome: homes[0], files: [{ name: "context.md", sha256: createHash("sha256").update(source).digest("hex") }] }), { mode: 0o600 });
  const ownContext = await core.context("owner"); assert.ok(ownContext.text === source); checks++;
  assert.equal((await core.context("wife")).text, ""); checks++;
  const memoryProposal = { proposalId: randomUUID(), baseRevision: ownContext.revision, text: "Підтверджений синтетичний запис." };
  const memory = await core.commitContext("owner", memoryProposal);
  assert.equal(memory.applied[memoryProposal.proposalId], createHash("sha256").update(stableJSON(memoryProposal)).digest("hex")); checks++;
  assert.equal((await core.commitContext("owner", memoryProposal)).replayed, true); assert.deepEqual(outbox.budget(), { turns: 1, posts: 2 }); checks++;
  stage = "native-history";
  const web = await core.history("owner"), desktop = await core.history("owner", "desktop:first");
  assert.equal(web.session_id, desktop.session_id); assert.deepEqual(web.messages, desktop.messages); checks++;
  assert.deepEqual((await core.history("wife", "desktop:wife")).messages, []); checks++;
  assert.equal((await core.submit("owner", inputId, payload)).state, "completed"); assert.deepEqual(outbox.budget(), { turns: 1, posts: 2 }); checks++;
  stage = "physical-close";
  await core.close();
  core = make(); stage = "physical-reopen";
  const reopened = await core.history("owner", "desktop:second");
  assert.equal(reopened.session_id, web.session_id); assert.deepEqual(reopened.messages, web.messages); checks++;
  const reopenedContext = await core.context("owner");
  assert.ok(reopenedContext.text === memory.text); assert.equal(reopenedContext.revision, memory.revision); checks++;
  const recovered = await core.status("owner", inputId);
  assert.equal(recovered.state, "completed"); assert.equal(recovered.nativeReceipt.admission_id, first.nativeReceipt.admission_id); checks++;
  assert.equal(recovered.resultRevision, first.resultRevision); assert.deepEqual(outbox.budget(), { turns: 1, posts: 2 }); checks++;
  stage = "second-native-turn";
  assert.equal((await core.submit("owner", randomUUID(), { text: "Другий синтетичний підсумок." }, { channel: "desktop:second" })).state, "completed");
  assert.equal(toolCalls, 2); assert.deepEqual(outbox.budget(), { turns: 2, posts: 4 }); checks++;
  stage = "web-gateway";
  appStore = openTurnStore(join(root, "joint-app.sqlite"), { hmacKey: key, runDeadlineMs: PERSONAL_LIMITS.deadlineMs });
  const reader = { readDay: async (_uid, targetDate) => ({ targetDate, revision: 1, meals: {}, notes: [] }), readPlan: async () => ({ planContext: {} }) };
  const kit = createTrainerTools({ store: appStore, index: {}, ...reader });
  const backend = createPersonalBackend({ uid: "owner", core, releaseTools: kit.release, verify: async () => {},
    tools: { ...kit.tools, read_confirmed_day: async (...args) => { toolCalls++; return kit.tools.read_confirmed_day(...args); } } });
  const mediaRoot = join(root, "app-media"); mkdirSync(mediaRoot, { mode: 0o700 });
  const media = createMediaStore(mediaRoot, { hash: appStore.hash });
  app = createTrainerGateway({ ownerUid: "owner", store: appStore, backend, ...reader,
    readContext: (uid, signal) => core.context(uid, { signal }), runDeadlineMs: PERSONAL_LIMITS.deadlineMs, queueWindowMs: 225000,
    snapshotFactory: value => buildSnapshot({ ...value, history: [], maxPayloadBytes: 512000 }),
    media, proxy: { cancel() {}, close() {} },
  });
  // Valid, high-entropy PNGs near the 5MiB contract, not tiny placeholders.
  const png = () => {
    const width = 1280, row = width * 3 + 1, pixels = randomBytes(row * width);
    for (let y = 0; y < width; y++) pixels[y * row] = 0;
    const chunk = (name, data) => { const type = Buffer.from(name), packet = Buffer.alloc(data.length + 12); packet.writeUInt32BE(data.length); type.copy(packet, 4); data.copy(packet, 8); packet.writeUInt32BE(crc32(Buffer.concat([type, data])), data.length + 8); return packet; };
    const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(width, 4); header[8] = 8; header[9] = 2;
    return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels, { level: 0 })), chunk("IEND", Buffer.alloc(0))]).toString("base64");
  };
  const request = { turnId: randomUUID(), baseRevision: 0, text: "Покажи день із сайта.", dateContext: { mode: "default" }, images: [{ type: "image/png", data: png() }, { type: "image/png", data: png() }] };
  assert.equal((await app.handle("owner", "/turns", "POST", request)).status, 202);
  let projected;
  for (let n = 0; n < 200; n++) { projected = appStore.get("owner", request.turnId); if (!["running", "queued"].includes(projected.state)) break; await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.equal(projected.state, "completed"); checks++;
  const state = await (await app.handle("owner", "/state", "GET")).json();
  assert.equal(state.messages.at(-2).turnId, request.turnId); assert.equal(state.messages.at(-1).turnId, request.turnId); checks++;
  assert.equal(state.canonicalHistory, true); assert.ok(state.messages.at(-2).content === request.text, "clean user text must exclude API-only context"); assert.equal(state.latestTurn.nativeInputClaimed, true); assert.equal(state.messages.at(-2).photos.length, 2); checks++;
  assert.ok(state.messages.every(message => !message.content.includes("SCISENSE-INPUT-V1") && !message.content.includes("SYNTHETIC-CONTEXT"))); checks++;
  assert.deepEqual(outbox.budget(), { turns: 3, posts: 6 }); assert.equal(toolCalls, 3); checks++;
  const physical = readFileSync(join(root, "synthetic-physical-posts.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.ok(physical.some(row => row.imageSeen === true)); checks++;
  assert.deepEqual((await import("node:fs")).readdirSync(join(homes[0], "cache/images")), []); checks++;
  const keptRoot = join(homes[0], "cache/documents/native-inputs");
  const kept = (await import("node:fs")).readdirSync(keptRoot, { recursive: true }).filter(name => name.endsWith(".png"));
  assert.equal(kept.length, 2); for (const name of kept) assert.ok(readFileSync(join(keptRoot, name)).length > 4 * 1024 * 1024); checks++;
  const beforePhotoRestart = await core.history("owner");
  await app.close(); app = null; appStore.close(); appStore = null; await core.close(); core = make();
  const afterPhotoRestart = await core.history("owner", "desktop:photo-reopen");
  assert.deepEqual(afterPhotoRestart.messages, beforePhotoRestart.messages); checks++;
  assert.deepEqual(outbox.budget(), { turns: 3, posts: 6 }); checks++;
  const third = { type: "image/png", data: png() };
  const replayed = await core.submit("owner", randomUUID(), { text: "Ще одне синтетичне фото після restart." }, { channel: "desktop:photo-reopen", prepare: async ({ stageAttachments }) => ({
    apiText: "fresh-snapshot. Перевір фото через read_confirmed_day.", attachments: await stageAttachments([third]),
    tools: async () => { toolCalls++; return { targetDate: "2026-10-26", totals: { cal: 123, p: 10, f: 3, c: 14 } }; },
  }) });
  assert.equal(replayed.state, "completed"); checks++;
  const replayPosts = readFileSync(join(root, "synthetic-physical-posts.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.ok(replayPosts.some(row => row.imageCount >= 3 && row.bodyBytes > 16 * 1024 * 1024)); checks++;
  assert.deepEqual(outbox.budget(), { turns: 4, posts: 8 }); checks++;
  console.log(JSON.stringify({ passed: true, checks, nativeCodexProducer: true, nativeTools: toolCalls, canonicalHistoryBothChannels: true, realAppGateway: true, canonicalContextBothChannels: true, confirmedMemoryAfterPhysicalRestart: true, cleanDisplayTextWithoutApiContext: true, photoReachedNativeCodex: true, ephemeralPhotoCleared: true, exactPhotoTranscriptAfterRestart: true, nearLimitThreePhotoReplay: true,
    isolatedSecondProfile: true, exactMessagesAfterPhysicalRestart: true, sameReceiptBirthEpochAfterRestart: true, physicalPostReservations: outbox.budget().posts, realModelRequests: 0 }));
} catch (error) {
  console.error(JSON.stringify({ syntheticStage: stage, error: error.message })); throw error;
} finally { await app?.close(); appStore?.close(); await core?.close(); outbox.close(); credentials.close(); key.fill(0); }
