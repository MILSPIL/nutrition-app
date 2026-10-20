// Підготовка й запуск лише лабораторії; цей CLI поки не має режиму платних API.
import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createPhoneGateway, privateHost } from "./phone-lab/gateway.mjs";
import { generateTls } from "./phone-lab/tls.mjs";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, "tmp/phone-lab"),
  configFile = path.join(dir, "config.json");
const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: options.capture ? ["pipe", "pipe", "ignore"] : "inherit",
      env: options.env || process.env,
    });
    const chunks = [];
    if (options.capture) {
      child.stdout.on("data", (chunk) => chunks.push(chunk));
      child.stdin.end(options.input);
    }
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(Error("local_command_failed")),
    );
  });
const keychain = (operation, value) =>
  run(
    "python3",
    [
      "-c",
      operation === "set"
        ? "import sys,json,keyring; x=json.load(sys.stdin); keyring.set_password('scisense-phone-lab','tls-key',x['value'])"
        : "import sys,keyring; x=keyring.get_password('scisense-phone-lab','tls-key'); assert x; sys.stdout.write(x)",
    ],
    {
      capture: true,
      input:
        operation === "set"
          ? JSON.stringify({ value: value.toString() })
          : undefined,
    },
  );
try {
  const command = process.argv[2];
  if (command === "prepare") {
    const candidates = (networkInterfaces().en0 || [])
      .filter((x) => x.family === "IPv4" && privateHost(x.address))
      .map((x) => x.address);
    const host =
      process.argv[3] || (candidates.length === 1 ? candidates[0] : "");
    if (!privateHost(host))
      throw Error("Вкажіть приватну IPv4-адресу Mac аргументом prepare.");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const tls = await generateTls(host);
    await keychain("set", tls.key);
    await writeFile(path.join(dir, "ca.crt"), tls.ca);
    await writeFile(path.join(dir, "server.crt"), tls.cert);
    const config = {
      host,
      port: 8443,
      origin: `https://${host}:8443`,
      project: "demo-scisense",
      live: false,
    };
    await writeFile(configFile, JSON.stringify(config, null, 2));
    await run("npm", ["run", "build"], {
      env: {
        ...process.env,
        CI: "true",
        REACT_APP_LOCAL_LAB: "1",
        REACT_APP_PHONE_LAB: "1",
        REACT_APP_PHONE_ORIGIN: config.origin,
        REACT_APP_MEAL_API_URL: "/meal-api",
        REACT_APP_PILOT_MODE: "1",
        BUILD_PATH: "tmp/phone-lab/build",
      },
    });
    console.log(
      JSON.stringify({
        prepared: true,
        origin: config.origin,
        ca: path.join(dir, "ca.crt"),
        privateKey: "macOS Keychain",
        live: false,
      }),
    );
  } else if (command === "start") {
    await readFile(configFile);
    await run(
      process.env.FIREBASE_CLI || "/Users/user/.npm-global/bin/firebase",
      [
        "emulators:exec",
        "--config",
        "firebase.lab.json",
        "--project",
        "demo-scisense",
        "--only",
        "auth,firestore",
        "node scripts/phone-lab.mjs serve",
      ],
    );
  } else if (command === "serve") {
    const config = JSON.parse(await readFile(configFile, "utf8"));
    if (config.project !== "demo-scisense" || config.live !== false)
      throw Error("Непогоджений режим API заборонено.");
    const gateway = await createPhoneGateway({
      ...config,
      key: await keychain("get"),
      cert: await readFile(path.join(dir, "server.crt")),
      buildDir: path.join(dir, "build"),
    });
    await gateway.listen();
    console.log(
      JSON.stringify({
        origin: gateway.origin,
        setup: gateway.origin + "/lab/setup",
        live: false,
        project: "demo-scisense",
      }),
    );
    let closing = false;
    const close = async () => {
      if (closing) return;
      closing = true;
      await gateway.close();
      process.exit(0);
    };
    process.on("SIGINT", close);
    process.on("SIGTERM", close);
  } else throw Error("Команди: prepare [IPv4], start. Реальні API вимкнені.");
} catch (error) {
  console.error(
    error.message.startsWith("local_")
      ? "Локальна команда не виконана. Секрети не виводяться."
      : error.message,
  );
  process.exitCode = 1;
}
