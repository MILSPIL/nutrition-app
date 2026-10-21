// Запускається тільки канонічним launcher, без доступу до production Firebase.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { requireIsolatedBrowser } from './browser-runtime.mjs';
requireIsolatedBrowser();
const cwd = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
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
