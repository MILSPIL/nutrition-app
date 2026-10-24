// Runs under the candidate unit in a disposable synthetic container. Opens only;
// it never writes a kernel value, even if a protection unexpectedly fails.
import assert from "node:assert/strict";
import { readFileSync, openSync, closeSync, constants } from "node:fs";
assert.equal(readFileSync("/proc/1/comm", "utf8").trim(), "systemd");
assert.equal(process.getuid(), 10001);
const status = readFileSync("/proc/self/status", "utf8");
for (const field of ["CapEff", "CapPrm", "CapAmb"])
  assert.match(status, new RegExp("^" + field + ":[\\t ]+0+$", "m"));
assert.match(status, /^NoNewPrivs:[\t ]+1$/m);
// mountinfo order does not identify the visible mount when mounts are stacked.
// Resolve the actual /sys descriptor's mount ID, never select the last row.
const sysFd = openSync("/sys", constants.O_RDONLY | constants.O_DIRECTORY);
let sysMountId;
try { sysMountId = readFileSync(`/proc/self/fdinfo/${sysFd}`, "utf8").match(/^mnt_id:[\t ]+(\d+)$/m)?.[1]; }
finally { closeSync(sysFd); }
const mounts = readFileSync("/proc/self/mountinfo", "utf8").trim().split("\n").map(line => line.split(" "));
const sys = mounts.find(fields => fields[0] === sysMountId);
assert.ok(sys && sys[5].split(",").includes("ro"), JSON.stringify({
  error: "visible_sys_not_read_only", sysMountId,
  visibleMount: sys?.join(" "), sysMounts: mounts.filter(fields => fields[4] === "/sys").map(fields => fields.join(" ")),
}));
for (const file of ["/proc/sys/kernel/hostname", "/proc/sysrq-trigger"]) {
  let fd, denied = false;
  try { fd = openSync(file, constants.O_WRONLY); }
  catch (error) { denied = ["EACCES", "EPERM", "EROFS"].includes(error.code); }
  finally { if (fd !== undefined) closeSync(fd); }
  assert.ok(denied, "kernel_tunable_open_allowed");
}
console.log(JSON.stringify({ parentCanaries: true, uid: 10001, capabilities: 0,
  noNewPrivileges: true, sysReadOnly: true, kernelTunableOpenDenied: true }));
