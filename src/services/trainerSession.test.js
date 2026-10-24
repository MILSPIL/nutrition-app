import { createTrainerSession } from "./trainerSession";
import { TextEncoder } from "util";
global.TextEncoder = TextEncoder;
Object.defineProperty(global, "crypto", {
  configurable: true,
  value: require("crypto").webcrypto,
});
const later = () => {
  let resolve, reject;
  const promise = new Promise((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
};
function fixture() {
  let server = {
    conversationId: "synthetic-conversation",
    revision: 0,
    composer: { text: "", revision: 0 },
    messages: [],
    drafts: [],
    currentTurn: null,
  };
  const api = {
    state: jest.fn(async () => structuredClone(server)),
    composer: jest.fn(async (b) => {
      if (b.baseRevision !== server.composer.revision)
        throw Object.assign(Error("composer_conflict"), { status: 409 });
      server.composer = { text: b.text, revision: b.baseRevision + 1 };
      return { ...server.composer };
    }),
    send: jest.fn(async (b) => {
      server.currentTurn = { id: b.turnId, state: "running" };
      server.composer = { text: "", revision: server.composer.revision + 1 };
      return server.currentTurn;
    }),
    turn: jest.fn(async (id) => {
      if (server.currentTurn?.id === id) return server.currentTurn;
      throw Object.assign(Error("not_found"), { status: 404 });
    }),
    prepareSave: jest.fn(),
    unknown: jest.fn(),
    receipt: jest.fn(),
  };
  const commit = jest.fn(),
    onChange = jest.fn(),
    onSaved = jest.fn(),
    session = createTrainerSession({ api, commit, onChange, onSaved });
  return {
    api,
    session,
    commit,
    onChange,
    onSaved,
    get server() {
      return server;
    },
    set server(s) {
      server = s;
    },
  };
}
beforeAll(() => {
  global.structuredClone = (value) => JSON.parse(JSON.stringify(value));
});
test("text opens immediately; composer durable ACK precedes turn and refresh does not resend", async () => {
  const f = fixture();
  await f.session.refresh();
  expect(f.api.send).not.toHaveBeenCalled();
  f.session.type("Картопля 200 г");
  await f.session.flush();
  await f.session.send({ targetDate: "2026-01-03" });
  expect(f.api.composer.mock.invocationCallOrder[0]).toBeLessThan(
    f.api.send.mock.invocationCallOrder[0],
  );
  await f.session.refresh();
  expect(f.api.send).toHaveBeenCalledTimes(1);
  expect(f.session.get().text).toBe("");
  f.session.close();
});
test("composer CAS keeps local text until explicit choice, and pending reads cannot erase edits", async () => {
  const f = fixture();
  await f.session.refresh();
  f.session.type("Мій текст");
  f.server.composer = { text: "Інша вкладка", revision: 1 };
  await expect(f.session.flush()).rejects.toThrow("composer_conflict");
  await f.session.refresh();
  expect(f.session.get().text).toBe("Мій текст");
  await expect(f.session.flush()).rejects.toThrow("composer_conflict");
  await f.session.chooseComposer(true);
  expect(f.server.composer.text).toBe("Мій текст");
  f.session.close();
});
test("lost admission ACK uses status and never another inference", async () => {
  const f = fixture();
  await f.session.refresh();
  f.session.type("Яблуко");
  const original = f.api.send.getMockImplementation();
  f.api.send.mockImplementation(async (b) => {
    await original(b);
    throw Error("offline");
  });
  await expect(f.session.send({ targetDate: "2026-01-03" })).rejects.toThrow(
    "admission_unknown",
  );
  expect(f.session.get().admission.state).toBe("unknown");
  await f.session.checkAdmission();
  expect(f.session.get().admission).toBeNull();
  expect(f.api.send).toHaveBeenCalledTimes(1);
  f.session.close();
});
test("definitely missing admission requires explicit retry with exactly same ID and payload", async () => {
  const f = fixture();
  await f.session.refresh();
  f.session.type("Яблуко");
  f.api.send.mockRejectedValueOnce(Error("offline"));
  await expect(f.session.send({ targetDate: "2026-01-03" })).rejects.toThrow();
  const first = f.api.send.mock.calls[0][0];
  await f.session.checkAdmission();
  expect(f.session.get().admission.state).toBe("not_received");
  await expect(
    f.session.send({ text: "Інша страва", targetDate: "2026-01-03" }),
  ).rejects.toThrow("admission_unknown");
  await f.session.checkAdmission(true);
  expect(f.api.send.mock.calls[1][0]).toEqual(first);
  f.session.close();
});
test("unknown Firestore commit retries exact frozen command and receipt alone marks saved", async () => {
  const f = fixture();
  await f.session.refresh();
  const draft = {
    draftId: "draft-synthetic-01",
    revision: 1,
    targetDate: "2026-01-03",
    state: "saving",
    save: { command: { submissionId: "same-command-id" } },
  };
  f.api.prepareSave.mockResolvedValue(draft);
  f.commit
    .mockRejectedValueOnce(Error("save_unknown"))
    .mockResolvedValueOnce({});
  f.api.receipt
    .mockRejectedValueOnce(Error("save_unconfirmed"))
    .mockResolvedValue({ state: "saved" });
  await expect(f.session.save(draft)).rejects.toThrow("save_unknown");
  expect(f.onSaved).not.toHaveBeenCalled();
  expect(f.api.unknown).toHaveBeenCalledTimes(1);
  await f.session.save(draft);
  expect(f.commit.mock.calls[0]).toEqual(f.commit.mock.calls[1]);
  expect(f.onSaved).toHaveBeenCalledTimes(1);
  f.session.close();
});
test("close or logout drops late state and cannot confirm late commit in another owner", async () => {
  const f = fixture(),
    wait = later();
  f.api.state.mockReturnValueOnce(wait.promise);
  const pending = f.session.refresh();
  f.session.close();
  wait.resolve(f.server);
  await expect(pending).rejects.toThrow("context_changed");
  expect(f.onChange).not.toHaveBeenCalled();
  expect(f.session.get().text).toBe("");
});

test("dirty composer keeps its original revision across polling another tab", async () => {
  const f = fixture();
  await f.session.refresh();
  f.session.type("Перший локальний текст");
  f.server.composer = { text: "Збережено іншою вкладкою", revision: 1 };
  await f.session.refresh();
  await expect(f.session.flush()).rejects.toThrow("composer_conflict");
  expect(f.server.composer.text).toBe("Збережено іншою вкладкою");
  f.session.close();
});

test("confirmed terminal rejection releases preview while ambiguous failure stays frozen", async () => {
  const f = fixture();
  await f.session.refresh();
  const draft = {
    draftId: "draft-synthetic-01",
    revision: 1,
    targetDate: "2026-01-03",
    state: "saving",
    save: {
      command: { submissionId: "rejected-id" },
      submissionId: "rejected-id",
    },
  };
  f.api.prepareSave.mockResolvedValue(draft);
  f.commit.mockRejectedValue(Error("plan_conflict"));
  f.api.receipt.mockResolvedValue({
    state: "ready",
    lastRejected: "rejected-id",
  });
  await expect(f.session.save(draft)).rejects.toThrow("plan_conflict");
  expect(f.api.unknown).not.toHaveBeenCalled();
  expect(f.onSaved).not.toHaveBeenCalled();
  f.session.close();
});

test("unknown admission drops image bytes after five minutes and requires confirmed missing status before recompose", async () => {
  jest.useFakeTimers();
  const f = fixture();
  try {
    await f.session.refresh();
    f.api.send.mockRejectedValueOnce(Error("offline"));
    f.session.type("Етикетка");
    await expect(
      f.session.send({
        targetDate: "2026-01-03",
        images: [
          {
            type: "image/png",
            data: "private-pixels",
            itemId: "synthetic-item",
          },
        ],
      }),
    ).rejects.toThrow("admission_unknown");
    jest.advanceTimersByTime(300001);
    expect(f.session.get().admission.input.images).toEqual([]);
    expect(() => f.session.recompose()).toThrow("admission_unknown");
    await f.session.checkAdmission();
    await expect(f.session.checkAdmission(true)).rejects.toThrow(
      "media_reattach_required",
    );
    f.session.recompose();
    expect(f.session.get().admission).toBeNull();
    expect(f.session.get().text).toBe("Етикетка");
    expect(f.api.send).toHaveBeenCalledTimes(1);
  } finally {
    f.session.close();
    jest.useRealTimers();
  }
});

test('late 404 after media TTL cannot restore or resend expired pixels',async()=>{
 jest.useFakeTimers();const f=fixture();try{
 await f.session.refresh();f.session.type('Фото');f.api.send.mockRejectedValueOnce(Error('offline'));await expect(f.session.send({targetDate:'2026-01-03',images:[{type:'image/png',data:'private-pixels'}]})).rejects.toThrow();
 const wait=later();f.api.turn.mockImplementationOnce(()=>wait.promise);const checking=f.session.checkAdmission(true);const rejection=expect(checking).rejects.toThrow('media_reattach_required');jest.advanceTimersByTime(300001);wait.resolve(Promise.reject(Object.assign(Error('not_found'),{status:404})));await rejection;expect(f.session.get().admission.input.images).toEqual([]);expect(f.api.send).toHaveBeenCalledTimes(1);
 }finally{f.session.close();jest.useRealTimers();}
});
