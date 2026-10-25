// Actual native owner + native Codex SDK producer + durable encrypted parent.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { createPersonalProcess } from "../server/trainer/personal-process.mjs";
import { createPersonalPayer } from "../server/trainer/personal-payer.mjs";
import { createPersonalCoordinator } from "../server/trainer/personal-coordinator.mjs";
import { openPersonalCredentials } from "../server/trainer/personal-credentials.mjs";
import { openPersonalStore } from "../server/trainer/personal-store.mjs";
import { personalProfiles } from "../server/trainer/personal-profiles.mjs";
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
let payerCount = 0, toolCalls = 0, core, stage = "open", checks = 0;
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
  const recovered = await core.status("owner", inputId);
  assert.equal(recovered.state, "completed"); assert.equal(recovered.nativeReceipt.admission_id, first.nativeReceipt.admission_id); checks++;
  assert.equal(recovered.resultRevision, first.resultRevision); assert.deepEqual(outbox.budget(), { turns: 1, posts: 2 }); checks++;
  stage = "second-native-turn";
  assert.equal((await core.submit("owner", randomUUID(), { text: "Другий синтетичний підсумок." }, { channel: "desktop:second" })).state, "completed");
  assert.equal(toolCalls, 2); assert.deepEqual(outbox.budget(), { turns: 2, posts: 4 }); checks++;
  console.log(JSON.stringify({ passed: true, checks, nativeCodexProducer: true, nativeTools: toolCalls, canonicalHistoryBothChannels: true,
    isolatedSecondProfile: true, exactMessagesAfterPhysicalRestart: true, sameReceiptBirthEpochAfterRestart: true, physicalPostReservations: outbox.budget().posts, realModelRequests: 0 }));
} catch (error) {
  console.error(JSON.stringify({ syntheticStage: stage, error: error.message })); throw error;
} finally { await core?.close(); outbox.close(); credentials.close(); key.fill(0); }
