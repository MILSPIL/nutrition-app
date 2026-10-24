import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("../", import.meta.url)),
  old = path.join(cwd, "tmp/hermes-old-writer");
fs.mkdirSync(old, { recursive: true });
const frozen = JSON.parse(
    fs.readFileSync(
      path.join(cwd, "scripts/fixtures/hermes-previous-writer.json"),
    ),
  ),
  names = ["mealItems", "mealCommands", "mealStore", "writerFence"];
for (const name of names) {
  let source = frozen.files[`src/services/${name}.js`];
  source = source.replace(/from '([^']+)'/g, (all, spec) =>
    spec.startsWith(".")
      ? `from '${spec.startsWith("./") && names.includes(spec.slice(2)) ? path.join(old, spec.slice(2) + ".js") : path.resolve(cwd, "src/services", spec) + ".js"}'`
      : all,
  );
  fs.writeFileSync(path.join(old, name + ".js"), source);
}
function run(bin, args) {
  const r = spawnSync(bin, args, { cwd, stdio: "inherit" });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status || 1);
}
run(path.join(cwd, "workers/meal-parser/node_modules/.bin/esbuild"), [
  "scripts/hermes-store-emulator.mjs",
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--packages=external",
  '--define:process.env.REACT_APP_LOCAL_LAB="1"',
  "--outfile=tmp/hermes-store-emulator.mjs",
]);
run(process.env.FIREBASE_CLI || "firebase", [
  "emulators:exec",
  "--config",
  "firebase.lab.json",
  "--project",
  "demo-scisense",
  "--only",
  "auth,firestore",
  "node tmp/hermes-store-emulator.mjs && node --test scripts/hermes-notes-rules.test.mjs",
]);
