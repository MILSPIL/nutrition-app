import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { localBudget } from "../../scripts/phone-lab/sqlite.mjs";
function fixture(t, policy = true) {
  const dir = mkdtempSync(join(tmpdir(), "trainer-quota-"));
  const file = join(dir, "budget.sqlite");
  const budget = localBudget(file, 5000000, {
    initialize: true,
    hermesPolicy: policy,
  });
  const db = new DatabaseSync(file);
  t.after(() => {
    db.close();
    budget.close();
    rmSync(dir, { recursive: true });
  });
  return {
    budget,
    db,
    async reserve() {
      return budget.binding
        .get()
        .fetch(
          new Request("https://budget.invalid", {
            method: "POST",
            body: JSON.stringify({
              action: "reserve",
              id: randomUUID(),
              uid: "a".repeat(64),
              cost: 1,
            }),
          }),
        );
    },
  };
}
for (const [window, limit, age] of [
  ["minute", 12, 1000],
  ["hour", 80, 120000],
  ["day", 120, 7200000],
])
  test(
    "Hermes shared " + window + " boundary " + limit + "/" + (limit + 1),
    async (t) => {
      const original = Date.now,
        now = Date.UTC(2026, 0, 4, 12);
      Date.now = () => now;
      t.after(() => {
        Date.now = original;
      });
      const f = fixture(t);
      const insert = f.db.prepare("INSERT INTO calls VALUES(?,?,?,?,?)");
      for (let n = 0; n < limit - 1; n++)
        insert.run(
          randomUUID(),
          (n % 2 ? "a" : "b").repeat(64),
          now - age,
          now - age + 1,
          1,
        );
      assert.equal((await f.reserve()).status, 200);
      f.db.exec("UPDATE calls SET finished=started+1");
      assert.equal((await f.reserve()).status, 429);
      assert.equal(f.db.prepare("SELECT COUNT(*) n FROM calls").get().n, limit);
    },
  );
test("rolling hour includes older ledger rows across UTC midnight", async (t) => {
  const original = Date.now,
    now = Date.UTC(2026, 0, 4, 0, 10);
  Date.now = () => now;
  t.after(() => {
    Date.now = original;
  });
  const f = fixture(t);
  const insert = f.db.prepare("INSERT INTO calls VALUES(?,?,?,?,?)");
  for (let n = 0; n < 80; n++)
    insert.run(randomUUID(), "b".repeat(64), now - 1200000, now - 1199999, 0);
  assert.equal((await f.reserve()).status, 429);
  assert.equal(f.budget.spent(), 0);
});
test("default still limits six per minute and preserves cap/schema", async (t) => {
  const f = fixture(t, false),
    now = Date.now();
  const insert = f.db.prepare("INSERT INTO calls VALUES(?,?,?,?,?)");
  for (let n = 0; n < 6; n++)
    insert.run(randomUUID(), "a".repeat(64), now - 1000, now - 999, 1);
  assert.equal((await f.reserve()).status, 429);
  assert.deepEqual(
    { ...f.db.prepare("SELECT * FROM lab_budget_metadata").get() },
    { version: 1, cap: 5000000 },
  );
});
test("Hermes policy keeps a single shared in-flight reserve and the existing money cap", async (t) => {
  const f = fixture(t);
  assert.equal((await f.reserve()).status, 200);
  assert.equal((await f.reserve()).status, 429);
  f.db.exec("UPDATE calls SET finished=started+1,cost=5000000");
  assert.equal((await f.reserve()).status, 429);
  assert.equal(f.budget.spent(), 5000000);
});
