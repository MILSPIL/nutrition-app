jest.mock("../firebase", () => ({ auth: { currentUser: null } }));
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { TextEncoder } from "util";
import TrainerChat from "../components/TrainerChat";
global.IS_REACT_ACT_ENVIRONMENT = true;
global.TextEncoder = TextEncoder;
Object.defineProperty(global, "crypto", {
  configurable: true,
  value: require("crypto").webcrypto,
});
let host, root, api, server, recorderFactory, callbacks, props;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  server = {
    conversationId: "synthetic-conversation",
    revision: 0,
    composer: { text: "", revision: 0 },
    messages: [],
    drafts: [],
    contextProposals: [],
    currentTurn: null,
  };
  api = {
    state: jest.fn(async () => JSON.parse(JSON.stringify(server))),
    composer: jest.fn(async (b) => {
      server.composer = { text: b.text, revision: b.baseRevision + 1 };
      return server.composer;
    }),
    send: jest.fn(async (b) => {
      server.revision++;
      server.composer = { text: "", revision: server.composer.revision + 1 };
      server.messages = [
        { id: b.turnId + "-u", role: "user", content: b.text },
        {
          id: b.turnId + "-a",
          role: "assistant",
          content: "Це синтетична відповідь на запитання.",
        },
      ];
      return { turnId: b.turnId, state: "completed" };
    }),
    cancel: jest.fn(async () => {
      server.currentTurn = null;
    }),
    note: jest.fn(),
  };
  recorderFactory = jest.fn((c) => {
    callbacks = c;
    return {
      start: jest.fn(async () => c.onState("recording")),
      stop: () => c.onStop(new Blob(["synthetic"]), 2),
      cancel: jest.fn(),
    };
  });
  props = {
    uid: "synthetic",
    ownerKey: "synthetic:profile",
    date: "2026-01-03",
    meal: 1,
    api,
    recorderFactory,
    audioNormalizer: async (b) => b,
    transcribe: jest.fn(async () => ({ text: "Синтетичне яблуко" })),
    onAdd: jest.fn(),
    onClose: jest.fn(),
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
const render = async () =>
  act(async () => {
    root.render(<TrainerChat {...props} />);
  });
const button = (text) =>
  [...host.querySelectorAll("button")].find(
    (b) => b.textContent === text || b.getAttribute("aria-label") === text,
  );
const click = async (text) => {
  const b = button(text);
  expect(b).toBeTruthy();
  expect(b.disabled).toBe(false);
  await act(async () => {
    Simulate.click(b);
  });
};
test("H01 ready exposes textarea and explicit record button without requesting microphone", async () => {
  await render();
  expect(host.querySelector("textarea").disabled).toBe(false);
  expect(button("Почати запис")).toBeTruthy();
  expect(recorderFactory).not.toHaveBeenCalled();
  expect(api.send).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(host.querySelector("textarea"));
});
test("H01 text question uses trainer only and never writes food", async () => {
  await render();
  await act(async () => {
    Simulate.change(host.querySelector("textarea"), {
      target: { value: "Що краще на вечерю?" },
    });
  });
  await click("Надіслати повідомлення");
  expect(api.send).toHaveBeenCalledTimes(1);
  expect(api.send.mock.calls[0][0].text).toBe("Що краще на вечерю?");
  expect(host.textContent).toContain("синтетична відповідь");
  expect(props.onAdd).not.toHaveBeenCalled();
});
test("H01 stop calls STT once then one Hermes turn, without analyze or automatic mic restart", async () => {
  await render();
  await click("Почати запис");
  expect(recorderFactory).toHaveBeenCalledTimes(1);
  await act(async () => {
    await callbacks.onStop(new Blob(["synthetic"]), 2);
  });
  expect(props.transcribe).toHaveBeenCalledTimes(1);
  expect(api.send).toHaveBeenCalledTimes(1);
  expect(api.send.mock.calls[0][0].text).toBe("Синтетичне яблуко");
  expect(button("Почати запис").disabled).toBe(false);
  expect(props.onAdd).not.toHaveBeenCalled();
});
test("H06 recovered current turn uses actual turnId for cancellation", async () => {
  server.currentTurn = { turnId: "synthetic-turn-id", state: "unknown" };
  await render();
  await click("Скасувати обробку");
  expect(api.cancel.mock.calls[0][0]).toBe("synthetic-turn-id");
});
test("H06 permission failure keeps text available and records voice attempt before microphone", async () => {
  const ledger = {
    enabled: true,
    start: jest.fn(async () => "synthetic-attempt"),
    update: jest.fn(async () => {}),
  };
  props.ledger = ledger;
  props.recorderFactory = jest.fn((c) => ({
    start: async () => c.onError(Error("NotAllowedError")),
    cancel: () => {},
  }));
  await render();
  await click("Почати запис");
  expect(ledger.start).toHaveBeenCalledWith(undefined, "voice");
  expect(host.querySelector("textarea").disabled).toBe(false);
  expect(host.textContent).toContain("Доступ до мікрофона");
  expect(ledger.update).toHaveBeenCalledWith(
    "synthetic-attempt",
    expect.objectContaining({ status: "error" }),
  );
});

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
const restore = async () =>
  act(async () => {
    window.dispatchEvent(new Event("pagehide"));
    const e = new Event("pageshow");
    Object.defineProperty(e, "persisted", { value: true });
    window.dispatchEvent(e);
  });
test("bfcache never revives microphone start after a delayed ledger ACK", async () => {
  const wait = deferred();
  props.ledger = {
    enabled: true,
    start: () => wait.promise,
    update: jest.fn(async () => {}),
    list: async () => [],
  };
  await render();
  await click("Почати запис");
  await restore();
  await act(async () => wait.resolve("old-attempt"));
  expect(recorderFactory).not.toHaveBeenCalled();
  expect(host.querySelector("textarea").disabled).toBe(false);
});
test("bfcache never submits a previous STT result after restoration", async () => {
  const wait = deferred();
  props.transcribe = jest.fn(() => wait.promise);
  await render();
  await click("Почати запис");
  let pending;
  await act(async () => {
    pending = callbacks.onStop(new Blob(["synthetic"]), 2);
  });
  await restore();
  await act(async () => {
    wait.resolve({ text: "Старий скасований голос" });
    await pending;
  });
  expect(api.send).not.toHaveBeenCalled();
  expect(button("Почати запис").disabled).toBe(false);
});
test("empty chat offers a package photo before any draft exists", async () => {
  await render();
  expect(button("Фото упаковки").disabled).toBe(false);
});
