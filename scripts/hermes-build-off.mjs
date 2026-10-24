// Builds only tracked public app configuration; no local env files or credentials.
import { existsSync, writeFileSync } from "node:fs";
import { spawnSync, execFileSync } from "node:child_process";
for (const name of [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
])
  if (existsSync(name)) throw Error("local_env_file_not_allowed");
const env = { ...process.env };
for (const key of Object.keys(env))
  if (key.startsWith("REACT_APP_")) delete env[key];
Object.assign(env, {
  REACT_APP_TRAINER_CHAT: "0",
  REACT_APP_LOCAL_LAB: "0",
  CI: "true",
});
const run = spawnSync("npm", ["run", "build"], { env, stdio: "inherit" });
if (run.status !== 0) process.exit(run.status ?? 1);
writeFileSync(
  "build/scisense-build.json",
  JSON.stringify({
    codeSha: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    trainerChatEnabled: false,
    localLabEnabled: false,
  }) + "\n",
);
