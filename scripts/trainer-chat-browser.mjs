import { dismissIndependentMeasurementReminder } from './tracker-browser-fixture.mjs';
// Actual UI + coordinator/tools/SQLite + demo Firestore. Only model and STT are fixtures.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { join, resolve, extname } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, runTransaction } from "firebase/firestore";
import { browserRuntime } from "./browser-runtime.mjs";
import { openTurnStore } from "../server/trainer/turn-store.mjs";
import { createMediaStore } from "../server/trainer/media.mjs";
import { createTrainerGateway } from "../server/trainer/gateway.mjs";
import { createTrainerTools } from "../server/trainer/tools.mjs";
import { normalizeFood } from "../server/trainer/food-data.mjs";
import { buildPlanCatalog } from "../src/services/planCatalog.js";
import {
  provisionContext,
  openContextStore,
} from "../server/trainer/context-store.mjs";
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8088");
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
const { chromium } = await browserRuntime(),
  build = resolve("tmp/hermes-build"),
  out = resolve("tmp/hermes-chat-qa"),
  dir = realpathSync(mkdtempSync(join(tmpdir(), "scisense-chat-qa-")));
mkdirSync(out, { recursive: true });
const key = randomBytes(32),
  store = openTurnStore(join(dir, "turns.sqlite"), { hmacKey: key });
mkdirSync(join(dir, "media"), { mode: 0o700 });
provisionContext(dir, {
  key,
  text: "Виключно синтетичний кураторський контекст.",
});
const contextStore = openContextStore(dir, { key });
const env = await initializeTestEnvironment({
  projectId: "demo-scisense",
  firestore: { host: "127.0.0.1", port: 8088 },
});
let uid,
  gateway,
  mode = "potato",
  calls = 0,
  sttCalls = 0,
  analyses = 0,
  sttFailOnce = false,
  sttDelay = 0,
  lastInput,
  latency = 0;
const evidence = {
  syntheticOnly: true,
  realCoordinator: true,
  realFirestore: true,
  model: "fixture",
  checks: [],
  widths: [],
  consoleErrors: [],
  externalBlocked: [],
};
const check = (name, ok) => {
  assert.ok(ok, name);
  evidence.checks.push(name);
};
const admin = async (fn) => {
  let result;
  await env.withSecurityRulesDisabled(async (c) => {
    result = await fn(c.firestore());
  });
  return result;
};
const readDay = async (owner, date) =>
  admin((db) =>
    runTransaction(db, async (tx) => {
      const snap = await tx.get(doc(db, "users", owner, "mealHistory", date)),
        data = snap.data() || { meals: {}, revision: 0 },
        notes = [];
      for (const id of Object.keys(data.foodNotes || {})) {
        const n = (
          await tx.get(doc(db, "users", owner, "foodNotes", id))
        ).data();
        notes.push({ ...n, noteId: id });
      }
      return {
        ...data,
        notes,
        incomplete: notes.length > 0,
        notesEnabled: true,
      };
    }),
  );
const readPlan = async (owner) =>
  admin(async (db) => {
    const root = (await getDoc(doc(db, "users", owner))).data() || {};
    const planContext = {
      profile: root.users?.[owner] || {},
      globalCustomProducts: root.globalCustomProducts || {},
      productOverrides: root.productOverrides || {},
    };
    return { planContext, catalog: buildPlanCatalog(planContext) };
  });
const rows = JSON.parse(
    readFileSync("server/trainer/fixtures/usda-excerpt.json"),
  ).rows.map(({ row, source }) => normalizeFood(row, source)),
  potato = rows.find((r) => r.id === "fdc:170438");
async function init(owner) {
  if (gateway) {
    assert.equal(owner, uid);
    return;
  }
  uid = owner;
  await admin((db) =>
    setDoc(doc(db, "releaseCapabilities", uid), {
      minimumWriterVersion: 3,
      notesEnabled: true,
    }),
  );
  const kit = createTrainerTools({
    store,
    index: { lookup: () => [potato] },
    readDay,
    readPlan,
    memoryWriteEnabled: true, // Synthetic fixture exercises explicit confirmation after cutover.
  });
  const backend = {
    async start(ctx) {
      calls++;
      lastInput = ctx.input;
      await new Promise((r) => setTimeout(r, latency));
      if (ctx.signal.aborted)
        throw Object.assign(Error("cancelled"), {
          definitelyNotExecuted: true,
        });
      const old = ctx.snapshot.draft?.find(
          (d) => d.targetDate === ctx.input.targetDate,
        ),
        itemId =
          old?.items[0]?.itemId || ctx.input.media?.[0]?.itemId || randomUUID();
      if (mode === "question")
        return { text: "Синтетична відповідь на запитання. Їжу не додавав." };
      if (mode === "memory") {
        await kit.tools.propose_context_update(
          {
            baseRevision: ctx.snapshot.contextRevision,
            text: "Виключно синтетичний кураторський контекст. Доданий тестовий факт.",
          },
          ctx,
        );
        return { text: "Пропоную запам’ятати тестовий факт." };
      }
      if (mode === "fail")
        throw Object.assign(Error("upstream_limited"), {
          definitelyNotExecuted: true,
        });
      let item = {
        itemId,
        name: "Тушкована картопля",
        quantity: { value: 200, unit: "g" },
        preparation: "cooked",
        source: { kind: "database", recordId: potato.id },
      };
      await kit.tools.food_lookup(
        { query: "potatoes boiled", preparation: "cooked" },
        ctx,
      );
      if (mode === "quantity")
        item = { itemId, quantity: { value: 150, unit: "g" } };
      if (mode === "photo")
        item = {
          ...item,
          quantity: { value: 100, unit: "g" },
          source: {
            kind: "label",
            photoRef: ctx.input.media[0].tempRef,
            nutritionBasis: { value: 100, unit: "g" },
            nutrients: { p: 3, f: 2, c: 4, cal: 51 },
          },
        };
      if (mode === "unknown")
        item = {
          ...item,
          name: "Синтетична домашня страва",
          source: { kind: "unknown" },
        };
      const result = await kit.tools.propose_food_draft(
        {
          ...(old ? { draftId: old.draftId } : {}),
          baseRevision: old?.revision || 0,
          dayRef: old ? "draft" : "today",
          meal: 1,
          items: [item],
        },
        ctx,
      );
      return {
        text: `Прев’ю готове на ${result.targetDate}. Перевірте кількість і натисніть «Додати».`,
      };
    },
    cleanup: async () => ({ cleaned: true }),
    stop: async () => ({ stopped: true }),
    status: async () => ({ state: "unknown" }),
    shutdown: async () => {},
  };
  gateway = createTrainerGateway({
    ownerUid: uid,
    store,
    media: createMediaStore(join(dir, "media"), { hash: store.hash }),
    proxy: { cancel() {}, close() {} },
    backend,
    contextStore,
    releaseTools: kit.release,
    readContext: async () => contextStore.read(),
    readDay,
    readPlan,
    memoryWriteEnabled: true, // Synthetic fixture exercises explicit confirmation after cutover.
  });
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname.startsWith("/meal-api/")) {
      if (url.pathname === "/meal-api/transcribe") {
        sttCalls++;
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const b = Buffer.concat(chunks);
        check(
          "STT отримує WAV",
          b.includes(Buffer.from("RIFF")) && b.includes(Buffer.from("WAVE")),
        );
        res.setHeader("Content-Type", "application/json");
        if (sttDelay) await new Promise(resolve => setTimeout(resolve, sttDelay));
        if (sttFailOnce) {
          sttFailOnce = false; res.statusCode = 504;
          return res.end(JSON.stringify({ error: "upstream_timeout" }));
        }
        return res.end(
          JSON.stringify({ text: "З’їв150г тушкованої картоплі" }),
        );
      }
      if (url.pathname === "/meal-api/analyze") {
        analyses++;
        throw Error("unexpected_analyze");
      }
      // This deliberate emulator-only transport is not shipped. Production auth is tested separately.
      const token = (req.headers.authorization || "").replace(/^Bearer /, ""),
        claims = JSON.parse(
          Buffer.from(token.split(".")[1] || "", "base64url"),
        );
      assert.equal(claims.aud, "demo-scisense");
      await init(claims.user_id || claims.sub);
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length
        ? JSON.parse(Buffer.concat(chunks))
        : undefined;
      const r = await gateway.handle(
        uid,
        url.pathname.slice("/meal-api/trainer".length),
        req.method,
        body,
      );
      res.writeHead(r.status, Object.fromEntries(r.headers));
      return res.end(await r.text());
    }
    let file = join(build, url.pathname === "/" ? "index.html" : url.pathname);
    if (!file.startsWith(build + "/")) throw Error("path");
    let bytes;
    try {
      bytes = readFileSync(file);
    } catch {
      file = join(build, "index.html");
      bytes = readFileSync(file);
    }
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".json": "application/json",
      }[extname(file)] || "application/octet-stream",
    );
    res.end(bytes);
  } catch (e) {
    console.error(
      "SYNTHETIC_QA_API",
      req.method,
      req.url,
      e.message,
      e.stack?.split("\n").slice(1, 3).join(" "),
    );
    res.writeHead(e.status || 400, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(
      JSON.stringify({
        error: /^[a-z_]+$/.test(e.message) ? e.message : "qa_request_failed",
      }),
    );
  }
});
await new Promise((r) => server.listen(4184, "127.0.0.1", r));
let browser, context, page;
const open = async () => {
  await page
    .getByRole("button", { name: "Відкрити тренера", exact: true })
    .click();
  await page.locator("#trainer-message:not(:disabled)").waitFor();
  await page.getByRole('button',{name:'Почати запис',exact:true}).waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('.trainer-chat button')].some(b=>b.getAttribute('aria-label')==='Почати запис'&&!b.disabled));
};
const send = async (text) => {
  await page.locator("#trainer-message").fill(text);
  await page
    .getByRole("button", { name: "Надіслати повідомлення", exact: true })
    .click();
  await page
    .getByText("Тренер розбирає повідомлення", { exact: true })
    .waitFor({ state: "hidden" });
};
const ready = async () => {
  await page.locator('[data-testid="trainer-draft"]').last().waitFor();
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll(".trainer-chat [role=status]")].some((n) =>
        n.textContent.includes("Зберігаю зміни"),
      ),
  );
};
try {
  browser = await chromium.launch({
    executablePath: process.env.AGENT_TEST_CHROME_EXECUTABLE,
    headless: true,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ["microphone"],
    locale: "uk-UA",
  });
  await dismissIndependentMeasurementReminder(context);
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => evidence.consoleErrors.push(e.message));
  page.on("console", (m) => {
    // This one transport failure is deliberately injected below to verify retry.
    if (m.type() === 'error' && m.location().url.endsWith('/meal-api/transcribe') && m.text().includes('504')) {
      evidence.expectedSttErrors = (evidence.expectedSttErrors || 0) + 1;
      return;
    }
    if (m.type() === "error") evidence.consoleErrors.push(m.text());
  });
  page.on("dialog", (d) => d.accept());
  await context.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    if (
      [
        "127.0.0.1",
        "localhost",
        "cdn.tailwindcss.com",
        "fonts.googleapis.com",
        "fonts.gstatic.com",
      ].includes(host)
    )
      return route.continue();
    evidence.externalBlocked.push(host);
    return route.abort();
  });
  await page.goto("http://127.0.0.1:4184/");
  await page.getByRole("button", { name: "Увійти через Google" }).click();
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
  await page.locator("[data-modal-surface]").waitFor({state:"hidden"});
  const date = await page
    .getByLabel("Дата записів", { exact: true })
    .inputValue();
  for (const width of [375, 390, 1366]) {
    await page.setViewportSize({ width, height: width === 1366 ? 900 : 844 });
    await open();
    check(
      "Ready " + width + " не починає запис",
      sttCalls === 0 && calls === 0,
    );
    check(
      "Textarea " + width + " одразу доступне",
      await page.locator("#trainer-message").isEnabled(),
    );
    const geometry = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect(),
        chat = r(".trainer-chat"),
        head = r(".trainer-header"),
        title = r("#trainer-title"),
        intro = r(".trainer-intro"),
        input = r("#trainer-message"),
        row = r(".trainer-input-row"),
        footer = r(".trainer-composer");
      return {
        width: innerWidth,
        overflow: document.documentElement.scrollWidth - innerWidth,
        headingLeft: title.left - chat.left,
        introLeft: intro.left - chat.left,
        composerLeft: row.left - chat.left,
        right: chat.right - row.right,
        textInset: input.left - row.left,
        edges:
          Math.abs(title.left - row.left) + Math.abs(intro.left - row.left),
        headerWidth: head.width,
        footerWidth: footer.width,
        controls: [
          ...document.querySelectorAll(
            ".trainer-chat button,.trainer-chat input,.trainer-chat summary",
          ),
        ]
          .filter((n) => n.getClientRects().length)
          .map((n) => n.getBoundingClientRect().height),
      };
    });
    evidence.widths.push(geometry);
    check(
      "Краї " + width,
      geometry.overflow === 0 &&
        geometry.edges === 0 &&
        geometry.headingLeft === 16 &&
        geometry.right === 16 &&
        geometry.textInset === 50 &&
        geometry.headerWidth === geometry.footerWidth,
    );
    check(
      "44px " + width,
      geometry.controls.every((h) => h >= 44),
    );
    await page.screenshot({ path: join(out, `ready-${width}.png`) });
    await page.locator('#trainer-message').fill('Синтетичне повідомлення\nДругий рядок\nТретій рядок для перевірки редагування');
    const typed = await page.locator('#trainer-message').evaluate(node => {
      const r = node.getBoundingClientRect(), row = node.closest('.trainer-input-row').getBoundingClientRect();
      return { height: r.height, left: r.left - row.left, right: row.right - r.right, overflow: document.documentElement.scrollWidth - innerWidth };
    });
    check('Багаторядкове поле ' + width, typed.height > 44 && typed.height <= 120 && typed.overflow === 0);
    await page.screenshot({ path: join(out, `typing-${width}.png`) });
    await page.locator('#trainer-message').fill('');
    await page
      .getByRole("button", { name: "Закрити чат", exact: true })
      .click();
    await page.waitForFunction(()=>document.activeElement?.getAttribute("aria-label")==="Відкрити тренера");
    check(
      "Фокус повернуто " + width,
      await page
        .getByRole("button", { name: "Відкрити тренера", exact: true })
        .evaluate((n) => document.activeElement === n),
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await open();
  await send("З’їв200г тушкованої картоплі");
  await ready();
  check(
    "Пошук дає174ккал у прев’ю",
    (await page.locator(".trainer-total").textContent()).includes("174"),
  );
  check(
    "До Додати день порожній",
    Object.keys((await readDay(uid, date)).submissionMarkers || {}).length ===
      0,
  );
  await page.getByText("Змінити літеру або норму", { exact: true }).click();
  await page
    .getByLabel("Літера продукту1".replace("у1", "у 1"), { exact: true })
    .selectOption("а");
  await page
    .getByText("Зберігаю зміни прев’ю…", { exact: true })
    .waitFor({ state: "hidden" });
  mode = "quantity";
  await page.getByRole("button", { name: "Почати запис", exact: true }).click();
  await page.getByRole("button", { name: "Зупинити запис", exact: true }).waitFor();
  await page.screenshot({ path: join(out, 'recording-390.png') });
  await page.waitForTimeout(600);
  sttDelay = 1200;
  await page.getByRole("button", { name: "Зупинити запис", exact: true }).click();
  await page.getByText('Розпізнаю голос…', { exact: true }).waitFor();
  await page.screenshot({ path: join(out, 'transcribing-390.png') });
  await page.getByRole("button", { name: "Скасувати голосове", exact: true }).waitFor();
  sttDelay = 0;
  check("Голос спершу показує текст без Hermes запиту", sttCalls === 1 && calls === 1);
  check("Голос можна відредагувати до надсилання", await page.locator('#trainer-message').isEditable());
  await page.waitForFunction(() => { const audio = document.querySelector('.trainer-voice-preview audio'); return audio && !audio.error && audio.readyState >= 2; });
  await page.locator('.trainer-voice-preview audio').evaluate(async audio => { await audio.play(); audio.pause(); });
  check('Запис справді відтворюється перед Send', calls === 1 && await page.locator('.trainer-voice-preview audio').count() === 1);
  await page.screenshot({ path: join(out, 'voice-preview-390.png') });
  await page.evaluate(() => { Object.defineProperty(visualViewport, 'height', { configurable: true, value: 480 }); visualViewport.dispatchEvent(new Event('resize')); });
  await page.waitForFunction(() => document.querySelector('.trainer-overlay').style.getPropertyValue('--trainer-visible-height') === '480px');
  const voiceKeyboard = await page.evaluate(() => {
    const row = document.querySelector('.trainer-input-row').getBoundingClientRect(), footer = document.querySelector('.trainer-composer').getBoundingClientRect();
    return { rowBottom: row.bottom, footerBottom: footer.bottom, scrollHeight: document.querySelector('.trainer-scroll').clientHeight, overflow: document.documentElement.scrollWidth - innerWidth };
  });
  check('Голосове прев’ю над клавіатурою', voiceKeyboard.rowBottom <= 480 && voiceKeyboard.footerBottom <= 480 && voiceKeyboard.scrollHeight > 44 && voiceKeyboard.overflow === 0);
  evidence.voiceKeyboard = voiceKeyboard;
  await page.screenshot({ path: join(out, 'voice-keyboard-390.png') });
  await page.evaluate(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize')); });
  await page.getByRole("button", { name: "Надіслати повідомлення", exact: true }).click();
  await page.getByLabel("Кількість 1", { exact: true }).waitFor();
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Кількість 1"]').value === "150",
  );
  check(
    "Голос одинSTT і одинHermes",
    sttCalls === 1 && calls === 2 && analyses === 0,
  );
  check(
    "Ручна літера збережена",
    (await page
      .getByLabel("Літера продукту 1", { exact: true })
      .inputValue()) === "а",
  );
  sttFailOnce = true;
  await page.getByRole('button', { name: 'Почати запис', exact: true }).click();
  await page.getByRole('button', { name: 'Зупинити запис', exact: true }).waitFor();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Зупинити запис', exact: true }).click();
  await page.getByRole('button', { name: 'Розпізнати ще раз', exact: true }).waitFor();
  const retainedAudio = await page.locator('.trainer-voice-preview audio').getAttribute('src');
  check('Помилка STT зберігає запис без Hermes', sttCalls === 2 && calls === 2 && await page.getByRole('button', { name: 'Надіслати повідомлення' }).isDisabled());
  await page.screenshot({ path: join(out, 'voice-error-390.png') });
  await page.getByRole('button', { name: 'Розпізнати ще раз', exact: true }).click();
  await page.getByRole('button', { name: 'Розпізнати ще раз', exact: true }).waitFor({ state: 'hidden' });
  check('Явний повтор STT використовує той самий запис', sttCalls === 3 && calls === 2 && await page.locator('.trainer-voice-preview audio').getAttribute('src') === retainedAudio);
  await page.getByRole('button', { name: 'Скасувати голосове', exact: true }).click();
  check('Скасований повтор не надсилає модельний запит', calls === 2 && await page.locator('.trainer-voice-preview audio').count() === 0);
  const image = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 500;
    c.height = 300;
    const x = c.getContext("2d");
    x.fillStyle = "#fff";
    x.fillRect(0, 0, 500, 300);
    x.fillStyle = "#000";
    x.font = "24px sans-serif";
    x.fillText("СИНТЕТИЧНА ЕТИКЕТКА 51ккал/100г", 10, 150);
    return c.toDataURL("image/png").split(",")[1];
  });
  const file = {
    name: "synthetic-label.png",
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  };
  await page
    .getByRole("button", { name: "Фото етикетки цього продукту", exact: true })
    .click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "З галереї", exact: true }).click();
  await (await chooser).setFiles(file);
  await page.locator(".trainer-photos img").waitFor();
  mode = "photo";
  await page
    .getByRole("button", { name: "Надіслати повідомлення", exact: true })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector(".trainer-source")
      .textContent.toLowerCase()
      .includes("етикет"),
  );
  check(
    "Фото прив’язане, порція не стала100г",
    lastInput.media[0].itemId ===
      (await gateway.handle(uid, "/state", "GET").then((r) => r.json()))
        .drafts[0]?.items[0]?.itemId &&
      (await page.getByLabel("Кількість 1", { exact: true }).inputValue()) ===
        "150",
  );
  const before = calls;
  await page.reload();
  await open();
  await ready();
  check(
    "Reload повернув чернетку без нового виклику",
    calls === before &&
      (await page.getByLabel("Кількість 1", { exact: true }).inputValue()) ===
        "150",
  );
  await page.screenshot({ path: join(out, "preview-390.png") });
  await page.getByRole("button", { name: "Додати", exact: true }).click();
  await page.getByRole("heading", { name: "Додано до щоденника", exact: true }).waitFor();
  const confirmed = await readDay(uid, date);
  check(
    "Один підтверджений запис після Додати",
    Object.keys(confirmed.submissionMarkers).length === 1 &&
      Object.values(confirmed.meals).flatMap((g) => Object.values(g).flat())
        .length === 1,
  );
  check(
    "Повний запис без тексту чату",
    !JSON.stringify(confirmed.meals).includes("originalText"),
  );
  mode = "unknown";
  await send("З’їв ще домашню страву невідомого складу");
  await page
    .getByLabel("Зберегти як нотатку без повного розрахунку", { exact: true })
    .check();
  await page
    .getByText("Зберігаю зміни прев’ю…", { exact: true })
    .waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Додати", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-testid="trainer-saved-receipt"]').length === 2,
  );
  check(
    "Нотатка видима й не нульові калорії",
    (await readDay(uid, date)).notes[0].knownNutrients.cal === null,
  );
  mode = "memory";
  await send("Запропонуй синтетичний факт для пам’яті");
  await page
    .getByRole("button", { name: "Переглянути зміни", exact: true })
    .click();
  check(
    "Пам’ять не змінена до Запам’ятати",
    contextStore.read().revision === 0,
  );
  await page.getByRole("button", { name: "Запам’ятати", exact: true }).click();
  await page
    .getByRole("button", { name: "Запам’ятати", exact: true })
    .waitFor({ state: "hidden" });
  check("Окреме підтвердження пам’яті", contextStore.read().revision === 1);
  mode = "question";
  const markers = Object.keys(
    (await readDay(uid, date)).submissionMarkers,
  ).length;
  await send("Що краще на вечерю?");
  await page
    .getByText("Синтетична відповідь на запитання. Їжу не додавав.", {
      exact: true,
    })
    .waitFor();
  check(
    "Запитання не додає їжу",
    Object.keys((await readDay(uid, date)).submissionMarkers).length ===
      markers,
  );
  for (const width of [375, 390, 1366]) {
    await page.setViewportSize({ width, height: 844 });
    const timeline = await page.evaluate(() => {
      const chat = document.querySelector('.trainer-chat'), messages = chat.querySelector('.trainer-messages');
      const saved = [...chat.querySelectorAll('[data-testid="trainer-saved-receipt"]')];
      const newest = [...messages.querySelectorAll('.trainer-message.from-user')].at(-1);
      const scroll = chat.querySelector('.trainer-scroll').getBoundingClientRect(), composer = chat.querySelector('.trainer-composer').getBoundingClientRect();
      return { saved: saved.length, savedBeforeLatest: saved.every(row => !!(row.compareDocumentPosition(newest) & Node.DOCUMENT_POSITION_FOLLOWING)),
        savedInputs: saved.reduce((n, row) => n + row.querySelectorAll('input,select,textarea').length, 0),
        overflow: chat.scrollWidth > chat.clientWidth, leftDelta: scroll.left - composer.left, rightDelta: scroll.right - composer.right };
    });
    check(`Збережені записи перед новою порадою ${width}`, timeline.saved === 2 && timeline.savedBeforeLatest && timeline.savedInputs === 0);
    check(`Межі чату й поля ${width}`, !timeline.overflow && timeline.leftDelta === 0 && timeline.rightDelta === 0);
    evidence.timeline ||= []; evidence.timeline.push({ width, ...timeline });
    await page.screenshot({ path: join(out, `saved-before-advice-${width}.png`) });
  }
  mode = "fail";
  await send("Синтетична відмова провайдера");
  await page.locator(".trainer-error").first().waitFor();
  check(
    "Відмова видима і текст можна повернути",
    await page
      .getByRole("button", {
        name: "Повернути текст для уточнення",
        exact: true,
      })
      .isVisible(),
  );
  check("Нема другого платного аналізатора", analyses === 0);
  await page.getByRole("button", { name: "Закрити чат", exact: true }).click();
  await page
    .getByText("Підсумок неповний:", { exact: false })
    .first()
    .waitFor();
  await page.screenshot({ path: join(out, "day-notes-390.png") });
  evidence.calls = calls;
  evidence.sttCalls = sttCalls;
  evidence.analyzeCalls = analyses;
  check(
    "Нема помилокJS",
    evidence.consoleErrors.filter(
      (e) => !e.includes("400") && !e.includes("409") && !e.includes("403"),
    ).length === 0,
  );
  writeFileSync(join(out, "evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(
    JSON.stringify({
      passed: true,
      checks: evidence.checks.length,
      widths: evidence.widths.map((x) => ({
        width: x.width,
        overflow: x.overflow,
        edges: x.edges,
        gutter: x.headingLeft,
      })),
      calls,
      sttCalls,
      analyses,
    }),
  );
} catch (e) {
  if (page) {
    await page.screenshot({ path: join(out, "failure.png") }).catch(() => {});
    writeFileSync(
      join(out, "failure.txt"),
      await page
        .locator("body")
        .innerText()
        .catch(() => ""),
    );
  }
  writeFileSync(join(out, "evidence.json"), JSON.stringify({ ...evidence, passed: false, failure: e.message }, null, 2));
  console.error("SYNTHETIC_QA_FAILURE", e.message);
  throw e;
} finally {
  await context?.close();
  await browser?.close();
  await gateway?.close();
  store.close();
  await env.cleanup();
  await new Promise((r) => {
    server.close(r);
    server.closeAllConnections();
  });
  rmSync(dir, { recursive: true, force: true });
}
