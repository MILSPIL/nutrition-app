import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const cwd = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
mkdirSync(path.join(cwd, "tmp"), { recursive: true });
// Точний старий writer, заморожений до реалізації. Спільний Firebase instance.
const previous = JSON.parse(readFileSync(path.join(cwd, 'scripts/fixtures/voice-letters-previous-writer.json')));
const oldDir = path.join(cwd, 'tmp/old-writer'); mkdirSync(oldDir, { recursive: true });
for (const file of ['mealItems', 'mealCommands', 'mealStore']) {
 let source = previous.files[`src/services/${file}.js`];
 source = source.replace(/from '([^']+)'/g, (all, spec) => {
  const local = spec.startsWith('./') && ['mealItems','mealCommands','mealStore'].includes(spec.slice(2));
  return spec.startsWith('.') ? `from '${local ? path.join(oldDir,spec.slice(2)+'.js') : path.resolve(cwd,'src/services',spec)+'.js'}'` : all;
 });
 writeFileSync(path.join(oldDir,file+'.js'),source);
}
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
