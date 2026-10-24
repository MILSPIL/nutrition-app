import fs from "node:fs";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { PREPARATIONS } from "./food-data.mjs";
import { fail } from "./limits.mjs";
export function openFoodIndex(file, expectedHash) {
  if (
    !/^[a-f0-9]{64}$/.test(expectedHash || "") ||
    createHash("sha256").update(fs.readFileSync(file)).digest("hex") !==
      expectedHash
  )
    fail("food_index_checksum", 503);
  const db = new DatabaseSync(file, { readOnly: true });
  db.exec("PRAGMA query_only=ON");
  const manifest = JSON.parse(
    db.prepare("SELECT value FROM metadata WHERE key='manifest'").get().value,
  );
  const search = db.prepare(
    "SELECT f.data FROM food_search s JOIN foods f ON f.id=s.id WHERE food_search MATCH ? AND (? = 'unknown' OR f.preparation=?) ORDER BY CASE WHEN lower(f.name) LIKE ? THEN 0 ELSE 1 END,bm25(food_search),f.id LIMIT 5",
  );
  return {
    manifest,
    lookup({ query, preparation = "unknown" }) {
      if (
        typeof query !== "string" ||
        query.length > 160 ||
        !PREPARATIONS.includes(preparation)
      )
        fail("invalid_food_query");
      const words =
        query
          .normalize("NFKC")
          .toLowerCase()
          .match(/[\p{L}\p{N}]+/gu) || [];
      if (!words.length || words.length > 12) fail("invalid_food_query");
      // FTS operators/quotes from the model are never evaluated as syntax.
      const phrase = words.map((w) => `"${w}"*`).join(" AND ");
      return search
        .all(phrase, preparation, preparation, words[0] + "%")
        .map((r) => JSON.parse(r.data));
    },
    close() {
      db.close();
    },
  };
}
