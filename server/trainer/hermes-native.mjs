import { createServer as createNetServer } from "node:net";
import { linuxWorkerCommand } from "./linux-isolation.mjs";
import { spawn, spawnSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  realpathSync,
  lstatSync,
  mkdirSync,
  copyFileSync,
  existsSync,
  readdirSync,
  openSync,
  fsyncSync,
  closeSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { networkInterfaces } from "node:os";
import { TOOLS, MODEL, fail } from "./limits.mjs";
import { boundedOperation } from "./deadline.mjs";
const here = dirname(fileURLToPath(import.meta.url));
const sha = (value) => createHash("sha256").update(value).digest("hex");
export function verifyNativeSource(source, manifestFile) {
  const pin = JSON.parse(readFileSync(join(here, "hermes-pin.json"))),
    bytes = readFileSync(manifestFile);
  if (sha(bytes) !== pin.manifestSha256) fail("hermes_pin_invalid", 503);
  const manifest = JSON.parse(bytes);
  if (Object.keys(manifest).length !== pin.files)
    fail("hermes_pin_invalid", 503);
  for (const [name, digest] of Object.entries(manifest)) {
    const file = join(source, name);
    if (
      !realpathSync(file).startsWith(realpathSync(source) + sep) ||
      sha(readFileSync(file)) !== digest
    )
      fail("hermes_pin_invalid", 503);
  }
  return pin;
}
// Trusted service configuration only. All inference travels over parent-owned IPC.
// No browser field can choose executable, profile, source, model, tools, or endpoint.
export function createNativeBackend({
  source,
  sourceManifest,
  profile,
  workDirectory,
  apiKey,
  tools,
  toolSchemas,
  isolation,
  pythonRoot,
}) {
  for (const folder of [source, profile, workDirectory])
    if (
      resolve(folder) !== realpathSync(folder) ||
      !lstatSync(folder).isDirectory()
    )
      fail("hermes_path_invalid", 503);
  for (const folder of [profile, workDirectory])
    if (lstatSync(folder).mode & 0o077) fail("hermes_permissions", 503);
  if (
    typeof apiKey !== "string" ||
    !/^[a-f0-9]{64}$/.test(apiKey) ||
    TOOLS.some(
      (n) => typeof tools[n] !== "function" || toolSchemas[n]?.name !== n,
    ) ||
    Object.keys(toolSchemas).length !== TOOLS.length
  )
    fail("trainer_config", 503);
  const pin = verifyNativeSource(source, sourceManifest);
  const config = JSON.parse(readFileSync(join(here, "hermes-config.json")));
  if (
    JSON.stringify(JSON.parse(readFileSync(join(profile, "config.yaml")))) !==
    JSON.stringify(config)
  )
    fail("hermes_config_invalid", 503);
  for (const name of [
    "hermes_worker.py",
    "hermes_privacy.py",
    "hermes-config.json",
  ])
    copyFileSync(join(here, name), join(workDirectory, name));
  for (const name of ["tmp", "empty-home"])
    mkdirSync(join(workDirectory, name), { recursive: true, mode: 0o700 });
  let outsidePort = 0;
  const outside = createNetServer((socket) => socket.end());
  const canaryReady = new Promise((ok, no) => {
    outside.once("error", no);
    outside.listen(0, "127.0.0.1", () => {
      outsidePort = outside.address().port;
      outside.unref();
      ok();
    });
  });
  canaryReady.catch(() => {});
  const exitedNamespaces = new Map();
  const workers = new Map(),
    faults = [],
    eventsMeta = [];
  function command() {
    const python = join(source, ".venv/bin/python"),
      script = join(workDirectory, "hermes_worker.py");
    if (process.platform === "darwin" && isolation === "macos-seatbelt") {
      const escaped = (s) => JSON.stringify(s);
      const policy = `(version 1)\n(allow default)\n(deny file-read-data (require-all (subpath "/Users") (require-not (subpath ${escaped(source)})) (require-not (subpath ${escaped(profile)})) (require-not (subpath ${escaped(workDirectory)}))))\n(deny file-write* (require-all (require-not (subpath ${escaped(profile)})) (require-not (subpath ${escaped(workDirectory)}))))\n(allow file-write* (literal "/dev/null"))\n(deny network-outbound)\n(allow network-outbound (remote ip "localhost:18751") (remote ip "localhost:18752"))\n(deny network-inbound)\n(allow network-inbound (local ip "localhost:18751") (local ip "localhost:18752"))\n(deny mach-lookup (global-name "com.apple.securityd"))\n`;
      const file = join(workDirectory, "worker.sb");
      writeFileSync(file, policy, { mode: 0o600 });
      return ["/usr/bin/sandbox-exec", ["-f", file, python, script]];
    }
    if (process.platform === "linux" && isolation === "linux-bubblewrap")
      return linuxWorkerCommand({ source, profile, workDirectory, pythonRoot });
    // CI runs the entire synthetic stack in a network-none container. This is NOT a
    // production activation option: runtime manifests reject this isolation kind.
    if (
      process.platform === "linux" &&
      isolation === "synthetic-network-none" &&
      Object.values(networkInterfaces())
        .flat()
        .every((n) => n.internal)
    )
      return [python, [script]];
    fail("hermes_isolation_required", 503);
  }
  function cleanupMetadata(turn, args, mode) {
    const file = join(workDirectory, turn.id + ".cleanup.json");
    if (mode === "start") {
      if (existsSync(file)) fail("turn_conflict", 409);
      const values = (args.images || []).map((image) => ({
        sha256: sha(Buffer.from(image.data, "base64")),
        suffix: {
          "image/png": ".png",
          "image/jpeg": ".jpg",
          "image/webp": ".webp",
        }[image.type],
      }));
      const tmp = file + ".tmp",
        fd = openSync(tmp, "wx", 0o600);
      try {
        writeFileSync(fd, JSON.stringify(values));
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(tmp, file);
      const dir = openSync(workDirectory, "r");
      try {
        fsyncSync(dir);
      } finally {
        closeSync(dir);
      }
    }
    if (!existsSync(file)) return [];
    const stat = lstatSync(file);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      stat.mode & 0o077
    )
      fail("hermes_permissions", 503);
    const value = JSON.parse(readFileSync(file));
    if (
      !Array.isArray(value) ||
      value.length > 2 ||
      value.some(
        (m) =>
          !/^[a-f0-9]{64}$/.test(m.sha256) ||
          ![".jpg", ".png", ".webp"].includes(m.suffix),
      )
    )
      fail("media_unavailable", 503);
    return value;
  }
  function startWorker(args, mode = "start") {
    const { turn } = args;
    if (workers.size) fail("trainer_busy", 409);
    const cleanupMedia = cleanupMetadata(turn, args, mode);
    const [exe, argv] = command();
    let filterFd, child;
    try {
      if (isolation === "linux-bubblewrap")
        filterFd = openSync(join(here, "worker-seccomp.bpf"), "r");
      child = spawn(exe, argv, {
        cwd: source,
        env: {
          PATH: "/usr/bin:/bin",
          HOME: join(workDirectory, "empty-home"),
          HERMES_HOME: profile,
          SCISENSE_IPC_KEY: "local-ipc-not-a-provider-credential",
          PYTHONUNBUFFERED: "1",
          PYTHONDONTWRITEBYTECODE: "1",
          TMPDIR: join(workDirectory, "tmp"),
          XDG_CONFIG_HOME: join(workDirectory, "empty-home/config"),
          XDG_CACHE_HOME: join(workDirectory, "empty-home/cache"),
        },
        stdio: [
          "pipe",
          "pipe",
          "ignore",
          ...(filterFd === undefined ? [] : [filterFd]),
        ],
      });
    } finally {
      if (filterFd !== undefined) closeSync(filterFd);
    }
    const lifetime = new AbortController(),
      signal = args.signal
        ? AbortSignal.any([args.signal, lifetime.signal])
        : lifetime.signal;
    let resolveResult,
      rejectResult,
      buffer = "",
      exited = false,
      modelRequests = 0,
      terminal = false,
      nativeIdentity,
      pidNamespace,
      isolationVerified = isolation === "synthetic-network-none";
    const result = new Promise((ok, no) => {
      resolveResult = ok;
      rejectResult = no;
    });
    result.catch(() => {});
    const commands = new Map();
    const send = (value) => {
      if (!exited && !child.stdin.destroyed)
        child.stdin.write(JSON.stringify(value) + "\n");
    };
    const failure = () => {
      rejectResult(
        Object.assign(Error("hermes_worker_failed"), {
          definitelyNotExecuted: modelRequests === 0,
        }),
      );
      for (const { reject } of commands.values())
        reject(Error("hermes_worker_failed"));
      commands.clear();
    };
    const exit = new Promise((resolveExit) =>
      child.once("close", (code, signal) => {
        eventsMeta.push({ type: "exit", code, signal });
        exited = true;
        lifetime.abort();
        // bwrap's PID-namespace init and die-with-parent policy end its children.
        // Never infer this proof from a PID number, a timeout or a Node restart.
        if (mode === "start" && isolation === "linux-bubblewrap" && nativeIdentity && pidNamespace)
          exitedNamespaces.set(turn.id, { ...nativeIdentity, pidNamespace });
        args.onWorkerExit?.();
        failure();
        workers.delete(turn.id);
        resolveExit(code);
      }),
    );
    child.on("error", failure);
    child.stdin.on("error", () => {});
    const rpc = async (type, fields = {}) => {
      if (exited) throw Error("hermes_worker_failed");
      const id = randomUUID();
      return boundedOperation(
        () =>
          new Promise((resolve, reject) => {
            commands.set(id, { resolve, reject });
            send({ type, id, ...fields });
          }),
      ).finally(() => commands.delete(id));
    };
    const worker = {
      child,
      result,
      exit,
      rpc,
      get terminal() {
        return terminal;
      },
    };
    workers.set(turn.id, worker);
    const abort = () => {
      void stopWorker(worker).catch(() => {});
    };
    if (args.signal) {
      args.signal.addEventListener("abort", abort, { once: true });
      result
        .finally(() => args.signal.removeEventListener("abort", abort))
        .catch(() => {});
      if (args.signal.aborted) abort();
    }
    async function dispatch(message) {
      eventsMeta.push({ type: message.type, at: Date.now() });
      if (message.type === "isolation") {
        if (message.fileDenied !== true || message.networkDenied !== true)
          throw Error("isolation_failed");
        if (isolation === "linux-bubblewrap") {
          if (!/^[0-9]+$/.test(message.pidNamespace || "")) throw Error("isolation_failed");
          pidNamespace = message.pidNamespace;
        }
        isolationVerified = true;
        return;
      }
      if (message.type === "run") {
        nativeIdentity = { runId: message.runId, sessionId: message.sessionId };
        args.onRun?.(nativeIdentity);
        return;
      }
      if (message.type === "result") {
        terminal = true;
        resolveResult({ state: "completed", result: message.result });
        return;
      }
      if (message.type === "status") {
        terminal = true;
        resolveResult({ state: message.state });
        return;
      }
      if (["stopped", "cleaned"].includes(message.type)) {
        commands.get(message.id)?.resolve(message);
        return;
      }
      if (message.type === "failure") {
        faults.push({ phase: message.phase, kind: message.kind });
        failure();
        return;
      }
      if (
        !["model", "tool"].includes(message.type) ||
        typeof message.id !== "string" ||
        !/^[a-f0-9]{32}$/.test(message.id)
      )
        throw Error("ipc_invalid");
      try {
        if (!isolationVerified) throw Error("isolation_failed");
        if (mode !== "start" || terminal) fail("turn_inactive", 409);
        if (message.type === "model") {
          const lease = args.issueLease();
          modelRequests++;
          const response = await args.modelCall(lease.token, message.payload);
          send({
            type: "reply",
            id: message.id,
            status: response.status,
            contentType: response.headers.get("content-type"),
            data: Buffer.from(await response.arrayBuffer()).toString("base64"),
          });
        } else {
          if (
            !TOOLS.includes(message.name) ||
            !message.arguments ||
            typeof message.arguments !== "object"
          )
            fail("invalid_tools");
          const value = await boundedOperation(
            (signal) =>
              tools[message.name](message.arguments, {
                turn,
                snapshot: args.snapshot,
                input: args.input,
                signal,
              }),
            Math.max(1, turn.deadline - Date.now()),
            signal,
          );
          if (Buffer.byteLength(JSON.stringify(value)) > 16000)
            fail("tool_result_too_large");
          send({ type: "reply", id: message.id, result: value });
        }
      } catch {
        send({ type: "reply", id: message.id, error: "gateway_refused" });
      }
    }
    let events = Promise.resolve();
    const decoder = new StringDecoder("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += decoder.write(chunk);
      if (Buffer.byteLength(buffer) > 20 * 1024 * 1024) {
        child.kill("SIGTERM");
        failure();
        return;
      }
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        try {
          const message = JSON.parse(line);
          if (["model", "tool"].includes(message.type))
            events = events
              .then(() => dispatch(message))
              .catch(() => {
                failure();
                child.kill("SIGTERM");
              });
          else
            void dispatch(message).catch(() => {
              failure();
              child.kill("SIGTERM");
            });
        } catch {
          failure();
          child.kill("SIGTERM");
        }
      }
    });
    send({
      mode,
      source,
      apiKey,
      cleanupMedia,
      exitedWorker: mode === "start" ? null : (exitedNamespaces.get(turn.id) ?? null),
      isolation,
      outsidePort,
      readDenyCanary: resolve(here, "../../package.json"),
      turnId: turn.id,
      runId: turn.run_id,
      sessionId: turn.session_id,
      toolSchemas,
      input: args.input ?? JSON.parse(turn.input),
      snapshot: args.snapshot ?? JSON.parse(turn.snapshot),
      images: args.images ?? [],
      ...(mode === "cleanup" ? { commandId: "startup-cleanup" } : {}),
    });
    return worker;
  }
  async function stopWorker(worker, { reconcile = false } = {}) {
    const proof = await worker.rpc("stop", { reconcile }).catch(() => null);
    if (proof?.stopped) return proof;
    worker.child.kill("SIGTERM");
    try {
      await boundedOperation(() => worker.exit, 1000);
    } catch {
      worker.child.kill("SIGKILL");
      await boundedOperation(() => worker.exit, 1000);
    }
    return { stopped: true, killed: true };
  }
  return {
    pin,
    diagnostics: () => ({
      faults: [...faults],
      workers: workers.size,
      events: eventsMeta,
    }),
    async start(args) {
      await canaryReady;
      const value = await startWorker(args).result;
      if (value.state !== "completed") throw Error("hermes_failed");
      return value.result;
    },
    async status(turn, { onRun } = {}) {
      await canaryReady;
      return (workers.get(turn.id) ?? startWorker({ turn, onRun }, "recover"))
        .result;
    },
    async stop(turn) {
      const worker = workers.get(turn.id);
      if (!worker) return { stopped: false };
      return stopWorker(worker, { reconcile: turn.state === "cancelled" });
    },
    async cleanup(turn) {
      await canaryReady;
      let worker = workers.get(turn.id);
      if (!worker) {
        worker = startWorker({ turn }, "recover");
        await worker.result;
      }
      const proof = await worker.rpc("cleanup", {
        reconcile: ["cancelled", "failed", "completed"].includes(turn.state),
      });
      if (!proof.cleaned) return { cleaned: false };
      const code = await boundedOperation(() => worker.exit);
      if (code === 0) {
        exitedNamespaces.delete(turn.id);
        const file = join(workDirectory, turn.id + ".cleanup.json");
        for (const candidate of [file, file + ".tmp"]) {
          if (!existsSync(candidate)) continue;
          const identity = lstatSync(candidate);
          if (
            !identity.isFile() ||
            identity.isSymbolicLink() ||
            identity.nlink !== 1 ||
            identity.mode & 0o077
          )
            fail("hermes_permissions", 503);
          unlinkSync(candidate);
        }
      }
      return { cleaned: code === 0, proof: proof.proof };
    },
    async shutdown() {
      await canaryReady.catch(() => {});
      await new Promise((ok) => outside.close(ok));
      for (const worker of [...workers.values()]) {
        await stopWorker(worker);
        worker.child.stdin.end();
        try {
          await boundedOperation(() => worker.exit, 2000);
        } catch {
          worker.child.kill("SIGKILL");
          await boundedOperation(() => worker.exit, 1000);
        }
      }
    },
    // Used only by synthetic failure tests; closing stdin models parent process loss.
    async killForTest(turnId) {
      if (
        isolation !== "macos-seatbelt" &&
        isolation !== "synthetic-network-none" &&
        isolation !== "linux-bubblewrap"
      )
        fail("forbidden");
      const worker = workers.get(turnId);
      if (worker) {
        worker.child.kill("SIGKILL");
        await boundedOperation(() => worker.exit);
      }
    },
    async disconnectForTest(turnId) {
      if (
        isolation !== "macos-seatbelt" &&
        isolation !== "synthetic-network-none" &&
        isolation !== "linux-bubblewrap"
      )
        fail("forbidden");
      const worker = workers.get(turnId);
      if (worker) {
        worker.child.stdin.end();
        await boundedOperation(() => worker.exit);
      }
    },
  };
}
