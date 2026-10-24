// No provider, owner data or credential is loaded. Test real namespace policy,
// then deliberately omit each defence to prove the canaries fail.
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  openSync,
  closeSync,
  realpathSync,
  readFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { linuxWorkerCommand } from "../server/trainer/linux-isolation.mjs";
const lab = realpathSync(resolve(".agents/runtime/hermes-lab"));
const root = mkdtempSync(join(lab, "isolation-synthetic-"));
const profile = join(root, "profile"),
  workDirectory = join(root, "work");
for (const p of [profile, workDirectory]) mkdirSync(p, { mode: 0o700 });
const outside = join(root, "outside.txt");
writeFileSync(outside, "synthetic", { mode: 0o600 });
const server = createServer((s) => s.end());
await new Promise((ok, no) => {
  server.once("error", no);
  server.listen(0, "127.0.0.1", ok);
});
const port = server.address().port;
const python = `import os,sys,ctypes,errno,socket,threading,signal
from pathlib import Path
assert not Path(${JSON.stringify(outside)}).exists(), 'outside_file_visible'
s=socket.socket();s.settimeout(1)
try:
 s.connect(('127.0.0.1',${port})); raise AssertionError('parent_network_visible')
except OSError: pass
finally: s.close()
libc=ctypes.CDLL(None,use_errno=True)
assert libc.syscall(308,-1,0)==-1 and ctypes.get_errno()==errno.EPERM, 'setns_policy_missing'
assert libc.syscall(435,0,0)==-1 and ctypes.get_errno()==errno.ENOSYS, 'clone3_policy_missing'
for flag in [0x10000000,0x20000,0x40000000,0x20000000,0x8000000,0x4000000,0x2000000]:
 assert libc.syscall(56,flag,0,0,0,0)==-1 and ctypes.get_errno()==errno.EPERM, 'clone_namespace_allowed'
try: os.unshare(os.CLONE_NEWUSER); raise AssertionError('unshare_allowed')
except PermissionError: pass
seen=[]
t=threading.Thread(target=lambda:seen.append(1));t.start();t.join();assert seen==[1]
pid=os.fork()
if pid==0:
 libc.syscall(0x40000000 | 39);os._exit(7)
_,status=os.waitpid(pid,0)
assert os.WIFSIGNALED(status) and os.WTERMSIG(status)==signal.SIGSYS, 'x32_not_killed'
print('isolation_verified')
`;
async function probe(mutation) {
  const [exe, base] = linuxWorkerCommand({
    source: join(lab, "source"),
    profile,
    workDirectory,
  });
  const args = base.slice(0, base.lastIndexOf("--") + 1);
  args.push(join(lab, "source/.venv/bin/python"), "-c", python);
  if (mutation === "network") args.splice(args.indexOf("--unshare-net"), 1);
  if (mutation === "seccomp") args.splice(args.indexOf("--seccomp"), 2);
  const fd = openSync("server/trainer/worker-seccomp.bpf", "r");
  let child;
  try {
    child = spawn(exe, args, {
      env: { PATH: "/usr/bin:/bin", HOME: workDirectory },
      stdio: ["ignore", "pipe", "pipe", fd],
    });
  } finally {
    closeSync(fd);
  }
  let out = "",
    err = "";
  child.stdout.on("data", (b) => (out += b));
  child.stderr.on("data", (b) => (err += b));
  const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
  try {
    const status = await new Promise((ok, no) => {
      child.once("error", no);
      child.once("exit", (code, signal) => ok({ code, signal }));
    });
    return { ...status, out, err };
  } finally {
    clearTimeout(timer);
  }
}
try {
  const normal = await probe();
  assert.equal(normal.code, 0, normal.err);
  const network = await probe("network");
  assert.notEqual(network.code, 0);
  assert.match(network.err, /parent_network_visible/);
  const seccomp = await probe("seccomp");
  assert.notEqual(seccomp.code, 0);
  assert.match(seccomp.err, /setns_policy_missing/);
  console.log(
    JSON.stringify({
      passed: true,
      nativeThreads: true,
      namespaceCloneDenied: true,
      x32Killed: true,
      networkMutationDetected: true,
      seccompMutationDetected: true,
      syntheticOnly: true,
    }),
  );
} finally {
  await new Promise((ok) => server.close(ok));
  rmSync(root, { recursive: true, force: true });
}
