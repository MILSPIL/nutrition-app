// Лише локальна телефонна лабораторія. Production Worker не імпортує цей модуль.
import { createServer } from "node:https";
import { request as httpRequest } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import path from "node:path";
import { createHandler } from "../../workers/meal-parser/src/index.js";

export const PROJECT = "demo-scisense";
export const UID = "scisense-phone-test";
const COOKIE = "__Host-scisense-lab";
const MAX_BODY = 15 * 1024 * 1024;
const SESSION_MS = 4 * 60 * 60 * 1000;
const deny = (code = "unauthorized", status = 401) =>
  Object.assign(Error(code), { status });
export function privateHost(host) {
  if (isIP(host) !== 4) return false;
  const [a, b] = host.split(".").map(Number);
  return (
    host === "127.0.0.1" ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}
export function unsignedToken(payload) {
  return (
    [{ alg: "none", typ: "JWT" }, payload]
      .map((x) => Buffer.from(JSON.stringify(x)).toString("base64url"))
      .join(".") + "."
  );
}
export function validateLabToken(token, now = Date.now()) {
  try {
    const parts = token.split(".");
    const header = JSON.parse(Buffer.from(parts[0], "base64url"));
    const body = JSON.parse(Buffer.from(parts[1], "base64url"));
    if (
      parts.length !== 3 ||
      parts[2] !== "" ||
      header.alg !== "none" ||
      body.iss !== `https://securetoken.google.com/${PROJECT}` ||
      body.aud !== PROJECT ||
      body.sub !== UID ||
      body.user_id !== UID ||
      !Number.isFinite(body.exp) ||
      body.exp <= now / 1000 ||
      !Number.isFinite(body.iat) ||
      body.iat > now / 1000 ||
      !Number.isFinite(body.auth_time) ||
      body.auth_time > now / 1000
    )
      throw deny();
    return UID;
  } catch {
    throw deny();
  }
}
async function bodyOf(req, limit = MAX_BODY) {
  if (Number(req.headers["content-length"]) > limit)
    throw deny("media_too_large", 413);
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw deny("media_too_large", 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function send(res, status, value, type = "application/json") {
  res.writeHead(status, { "Content-Type": type });
  res.end(
    type === "application/json" && !Buffer.isBuffer(value)
      ? JSON.stringify(value)
      : value,
  );
}
const page = (content) =>
  `<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>SciSense: лабораторія</title><style>body{font:18px system-ui;max-width:560px;margin:10vh auto;padding:24px}input,button{font:inherit;padding:14px;box-sizing:border-box;width:100%;margin:8px 0}code{font-size:24px}p{line-height:1.5}</style><h1>SciSense: тест із телефона</h1>${content}</html>`;
const pairPage = (live) => page(
  `<p>Тестова база на Mac. ${live ? 'Whisper + Sonnet увімкнені. Ліміт тесту $5.' : 'Реальні API поки вимкнені.'}</p><p>Введіть одноразовий код зі сторінки налаштування на Mac.</p><form method="post" action="/lab/pair"><label>Код сполучення<input name="code" autocomplete="off" required maxlength="24"></label><button>Підключити телефон</button></form>`,
);

export async function createPhoneGateway({
  host,
  port = 8443,
  key,
  cert,
  buildDir,
  authPort = 9099,
  firestorePort = 8088,
  apiEnv = {},
  provider,
  localTranscription = false,
  now = Date.now,
}) {
  if (
    !privateHost(host) ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535
  )
    throw Error("Private IPv4 and explicit port required");
  const origin = `https://${host}:${port}`,
    root = await realpath(buildDir);
  // Явно не успадковуємо ключі або LIVE_ENABLED із process.env.
  const env = {
    ...apiEnv,
    ALLOWED_ORIGINS: origin,
    FIREBASE_PROJECT: PROJECT,
    ALLOWED_UIDS: UID,
  };
  let pairing = randomBytes(6).toString("hex"),
    paired = null,
    pairExpires = now() + 15 * 60 * 1000;
  let attempts = [],
    closed = false;
  const channelIds = new Set();
  const pairedRequest = (req) => {
    const value = (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(COOKIE + "="))
      ?.slice(COOKIE.length + 1);
    return (
      paired &&
      paired.expires > now() &&
      value?.length === paired.value.length &&
      timingSafeEqual(Buffer.from(value), Buffer.from(paired.value))
    );
  };
  const handler = createHandler({
    provider,
    localTranscription,
    authenticate: async (request) => {
      const token = request.headers
        .get("Authorization")
        ?.match(/^Bearer (\S+)$/)?.[1];
      validateLabToken(token || "", now());
      // Наявність demo JWT сама по собі не достатня: cookie перевіряється до handler,
      // а тут підтверджуємо існування користувача в окремому emulator.
      const response = await fetch(
        `http://127.0.0.1:${authPort}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=demo-key`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: token }),
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!response.ok || (await response.json()).users?.[0]?.localId !== UID)
        throw deny();
      return UID;
    },
  });
  const server = createServer(
    {
      key,
      cert,
      minVersion: "TLSv1.2",
      requestTimeout: 65000,
      headersTimeout: 10000,
    },
    async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Referrer-Policy", "same-origin");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Permissions-Policy", "microphone=(self), camera=(self)");
      try {
        if (
          req.headers.host !== `${host}:${port}` ||
          (req.headers.origin && req.headers.origin !== origin) ||
          req.headers["sec-fetch-site"] === "cross-site"
        )
          throw deny("origin_forbidden", 403);
        if (!req.url.startsWith("/") || req.url.startsWith("//"))
          throw deny("not_found", 404);
        const url = new URL(req.url, origin),
          pathname = url.pathname;
        if (pathname === "/lab/setup" && req.method === "GET") {
          // Код доступний тільки з самого Mac; remoteAddress не береться з proxy headers.
          if (
            ![host, "127.0.0.1", "::ffff:127.0.0.1"].includes(
              req.socket.remoteAddress,
            )
          )
            throw deny("local_only", 403);
          const content =
            pairing && pairExpires > now()
              ? `<p>На телефоні відкрийте ${origin} і введіть код:</p><code>${pairing}</code><p>Код діє 15 хвилин і лише один раз. ${env.LIVE_ENABLED === 'true' ? 'Whisper + Sonnet увімкнені, ліміт $5.' : 'API вимкнені.'}</p>`
              : "<p>Код використано або час сплив. Для нового сполучення перезапустіть лабораторію.</p>";
          return send(res, 200, page(content), "text/html; charset=utf-8");
        }
        if (pathname === "/lab/pair" && req.method === "POST") {
          if (req.headers.origin !== origin)
            throw deny("origin_forbidden", 403);
          attempts = attempts.filter((time) => time > now() - 60000);
          if (attempts.length >= 5) throw deny("rate_limited", 429);
          attempts.push(now());
          const code = new URLSearchParams(
            (await bodyOf(req, 1024)).toString(),
          ).get("code");
          if (
            !pairing ||
            pairExpires <= now() ||
            code?.length !== pairing.length ||
            !timingSafeEqual(Buffer.from(code), Buffer.from(pairing))
          )
            throw deny();
          paired = {
            value: randomBytes(32).toString("hex"),
            expires: now() + SESSION_MS,
          };
          pairing = null;
          res.writeHead(303, {
            Location: "/",
            "Set-Cookie": `${COOKIE}=${paired.value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}`,
          });
          return res.end();
        }
        if (!pairedRequest(req)) {
          if (pathname === "/" && req.method === "GET")
            return send(res, 200, pairPage(env.LIVE_ENABLED === "true"), "text/html; charset=utf-8");
          throw deny();
        }
        if (pathname === "/lab/token" && req.method === "POST") {
          if (req.headers.origin !== origin)
            throw deny("origin_forbidden", 403);
          return send(res, 200, {
            token: unsignedToken({
              uid: UID,
              iat: Math.floor(now() / 1000),
              exp: Math.floor(now() / 1000) + 3600,
              aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
              iss: "lab@demo-scisense.iam.gserviceaccount.com",
              sub: "lab@demo-scisense.iam.gserviceaccount.com",
            }),
          });
        }
        if (pathname === "/lab/status" && req.method === "GET")
          return send(res, 200, {
            project: PROJECT,
            uid: UID,
            live: env.LIVE_ENABLED === "true",
          });
        if (/^\/meal-api\/(transcribe|analyze)$/.test(pathname)) {
          if (req.method !== "POST" || req.headers.origin !== origin)
            throw deny("origin_forbidden", 403);
          const controller = new AbortController();
          const abort = () => { if (!res.writableEnded) controller.abort(); };
          res.once("close", abort);
          try {
          const response = await handler.fetch(
            new Request(origin + pathname.replace("/meal-api", ""), {
              method: "POST",
              headers: {
                Authorization: req.headers.authorization || "",
                Origin: origin,
                "Content-Type": req.headers["content-type"] || "",
              },
              body: await bodyOf(req),
              signal: controller.signal,
            }),
            env,
          );
          res.writeHead(response.status, Object.fromEntries(response.headers));
          return res.end(Buffer.from(await response.arrayBuffer()));
          } finally { res.off("close", abort); }
        }
        let upstream;
        const database = `projects/${PROJECT}/databases/(default)`;
        const channel =
          /^\/google\.firestore\.v1\.Firestore\/(Listen|Write)\/channel$/.test(
            pathname,
          );
        const unary =
          pathname === `/v1/${database}/documents:batchGet` ||
          pathname === `/v1/${database}/documents:commit`;

        const authRoute =
          /^\/identitytoolkit\.googleapis\.com\/v1\/accounts:(signInWithCustomToken|lookup)$/.test(
            pathname,
          ) || pathname === "/securetoken.googleapis.com/v1/token";
        if (authRoute) upstream = authPort;
        if (channel || unary) upstream = firestorePort;
        if (upstream) {
          if (!["GET", "POST"].includes(req.method))
            throw deny("method_not_allowed", 405);
          // Фіксований loopback upstream, без cookie та proxy/host headers браузера.
          const bytes = req.method === "POST" ? await bodyOf(req) : undefined;
          if (authRoute) {
            if (req.method !== "POST") throw deny("method_not_allowed", 405);
            let body;
            try {
              body = pathname.includes("securetoken")
                ? Object.fromEntries(new URLSearchParams(bytes.toString()))
                : JSON.parse(bytes);
            } catch {
              throw deny("bad_request", 400);
            }
            if (pathname.endsWith("signInWithCustomToken")) {
              try {
                const parts = body.token.split("."),
                  claims = JSON.parse(Buffer.from(parts[1], "base64url"));
                if (
                  parts.length !== 3 ||
                  parts[2] !== "" ||
                  JSON.parse(Buffer.from(parts[0], "base64url")).alg !==
                    "none" ||
                  claims.uid !== UID ||
                  claims.iss !== "lab@demo-scisense.iam.gserviceaccount.com"
                )
                  throw deny();
              } catch {
                throw deny();
              }
            } else if (pathname.endsWith("lookup"))
              validateLabToken(body.idToken || "", now());
            const response = await fetch(
              `http://127.0.0.1:${authPort}${url.pathname}${url.search}`,
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    req.headers["content-type"] || "application/json",
                },
                body: bytes,
                signal: AbortSignal.timeout(5000),
              },
            );
            const data = await response.json();
            if (!response.ok) throw deny("unauthorized", 401);
            if (data.idToken || data.id_token)
              validateLabToken(data.idToken || data.id_token, now());
            if (
              data.users &&
              (data.users.length !== 1 || data.users[0].localId !== UID)
            )
              throw deny();
            return send(res, 200, data);
          }
          if (channel && url.searchParams.get("database") !== database)
            throw deny("project_forbidden", 403);
          const params = channel
            ? new URLSearchParams(bytes?.toString())
            : null;
          for (const key of ["database", "SID", "$httpHeaders"])
            if (url.searchParams.getAll(key).length > 1)
              throw deny("bad_request", 400);
          if (
            (params?.getAll("headers").length || 0) > 1 ||
            url.searchParams.has("headers") ||
            params?.has("$httpHeaders")
          )
            throw deny("bad_request", 400);
          const carriers = [req.headers.authorization].filter(Boolean);
          for (const encoded of [
            params?.get("headers"),
            url.searchParams.get("$httpHeaders"),
          ].filter(Boolean)) {
            const matches = encoded
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter((line) => /^authorization\s*:/i.test(line));
            if (matches.length > 1) throw deny();
            if (matches.length)
              carriers.push(
                matches[0].replace(/^authorization\s*:/i, "").trim(),
              );
          }
          if (
            req.rawHeaders
              .filter((_, index) => index % 2 === 0)
              .filter((name) => name.toLowerCase() === "authorization").length >
            1
          )
            throw deny();
          for (const bearer of carriers) {
            if (!/^Bearer \S+$/.test(bearer)) throw deny();
            validateLabToken(bearer.slice(7), now());
          }
          if (new Set(carriers).size > 1) throw deny();
          const sid = url.searchParams.get("SID");
          if (!carriers.length && (!channel || !sid || !channelIds.has(sid)))
            throw deny();
          if (sid && !channelIds.has(sid)) throw deny();
          const checkPaths = (value) => {
            if (
              typeof value === "string" &&
              value.startsWith("projects/") &&
              value !== database &&
              !value.startsWith(database + "/")
            )
              throw deny("project_forbidden", 403);
            if (value && typeof value === "object")
              for (const item of Object.values(value)) checkPaths(item);
          };
          if (unary) {
            try {
              checkPaths(JSON.parse(bytes));
            } catch (error) {
              if (error.status) throw error;
              throw deny("bad_request", 400);
            }
          }
          if (channel && params)
            for (const [key, value] of params)
              if (/^req\d+___data__$/.test(key)) {
                try {
                  checkPaths(JSON.parse(value));
                } catch (error) {
                  if (error.status) throw error;
                  throw deny("bad_request", 400);
                }
              }
          const headers = {};
          for (const name of [
            "content-type",
            "authorization",
            "x-goog-api-client",
            "x-goog-request-params",
            "x-firebase-gmpid",
          ])
            if (req.headers[name]) headers[name] = req.headers[name];
          if (bytes) headers["content-length"] = bytes.length;
          const proxy = httpRequest(
            {
              host: "127.0.0.1",
              port: upstream,
              path: url.pathname + url.search,
              method: req.method,
              headers,
            },
            (incoming) => {
              res.writeHead(incoming.statusCode, {
                "Content-Type":
                  incoming.headers["content-type"] || "application/json",
              });
              if (channel && !sid) {
                let prefix = "";
                incoming.on("data", (chunk) => {
                  if (prefix.length < 65536) prefix += chunk.toString();
                  const id = prefix.match(/\[\s*"c"\s*,\s*"([^"]+)"/)?.[1];
                  if (id && channelIds.size < 512) channelIds.add(id);
                });
              }
              incoming.pipe(res);
              incoming.on("error", () => res.destroy());
            },
          );
          proxy.setTimeout(60000, () => proxy.destroy());
          proxy.on("error", () => {
            if (!res.headersSent)
              send(res, 502, { error: "emulator_unavailable" });
            else res.destroy();
          });
          res.on("close", () => proxy.destroy());
          proxy.end(bytes);
          return;
        }
        if (req.method !== "GET") throw deny("not_found", 404);
        const requested =
          pathname === "/"
            ? "index.html"
            : decodeURIComponent(pathname).slice(1);
        const file = await realpath(path.resolve(root, requested));
        if (!file.startsWith(root + path.sep)) throw deny("not_found", 404);
        const type =
          {
            ".html": "text/html; charset=utf-8",
            ".js": "application/javascript",
            ".css": "text/css",
            ".png": "image/png",
            ".ico": "image/x-icon",
            ".json": "application/json",
            ".svg": "image/svg+xml",
          }[path.extname(file)] || "application/octet-stream";
        return send(res, 200, await readFile(file), type);
      } catch (error) {
        if (!res.headersSent)
          send(res, error.status || 404, {
            error: error.status ? error.message : "not_found",
          });
        else res.destroy();
      }
    },
  );
  server.on("clientError", (_, socket) => socket.destroy());
  return {
    origin,
    server,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, resolve);
      }),
    close: async () => {
      if (closed) return;
      closed = true;
      paired = null;
      pairing = null;
      channelIds.clear();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
