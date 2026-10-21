import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { requireIsolatedBrowser } from './browser-runtime.mjs';
requireIsolatedBrowser();
const cwd = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const run = (cmd, args, env = process.env) =>
  new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { cwd, env, stdio: "inherit" });
    c.on("error", reject);
    c.on("exit", (code) =>
      code === 0 ? resolve() : reject(Error("qa_failed")),
    );
  });
await run("npm", ["run", "build"], {
  ...process.env,
  CI: "true",
  REACT_APP_LOCAL_LAB: "1",
  REACT_APP_PHONE_LAB: "1",
  REACT_APP_PHONE_ORIGIN: "https://127.0.0.1:8444",
  REACT_APP_MEAL_API_URL: "/meal-api",
  REACT_APP_PILOT_MODE: "1",
  BUILD_PATH: "tmp/phone-lab-qa-build",
});
await run(process.env.FIREBASE_CLI || "firebase", [
  "emulators:exec",
  "--config",
  "firebase.lab.json",
  "--project",
  "demo-scisense",
  "--only",
  "auth,firestore",
  "node scripts/phone-lab-browser.mjs",
]);
