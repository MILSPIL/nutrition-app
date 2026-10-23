// Запускається тільки канонічним launcher, без доступу до production Firebase.
import { spawn } from "node:child_process";
import {existsSync,readFileSync} from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { requireIsolatedBrowser } from './browser-runtime.mjs';
requireIsolatedBrowser();
const cwd = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const version=readFileSync(path.join(cwd,'.nvmrc'),'utf8').trim().replace(/^v/,'');
const pinned=path.join(cwd,`.agents/runtime/deployment/2026-10-22-ntzg-03/runtime-candidate-${version}/node-v${version}-darwin-arm64/bin`);
if(existsSync(pinned)) process.env.PATH=pinned+path.delimiter+process.env.PATH;
const run = (command, args, env = process.env) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(Error(`${command}: ${code}`)),
    );
  });
await run("npm", ["run", "build"], {
  ...process.env,
  CI: "true",
  REACT_APP_LOCAL_LAB: "1",
  REACT_APP_MEAL_API_URL: "http://127.0.0.1:8787",
  REACT_APP_PILOT_MODE: "1",
  BUILD_PATH: "tmp/voice-photo-build",
});
await run(process.env.FIREBASE_CLI || "firebase", [
  "emulators:exec",
  "--config",
  "firebase.lab.json",
  "--project",
  "demo-scisense",
  "--only",
  "auth,firestore",
  "node scripts/voice-photo-browser.mjs",
]);
