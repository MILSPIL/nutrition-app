// Build the exact committed source in an owned export with an explicit environment.
// Local public files, dotenv files and inherited build/preload options cannot enter it.
import { existsSync, lstatSync, readFileSync, writeFileSync, readdirSync, mkdirSync, mkdtempSync, cpSync, rmSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir, homedir } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";

export function buildHermesRelease({ enabled = false } = {}) {
  if (typeof enabled !== "boolean") throw Error("build_mode_invalid");
  const repo = realpathSync(process.cwd());
  const pin = readFileSync(join(repo, ".nvmrc"), "utf8").trim().replace(/^v/, "");
  if (process.versions.node !== pin) throw Error("pinned_node_required");
  const node = realpathSync(process.execPath);
  const npmCli = join(dirname(node), "../lib/node_modules/npm/bin/npm-cli.js");
  if (!existsSync(npmCli)) throw Error("pinned_npm_missing");
  const gitEnv = { PATH: "/usr/bin:/bin", HOME: homedir() };
  const git = (args) => execFileSync("/usr/bin/git", args, { cwd: repo, env: gitEnv, encoding: "utf8" }).trim();
  const sha = git(["rev-parse", "HEAD"]);
  if (!/^[a-f0-9]{40}$/.test(sha)) throw Error("head_invalid");
  const codePaths = ["src", "public", "server", "workers", "scripts", "deploy", "package.json", "package-lock.json", ".nvmrc", ".github", "firestore.rules"];
  if (git(["diff", "HEAD", "--name-only", "--", ...codePaths])) throw Error("uncommitted_code");
  if (git(["ls-files", "--", "build"])) throw Error("build_path_tracked");
  const output = join(repo, "build");
  if (existsSync(output) && (!lstatSync(output).isDirectory() || lstatSync(output).isSymbolicLink())) throw Error("build_path_not_directory");
  const owned = mkdtempSync(join(tmpdir(), "scisense-release-build-"));
  try {
    const stage = join(owned, "source");
    mkdirSync(stage);
    const archive = join(owned, "source.tar");
    git(["archive", "--format=tar", "--output=" + archive, sha]);
    execFileSync("/usr/bin/tar", ["-xf", archive, "-C", stage], { env: gitEnv });
    const checkRegularTree = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name), st = lstatSync(path);
        if (st.isSymbolicLink() || (!st.isDirectory() && !st.isFile())) throw Error("source_not_regular");
        if (st.isDirectory()) checkRegularTree(path);
      }
    };
    checkRegularTree(stage);
    for (const name of [".env", ".env.local", ".env.production", ".env.production.local", ".npmrc"]) {
      if (existsSync(join(stage, name))) throw Error("export_env_file_not_allowed");
    }
    const env = {
      PATH: dirname(node) + ":/usr/bin:/bin",
      HOME: homedir(),
      TMPDIR: owned,
      CI: "true",
      NPM_CONFIG_USERCONFIG: "/dev/null",
      NPM_CONFIG_GLOBALCONFIG: join(owned, "absent-global-npmrc"),
      REACT_APP_TRAINER_CHAT: enabled ? "1" : "0",
      REACT_APP_MEAL_API_URL: "/meal-api",
      REACT_APP_LOCAL_LAB: "0",
      REACT_APP_PHONE_LAB: "0",
      REACT_APP_PILOT_MODE: "0",
    };
    const run = (args, failure) => {
      const result = spawnSync(node, [npmCli, ...args], { cwd: stage, env, stdio: ["ignore", "pipe", "pipe"], timeout: 240000, maxBuffer: 8 * 1024 * 1024 });
      if (result.status !== 0) {
        const code = result.stderr?.toString().match(/npm error code (E[A-Z]+)/)?.[1] ?? "unknown";
        throw Error(failure + ":" + code);
      }
    };
    run(["ci", "--offline", "--ignore-scripts", "--no-audit", "--no-fund"], "locked_offline_dependencies_failed");
    run(["run", "build"], "clean_release_build_failed");
    const built = join(stage, "build");
    checkRegularTree(built);
    for (const name of ["index.html", "asset-manifest.json"]) if (!lstatSync(join(built, name)).isFile()) throw Error("build_incomplete");
    const receipt = enabled
      ? { codeSha: sha, trainerChatEnabled: true, localLabEnabled: false, phoneLabEnabled: false, pilotModeEnabled: false }
      : { codeSha: sha, trainerChatEnabled: false, localLabEnabled: false };
    writeFileSync(join(built, "scisense-build.json"), JSON.stringify(receipt) + "\n");
    const assets = [];
    const inventory = directory => {
      for (const name of readdirSync(directory).sort()) {
        const file = join(directory, name), info = lstatSync(file);
        if (info.isSymbolicLink()) throw Error("build_asset_symlink");
        if (info.isDirectory()) inventory(file);
        else if (info.isFile()) assets.push({ path: file.slice(built.length + 1), bytes: info.size, sha256: createHash("sha256").update(readFileSync(file)).digest("hex") });
        else throw Error("build_asset_special");
      }
    };
    inventory(built);
    writeFileSync(join(built, "scisense-build-files.json"), JSON.stringify({ version: 1, codeSha: sha, files: assets }) + "\n");
    // build/ is a generated, untracked directory. Never follow a substituted link.
    if (existsSync(output) && (!lstatSync(output).isDirectory() || lstatSync(output).isSymbolicLink())) throw Error("build_path_not_directory");
    rmSync(output, { recursive: true, force: true });
    cpSync(built, output, { recursive: true, errorOnExist: true });
    return { ...receipt, cleanGitExport: true, mealApiEndpoint: "/meal-api", pinnedNode: pin, output };
  } finally {
    rmSync(owned, { recursive: true, force: true });
  }
}
