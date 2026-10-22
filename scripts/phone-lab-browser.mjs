import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createPhoneGateway, UID } from "./phone-lab/gateway.mjs";
import { generateTls } from "./phone-lab/tls.mjs";
import { localBudget } from "./phone-lab/sqlite.mjs";
import { callProvider } from "../workers/meal-parser/src/providers.js";
import { browserRuntime } from "./browser-runtime.mjs";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--stt-only")) throw Error("unknown_qa_argument");
const sttOnly = args.includes("--stt-only");
const mode = sttOnly ? "stt_only" : "full";
const language = sttOnly ? "ru" : "uk";
const transcript = "Випив тестовий кефір, 200 грамів";
const { chromium } = await browserRuntime();
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, sttOnly ? "tmp/phone-lab-stt-only-qa" : "tmp/phone-lab-qa");
await mkdir(out, { recursive: true });
const evidence = {
  mode,
  fixtureOnly: true,
  paidCalls: 0,
  checks: [],
  errors: [],
  unexpectedNetwork: [],
  blockedSdkConnectivityProbes: 0,
  failedRoutes: [],
  providerCalls: { transcribe: 0, analyze: 0 },
  apiRequests: { transcribe: 0, analyze: 0 },
  groqTransport: [],
  mealCommits: 0,
  geometry: [],
  cleanup: {},
};
const check = (name, condition) => {
  assert.ok(condition, name);
  evidence.checks.push(name);
};
const proposal = JSON.parse(
  await readFile(path.join(root, "workers/meal-parser/pilot-proposal.json"), "utf8"),
);
let tls, budget, gateway, browser, context, page;

async function measureLanguage(viewport) {
  await page.setViewportSize(viewport);
  await page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const geometry = await page.getByLabel("Мова розпізнавання").evaluate((el) => {
    const rect = (node) => {
      const { left, right, top, bottom, width, height } = node.getBoundingClientRect();
      return { left, right, top, bottom, width, height };
    };
    const panel = el.closest(".voice-panel");
    const body = panel.querySelector(".voice-body");
    const select = rect(el);
    const label = rect(el.closest("label"));
    const heading = rect(panel.querySelector("h2"));
    const recording = rect(panel.querySelector(".voice-recording"));
    const stop = rect(panel.querySelector(".voice-recording button"));
    const bodyRect = rect(body);
    const css = getComputedStyle(body);
    const content = {
      left: bodyRect.left + parseFloat(css.paddingLeft),
      right: bodyRect.right - parseFloat(css.paddingRight),
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      select, label, heading, recording, stop, body: bodyRect,
      deltas: {
        selectToLabelLeft: select.left - label.left,
        selectToLabelRight: select.right - label.right,
        selectToHeadingLeft: select.left - heading.left,
        selectToStopLeft: select.left - stop.left,
        selectToStopRight: select.right - stop.right,
        selectToBodyContentLeft: select.left - content.left,
        selectToBodyContentRight: select.right - content.right,
        selectToRecordingGap: recording.top - select.bottom,
      },
    };
  });
  evidence.geometry.push(geometry);
  const { selectToRecordingGap, ...horizontal } = geometry.deltas;
  check(`Мова ${viewport.width}: горизонтальні відхилення 0 px`,
    Object.values(horizontal).every((value) => value === 0));
  check(`Мова ${viewport.width}: проміжок до запису 10 px`, selectToRecordingGap === 10);
  await page.screenshot({ path: path.join(out, `recording-${viewport.width}.png`) });
}

try {
  tls = await generateTls("127.0.0.1");
  const budgetFile = path.join(out, "budget.sqlite");
  await rm(budgetFile, { force: true });
  budget = localBudget(budgetFile, 5000000, { initialize: true, groqFree: true });
  const apiEnv = {
    ...proposal.candidateC,
    INFERENCE_MODE: mode,
    LIVE_ENABLED: "true",
    GROQ_FREE_APPROVED_AT: new Date(Date.now() - 60000).toISOString(),
    GROQ_FREE_LIMITS: "true",
    GROQ_API_KEY: "fixture-groq-only",
    PRICING_APPROVED_AT: sttOnly ? "" : "synthetic-test-only",
    ...(sttOnly ? {} : { ANTHROPIC_API_KEY: "fixture-anthropic-only" }),
    PILOT_BUDGET: budget.binding,
  };
  check("STT-only не має ключа Anthropic", !sttOnly || !("ANTHROPIC_API_KEY" in apiEnv));
  gateway = await createPhoneGateway({
    host: "127.0.0.1",
    port: 8444,
    key: tls.key,
    cert: tls.cert,
    buildDir: path.join(root, "tmp/phone-lab-qa-build"),
    apiEnv,
    provider: async (kind, payload, env, options) => {
      evidence.providerCalls[kind]++;
      if (kind === "transcribe") {
        check("Сервер прочитав справжній WAV браузера",
          payload.file.type === "audio/wav" && payload.duration > 0);
        check("Мова з select дійшла до parser", payload.language === language);
        return callProvider(kind, payload, env, async (url, request) => {
          const form = request.body;
          const file = form.get("file");
          check("Groq: точні URL, модель, мова та WAV filename",
            url === "https://api.groq.com/openai/v1/audio/transcriptions" &&
            request.method === "POST" && request.redirect === "error" &&
            form.get("model") === "whisper-large-v3" &&
            form.get("language") === language &&
            form.get("temperature") === "0" &&
            file.name === "recording.wav" && file.type === "audio/wav");
          evidence.groqTransport.push({
            url,
            model: form.get("model"),
            language: form.get("language"),
            filename: file.name,
            audioBytes: file.size,
            duration: payload.duration,
            fixtureResponse: true,
          });
          return Response.json({ text: transcript });
        }, options);
      }
      check("Аналіз дозволений тільки звичайному сценарію", !sttOnly && kind === "analyze");
      if (payload.images.length)
        check("Сервер прочитав нормалізоване фото",
          payload.images.every((x) => x.type === "image/jpeg" && x.data.startsWith("/9j/")));
      return {
        items: [{
          name: "Тестовий кефір",
          quantity: { value: 200, unit: "g" },
          nutritionBasis: { value: 100, unit: "g" },
          nutrients: { p: 3, f: 2.5, c: 4, cal: 53 },
          source: { kind: payload.images.length ? "label" : "estimate" },
          estimated: !payload.images.length,
          clarification: "",
        }],
        unparsed: [],
      };
    },
  });
  await gateway.listen();
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.AGENT_TEST_CHROME_EXECUTABLE,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
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
      evidence.failedRoutes.push({ path: new URL(res.url()).pathname, status: res.status() });
  });
  page.on("dialog", (dialog) => dialog.accept());
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === gateway.origin) {
      for (const kind of ["transcribe", "analyze"])
        if (url.pathname === `/meal-api/${kind}` && request.method() === "POST")
          evidence.apiRequests[kind]++;
      if (url.pathname.endsWith("/documents:commit") && request.method() === "POST") {
        const commit = request.postDataJSON();
        if (commit.writes?.some((write) => write.update?.name?.includes("/mealHistory/")))
          evidence.mealCommits++;
      }
      return route.continue();
    }
    if (["cdn.tailwindcss.com", "fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname))
      return route.continue();
    // The pinned Firebase WebChannel wrapper probes cleardot.gif after a channel error.
    // Keep blocking that exact metadata-free image; never permit Google as an origin.
    if (url.origin === "https://www.google.com" && url.pathname === "/images/cleardot.gif" &&
        !url.username && !url.password && url.searchParams.size === 1 &&
        Boolean(url.searchParams.get("zx")) &&
        request.method() === "GET" && request.resourceType() === "image") {
      evidence.blockedSdkConnectivityProbes++;
      return route.abort();
    }
    evidence.unexpectedNetwork.push({ origin: url.origin, path: url.pathname,
      method: request.method(), type: request.resourceType() });
    return route.abort();
  });
  await page.goto(gateway.origin + "/lab/setup");
  // Positive control: interception must fail the image locally, without a network response.
  const probeBlocked = await page.evaluate(() => new Promise((resolve) => {
    const probe = new Image();
    probe.onload = () => resolve(false);
    probe.onerror = () => resolve(true);
    probe.src = "https://www.google.com/images/cleardot.gif?zx=synthetic-qa-control";
  }));
  check("Контрольний діагностичний запит SDK заблоковано локально",
    probeBlocked && evidence.blockedSdkConnectivityProbes === 1);
  const code = await page.locator("code").innerText();
  await page.goto(gateway.origin);
  evidence.pairingEdges = await page.getByLabel("Код сполучення").evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { left: rect.left, right: innerWidth - rect.right };
  });
  check("Форма сполучення: зовнішні відступи 24/24",
    evidence.pairingEdges.left === 24 && evidence.pairingEdges.right === 24);
  await page.getByLabel("Код сполучення").fill(code);
  await page.getByRole("button", { name: "Підключити телефон" }).click();
  await page.getByRole("button", { name: "Увійти в тестовий простір" }).click();
  await page.getByRole("button", { name: "Почати!", exact: true }).click();
  await page.getByRole("button", { name: "Почати!", exact: true }).waitFor({ state: "hidden" });
  await page.locator(".fixed.z-50")
    .filter({ has: page.getByRole("heading", { name: "Налаштування", exact: true }) })
    .locator("button:has(svg.lucide-x)").first().click();
  await page.waitForFunction(() => document.querySelectorAll(".fixed.z-50").length === 0);
  check("SDK увійшов через HTTPS Auth emulator", true);
  await page.getByRole("button", { name: "Додати їжу голосом", exact: true }).click();
  await page.getByRole("button", { name: "Зупинити запис", exact: true }).waitFor();
  check("Початкова мова автоматична",
    await page.getByLabel("Мова розпізнавання").inputValue() === "auto");
  for (const width of [375, 390, 1366])
    await measureLanguage({ width, height: width === 1366 ? 900 : 844 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Мова розпізнавання").selectOption(language);
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Зупинити запис", exact: true }).click();

  if (sttOnly) {
    await page.getByLabel("Розпізнаний текст", { exact: true }).waitFor();
    check("STT-only показує транскрипцію без редагування",
      await page.getByLabel("Розпізнаний текст").inputValue() === transcript &&
      await page.getByLabel("Розпізнаний текст").getAttribute("readonly") !== null);
    check("STT-only не показує фото, продукти та Додати",
      await page.locator('input[type="file"], [data-testid="voice-item"]').count() === 0 &&
      await page.getByRole("button", { name: "Додати", exact: true }).count() === 0);
    check("STT-only пояснює обмеження українською",
      (await page.locator(".voice-lab-note").innerText()).includes("Фото, аналіз їжі та додавання прийому"));
    await page.screenshot({ path: path.join(out, "transcript.png") });
    await page.getByRole("button", { name: "Закрити голосову чернетку" }).click();
    await page.reload();
    await page.getByRole("button", { name: "Додати їжу голосом", exact: true }).waitFor();
  } else {
    await page.locator('[data-testid="voice-item"]').waitFor();
    const image = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 400; canvas.height = 300;
      const drawing = canvas.getContext("2d");
      drawing.fillStyle = "white"; drawing.fillRect(0, 0, 400, 300);
      drawing.fillStyle = "black"; drawing.font = "24px sans-serif";
      drawing.fillText("Тестовий кефір", 10, 50);
      drawing.fillText("100 г: 53 ккал, Б3 Ж2.5 В4", 10, 100);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    await page.getByLabel("Фото з галереї", { exact: true }).setInputFiles({
      name: "test.png", mimeType: "image/png", buffer: Buffer.from(image, "base64"),
    });
    await page.locator(".voice-source").filter({ hasText: "Етикетка" }).waitFor();
    check("200 г із фото дає 106 ккал",
      await page.locator(".voice-nutrition").innerText() === "106 ккал · Б 6 · Ж 5 · В 8");
    await page.screenshot({ path: path.join(out, "preview.png") });
    await page.getByRole("button", { name: "Додати", exact: true }).click();
    await page.getByRole("heading", { name: "Прийом збережено" }).waitFor();
    await page.reload();
    await page.getByText("Тестовий кефір", { exact: true }).waitFor();
    check("Firestore HTTPS запис перечитано після reload без дубля",
      await page.getByText("106", { exact: true }).count() === 1);
    await page.screenshot({ path: path.join(out, "saved.png") });
  }

  await page.getByRole("button", { name: "Додати їжу голосом", exact: true }).click();
  await page.getByRole("button", { name: "Зупинити запис", exact: true }).waitFor();
  check("Мовна перевага пережила reload і повторне відкриття",
    await page.getByLabel("Мова розпізнавання").inputValue() === language);
  const voiceStorage = await page.evaluate(() =>
    Object.entries(localStorage).filter(([key]) => key.startsWith("scisense.voice.")));
  check("У localStorage записана тільки мовна перевага",
    voiceStorage.length === 1 && voiceStorage[0][0] === "scisense.voice.language" &&
    voiceStorage[0][1] === language);
  await page.getByRole("button", { name: "Закрити голосову чернетку" }).click();
  const collectionUrl = "http://127.0.0.1:8088/v1/projects/demo-scisense/databases/(default)/documents/users/" + UID;
  const stored = await fetch(collectionUrl, { headers: { Authorization: "Bearer owner" } }).then((response) => response.json());
  check("Запис належить дозволеному тестовому UID", stored.name?.endsWith("/users/" + UID));
  const history = await fetch(collectionUrl + "/mealHistory", { headers: { Authorization: "Bearer owner" } }).then((response) => response.json());
  check("Історію прийомів прочитано без помилки", !history.error);
  const days = history.documents || [];
  evidence.mealHistoryDocuments = days.length;
  check("Запит пройшов Groq adapter з підставним транспортом",
    evidence.groqTransport.length === 1 && evidence.providerCalls.transcribe === 1 &&
    evidence.apiRequests.transcribe === 1);
  if (sttOnly) {
    check("STT-only: нуль analyze, записів прийому й резерву Anthropic",
      evidence.apiRequests.analyze === 0 && evidence.providerCalls.analyze === 0 &&
      evidence.mealCommits === 0 && days.length === 0 && budget.spent() === 0);
  } else {
    check("Повний сценарій: два аналізи та одне збереження",
      evidence.apiRequests.analyze === 2 && evidence.providerCalls.analyze === 2 &&
      evidence.mealCommits === 1 && days.length === 1 && budget.spent() > 0);
    check("Один день має revision 1 і один маркер збереження",
      days[0].fields?.revision?.integerValue === "1" &&
      Object.keys(days[0].fields?.submissionMarkers?.mapValue?.fields || {}).length === 1);
  }
  check("Жодного прямого HTTP, production або AI API браузера", evidence.unexpectedNetwork.length === 0);
  check("Немає помилок JavaScript", evidence.errors.length === 0);
  // Цих трьох -v4 файлів немає вже у базовому HEAD; не приховуємо їх у звіті.
  const knownMissingIcons = new Set([
    "/icons/category-carbs-v4.png",
    "/icons/category-dairy-v4.png",
    "/icons/category-treats-v4.png",
  ]);
  evidence.knownStaticAssetFailures = evidence.failedRoutes.filter(
    ({ path, status }) => status === 404 && knownMissingIcons.has(path),
  );
  check("Поза відомими трьома іконками HTTP-помилок немає",
    evidence.failedRoutes.length === evidence.knownStaticAssetFailures.length);
  evidence.browserTlsTrust = "Лише ізольований тест обходить довіру TLS; справжній телефон ще не перевірений";
  evidence.reservedMicros = budget.spent();
  evidence.passed = true;
} catch (error) {
  evidence.failure = error.message;
  evidence.passed = false;
  if (page) await page.screenshot({ path: path.join(out, "failure.png") }).catch(() => {});
  throw error;
} finally {
  const failures = [];
  for (const [name, close] of [
    ["context", async () => { await context?.close(); return !context || context.pages().length === 0; }],
    ["browser", async () => { await browser?.close(); return !browser?.isConnected(); }],
    ["gateway", async () => { await gateway?.close(); return !gateway?.server.listening; }],
    ["budget", async () => { budget?.close(); return true; }],
  ]) {
    try { evidence.cleanup[name] = await close(); }
    catch (error) { evidence.cleanup[name] = false; failures.push(error.message); }
  }
  tls?.key.fill(0);
  evidence.cleanup.ok = Object.values(evidence.cleanup).every((value) => value === true);
  if (!evidence.cleanup.ok) evidence.passed = false;
  await writeFile(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2));
  if (!evidence.cleanup.ok) throw Error("qa_cleanup_failed: " + failures.join(", "));
}
console.log(JSON.stringify({
  mode, passed: evidence.checks.length, fixtureOnly: true, paidCalls: 0,
  reservedMicros: evidence.reservedMicros,
  knownStaticAssetFailures: evidence.knownStaticAssetFailures.length,
  cleanup: evidence.cleanup,
}));
