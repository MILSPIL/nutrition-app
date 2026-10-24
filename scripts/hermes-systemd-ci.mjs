// Owned disposable CI container only. No host mounts, ports or real credentials.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const name = "scisense-hermes-systemd-" + randomUUID();
let attempted = false,
  result;
function docker(args, timeout = 120000) {
  const r = spawnSync("docker", args, {
    encoding: "utf8",
    timeout,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (r.status !== 0) throw Error((r.stdout + r.stderr).slice(-10000));
  return r.stdout.trim();
}
try {
  docker(
    [
      "build",
      "--file",
      "server/trainer/hermes-systemd.Dockerfile",
      "--tag",
      "scisense-hermes-systemd",
      ".",
    ],
    300000,
  );
  attempted = true;
  docker([
    "run",
    "--detach",
    "--name",
    name,
    "--privileged",
    "--cgroupns=private",
    "--network=none",
    "--cpus=2",
    "--memory=2g",
    "--memory-swap=2g",
    "--tmpfs",
    "/run",
    "--tmpfs",
    "/run/lock",
    "scisense-hermes-systemd",
  ]);
  const conf = JSON.parse(docker(["inspect", name]))[0];
  if (
    conf.HostConfig.Binds?.length ||
    Object.keys(conf.HostConfig.PortBindings || {}).length ||
    conf.HostConfig.NetworkMode !== "none" ||
    conf.HostConfig.NanoCpus !== 2e9 ||
    conf.HostConfig.Memory !== 2147483648 ||
    conf.HostConfig.MemorySwap !== 2147483648
  )
    throw Error("unsafe_container");
  result = JSON.parse(
    docker(
      ["exec", name, "node", "server/trainer/hermes-systemd-test.mjs"],
      70000,
    ),
  );
} catch (error) {
  result = { passed: false, error: error.message };
  process.exitCode = 1;
} finally {
  let cleanup = !attempted;
  if (attempted) {
    try {
      docker(["rm", "--force", name]);
      cleanup =
        docker([
          "ps",
          "-a",
          "--filter",
          "name=^/" + name + "$",
          "--format",
          "{{.ID}}",
        ]) === "";
    } catch {
      cleanup = false;
    }
  }
  if (!cleanup) process.exitCode = 1;
  mkdirSync("tmp/hermes-linux", { recursive: true });
  writeFileSync(
    "tmp/hermes-linux/systemd.json",
    JSON.stringify({ ...result, containerName: name, cleanup }, null, 2) + "\n",
  );
  console.log(JSON.stringify({ ...result, cleanup }));
}
