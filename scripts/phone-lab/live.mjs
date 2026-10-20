import { readFile } from "node:fs/promises";
import path from "node:path";
import { LOCAL_TRANSCRIBE_MODEL } from "../../workers/meal-parser/src/index.js";
import { callProvider } from "../../workers/meal-parser/src/providers.js";
import { localBudget } from "./sqlite.mjs";
import { createWhisper, verifyWhisper } from "./whisper.mjs";
import { keychain } from "./keychain.mjs";
const CAP = 5000000;
const readJson = async file => JSON.parse(await readFile(file, "utf8"));
export function approvedSettings(proposal) {
  const b = proposal?.candidateB;
  if (proposal?.status !== "approved_local_pilot" || proposal.selectedCandidate !== "B" ||
      !proposal.approvedAt || !proposal.accountVerification?.creditAvailabilityConfirmedByOwner ||
      b?.PRICING_APPROVED_AT !== proposal.approvedAt || b?.PILOT_BUDGET_MICROS !== CAP ||
      b?.TRANSCRIBE_MODEL !== LOCAL_TRANSCRIBE_MODEL || b?.PARSE_MODEL !== "claude-sonnet-5-5" ||
      b?.PRICING_MODEL_PAIR !== `${LOCAL_TRANSCRIBE_MODEL}|claude-sonnet-5-5` ||
      b?.INPUT_MICROS_PER_MTOK !== 2000000 || b?.OUTPUT_MICROS_PER_MTOK !== 10000000)
    throw Error("pilot_not_approved");
  return { LIVE_ENABLED: "true", TRANSCRIBE_MODEL: b.TRANSCRIBE_MODEL, PARSE_MODEL: b.PARSE_MODEL,
    PRICING_MODEL_PAIR: b.PRICING_MODEL_PAIR, PRICING_APPROVED_AT: b.PRICING_APPROVED_AT,
    INPUT_MICROS_PER_MTOK: b.INPUT_MICROS_PER_MTOK, OUTPUT_MICROS_PER_MTOK: b.OUTPUT_MICROS_PER_MTOK };
}
export async function liveRuntime(root, { initialize = false } = {}) {
  const dir = path.join(root, "tmp/phone-lab"), file = path.join(dir, "pilot-budget.sqlite");
  const proposal = await readJson(path.join(root, "workers/meal-parser/pilot-proposal.json"));
  const settings = approvedSettings(proposal);
  const runtime = await readJson(path.join(dir, "whisper-runtime.json"));
  await verifyWhisper(runtime);
  const marker = JSON.stringify({ proposal: proposal.proposalId, cap: CAP, file });
  const previous = await keychain("scisense-phone-lab", "pilot-2026-10-20");
  // Втрата runtime/SQLite не може стати новими $5: окремий маркер живе в Keychain.
  if ((initialize && previous) || (!initialize && previous !== marker)) throw Error("pilot_budget_locked");
  const secret = await keychain("scisense-anthropic", "api-key");
  if (!secret.startsWith("sk-ant-") || /\s/.test(secret)) throw Error("keychain_unavailable");
  const budget = localBudget(file, CAP, { initialize });
  const whisper = createWhisper(runtime);
  let closed = false;
  try {
    if (initialize) await keychain("scisense-phone-lab", "pilot-2026-10-20", marker);
    return {
      apiEnv: { ...settings, ANTHROPIC_API_KEY: secret, PILOT_BUDGET: budget.binding },
      localTranscription: true,
      provider: (kind, payload, env, context) => kind === "transcribe" ? whisper.transcribe(payload, context) : callProvider(kind, payload, env),
      spent: budget.spent,
      async close() { if (closed) return; closed = true; await whisper.close(); budget.close(); },
    };
  } catch (error) { await whisper.close(); budget.close(); throw error; }
}
