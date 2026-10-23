import { spawn } from "node:child_process";
const allowed = new Set(["scisense-groq/api-key", "scisense-anthropic/api-key", "scisense-phone-lab/tls-key", "scisense-phone-lab/pilot-2026-10-20"]);
export function keychain(service, account, value) {
  if (!allowed.has(`${service}/${account}`)) throw Error("keychain_scope");
  const setting = value !== undefined;
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["-c", setting
      ? "import sys,json,keyring; x=json.load(sys.stdin); keyring.set_password(x['service'],x['account'],x['value'])"
      : "import sys,json,keyring; x=json.load(sys.stdin); sys.stdout.write(keyring.get_password(x['service'],x['account']) or '')"],
      { stdio: ["pipe", "pipe", "ignore"] });
    const chunks = []; let size = 0;
    const timer = setTimeout(() => child.kill("SIGKILL"), 15000);
    child.on("error", () => { clearTimeout(timer); reject(Error("keychain_unavailable")); });
    child.stdout.on("data", chunk => { size += chunk.length; if (size > 32768) child.kill("SIGKILL"); else chunks.push(chunk); });
    child.stdin.on("error", () => {});
    child.on("close", code => { clearTimeout(timer); code === 0 && size <= 32768 ? resolve(Buffer.concat(chunks).toString()) : reject(Error("keychain_unavailable")); });
    child.stdin.end(JSON.stringify({ service, account, ...(setting ? { value: String(value) } : {}) }));
  });
}
