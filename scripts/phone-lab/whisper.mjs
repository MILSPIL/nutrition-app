import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
export const WHISPER_SOURCE = "d1be6fde11ac6e0407606b4e42fe72d34add8037";
export const WHISPER_MODEL_SHA1 = "e050f7970618a659205450ad97eb95a18d69c9ee";
export async function verifyWhisper(runtime) {
  if (runtime?.sourceCommit !== WHISPER_SOURCE || runtime?.modelSha1 !== WHISPER_MODEL_SHA1)
    throw Error("whisper_unverified");
  await access(runtime.binary, constants.X_OK);
  const hash = createHash("sha1");
  for await (const chunk of createReadStream(runtime.model)) hash.update(chunk);
  if (hash.digest("hex") !== WHISPER_MODEL_SHA1) throw Error("whisper_unverified");
}
// Кожен запис має власний процес і контекст. Аудіо лише stdin, результат лише pipe.
export function createWhisper({ binary, model, timeoutMs = 45000, spawnProcess = spawn }) {
  const active = new Map();
  let closed = false;
  return {
    async transcribe(payload, { signal } = {}) {
      if (closed || active.size) throw Object.assign(Error("upstream_limited"), { status: 429 });
      if (signal?.aborted) throw Error("upstream_timeout");
      const bytes = Buffer.from(await payload.file.arrayBuffer());
      // Тиша не повинна перетворюватися на вигаданий продукт Whisper.
      let audible = 0;
      for (let i = 44; i + 1 < bytes.length; i += 2) if (Math.abs(bytes.readInt16LE(i)) > 128) audible++;
      if (audible < 800) throw Error("empty_transcript");
      if (closed || active.size) throw Object.assign(Error("upstream_limited"), { status: 429 });
      return new Promise((resolve, reject) => {
        let child, timer, killer, failure, closedResolve, size = 0, settled = false;
        const chunks = [];
        const finish = (error, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer); clearTimeout(killer);
          signal?.removeEventListener("abort", abort);
          active.delete(stop);
          closedResolve?.();
          bytes.fill(0);
          error ? reject(Error(error)) : resolve(value);
        };
        const stop = (reason = "upstream_timeout") => {
          if (failure) return;
          failure = reason;
          child?.kill("SIGTERM");
          killer = setTimeout(() => child?.kill("SIGKILL"), 1000);
        };
        const abort = () => stop();
        try {
          child = spawnProcess(binary, ["-m", model, "-f", "-", "-otxt", "-l", "auto", "-np", "-nt", "-sns", "-t", "4"], {
            stdio: ["pipe", "pipe", "ignore"],
            env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR },
          });
          active.set(stop, new Promise(resolve => { closedResolve = resolve; }));
          timer = setTimeout(stop, timeoutMs);
          signal?.addEventListener("abort", abort, { once: true });
          if (signal?.aborted) stop();
          child.on("error", () => finish("upstream_failed"));
          child.stdin.on("error", () => stop("upstream_failed"));
          child.stdout.on("data", (chunk) => {
            size += chunk.length;
            if (size > 32000) return stop("invalid_response");
            chunks.push(chunk);
          });
          child.on("close", (code) => {
            if (failure || code !== 0) return finish(failure || "upstream_failed");
            const text = Buffer.concat(chunks).toString("utf8").trim();
            if (!text || text.length > 8000) return finish("empty_transcript");
            finish(null, { text });
          });
          child.stdin.end(bytes);
        } catch { finish("upstream_failed"); }
      });
    },
    async close() { closed = true; for (const stop of active.keys()) stop(); await Promise.all(active.values()); },
  };
}
