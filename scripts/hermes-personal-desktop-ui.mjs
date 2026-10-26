// Mac-only actual Electron acceptance, invoked only by the synthetic runtime.
import assert from "node:assert/strict";
import { createServer, connect } from "node:net";
import { mkdirSync, writeFileSync, readFileSync, realpathSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export async function checkPersonalDesktopUi({ root, socketPath, token, source, executable, playwrightModule, evidenceDir,
  sessionId, existingText, sendText, expectedAnswer, photo }) {
  if (process.platform !== "darwin" || !process.env.SCISENSE_FIXTURE_ROOT || realpathSync(root) !== realpathSync(process.env.SCISENSE_FIXTURE_ROOT) ||
      !Buffer.isBuffer(token) || token.length !== 43 || !source.startsWith("/private/tmp/") || !evidenceDir.startsWith("/")) throw Error("synthetic_desktop_required");
  const { _electron } = await import(pathToFileURL(playwrightModule));
  const userData = join(root, "desktop-user-data"), home = join(root, "desktop-home"), clients = new Set(), requests = new Map(), errors = [], sent = [], httpErrors = [], rpcErrors = [];
  let app, tcp, answerSeen = false, photoRpcSeen = false, fileDialogUsed = false, liveEvent = false, wireSecretsAbsent = true, nativeReceipt;
  const submittedRpcIds = new Set();
  mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
  mkdirSync(userData, { mode: 0o700 }); mkdirSync(home, { mode: 0o700 });
  for (const name of [".hermes", ".codex", ".config", ".cache", ".local/share", "bin"]) mkdirSync(join(home, name), { recursive: true, mode: 0o700 });
  writeFileSync(join(home, "bin/gh"), "#!/bin/sh\nexit 1\n", { mode: 0o700 });
  const before = createHash("sha256").update(readFileSync(join(source, "apps/desktop/dist/electron-main.mjs"))).digest("hex");
  let result;
  try {
    tcp = createServer(incoming => {
      const outgoing = connect(socketPath); clients.add(incoming); clients.add(outgoing); let latestPath;
      outgoing.on("data",chunk=>{const text=chunk.toString(),line=text.split("\r\n",1)[0],status=line.match(/^HTTP\/1\.1 ([0-9]+)/);if(status&&Number(status[1])>=400&&httpErrors.length<30){let reason;reason=text.match(/"error":"([a-z_]+)"/)?.[1];httpErrors.push({path:latestPath,status:Number(status[1]),reason});}});
      incoming.on("data", chunk => { const first = chunk.toString().split("\r\n", 1)[0]; if (/^(GET|POST|PUT) \/api\//.test(first)) {
        const path = first.split(" ")[1].split("?")[0]; latestPath=path; requests.set(path, (requests.get(path) || 0) + 1);
      } });
      incoming.pipe(outgoing); outgoing.pipe(incoming);
      incoming.on("error", () => outgoing.destroy()); outgoing.on("error", () => incoming.destroy());
      incoming.on("close", () => { outgoing.destroy(); clients.delete(incoming); clients.delete(outgoing); });
    });
    await new Promise(resolve => tcp.listen(0, "127.0.0.1", resolve));
    const origin = "http://127.0.0.1:" + tcp.address().port;
    // This short-lived token belongs only to the synthetic endpoint. A real
    // Desktop connection uses its encrypted native secret store at cutover.
    writeFileSync(join(userData, "connection.json"), JSON.stringify({ mode: "remote", remote: { url: origin,
      authMode: "token", token: { encoding: "synthetic", value: token.toString() } }, profiles: {} }), { mode: 0o600 });
    app = await _electron.launch({ executablePath: executable,
      args: ["--headless=new", "--disable-gpu", join(source, "apps/desktop")], timeout: 20000,
      env: { PATH: join(home, "bin") + ":/usr/bin:/bin", HOME: home, HERMES_HOME: join(home, ".hermes"), CODEX_HOME: join(home, ".codex"),
        XDG_CONFIG_HOME: join(home, ".config"), XDG_CACHE_HOME: join(home, ".cache"), XDG_DATA_HOME: join(home, ".local/share"), TMPDIR: root,
        HERMES_DESKTOP_USER_DATA_DIR: userData, HERMES_DESKTOP_IGNORE_EXISTING: "1", HERMES_DESKTOP_SKIP_PROTOCOL_REGISTRATION: "1", HERMES_DESKTOP_VARIANT: "light" } });
    const page = await app.firstWindow({ timeout: 20000 }); page.on("pageerror", e => errors.push({message:e.message,stack:e.stack}));
    // Tag an error in this disposable process with its API path so an optional
    // route failure cannot hide behind an untraceable Electron IPC wrapper.
    await app.evaluate(({ipcMain})=>{
      const original=ipcMain._invokeHandlers.get("hermes:api");
      if(typeof original!=="function")throw Error("synthetic_ipc_diagnostics_unavailable");
      ipcMain.removeHandler("hermes:api");
      ipcMain.handle("hermes:api",async(event,payload)=>{try{return await original(event,payload);}catch(fault){throw Error(String(fault.message)+" ["+(payload?.method||"GET")+" "+String(payload?.path||"").split("?")[0]+"]");}});
    });
    page.on("websocket", socket => {
      if (new URL(socket.url()).searchParams.has("token") || new URL(socket.url()).searchParams.has("ticket")) wireSecretsAbsent = false;
      socket.on("framesent", frame => {
        try {
          const value = JSON.parse(frame.payload);
          if (value.method === "prompt.submit" && value.params.text === sendText) { sent.push({ inputId: value.params.submission_id ?? value.params.input_id, sessionId: value.params.session_id, attachments: value.params.attachments ?? [] }); submittedRpcIds.add(value.id); }
          if (value.method === "image.attach_bytes") photoRpcSeen = true;
        } catch {}
      });
      socket.on("framereceived", frame => {
        try {
          const value = JSON.parse(frame.payload);
          if(value.error&&rpcErrors.length<30)rpcErrors.push({code:value.error.code,reason:value.error.data?.reason});
          if (submittedRpcIds.has(value.id) && value.result?.admission_id) nativeReceipt = value.result;
          if (value.method === "event" && value.params?.type === "message.complete" && value.params.session_id === sessionId) liveEvent = true;
        } catch {}
      });
    });
    await page.waitForLoadState("domcontentloaded");
    await page.getByText("Bot Chat", { exact: true }).first().click({ timeout: 15000 });
    await page.getByText(existingText, { exact: false }).first().waitFor({ timeout: 15000 });
    const editor = page.getByRole("textbox", { name: "Message", exact: true });
    await editor.fill(sendText);
    if (photo) {
      // The file chooser belongs only to this disposable Electron process.
      // UI input still runs the normal local read + image.attach_bytes path.
      await app.evaluate(({ dialog }, filename) => {
        globalThis.__scisensePhotoPickCount=0;
        dialog.showOpenDialog = async () => { globalThis.__scisensePhotoPickCount++; return { canceled: false, filePaths: [filename] }; };
      }, photo);
      const candidates = await page.locator("button").evaluateAll(nodes => nodes.map(n => ({ text: n.textContent, label: n.getAttribute("aria-label"), title: n.getAttribute("title") })));
      writeFileSync(join(evidenceDir, "composer-buttons.json"), JSON.stringify(candidates, null, 2));
      await page.getByRole("button", { name: "Add context", exact: true }).click({ timeout: 5000 });
      await page.getByRole("menuitem", { name: /^Images/ }).click({ timeout: 5000 });
      await page.waitForTimeout(500);
      fileDialogUsed=await app.evaluate(()=>globalThis.__scisensePhotoPickCount===1);
      assert.equal(fileDialogUsed,true);
    }
    await editor.press("Enter");
    await page.getByText(expectedAnswer, { exact: false }).last().waitFor({ timeout: 45000 }); answerSeen = true;
    for(const until=Date.now()+5000;(!liveEvent||!nativeReceipt)&&Date.now()<until;)await page.waitForTimeout(25);
    assert.equal(sent.length, 1); assert.equal(sent[0].sessionId, sessionId); assert.equal(wireSecretsAbsent, true); assert.equal(liveEvent, true); assert.ok(nativeReceipt?.admission_id);
    if (photo) { assert.equal(photoRpcSeen, true); assert.equal(sent[0].attachments.length, 1, "desktop_photo_missing_from_submit"); assert.equal(sent[0].attachments[0].mime, "image/png"); }
    assert.deepEqual(errors, []);
    await page.screenshot({ path: join(evidenceDir, "desktop-native-chat.png") });
    const historyVisible = (await page.locator("body").innerText()).includes(existingText);
    assert.equal(historyVisible, true);
    const stats = await app.evaluate(({ app }) => ({ userData: app.getPath("userData"), home: process.env.HERMES_HOME }));
    assert.equal(stats.userData, userData); assert.equal(stats.home, join(home, ".hermes"));
    result = { passed: true, actualElectron: true, actualUiComposer: true, sameCanonicalSession: true, existingHistoryVisible: true,
      answerVisible: answerSeen, photoRpcSeen, fileDialogUsed, singleUiSubmission: true, secretsAbsentFromWireUrls: true,
      inputId: sent[0].inputId, receipt: nativeReceipt, attachments: sent[0].attachments, desktopLiveEvent: liveEvent, sessionId, sourceCommit: "bf0203a794a07aac3ff764972ab9087baa4e4f4e", mainBundleSha256: before,
      requestCounts: Object.fromEntries(requests), pageErrors: errors, realModelRequests: 0 };
    writeFileSync(join(evidenceDir, "desktop-native-ui.json"), JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
    return result;
  } catch (fault) {
    writeFileSync(join(evidenceDir,"desktop-failure-diagnostics.json"),JSON.stringify({requestCounts:Object.fromEntries(requests),httpErrors,rpcErrors},null,2));
    if (app) {
      const windows = app.windows();
      if (windows[0]) { await windows[0].screenshot({ path: join(evidenceDir, "desktop-failure.png") }).catch(() => {});
        writeFileSync(join(evidenceDir, "desktop-failure-dom.txt"), await windows[0].locator("body").innerText().catch(() => "")); }
    }
    throw fault;
  } finally {
    await app?.close().catch(() => {}); for (const socket of clients) socket.destroy();
    if (tcp) await new Promise(resolve => tcp.close(resolve));
    rmSync(userData, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true });
    assert.equal(existsSync(userData), false); assert.equal(existsSync(home), false);
  }
}
