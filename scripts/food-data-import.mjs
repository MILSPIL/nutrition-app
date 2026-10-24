#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { normalizeFood, NUTRIENTS } from "../server/trainer/food-data.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export async function importFoodData({
  archives,
  output,
  manifest = JSON.parse(
    fs.readFileSync(path.join(root, "server/trainer/food-data-manifest.json")),
  ),
}) {
  if (fs.existsSync(output) || fs.existsSync(output + ".tmp"))
    throw Error("output_exists");
  const stats = {
    version: manifest.version,
    sources: [],
    nutrientMapping: NUTRIENTS,
    license: manifest.license,
    count: 0,
    partial: 0,
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  let db;
  try {
    db = new DatabaseSync(output + ".tmp");
    db.exec(
      'PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE foods(id TEXT PRIMARY KEY,name TEXT NOT NULL,preparation TEXT NOT NULL,data TEXT NOT NULL); CREATE VIRTUAL TABLE food_search USING fts5(id UNINDEXED,name,tokenize="unicode61");',
    );
    const insert = db.prepare("INSERT INTO foods VALUES(?,?,?,?)"),
      index = db.prepare("INSERT INTO food_search VALUES(?,?)");
    db.exec("BEGIN");
    for (const source of manifest.sources) {
      const archive = path.join(archives, source.file);
      const hash = createHash("sha256");
      for await (const bytes of fs.createReadStream(archive))
        hash.update(bytes);
      if (hash.digest("hex") !== source.sha256) throw Error("archive_checksum");
      const read = spawnSync(
        "python3",
        [
          "-c",
          "import sys,zipfile;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))",
          archive,
          source.member,
        ],
        { maxBuffer: 300 * 1024 * 1024 },
      );
      if (read.status !== 0) throw Error("archive_member");
      const rows = JSON.parse(read.stdout)[source.rootKey];
      if (!Array.isArray(rows) || rows.length !== source.count)
        throw Error("source_count");
      let partial = 0,
        nullRows = 0;
      for (const row of rows) {
        if (row === null) {
          nullRows++;
          continue;
        }
        const food = normalizeFood(row, source);
        insert.run(food.id, food.name, food.preparation, JSON.stringify(food));
        index.run(food.id, food.name);
        if (Object.values(food.nutrients).some((x) => x == null)) partial++;
      }
      if (nullRows !== source.nullRows) throw Error("source_null_count");
      stats.sources.push({
        id: source.id,
        count: rows.length - nullRows,
        nullRows,
        partial,
        sha256: source.sha256,
      });
      stats.count += rows.length - nullRows;
      stats.partial += partial;
    }
    db.prepare("INSERT INTO metadata VALUES(?,?)").run(
      "manifest",
      JSON.stringify(stats),
    );
    db.exec(
      "COMMIT; INSERT INTO food_search(food_search) VALUES('optimize'); VACUUM;",
    );
    if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok")
      throw Error("index_integrity");
    db.close();
    db = null;
    fs.renameSync(output + ".tmp", output);
    fs.chmodSync(output, 0o444);
    const sha256 = createHash("sha256")
      .update(fs.readFileSync(output))
      .digest("hex");
    return { ...stats, sha256, bytes: fs.statSync(output).size };
  } catch (error) {
    db?.close();
    fs.rmSync(output + ".tmp", { force: true });
    throw error;
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [archives, output] = process.argv.slice(2);
  if (!archives || !output)
    throw Error(
      "usage: node scripts/food-data-import.mjs ARCHIVE_DIRECTORY OUTPUT_SQLITE",
    );
  console.log(
    JSON.stringify(await importFoodData({ archives, output }), null, 2),
  );
}
