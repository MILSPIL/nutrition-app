import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:https";
import { createServer, globalAgent as httpAgent } from "node:http";
import { checkServerIdentity } from "node:tls";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createPhoneGateway,
  validateLabToken,
  unsignedToken,
  PROJECT,
  UID,
  privateHost,
} from "./gateway.mjs";
import { generateTls } from "./tls.mjs";
import { localBudget } from "./sqlite.mjs";
const token = (changes = {}) =>
  unsignedToken({
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: UID,
    user_id: UID,
    iat: Date.now() / 1000 - 1,
    auth_time: Date.now() / 1000 - 1,
    exp: Date.now() / 1000 + 60,
    ...changes,
  });
test("Lab tokens cannot impersonate production or another UID; origin is private IPv4", () => {
  assert.equal(validateLabToken(token()), UID);
  for (const changes of [
    { aud: "nutrition-tracker-ua" },
    { iss: "wrong" },
    { sub: "other" },
    { user_id: "other" },
    { exp: 0 },
    { iat: Date.now() / 1000 + 60 },
    { auth_time: Date.now() / 1000 + 60 },
  ])
    assert.throws(() => validateLabToken(token(changes)));
  assert.throws(() => validateLabToken(token() + "signature"));
  assert.throws(() => validateLabToken("bad"));
  assert.ok(privateHost("192.168.1.8"));
  assert.ok(privateHost("172.16.0.1"));
  for (const host of [
    "0.0.0.0",
    "8.8.8.8",
    "example.com",
    "127.0.0.2",
    "::",
    "172.32.0.1",
  ])
    assert.equal(privateHost(host), false);
});
test("HTTPS pairing, origin, expiry, private static files; no unpaired API", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "scisense-gateway-"));
  const tls = await generateTls("127.0.0.1");
  let time = Date.now(),
    gateway,
    forwarded = 0;
  const upstream = createServer((req, res) => {
    forwarded++;
    res.end("{}");
  });
  await new Promise((resolve) => upstream.listen(9446, "127.0.0.1", resolve));
  const get = (route, method = "GET", headers = {}, body = "") =>
    new Promise((resolve, reject) => {
      const req = request(
        "https://127.0.0.1:9445" + route,
        {
          method,
          ca: tls.ca,
          headers,
          checkServerIdentity: (_, cert) =>
            checkServerIdentity("127.0.0.1", cert),
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks).toString(),
            }),
          );
        },
      );
      req.on("error", reject);
      req.end(body);
    });
  try {
    await writeFile(path.join(dir, "index.html"), "LAB");
    await writeFile(path.join(dir, "category-fixture.webp"), "RIFF0000WEBPfixture");
    gateway = await createPhoneGateway({
      host: "127.0.0.1",
      port: 9445,
      key: tls.key,
      cert: tls.cert,
      buildDir: dir,
      authPort: 9446,
      firestorePort: 9446,
      now: () => time,
    });
    await gateway.listen();
    assert.equal((await get("/lab/status")).status, 401);
    assert.equal(
      (await get("/meal-api/analyze", "POST", { origin: gateway.origin }, "{}"))
        .status,
      401,
    );
    assert.equal(
      (await get("/", "GET", { host: "evil.example:9445" })).status,
      403,
    );
    assert.equal(
      (await get("/lab/setup", "GET", { "sec-fetch-site": "cross-site" }))
        .status,
      403,
    );
    const setup = await get("/lab/setup"),
      code = setup.body.match(/<code>([a-f0-9]+)<\/code>/)[1];
    assert.equal(
      (await get("/lab/pair", "POST", {}, "code=" + code)).status,
      403,
    );
    const pair = await get(
      "/lab/pair",
      "POST",
      { origin: gateway.origin },
      "code=" + code,
    );
    assert.equal(pair.status, 303);
    assert.match(
      pair.headers["set-cookie"][0],
      /Secure; HttpOnly; SameSite=Strict/,
    );
    const cookie = pair.headers["set-cookie"][0].split(";")[0];
    assert.equal(
      (
        await get(
          "/lab/pair",
          "POST",
          { origin: gateway.origin },
          "code=" + code,
        )
      ).status,
      401,
    );
    assert.equal((await get("/", "GET", { cookie })).body, "LAB");
    const icon = await get("/category-fixture.webp", "GET", { cookie });
    assert.equal(icon.status, 200);
    assert.equal(icon.headers["content-type"], "image/webp");
    assert.equal(icon.body, "RIFF0000WEBPfixture");
    assert.equal(
      (await get("/lab/status", "GET", { cookie })).body,
      JSON.stringify({ project: PROJECT, uid: UID, live: false, mode: "full" }),
    );
    assert.equal(
      (
        await get("/lab/token", "POST", {
          cookie,
          origin: "https://evil.example",
        })
      ).status,
      403,
    );
    assert.equal(
      (await get("/lab/token", "POST", { cookie, origin: gateway.origin }))
        .status,
      200,
    );
    assert.equal(
      (
        await get(
          "/meal-api/analyze",
          "POST",
          { cookie, origin: gateway.origin, authorization: "Bearer bad" },
          "{}",
        )
      ).status,
      401,
    );
    assert.equal(
      (await get("/%2e%2e/gateway.mjs", "GET", { cookie })).status,
      404,
    );
    const authHeaders = {
      cookie,
      origin: gateway.origin,
      "content-type": "application/json",
    };
    assert.equal(
      (
        await get(
          "/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken",
          "POST",
          authHeaders,
          JSON.stringify({
            token: unsignedToken({ uid: "foreign", iss: "wrong" }),
          }),
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await get(
          "/google.firestore.v1.Firestore/Commit",
          "POST",
          { ...authHeaders, authorization: "Bearer owner" },
          "{}",
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await get(
          "/google.firestore.v1.Firestore/Write/channel?database=projects/foreign/databases/(default)",
          "POST",
          authHeaders,
          "",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await get(
          "/google.firestore.v1.Firestore/Write/channel?database=projects/demo-scisense/databases/(default)&SID=unregistered",
          "POST",
          authHeaders,
          "",
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await get(
          "/v1/projects/demo-scisense/databases/(default)/documents:commit",
          "POST",
          {
            ...authHeaders,
            authorization: "Bearer " + token({ sub: "foreign" }),
          },
          "{}",
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await get(
          "/v1/projects/demo-scisense/databases/(default)/documents:commit",
          "POST",
          { ...authHeaders, authorization: "Bearer " + token() },
          JSON.stringify({
            writes: [
              {
                update: {
                  name: "projects/foreign/databases/(default)/documents/test",
                },
              },
            ],
          }),
        )
      ).status,
      403,
    );
    const ownerHeaders = encodeURIComponent("Authorization: Bearer owner\r\n");
    assert.equal(
      (
        await get(
          "/google.firestore.v1.Firestore/Write/channel?database=projects/demo-scisense/databases/(default)&$httpHeaders=" +
            ownerHeaders,
          "POST",
          { ...authHeaders, authorization: "Bearer " + token() },
          "",
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await get(
          "/google.firestore.v1.Firestore/Write/channel?database=projects/demo-scisense/databases/(default)",
          "POST",
          { ...authHeaders, authorization: "Bearer " + token() },
          "headers=" + ownerHeaders,
        )
      ).status,
      401,
    );
    assert.equal(forwarded, 0);
    time += 4 * 60 * 60 * 1000 + 1;
    assert.equal((await get("/lab/status", "GET", { cookie })).status, 401);
  } finally {
    await gateway?.close();
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
test("Local SQLite cannot silently recreate lost budget; restart and other UID keep spend", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "scisense-sqlite-")),
    file = path.join(dir, "budget.sqlite");
  let budget;
  const call = (id, uid = "a") =>
    new Request("https://budget/reserve", {
      method: "POST",
      body: JSON.stringify({
        action: "reserve",
        id: `phone-test-request-${id}`,
        uid: uid.repeat(64),
        cost: 60,
      }),
    });
  try {
    assert.throws(() => localBudget(file, 100));
    await rm(file, { force: true });
    budget = localBudget(file, 100, { initialize: true });
    assert.equal((await budget.binding.get().fetch(call(1))).status, 200);
    budget.close();
    budget = localBudget(file, 100);
    assert.equal(budget.spent(), 60);
    assert.equal((await budget.binding.get().fetch(call(2, "b"))).status, 429);
    budget.close();
    budget = null;
    assert.throws(() => localBudget(file, 101));
    await writeFile(file, "");
    assert.throws(() => localBudget(file, 100));
    await rm(file);
    assert.throws(() => localBudget(file, 100));
  } finally {
    budget?.close();
    await rm(dir, { recursive: true, force: true });
  }
});


test("emulator proxy observes resets without retries and aborts disconnected streams", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "scisense-proxy-reuse-")), tls = await generateTls("127.0.0.1");
  const previousMax = httpAgent.maxSockets; httpAgent.maxSockets = 1;
  let gateway, forwarded = 0, streamed = false, streamClosed; const proxyErrors = [];
  const stopped = new Promise(resolve => { streamClosed = resolve; });
  const upstream = createServer((req, res) => {
    forwarded++; req.resume();
    if (req.headers["x-goog-api-client"] === "synthetic-reset") { req.socket.destroy(); return; }
    if (req.headers["x-goog-api-client"] === "synthetic-stream") {
      streamed = true; res.writeHead(200, { "Content-Type": "application/json" }); res.write("["); res.once("close", streamClosed);
    } else res.end("[]");
  });
  await new Promise(resolve => upstream.listen(9448, "127.0.0.1", resolve));
  const get = (route, method = "GET", headers = {}, body = "") => new Promise((resolve, reject) => {
    const req = request("https://127.0.0.1:9447" + route, { method, ca: tls.ca, headers }, res => {
      const chunks = []; res.on("data", value => chunks.push(value));
      res.once("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    }); req.once("error", reject); req.end(body);
  });
  try {
    await writeFile(path.join(dir, "index.html"), "LAB");
    gateway = await createPhoneGateway({ host: "127.0.0.1", port: 9447, key: tls.key, cert: tls.cert,
      buildDir: dir, authPort: 9448, firestorePort: 9448, onProxyError: error => proxyErrors.push(error) }); await gateway.listen();
    const setup = await get("/lab/setup"), code = setup.body.match(/<code>([a-f0-9]+)<\/code>/)[1];
    const pair = await get("/lab/pair", "POST", { origin: gateway.origin }, "code=" + code);
    const headers = { cookie: pair.headers["set-cookie"][0].split(";")[0], origin: gateway.origin,
      authorization: "Bearer " + token(), "content-type": "application/json" };
    const route = "/v1/projects/demo-scisense/databases/(default)/documents:batchGet";
    const body = JSON.stringify({ documents: ["projects/demo-scisense/databases/(default)/documents/users/" + UID] });
    const results = await Promise.all(Array.from({ length: 16 }, () => get(route, "POST", headers, body)));
    assert.deepEqual(results.map(value => value.status), Array(16).fill(200));
    assert.equal(forwarded, 16);
    const reset = await get(route, "POST", { ...headers, "x-goog-api-client": "synthetic-reset" }, body);
    assert.equal(reset.status, 502); assert.equal(forwarded, 17);
    assert.equal(proxyErrors.length, 1); assert.equal(proxyErrors[0].code, "ECONNRESET");
    assert.equal(JSON.stringify(proxyErrors).includes(headers.authorization), false);
    await new Promise((resolve, reject) => {
      const req = request("https://127.0.0.1:9447" + route, { method: "POST", ca: tls.ca,
        headers: { ...headers, "x-goog-api-client": "synthetic-stream" } }, res => {
        res.once("data", () => { req.destroy(); resolve(); });
      }); req.once("error", error => { if (!streamed) reject(error); }); req.end(body);
    });
    await Promise.race([stopped, new Promise((_, reject) => setTimeout(() => reject(Error("upstream_stream_not_aborted")), 2000))]);
    assert.equal(streamed, true);
  } finally {
    httpAgent.maxSockets = previousMax;
    await gateway?.close(); upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
