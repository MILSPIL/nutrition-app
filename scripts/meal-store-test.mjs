import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const cwd = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
mkdirSync(path.join(cwd, "tmp"), { recursive: true });
const run = (bin, args) => {
  const result = spawnSync(bin, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};
run(path.join(cwd, "workers/meal-parser/node_modules/.bin/esbuild"), [
  "scripts/meal-store-emulator.mjs",
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--packages=external",
  '--define:process.env.REACT_APP_LOCAL_LAB="1"',
  "--outfile=tmp/meal-store-emulator.mjs",
]);
run(process.env.FIREBASE_CLI || "firebase", [
  "emulators:exec",
  "--config",
  "firebase.lab.json",
  "--project",
  "demo-scisense",
  "--only",
  "auth,firestore",
  "node tmp/meal-store-emulator.mjs",
]);
