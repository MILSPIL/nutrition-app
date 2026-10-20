// Синтетичний браузерний QA. Провайдерні відповіді підставні; Firestore і MediaRecorder справжні локальні.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
if (!process.env.AGENT_TEST_BROWSER_SESSION)
  throw Error("Isolated launcher required");
const { chromium } = await import(
  pathToFileURL(process.env.AGENT_TEST_PLAYWRIGHT_MODULE).href
);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  build = path.join(root, "tmp/voice-photo-build"),
  out = path.join(root, "tmp/voice-photo-qa");
await mkdir(out, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    let file = path.join(build, pathname === "/" ? "index.html" : pathname);
    if (!file.startsWith(build + path.sep)) throw Error("path");
    let bytes;
    try {
      bytes = await readFile(file);
    } catch (_) {
      file = path.join(build, "index.html");
      bytes = await readFile(file);
    }
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".json": "application/json",
        ".svg": "image/svg+xml",
      }[path.extname(file)] || "application/octet-stream",
    );
    res.end(bytes);
  } catch (_) {
    res.writeHead(500).end();
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(4178, "127.0.0.1", resolve);
});
const evidence = {
  fixtureOnly: true,
  checks: [],
  widths: [],
  consoleErrors: [],
  externalBlocked: [],
};
let browser, context, page;
const check = (name, condition) => {
  assert.ok(condition, name);
  evidence.checks.push(name);
};
const fixture = (kind = "estimate", unit = "g") => ({
  items: [
    {
      name: "Тестовий кефір",
      quantity: { value: 200, unit },
      nutritionBasis: { value: 100, unit },
      nutrients: { p: 2.9, f: 2.5, c: 4, cal: 53 },
      source: { kind },
      estimated: kind === "estimate",
      clarification: "",
    },
  ],
  unparsed: [],
});
const readLedger = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("scisense-pilot-v1", 1);
        r.onerror = reject;
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("attempts"),
            get = tx.objectStore("attempts").getAll();
          get.onsuccess = () => resolve(get.result);
          tx.oncomplete = () => db.close();
        };
      }),
  );
const openVoice = async () => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page
    .getByRole("button", { name: "Додати їжу голосом", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Зупинити запис", exact: true })
    .waitFor();
};
const stopVoice = async () => {
  await page.waitForTimeout(350);
  await page
    .getByRole("button", { name: "Зупинити запис", exact: true })
    .click();
  await page.locator('[data-testid="voice-item"]').waitFor();
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
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => evidence.consoleErrors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") evidence.consoleErrors.push(m.text());
  });
  page.on("dialog", (d) => d.accept());
  let mode = "normal",
    apiCalls = 0;
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin === "http://127.0.0.1:8787") {
      const headers = {
        "Access-Control-Allow-Origin": "http://127.0.0.1:4178",
        "Access-Control-Allow-Headers": "Authorization,Content-Type",
        "Content-Type": "application/json",
      };
      if (request.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers });
      apiCalls++;
      assert.match(request.headers().authorization || "", /^Bearer /);
      if (url.pathname === "/transcribe") {
        const bytes = request.postDataBuffer();
        check(
          "Браузер надіслав нормалізований WAV",
          bytes.includes(Buffer.from("RIFF")) &&
            bytes.includes(Buffer.from("WAVE")),
        );
        if (mode === "silence")
          return route.fulfill({
            status: 200,
            headers,
            body: JSON.stringify({ text: "" }),
          });
        return route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify({ text: "Випив 200 грамів тестового кефіру" }),
        });
      }
      const body = request.postDataJSON();
      let answer = fixture(body.images.length ? "label" : "estimate");
      if (body.images.length) {
        check(
          "Фото нормалізоване до JPEG без metadata",
          body.images.every(
            (i) => i.type === "image/jpeg" && i.data.startsWith("/9j/"),
          ),
        );
        if (body.images.length === 1 && mode === "two-photos") {
          answer.items[0].nutrients = { p: null, f: null, c: null, cal: null };
          answer.items[0].clarification = "Потрібна харчова панель";
        }
      }
      if (mode === "partial") {
        answer.unparsed = ["нерозбірливий продукт"];
      }
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify(answer),
      });
    }
    if (
      [
        "127.0.0.1",
        "localhost",
        "cdn.tailwindcss.com",
        "fonts.googleapis.com",
        "fonts.gstatic.com",
      ].includes(url.hostname)
    )
      return route.continue();
    evidence.externalBlocked.push(url.hostname);
    return route.abort();
  });
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("button", { name: "Увійти через Google" }).click();
  await page.getByRole("button", { name: "Почати!" }).click();
  await page
    .getByRole("button", { name: "Почати!" })
    .waitFor({ state: "hidden" });
  const settingsPanel = page
    .locator(".fixed.z-50")
    .filter({
      has: page.getByRole("heading", { name: "Налаштування", exact: true }),
    });
  await settingsPanel.locator("button:has(svg.lucide-x)").first().click();
  await page.waitForFunction(
    () => document.querySelectorAll(".fixed.z-50").length === 0,
  );
  await page
    .getByRole("button", { name: "Додати їжу голосом", exact: true })
    .waitFor();
  const targetDate = await page
    .getByLabel("Дата записів", { exact: true })
    .inputValue();
  for (const width of [375, 390, 1366]) {
    await page.setViewportSize({ width, height: width === 1366 ? 900 : 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const home = await page
      .getByRole("button", { name: "Додати їжу голосом", exact: true })
      .boundingBox();
    check(
      `Мікрофон ${width} видимий без прокрутки`,
      home.y >= 0 && home.y + home.height <= 844 && home.height >= 44,
    );
    await page.screenshot({ path: path.join(out, `home-${width}.png`) });
    await openVoice();
    await stopVoice();
    const deltas = await page.evaluate(() => {
      const rect = (s) => document.querySelector(s).getBoundingClientRect(),
        panel = rect(".voice-panel"),
        heading = rect(".voice-heading"),
        body = rect(".voice-body"),
        item = rect(".voice-item"),
        footer = rect(".voice-footer");
      return {
        itemLeft: item.left - body.left,
        itemRight: body.right - item.right,
        footerLeft: footer.left - item.left,
        footerRight: footer.right - item.right,
        headingLeft: heading.left - panel.left,
        headingRight: panel.right - heading.right,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    check(
      `Відступи ${width}: 20/20, дельти 0`,
      deltas.itemLeft === 20 &&
        deltas.itemRight === 20 &&
        deltas.footerLeft === 0 &&
        deltas.footerRight === 0 &&
        deltas.headingLeft === 0 &&
        deltas.headingRight === 0 &&
        deltas.overflow === 0,
    );
    evidence.widths.push({ width, home, deltas });
    await page.screenshot({ path: path.join(out, `preview-${width}.png`) });
    if (width !== 1366) {
      await page
        .getByRole("button", { name: "Закрити голосову чернетку" })
        .click();
      continue;
    }
  }
  // Два знімки одного продукту, без дублювання. Фото генерується з вигаданою етикеткою.
  const photoData = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 600;
    const x = c.getContext("2d");
    x.fillStyle = "white";
    x.fillRect(0, 0, 800, 600);
    x.fillStyle = "black";
    x.font = "32px Arial";
    [
      "ТЕСТОВИЙ КЕФІР",
      "Синтетична етикетка",
      "На 100 г: 53 ккал",
      "Білки 2,9 · Жири 2,5 · Вуглеводи 4,0",
    ].forEach((v, i) => x.fillText(v, 30, 80 + i * 90));
    return c.toDataURL("image/png").split(",")[1];
  });
  mode = "two-photos";
  const photoFile = {
    name: "synthetic-label.png",
    mimeType: "image/png",
    buffer: Buffer.from(photoData, "base64"),
  };
  await page
    .getByLabel("Фото з галереї", { exact: true })
    .setInputFiles(photoFile);
  await page
    .getByText("Фото ще потребує уточнення.", { exact: false })
    .waitFor();
  check(
    "Лицьова сторона без БЖВ не активує Додати",
    await page
      .getByRole("button", { name: "Додати", exact: true })
      .isDisabled(),
  );
  await page
    .getByLabel("Фото з галереї", { exact: true })
    .setInputFiles(photoFile);
  await page.locator(".voice-source").filter({ hasText: "Етикетка" }).waitFor();
  check(
    "Два фото уточнюють один продукт",
    (await page.locator('[data-testid="voice-item"]').count()) === 1,
  );
  check(
    "200 г має саме 106 ккал",
    (await page.locator(".voice-nutrition").textContent()) ===
      "106 ккал · Б 5.8 · Ж 5 · В 8",
  );
  await page.getByRole("button", { name: "Додати", exact: true }).click();
  await page.getByRole("heading", { name: "Прийом збережено" }).waitFor();
  await page
    .getByRole("button", { name: "Запис правильний і повний", exact: true })
    .click();
  const rows = await readLedger();
  check(
    "Закриті спроби є в знаменнику, успіх один",
    rows.length === 3 &&
      rows.filter((r) => r.status === "saved" && r.correct).length === 1 &&
      rows.filter((r) => r.status === "abandoned").length === 2,
  );
  check(
    "Медіа й зміст не потрапили до обліку пілоту",
    !JSON.stringify(rows).includes("кефір") &&
      !JSON.stringify(rows).includes("data:image") &&
      !rows.some((r) => "uid" in r || "text" in r || "nutrients" in r),
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Додати їжу голосом", exact: true })
    .waitFor();
  await page.getByText("Тестовий кефір", { exact: true }).waitFor();
  check(
    "Reload зберіг 106 у підсумку",
    (await page.getByText("106", { exact: true }).count()) === 1,
  );
  await page
    .getByRole("button", { name: "Надіслати звіт", exact: true })
    .click();
  await page.getByRole("heading", { name: "Звіт для тренера" }).waitFor();
  const report = await page.locator("pre").textContent();
  check(
    "Звіт зберіг одиницю й точні калорії",
    report.includes("200 г") && report.includes("106 ккал"),
  );
  await page.locator(".fixed.z-50 button:has(svg.lucide-x)").last().click();
  await page.locator(".fixed.z-50").waitFor({ state: "hidden" });
  // Перезавантаження під час запису завершує спробу без збереженої їжі.
  mode = "normal";
  await openVoice();
  await page.reload();
  await page
    .getByRole("button", { name: "Додати їжу голосом", exact: true })
    .waitFor();
  const afterReload = await readLedger();
  check(
    "Reload під час запису дає abandoned",
    afterReload.length === 4 &&
      afterReload.filter((r) => r.status === "abandoned").length === 3,
  );
  // Інший день порожній, повернення не дублює їжу.
  const next = new Date(`${targetDate}T12:00:00`);
  next.setDate(next.getDate() + 1);
  const tomorrow = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  await page.getByLabel("Дата записів", { exact: true }).fill(tomorrow);
  await page
    .getByRole("button", { name: "Додати їжу голосом", exact: true })
    .waitFor();
  await page.waitForFunction(
    () => !document.body.textContent.includes("Тестовий кефір"),
  );
  await page.getByLabel("Дата записів", { exact: true }).fill(targetDate);
  await page.getByText("Тестовий кефір", { exact: true }).waitFor();
  check("Порожній день не копіює вчорашній прийом", true);
  // Тиша → явний повтор: одна нова спроба, поточна медіачернетка зберігається.
  mode = "silence";
  await openVoice();
  await page.waitForTimeout(350);
  await page
    .getByRole("button", { name: "Зупинити запис", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Повторити обробку", exact: true })
    .waitFor();
  mode = "normal";
  await page
    .getByRole("button", { name: "Повторити обробку", exact: true })
    .click();
  await page.locator('[data-testid="voice-item"]').waitFor();
  await page.getByRole("button", { name: "Закрити голосову чернетку" }).click();
  const finalRows = await readLedger();
  check(
    "Тиша й повтор обліковані окремо",
    finalRows.length === 6 &&
      finalRows.some((r) => r.status === "error") &&
      finalRows.some((r) => r.parentAttemptId),
  );
  evidence.apiCalls = apiCalls;
  evidence.attempts = finalRows.length;
  check(
    "Жодного звернення до production або зовнішнього API",
    evidence.externalBlocked.length === 0,
  );
  check(
    "Немає помилок JavaScript чи консолі",
    evidence.consoleErrors.length === 0,
  );
  console.log(
    JSON.stringify({
      passed: evidence.checks.length,
      widths: evidence.widths,
      attempts: evidence.attempts,
      fixtureOnly: true,
    }),
  );
} catch (error) {
  if (page) {
    await page
      .screenshot({ path: path.join(out, "failure.png") })
      .catch(() => {});
    await writeFile(
      path.join(out, "failure.txt"),
      await page
        .locator("body")
        .innerText()
        .catch(() => ""),
    );
  }
  throw error;
} finally {
  await writeFile(
    path.join(out, "evidence.json"),
    JSON.stringify(evidence, null, 2),
  );
  await context?.close();
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
