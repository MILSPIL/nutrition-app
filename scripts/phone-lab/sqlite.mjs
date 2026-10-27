import { DatabaseSync } from "node:sqlite";
import { writeFileSync } from "node:fs";
import { PilotBudget } from "../../workers/meal-parser/src/budget.js";
// Metadata перевіряється після open: порожній/відсутній/пошкоджений файл не є новим бюджетом.
export function localBudget(file, cap, { initialize = false, groqFree = false } = {}) {
  if (!Number.isSafeInteger(cap) || cap <= 0) throw Error("budget_disabled");
  if (initialize) writeFileSync(file, "", { flag: "wx", mode: 0o600 });
  const db = new DatabaseSync(file);
  try {
    db.exec("PRAGMA synchronous=FULL");
    if (!initialize) {
      const meta = db
        .prepare("SELECT cap,version FROM lab_budget_metadata")
        .get();
      if (
        meta?.version !== 1 ||
        meta.cap !== cap ||
        db.prepare("PRAGMA quick_check").get().quick_check !== "ok"
      )
        throw Error("budget_invalid");
      db.prepare(
        "SELECT id,uid,started,finished,cost FROM calls LIMIT 1",
      ).all();
    }
    const storage = {
      sql: {
        exec(sql, ...args) {
          const stmt = db.prepare(sql),
            rows = stmt.columns().length
              ? stmt.all(...args)
              : (stmt.run(...args), []);
          return { toArray: () => rows, one: () => rows[0] };
        },
      },
      transactionSync(fn) {
        db.exec("BEGIN IMMEDIATE");
        try {
          const result = fn();
          db.exec("COMMIT");
          return result;
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      },
    };
    const budget = new PilotBudget(
      { storage },
      { PILOT_BUDGET_MICROS: String(cap), GROQ_FREE_LIMITS: String(groqFree) },
    );
    if (initialize) {
      db.exec(
        "CREATE TABLE lab_budget_metadata (version INTEGER NOT NULL,cap INTEGER NOT NULL)",
      );
      db.prepare("INSERT INTO lab_budget_metadata VALUES(1,?)").run(cap);
    }
    return {
      binding: { idFromName: (name) => name, get: () => budget },
      close: () => db.close(),
      spent: () =>
        storage.sql
          .exec("SELECT COALESCE(SUM(cost),0) AS total FROM calls")
          .one().total,
    };
  } catch {
    db.close();
    throw Error("budget_invalid");
  }
}
