// Actual pinned native owner; only model replies and app tools are synthetic.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createPersonalProcess } from "../server/trainer/personal-process.mjs";
const setup = JSON.parse(readFileSync(process.argv[2]));
const model = "synthetic-model", calls = [], tools = [], events = [];
function completion(payload) {
  calls.push(payload);
  assert.equal(payload.model, model);
  assert.ok(calls.length <= 2, "restart/replay must not issue another model call");
  const finished = payload.messages.some(message => message.role === "tool");
  const message = finished ? { role: "assistant", content: "Спільний синтетичний IPC діалог збережено." }
    : { role: "assistant", content: null, tool_calls: [{ id: "synthetic-ipc-tool", type: "function", function: { name: "read_confirmed_day", arguments: '{"dayRef":"today"}' } }] };
  const value = { id: "synthetic-ipc-completion", object: "chat.completion", created: 1, model,
    choices: [{ index: 0, message, finish_reason: finished ? "stop" : "tool_calls" }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
  if (!payload.stream) return { completion: value };
  const delta = structuredClone(message);
  if (delta.tool_calls) delta.tool_calls = delta.tool_calls.map((call, index) => ({ index, ...call }));
  return { chunks: [{ ...value, object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: value.choices[0].finish_reason }] }] };
}
const make = () => createPersonalProcess({
  spawnWorker: () => spawn(setup.command, setup.args, { env: setup.env, cwd: setup.cwd, stdio: ["pipe", "pipe", "ignore"] }),
  connection: { model, contextWindow: 128000, supportsTools: true, supportsVision: true }, toolSchemas: setup.toolSchemas,
  onModel: completion,
  onTool: (name, arguments_) => { tools.push({ name, arguments_ }); assert.equal(name, "read_confirmed_day"); return { targetDate: "2026-10-25", totals: { cal: 123, p: 10, f: 3, c: 14 } }; },
  onEvent: (channel, event) => events.push({ channel, event }),
});
let owner = make(), checks = 0, stage = "open";
try {
  const web = await owner.bot("web"), desktop = await owner.bot("desktop:first");
  assert.equal(web.session_id, desktop.session_id); checks++;
  const input = { session_id: web.session_id, submission_id: randomUUID(), text: "Покажи синтетичний підсумок через IPC.", api_text: "Покажи синтетичний підсумок через IPC. Use read_confirmed_day." };
  stage = "submit";
  const admission = await owner.rpc("web", "prompt.submit", input);
  stage = "receipt";
  let status;
  for (let index = 0; index < 100; index++) {
    status = await owner.rpc("web", "prompt.receipt", { session_id: web.session_id, admission_id: admission.admission_id, include_result: true });
    if (["terminal", "unknown"].includes(status.status)) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(status.status, "terminal"); assert.equal(calls.length, 2); assert.equal(tools.length, 1); checks++;
  stage = "history";
  const history = await owner.rpc("desktop:first", "session.resume", { session_id: web.session_id });
  assert.ok(history.messages.some(message => String(message.content).includes("IPC діалог збережено"))); checks++;
  await assert.rejects(owner.rpc("desktop:first", "session.resume", { session_id: web.session_id, profile: "foreign-profile" }), /profile_mismatch/); checks++;
  stage = "detach";
  await owner.bot("desktop:second"); await owner.detach("desktop:first");
  assert.equal((await owner.bot("desktop:second")).session_id, web.session_id); checks++;
  stage = "close";
  const exit = await owner.close(); assert.equal(exit.code, 0); assert.equal(owner.exited, true); checks++;
  owner = make();
  stage = "reopen";
  const reopened = await owner.bot("desktop:second");
  assert.equal(reopened.session_id, web.session_id); assert.deepEqual(reopened.messages, history.messages); assert.equal(calls.length, 2); checks++;
  stage = "replay";
  const recovered = await owner.rpc("web", "prompt.receipt", { session_id: web.session_id, admission_id: admission.admission_id, include_result: true });
  assert.equal(recovered.status, "terminal"); assert.equal(calls.length, 2); checks++;
  await owner.bot("web");
  const duplicate = await owner.rpc("web", "prompt.submit", input);
  assert.equal(duplicate.admission_id, admission.admission_id); assert.equal(calls.length, 2); checks++;
  assert.ok(events.length > 0); checks++;
  console.log(JSON.stringify({ passed: true, checks, canonicalSessionSame: true, exactMessagesAfterRestart: true, sameReceiptAfterRestart: true, syntheticModelCalls: calls.length, nativeToolCalls: tools.length, nativeEvents: events.length, realModelRequests: 0 }));
} catch (error) {
  console.error(JSON.stringify({ syntheticStage: stage, error: error.message }));
  throw error;
} finally {
  await owner.close();
}
