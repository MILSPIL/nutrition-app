import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { privateHost } from "./gateway.mjs";
// OpenSSL's native '-' means stdin/stdout on Linux and macOS. Reopening
// /dev/fd/N can fail for Node's socket-backed child stdio on Linux.
// Private keys stay in bounded memory/stdio; only public material uses files.
function openssl(args, input) {
  return new Promise((resolve, reject) => {
    // x509 -CAkey does not support native "-". Give it a real OS pipe:
    // Node child stdio is a socket on Linux. The shell program is fixed;
    // all options are positional arguments and the key is only stdin.
    const child = input
      ? spawn("/bin/sh", ["-c", 'cat | exec openssl "$@"', "scisense-tls", ...args],
          { stdio: ["pipe", "pipe", "ignore"], detached: true })
      : spawn("openssl", args, { stdio: ["pipe", "pipe", "ignore"], detached: true });
    const kill = (signal) => {
      if (child.pid) { try { process.kill(-child.pid, signal); } catch {} }
    };
    const chunks = [];
    let size = 0, failed = false, closed = false, cleanupPending = false, exitCode;
    const finish = () => {
      if (!closed || cleanupPending) return;
      const output = !failed && exitCode === 0 ? Buffer.concat(chunks) : null;
      for (const chunk of chunks) chunk.fill(0);
      if (output) resolve(output);
      else reject(Error("tls_generation_failed"));
    };
    const stop = () => {
      if (failed) return;
      failed = true;
      kill("SIGTERM");
      cleanupPending = true;
      // The leader can close before a TERM-resistant descendant. Keep the
      // escalation alive and await it before exposing failure to the caller.
      setTimeout(() => { kill("SIGKILL"); cleanupPending = false; finish(); }, 1000);
    };
    const timer = setTimeout(stop, 20000);
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > 32768 || failed) { chunk.fill(0); stop(); }
      else chunks.push(chunk);
    });
    child.stdin.on("error", stop);
    child.on("error", stop);
    child.on("close", (code) => {
      clearTimeout(timer);
      closed = true; exitCode = code;
      if (code !== 0) stop();
      finish();
    });
    child.stdin.end(input);
  });
}
function pem(output, label) {
  const begin = Buffer.from(`-----BEGIN ${label}-----`);
  const end = Buffer.from(`-----END ${label}-----`);
  const start = output.indexOf(begin), finish = output.indexOf(end);
  if (start < 0 || finish <= start || output.indexOf(begin, start + 1) !== -1)
    throw Error("tls_generation_failed");
  return Buffer.concat([output.subarray(start, finish + end.length), Buffer.from("\n")]);
}
export async function generateTls(host) {
  if (!privateHost(host)) throw Error("Private IPv4 required");
  const dir = await mkdtemp(path.join(tmpdir(), "scisense-tls-"));
  let caOutput, csrOutput, caKey, serverKey, succeeded = false;
  try {
    caOutput = await openssl([
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "3",
      "-subj", "/CN=SciSense temporary phone lab",
      "-addext", "basicConstraints=critical,CA:TRUE",
      "-addext", "keyUsage=critical,keyCertSign,cRLSign",
      "-keyout", "-", "-out", "-",
    ]);
    caKey = pem(caOutput, "PRIVATE KEY");
    const ca = pem(caOutput, "CERTIFICATE");
    csrOutput = await openssl([
      "req", "-new", "-newkey", "rsa:2048", "-nodes",
      "-subj", "/CN=SciSense phone lab", "-keyout", "-", "-out", "-",
    ]);
    serverKey = pem(csrOutput, "PRIVATE KEY");
    await writeFile(path.join(dir, "ca.pem"), ca);
    await writeFile(path.join(dir, "request.pem"), pem(csrOutput, "CERTIFICATE REQUEST"));
    await writeFile(
      path.join(dir, "extensions"),
      "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:" + host + "\n",
    );
    const cert = await openssl([
      "x509", "-req", "-days", "2", "-in", path.join(dir, "request.pem"),
      "-CA", path.join(dir, "ca.pem"), "-CAkey", "/dev/stdin",
      "-set_serial", "0x" + randomBytes(16).toString("hex"),
      "-extfile", path.join(dir, "extensions"), "-out", "-",
    ], caKey);
    succeeded = true;
    return { key: serverKey, cert, ca };
  } finally {
    caOutput?.fill(0); csrOutput?.fill(0); caKey?.fill(0);
    if (!succeeded) serverKey?.fill(0);
    await rm(dir, { recursive: true, force: true });
  }
}
