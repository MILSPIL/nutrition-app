import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
if (
  process.env.container !== "docker" ||
  readFileSync("/proc/1/comm", "utf8").trim() !== "systemd"
)
  throw Error("synthetic_container_required");
const unit = "scisense-api.service";
const ctl = (...args) => {
  const r = spawnSync("systemctl", args, { encoding: "utf8", timeout: 55000 });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
for (let i = 0; i < 100; i++) {
  if (
    spawnSync("systemctl", ["show", "-p", "Version", "--value"], {
      timeout: 1000,
    }).status === 0
  )
    break;
  await sleep(100);
}
try {
  ctl("daemon-reload");
  ctl("start", unit);
  assert.equal(ctl("show", unit, "-p", "ExecMainStatus", "--value"), "0");
  for (const [key, value] of Object.entries({
    CPUQuotaPerSecUSec: "2s",
    MemoryMax: "2147483648",
    MemorySwapMax: "0",
    TasksMax: "128",
    KillMode: "control-group",
    NoNewPrivileges: "yes",
    ProtectKernelTunables: "yes",
    CapabilityBoundingSet: "",
  }))
    assert.equal(ctl("show", unit, "-p", key, "--value"), value, key);
  assert.match(
    ctl("show", unit, "-p", "RestrictAddressFamilies", "--value"),
    /AF_NETLINK/,
  );
  const resource = JSON.parse(
    readFileSync("/var/lib/scisense/hermes-lab/resource-summary.json"),
  );
  console.log(
    JSON.stringify({
      passed: true,
      syntheticOnly: true,
      actualUnit: "deploy/hermes/scisense-api.service",
      resource,
    }),
  );
} catch (error) {
  console.error(
    spawnSync("journalctl", ["-u", unit, "--no-pager", "-n", "40"], {
      encoding: "utf8",
    }).stdout,
  );
  throw error;
}
