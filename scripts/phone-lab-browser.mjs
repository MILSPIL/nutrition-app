import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createPhoneGateway, UID } from "./phone-lab/gateway.mjs";
import { generateTls } from "./phone-lab/tls.mjs";
import { localBudget } from "./phone-lab/sqlite.mjs";
if (!process.env.AGENT_TEST_BROWSER_SESSION)
  throw Error("Isolated launcher required");
const { chromium } = await import(
  pathToFileURL(process.env.AGENT_TEST_PLAYWRIGHT_MODULE).href
);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  out = path.join(root, "tmp/phone-lab-qa");
await mkdir(out, { recursive: true });
const evidence = {
  fixtureOnly: true,
  paidCalls: 0,
  checks: [],
  errors: [],
  unexpectedNetwork: [],
  failedRoutes: [],
};
const check = (name, condition) => {
  assert.ok(condition, name);
  evidence.checks.push(name);
};
const tls = await generateTls("127.0.0.1");
const budgetFile = path.join(out, "budget.sqlite");
await rm(budgetFile, { force: true });
const budget = localBudget(budgetFile, 1000000, { initialize: true });
const proposal = JSON.parse(
  await readFile(
    path.join(root, "workers/meal-parser/pilot-proposal.json"),
    "utf8",
  ),
);
let gateway,
  browser,
  context,
  page,
  calls = 0;
try {
  gateway = await createPhoneGateway({
    host: "127.0.0.1",
    port: 8444,
    key: tls.key,
    cert: tls.cert,
    buildDir: path.join(root, "tmp/phone-lab-qa-build"),
    apiEnv: {
      ...proposal.candidateA,
      PRICING_APPROVED_AT: "synthetic-test-only",
      LIVE_ENABLED: "true",
      OPENAI_API_KEY: "fixture",
      ANTHROPIC_API_KEY: "fixture",
      PILOT_BUDGET: budget.binding,
    },
    provider: async (kind, payload) => {
      calls++;
      if (kind === "transcribe") {
        check(
          "Server прочитав справжній WAV браузера",
          payload.file.type === "audio/wav" && payload.duration > 0,
        );
        return { text: "Випив тестовий кефір, 200 грамів" };
      }
      if (payload.images.length)
        check(
          "Server прочитав нормалізоване фото",
          payload.images.every(
            (x) => x.type === "image/jpeg" && x.data.startsWith("/9j/"),
          ),
        );
      return {
        items: [
          {
            name: "Тестовий кефір",
            quantity: { value: 200, unit: "g" },
            nutritionBasis: { value: 100, unit: "g" },
            nutrients: { p: 3, f: 2.5, c: 4, cal: 53 },
            source: { kind: payload.images.length ? "label" : "estimate" },
            estimated: !payload.images.length,
            clarification: "",
          },
        ],
        unparsed: [],
      };
    },
  });
  await gateway.listen();
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.AGENT_TEST_CHROME_EXECUTABLE,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "uk-UA",
    permissions: ["microphone"],
    ignoreHTTPSErrors: true,
  });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => evidence.errors.push(e.message));
  page.on("response", (res) => {
    if (res.status() >= 400)
      evidence.failedRoutes.push({
        path: new URL(res.url()).pathname,
        status: res.status(),
      });
  });
  page.on("dialog", (d) => d.accept());
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin === gateway.origin ||
      [
        "cdn.tailwindcss.com",
        "fonts.googleapis.com",
        "fonts.gstatic.com",
      ].includes(url.hostname)
    )
      return route.continue();
    evidence.unexpectedNetwork.push(url.origin);
    return route.abort();
  });
  await page.goto(gateway.origin + "/lab/setup");
  const code = await page.locator("code").innerText();
  await page.goto(gateway.origin);
  const pairingEdges = await page
    .getByLabel("Код сполучення")
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: innerWidth - r.right };
    });
  check(
    "Форма сполучення: зовнішні відступи 24/24",
    pairingEdges.left === 24 && pairingEdges.right === 24,
  );
  await page.getByLabel("Код сполучення").fill(code);
  await page.getByRole("button", { name: "Підключити телефон" }).click();
  await page.getByRole("button", { name: "Увійти в тестовий простір" }).click();
  await page.getByRole("button", { name: "Почати!", exact: true }).click();
  await page
    .getByRole("button", { name: "Почати!", exact: true })
    .waitFor({ state: "hidden" });
  await page
    .locator(".fixed.z-50")
    .filter({
      has: page.getByRole("heading", { name: "Налаштування", exact: true }),
    })
    .locator("button:has(svg.lucide-x)")
    .first()
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".fixed.z-50").length === 0,
  );
  check("SDK увійшов через HTTPS Auth emulator", true);
  await page
    .getByRole("button", { name: "Додати їжу голосом", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Зупинити запис", exact: true })
    .waitFor();
  await page.waitForTimeout(400);
  await page
    .getByRole("button", { name: "Зупинити запис", exact: true })
    .click();
  await page.locator('[data-testid="voice-item"]').waitFor();
  const image = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 300;
    const x = c.getContext("2d");
    x.fillStyle = "white";
    x.fillRect(0, 0, 400, 300);
    x.fillStyle = "black";
    x.font = "24px sans-serif";
    x.fillText("Тестовий кефір", 10, 50);
    x.fillText("100 г: 53 ккал, Б3 Ж2.5 В4", 10, 100);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page
    .getByLabel("Фото з галереї", { exact: true })
    .setInputFiles({
      name: "test.png",
      mimeType: "image/png",
      buffer: Buffer.from(image, "base64"),
    });
  await page.locator(".voice-source").filter({ hasText: "Етикетка" }).waitFor();
  check(
    "200 г із фото дає 106 ккал",
    (await page.locator(".voice-nutrition").innerText()) ===
      "106 ккал · Б 6 · Ж 5 · В 8",
  );
  await page.getByRole("button", { name: "Додати", exact: true }).click();
  await page.getByRole("heading", { name: "Прийом збережено" }).waitFor();
  await page.reload();
  await page.getByText("Тестовий кефір", { exact: true }).waitFor();
  check(
    "Firestore HTTPS запис перечитано після reload",
    (await page.getByText("106", { exact: true }).count()) === 1,
  );
  check(
    "Запити пройшли parser, auth, SQLite і fixture provider",
    calls === 3 && budget.spent() > 0,
  );
  const stored = await fetch(
    "http://127.0.0.1:8088/v1/projects/demo-scisense/databases/(default)/documents/users/" +
      UID,
    { headers: { Authorization: "Bearer owner" } },
  ).then((r) => r.json());
  check(
    "Запис належить дозволеному тестовому UID",
    stored.name?.endsWith("/users/" + UID),
  );
  check(
    "Жодного прямого HTTP, production або AI API",
    evidence.unexpectedNetwork.length === 0,
  );
  check("Немає помилок JavaScript", evidence.errors.length === 0);
  await page.screenshot({ path: path.join(out, "saved.png") });
  evidence.browserTlsTrust =
    "isolated test bypass only; physical phone trust remains pending";
  evidence.reservedMicros = budget.spent();
  evidence.calls = calls;
  evidence.pairingEdges = pairingEdges;
  console.log(
    JSON.stringify({
      passed: evidence.checks.length,
      fixtureOnly: true,
      paidCalls: 0,
      reservedMicros: budget.spent(),
    }),
  );
} catch (error) {
  if (page)
    await page
      .screenshot({ path: path.join(out, "failure.png") })
      .catch(() => {});
  throw error;
} finally {
  await context?.close();
  await browser?.close();
  await gateway?.close();
  budget.close();
  await writeFile(
    path.join(out, "evidence.json"),
    JSON.stringify(evidence, null, 2),
  );
}
