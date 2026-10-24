import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, delimiter } from "node:path";
import { requireIsolatedBrowser } from "./browser-runtime.mjs";
requireIsolatedBrowser();
const cwd = resolve("."),
  pin = resolve(
    ".agents/runtime/deployment/2026-10-22-ntzg-03/runtime-candidate-24.22.1/node-v24.22.1-darwin-arm64/bin",
  );
if (existsSync(pin))
  process.env.PATH =
    pin +
    delimiter +
    "/Users/user/.npm-global/bin" +
    delimiter +
    process.env.PATH;
const run = (bin, args, env = process.env) =>
  new Promise((ok, no) => {
    const p = spawn(bin, args, { cwd, env, stdio: "inherit" });
    p.once("error", no);
    p.once("exit", (code) =>
      code === 0 ? ok() : no(Error("local_qa_failed:" + code)),
    );
  });
await run("npm", ["run", "build"], {
  ...process.env,
  CI: "true",
  REACT_APP_LOCAL_LAB: "1",
  REACT_APP_TRAINER_CHAT: "1",
  REACT_APP_PILOT_MODE: "1",
  REACT_APP_MEAL_API_URL: "/meal-api",
  BUILD_PATH: "tmp/hermes-build",
});
await run(process.env.FIREBASE_CLI || "firebase", [
  "emulators:exec",
  "--config",
  "firebase.lab.json",
  "--project",
  "demo-scisense",
  "--only",
  "auth,firestore",
  "node scripts/trainer-chat-browser.mjs",
]);
