// COACH-PROBLEMS-01, K1 і K2: знеособлений журнал проблем тренера.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { KNOWN_CODES, openProblemJournal, kyivDay } from "./problem-journal.mjs";
import { MODEL_TOOL_ERRORS } from "./tool-errors.mjs";
import { PAYER_DIAGNOSTIC_CODES } from "./personal-payer.mjs";
import { fixture, ids, answer } from "./problem-journal-fixture-test.mjs";

const RELEASE = "a".repeat(40);
// 2026-03-10 12:00 за Києвом (UTC+2), середина доби.
const NOON = Date.parse("2026-03-10T10:00:00Z"), DAY = 86400000;
const dir = () => mkdtempSync(join(tmpdir(), "problem-journal-"));
const rows = file => {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return db.prepare("SELECT * FROM problems ORDER BY day,category,code,tool").all().map(r => ({ ...r })); }
  finally { db.close(); }
};

test("K1 лічильник агрегується за ключем, час до хвилини UTC", () => {
  const root = dir(), file = join(root, "problems.sqlite");
  let now = NOON;
  const journal = openProblemJournal(file, { release: RELEASE, now: () => now });
  journal.record("tool_error", "invalid_food_proposal", "propose_food_draft");
  now += 120000;
  journal.record("tool_error", "invalid_food_proposal", "propose_food_draft");
  journal.record("tool_error", "invalid_food_proposal", "food_lookup");
  journal.close();
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(rows(file), [
    { day: "2026-03-10", release: RELEASE, category: "tool_error", code: "invalid_food_proposal", tool: "food_lookup", count: 1, first_at: "2026-03-10T10:02Z", last_at: "2026-03-10T10:02Z" },
    { day: "2026-03-10", release: RELEASE, category: "tool_error", code: "invalid_food_proposal", tool: "propose_food_draft", count: 2, first_at: "2026-03-10T10:00Z", last_at: "2026-03-10T10:02Z" },
  ]);
  rmSync(root, { recursive: true });
});

test("K1 порожній інструмент '' агрегується, а не розсипається", () => {
  const root = dir(), file = join(root, "problems.sqlite");
  const journal = openProblemJournal(file, { release: RELEASE, now: () => NOON });
  for (let i = 0; i < 3; i++) journal.record("turn_failed", "trainer_failed");
  journal.record("turn_failed", "trainer_failed", "");
  assert.deepEqual(journal.rows("2026-03-10").map(r => [r.category, r.code, r.tool, r.count]), [["turn_failed", "trainer_failed", "", 4]]);
  journal.close();
  const db = new DatabaseSync(file, { readOnly: true });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM problems WHERE tool IS NULL").get().n, 0);
  db.close();
  rmSync(root, { recursive: true });
});

test("K1 доба за Києвом", () => {
  assert.equal(kyivDay(Date.parse("2026-03-10T21:59:00Z")), "2026-03-10");
  assert.equal(kyivDay(Date.parse("2026-03-10T22:00:00Z")), "2026-03-11");
  assert.equal(kyivDay(Date.parse("2026-07-10T20:59:00Z")), "2026-07-10");
  assert.equal(kyivDay(Date.parse("2026-07-10T21:00:00Z")), "2026-07-11");
});

test("K1 ретеншн 30 діб: при відкритті і раз на добу тим самим процесом", () => {
  const root = dir(), file = join(root, "problems.sqlite");
  let now = NOON - 31 * DAY;
  let journal = openProblemJournal(file, { release: RELEASE, now: () => now });
  journal.record("turn_failed", "trainer_failed");
  now = NOON - 30 * DAY;
  journal.record("turn_failed", "trainer_timeout");
  journal.close();
  now = NOON;
  journal = openProblemJournal(file, { release: RELEASE, now: () => now });
  journal.close();
  assert.deepEqual(rows(file).map(r => [r.day, r.code]), [["2026-02-08", "trainer_timeout"]]);
  // Той самий процес: доба змінилась, наступний запис чистить старе.
  journal = openProblemJournal(file, { release: RELEASE, now: () => now });
  now = NOON + DAY;
  journal.record("turn_failed", "trainer_quota");
  journal.close();
  assert.deepEqual(rows(file).map(r => [r.day, r.code]), [["2026-03-11", "trainer_quota"]]);
  rmSync(root, { recursive: true });
});

test("K1 межа 5000 рядків і один рядок overflow на добу й реліз", () => {
  const root = dir(), file = join(root, "problems.sqlite");
  let now = NOON - 20 * DAY;
  const journal = openProblemJournal(file, { release: RELEASE, now: () => now });
  const tools = ["food_lookup", "read_confirmed_day", "read_plan", "read_trainer_context", "propose_food_draft", "propose_context_update", ""];
  let n = 0;
  outer: for (let d = 0; d < 20; d++) {
    now = NOON - (20 - d) * DAY;
    for (const code of KNOWN_CODES) for (const tool of tools) {
      journal.record("tool_error", code, tool);
      if (++n === 5000) break outer;
    }
  }
  assert.equal(journal.status().writeErrors, 0);
  journal.record("turn_failed", "trainer_failed");
  journal.record("turn_unknown", "execution_unknown");
  // Наявний ключ і далі рахується.
  journal.record("tool_error", KNOWN_CODES[0], "food_lookup");
  const stamp = kyivDay(now);
  journal.close();
  const all = rows(file);
  assert.equal(all.filter(r => r.category !== "overflow").length, 5000);
  const overflow = all.filter(r => r.category === "overflow");
  assert.deepEqual(overflow.map(r => [r.day, r.release, r.code, r.tool, r.count]), [[stamp, RELEASE, "other", "", 2]]);
  assert.equal(all.some(r => r.category === "turn_failed"), false);
  const first = all.find(r => r.category === "tool_error" && r.code === KNOWN_CODES[0] && r.tool === "food_lookup" && r.day === kyivDay(NOON - 20 * DAY));
  assert.equal(first.count, 1);
  // Наступна доба: новий рядок overflow, не той самий.
  const again = openProblemJournal(file, { release: RELEASE, now: () => now + DAY });
  again.record("turn_failed", "trainer_failed");
  again.close();
  assert.equal(rows(file).filter(r => r.category === "overflow").length, 2);
  rmSync(root, { recursive: true });
});

test("K1 код поза KNOWN_CODES → other, інструмент поза TOOLS → other", () => {
  const root = dir(), file = join(root, "problems.sqlite");
  const journal = openProblemJournal(file, { release: RELEASE, now: () => NOON });
  journal.record("tool_error", "something_new_and_unlisted", "some_tool");
  journal.record("tool_error", "Trainer Failed", "propose_food_draft");
  journal.record("turn_failed", "trainer_failed", "food_lookup ");
  journal.close();
  assert.deepEqual(rows(file).map(r => [r.category, r.code, r.tool]), [
    ["tool_error", "other", "other"],
    ["tool_error", "other", "propose_food_draft"],
    ["turn_failed", "trainer_failed", "other"],
  ]);
  rmSync(root, { recursive: true });
});

// Джерела (1)-(5) S1. Тест збирає коди сам, а не з модуля.
const walk = d => readdirSync(d).flatMap(n => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? (p === join("server", "linux") ? [] : walk(p)) : [p];
});
function sourceCodes() {
  const codes = new Set();
  const files = walk("server").filter(f => f.endsWith(".mjs") && !f.endsWith(".test.mjs") && !f.endsWith("-test.mjs"));
  assert.ok(files.length > 50);
  for (const f of files) {
    const s = readFileSync(f, "utf8");
    for (const m of s.matchAll(/(?<![\w$])(?:fail|Error|refusal|executionAbort|safeError)\(\s*(['"])((?:(?!\1)[^\\\n])*)\1/g)) codes.add(m[2]);
    for (const m of s.matchAll(/\.fail\(\s*[^,()]+,\s*(['"])((?:(?!\1)[^\\\n])*)\1/g)) codes.add(m[2]);
  }
  const recovery = readFileSync("server/trainer/turn-store.mjs", "utf8");
  for (const code of ["execution_unknown", "media_reattach_required", "interrupted_before_start"]) {
    assert.ok(recovery.includes(code), code);
    codes.add(code);
  }
  const python = (file, name) => {
    const s = readFileSync(file, "utf8"), at = s.search(new RegExp("^" + name + "\\s*=", "m"));
    assert.ok(at >= 0, file + " " + name);
    const body = s.slice(at, s.indexOf("}", at) + 1), found = [...body.matchAll(/"([a-z_]+)"/g)].map(m => m[1]);
    assert.ok(found.length > 5, file + " " + name);
    return found;
  };
  for (const code of python("server/trainer/hermes_personal_worker.py", "_ALLOWED_ERRORS")) codes.add(code);
  for (const code of python("server/trainer/hermes_personal_provider.py", "_ERRORS")) codes.add(code);
  for (const code of python("server/trainer/hermes_personal_ipc.py", "TOOL_ERRORS")) codes.add(code);
  for (const code of MODEL_TOOL_ERRORS) codes.add(code);
  for (const code of PAYER_DIAGNOSTIC_CODES) codes.add(code);
  return codes;
}

test("K1 повнота KNOWN_CODES: кожен код із джерел (1)-(5) S1 є у переліку", () => {
  const known = new Set(KNOWN_CODES), codes = sourceCodes();
  assert.ok(codes.size > 150, String(codes.size));
  assert.deepEqual([...codes].filter(code => !known.has(code)).sort(), []);
  for (const code of ["user_cancel", "expired", "native_cancelled", "shutdown", "no_matching_source", "recipe_estimate", "unknown", "estimate", "item", "other"])
    assert.ok(known.has(code), code);
  for (const code of ["interrupted_before_start", "media_reattach_required", "trainer_queue_full", "trainer_cancelled"])
    assert.ok(known.has(code), code);
  for (const code of KNOWN_CODES) assert.match(code, /^[a-z_]{1,60}$/);
  assert.ok(Object.isFrozen(KNOWN_CODES));
});

// K2. Маркери з малих літер, щоб збіг за байтами був чесним.
const PRIVATE_MARKERS = ["private_marker_vivsianka", "uid_private_marker", "vivsianka_200_g"];
function assertNoMarkers(root) {
  const files = readdirSync(root).filter(name => name.startsWith("problems.sqlite"));
  assert.ok(files.includes("problems.sqlite"));
  for (const name of files) {
    const bytes = readFileSync(join(root, name));
    for (const marker of PRIVATE_MARKERS) assert.equal(bytes.includes(marker), false, name + " містить " + marker);
  }
}

test("K2 приватність: маркери не потрапляють у байти problems.sqlite*", () => {
  const root = dir(), file = join(root, "problems.sqlite");
  const journal = openProblemJournal(file, { release: RELEASE, now: () => NOON });
  for (const marker of PRIVATE_MARKERS) {
    journal.record("turn_failed", marker);
    journal.record("turn_cause", marker);
    journal.record("tool_error", marker, marker);
    journal.record("turn_cancelled", marker);
    journal.record("food_estimate", marker, "propose_food_draft");
  }
  // Файли перевіряються і до закриття (WAL), і після.
  assertNoMarkers(root);
  journal.close();
  assertNoMarkers(root);
  rmSync(root, { recursive: true });
});

test("K2 приватність справжнім шляхом: error.message у fail(), turn_cause, tool_error, estimateReason, причина cancel(), uid, назва позиції", async t => {
  const [a, b] = ids(2);
  let step = 0;
  const f = fixture(t, { uid: "uid_private_marker", nativeStatus: { state: "failed" },
    tools: { propose_food_draft: async () => ({ state: "ready", saved: false, incomplete: true }), read_plan: async () => { throw Error("private_marker_vivsianka"); } },
    script: async ({ admit, call }) => {
      await admit();
      if (step++ === 0) {
        await call("propose_food_draft", { baseRevision: 0, dayRef: "today", meal: 1, items: [{ itemId: "33333333-3333-4333-8333-333333333333", name: "vivsianka_200_g",
          quantity: { value: 200, unit: "g" }, preparation: "cooked", source: { kind: "estimate", estimateReason: "private_marker_vivsianka", assumptions: ["vivsianka_200_g"] } }] });
        await call("read_plan", {}).catch(() => {});
        return answer("vivsianka_200_g private_marker_vivsianka");
      }
      throw Error("private_marker_vivsianka");
    } });
  await f.post(a, "vivsianka_200_g uid_private_marker"); assert.equal((await f.settle(a)).state, "completed");
  await f.post(b, "private_marker_vivsianka"); assert.equal((await f.settle(b)).state, "unknown");
  f.store.fail(b, "private_marker_vivsianka");
  f.store.cancel("uid_private_marker", b, "private_marker_vivsianka");
  const categories = new Set(f.rows().map(([category]) => category));
  for (const category of ["food_estimate", "food_total", "tool_error", "turn_cause", "turn_unknown", "turn_failed"]) assert.ok(categories.has(category), category);
  assertNoMarkers(f.dir);
  f.journal.close();
  assertNoMarkers(f.dir);
});
