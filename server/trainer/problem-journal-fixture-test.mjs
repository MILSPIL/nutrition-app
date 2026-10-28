// COACH-PROBLEMS-01: спільна тестова фабрика для K2, K3, K5. Файл *-test.mjs не
// входить у пакет і в джерела KNOWN_CODES.
import { randomBytes } from "node:crypto";
import { mkdtempSync, realpathSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { openTurnStore } from "./turn-store.mjs";
import { createTrainerGateway } from "./gateway.mjs";
import { createPersonalBackend } from "./personal-backend.mjs";
import { personalQueue } from "./personal-queue.mjs";
import { buildSnapshot } from "./snapshot.mjs";
import { openProblemJournal, turnProblemRecorder } from "./problem-journal.mjs";

export const RELEASE = "b".repeat(40), START = Date.parse("2026-10-24T10:00:00Z");
export const ids = n => Array.from({ length: n }, (_, i) => "00000000-0000-4000-8000-" + String(i + 1).padStart(12, "0"));
export const throwing = { record() { throw Error("synthetic_journal_fault"); } };

// Тестова фабрика як у personal-gateway.test.mjs; `script` грає роль Native.
export function fixture(t, { script, journal: provided, maxWaiting = 4, tools = {}, nativeStatus = { state: "completed" }, uid = "owner" } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "problem-sources-"))); chmodSync(dir, 0o700);
  let clock = START;
  const journal = provided === undefined ? openProblemJournal(join(dir, "problems.sqlite"), { release: RELEASE, now: () => clock }) : provided;
  const onTransition = journal === throwing ? () => throwing.record() : turnProblemRecorder(journal);
  const storeFile = join(dir, "turns.sqlite"), hmacKey = randomBytes(32);
  const store = openTurnStore(storeFile, { hmacKey, now: () => clock, onTransition });
  const queue = personalQueue({ maxWaiting }), inputs = new Map(), sessionId = "11111111-1111-4111-8111-111111111111";
  let admitted = 0;
  const core = { enqueue(_uid, id, body) { inputs.set(id, { body, admitted: false }); },
    schedule(uid, id, callback, { signal }) { return queue.run(uid, async signal => callback({ signal, deadline: clock + 45000,
      execute: async value => {
        try {
        const native = { admission_id: "22222222-2222-4222-8222-" + String(++admitted).padStart(12, "0"), ref: { session_id: sessionId } };
        const prepared = await value.prepare({ signal, sessionId });
        const admit = async () => { inputs.get(id).admitted = true; await prepared.onAdmission(native); };
        const call = (name, args) => prepared.tools(name, args, { signal, nativeBinding: { admissionId: native.admission_id, sessionId } });
        return await script({ admit, call, signal, verify: () => prepared.verify() });
        } finally { inputs.get(id).finished = true; }
      } }), { signal }); },
    async history() { return { session_id: sessionId, messages: [] }; },
    input(_uid, id) { const value = inputs.get(id); return { state: value?.finished && value.admitted ? "completed" : value?.admitted ? "admitted" : "queued", generation: value?.admitted ? 1 : null }; },
    async status() { return nativeStatus; },
    async cancelInput() { return { stopped: true }; },
  };
  const backend = createPersonalBackend({ uid, core, tools, problems: journal, stageAttachments: async () => [] });
  const g = createTrainerGateway({ ownerUid: uid, store, backend, now: () => clock, queueWindowMs: 225000, problems: journal,
    snapshotFactory: value => buildSnapshot({ ...value, history: [], maxPayloadBytes: 512000 }),
    media: { describe: () => [], stage() {}, load: () => [], remove() {}, sweep: () => ({ faults: 0 }) }, proxy: { cancel() {}, close() {} },
    readContext: async () => ({ text: "synthetic", revision: 1 }), readDay: async (_uid, targetDate) => ({ targetDate, revision: 0, meals: {}, notes: [] }), readPlan: async () => ({ planContext: {} }),
  });
  let closed = false;
  const close = async () => { if (closed) return; closed = true; await g.close(); await queue.close(); store.close(); };
  t.after(async () => { await close(); journal?.close?.(); rmSync(dir, { recursive: true, force: true }); });
  const post = (id, text = "Синтетичне повідомлення") => g.handle(uid, "/turns", "POST", { turnId: id, baseRevision: store.conversation(uid).revision, text, dateContext: { mode: "default" } });
  return { g, store, post, uid, queue, journal, dir, storeFile, hmacKey, close, tick(ms) { clock += ms; },
    rows: () => journal.rows("2000-01-01").map(r => [r.category, r.code, r.tool, r.count]),
    async settle(id) { for (let n = 0; n < 200; n++) { const row = store.get(uid, id); if (!["running", "queued"].includes(row.state)) return row; await sleep(2); } throw Error("fixture_timeout"); } };
}
export const answer = text => ({ state: "completed", result: { final_response: text } });
export const turnRows = rows => rows.filter(([category]) => category.startsWith("turn_") && category !== "turn_cause");
