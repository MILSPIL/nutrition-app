import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { privateHost } from "./gateway.mjs";
// Ключі OpenSSL проходять через pipe й пам’ять, не через argv або файли.
function openssl(args, { input, extraInput } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("openssl", args, {
      stdio: ["pipe", "pipe", "ignore", "pipe"],
    });
    const output = [],
      extra = [];
    child.stdout.on("data", (chunk) => output.push(chunk));
    if (extraInput) child.stdio[3].end(extraInput);
    else child.stdio[3].on("data", (chunk) => extra.push(chunk));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve({
            output: Buffer.concat(output),
            extra: Buffer.concat(extra),
          })
        : reject(Error("tls_generation_failed")),
    );
    child.stdin.end(input);
  });
}
export async function generateTls(host) {
  if (!privateHost(host)) throw Error("Private IPv4 required");
  const dir = await mkdtemp(path.join(tmpdir(), "scisense-tls-"));
  try {
    const ca = await openssl([
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "3",
      "-subj",
      "/CN=SciSense temporary phone lab",
      "-addext",
      "basicConstraints=critical,CA:TRUE",
      "-addext",
      "keyUsage=critical,keyCertSign,cRLSign",
      "-keyout",
      "/dev/fd/3",
      "-out",
      "/dev/stdout",
    ]);
    const csr = await openssl([
      "req",
      "-new",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-subj",
      "/CN=SciSense phone lab",
      "-keyout",
      "/dev/fd/3",
      "-out",
      "/dev/stdout",
    ]);
    await writeFile(path.join(dir, "ca.pem"), ca.output);
    await writeFile(
      path.join(dir, "extensions"),
      "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:" +
        host +
        "\n",
    );
    const cert = await openssl(
      [
        "x509",
        "-req",
        "-days",
        "2",
        "-in",
        "/dev/stdin",
        "-CA",
        path.join(dir, "ca.pem"),
        "-CAkey",
        "/dev/fd/3",
        "-set_serial",
        "0x" + randomBytes(16).toString("hex"),
        "-extfile",
        path.join(dir, "extensions"),
        "-out",
        "/dev/stdout",
      ],
      { input: csr.output, extraInput: ca.extra },
    );
    return { key: csr.extra, cert: cert.output, ca: ca.output };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
