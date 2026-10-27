jest.mock("../firebase", () => ({ auth: { currentUser: null } }));
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { TextEncoder } from "util";
import TrainerChat from "../components/TrainerChat";
import { buildPlanCatalog } from "./planCatalog";
import { assignPlanItems } from "./planAllocation";
global.IS_REACT_ACT_ENVIRONMENT = true;
global.TextEncoder = TextEncoder;
Object.defineProperty(global, "crypto", {
  configurable: true,
  value: require("crypto").webcrypto,
});
let host, root, api, server, recorderFactory, callbacks, props;
beforeEach(() => {
  URL.createObjectURL = jest.fn(() => "blob:synthetic-recording");
  URL.revokeObjectURL = jest.fn();
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
  expect(document.activeElement).not.toBe(host.querySelector("textarea"));
  expect(document.activeElement).toBe(button("Закрити чат"));
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
test("H01 stop previews editable text and waits for an explicit send", async () => {
  await render();
  await click("Почати запис");
  expect(recorderFactory).toHaveBeenCalledTimes(1);
  await act(async () => {
    await callbacks.onStop(new Blob(["synthetic"]), 2);
  });
  expect(props.transcribe).toHaveBeenCalledTimes(1);
  expect(api.send).not.toHaveBeenCalled();
  expect(host.querySelector("textarea").value).toBe("Синтетичне яблуко");
  expect(button("Скасувати голосове")).toBeTruthy();
  expect(host.querySelector('audio[aria-label="Прослухати голосове перед надсиланням"]').getAttribute("src")).toBe("blob:synthetic-recording");
  await act(async () => Simulate.change(host.querySelector("textarea"), { target: { value: "Виправлене яблуко" } }));
  await click("Надіслати повідомлення");
  expect(api.send).toHaveBeenCalledTimes(1);
  expect(api.send.mock.calls[0][0].text).toBe("Виправлене яблуко");
  expect(button("Скасувати голосове")).toBeFalsy();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-recording");
  expect(props.onAdd).not.toHaveBeenCalled();
});
test("cancel voice preview restores existing text without sending or losing photos", async () => {
  server.composer.text = "Вже набраний текст";
  props.photoNormalizer = jest.fn(async () => ({ type: "image/jpeg", data: "synthetic-photo", preview: "data:image/jpeg;base64,c3ludGhldGlj" }));
  await render();
  await act(async () => Simulate.change(host.querySelector('input[type="file"]'), { target: { files: [new File(["photo"], "synthetic.jpg", { type: "image/jpeg" })], value: "" } }));
  await click("Почати запис");
  await act(async () => callbacks.onStop(new Blob(["synthetic"]), 2));
  expect(host.querySelector("textarea").value).toBe("Вже набраний текст\nСинтетичне яблуко");
  await click("Скасувати голосове");
  expect(host.querySelector("textarea").value).toBe("Вже набраний текст");
  expect(api.send).not.toHaveBeenCalled();
  expect(button("Почати запис").disabled).toBe(false);
  expect(host.querySelectorAll('img[alt="Фото етикетки перед надсиланням"]')).toHaveLength(1);
});
test("cancel before the voice metric ACK never opens the microphone", async () => {
  const pending = deferred();
  props.ledger = { enabled: true, start: jest.fn(() => pending.promise), update: jest.fn(async () => {}) };
  await render();
  await click("Почати запис");
  await click("Скасувати запис");
  await act(async () => pending.resolve("cancelled-attempt"));
  expect(recorderFactory).not.toHaveBeenCalled();
  expect(props.transcribe).not.toHaveBeenCalled();
  expect(api.send).not.toHaveBeenCalled();
});
test("cancel during transcription ignores a late transcript", async () => {
  const pending = deferred();
  props.transcribe = jest.fn(() => pending.promise);
  await render();
  await click("Почати запис");
  let stopped;
  await act(async () => { stopped = callbacks.onStop(new Blob(["synthetic"]), 2); });
  await click("Скасувати запис");
  await act(async () => { pending.resolve({ text: "Скасований текст" }); await stopped; });
  expect(host.querySelector("textarea").value).toBe("");
  expect(api.send).not.toHaveBeenCalled();
  expect(button("Скасувати голосове")).toBeFalsy();
});
test("explicit send locks preview cancellation while its metric ACK is pending", async () => {
  const pending = deferred();
  props.ledger = { enabled: true, start: jest.fn(async () => "voice-attempt"), update: jest.fn(async (_id, patch) => {
    if (patch.status === "processing") await pending.promise;
  }) };
  await render();
  await click("Почати запис");
  await act(async () => callbacks.onStop(new Blob(["synthetic"]), 2));
  await click("Надіслати повідомлення");
  expect(button("Скасувати голосове").disabled).toBe(true);
  await act(async () => Simulate.click(button("Скасувати голосове")));
  expect(host.querySelector("textarea").value).toBe("Синтетичне яблуко");
  await act(async () => pending.resolve());
  expect(api.send).toHaveBeenCalledTimes(1);
  expect(api.send.mock.calls[0][0].text).toBe("Синтетичне яблуко");
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
  expect(button("Прикріпити фото").disabled).toBe(false);
  await act(async () => Simulate.click(button("Прикріпити фото")));
  expect(button("Сфотографувати").disabled).toBe(false);
  expect(button("З галереї").disabled).toBe(false);
});


test("C01 food shortcut focuses input without inference or recording", async () => {
  await render();
  await click("Записати їжу");
  expect(document.activeElement).toBe(host.querySelector("textarea"));
  expect(api.send).not.toHaveBeenCalled();
  expect(recorderFactory).not.toHaveBeenCalled();
});
test("C01 advice shortcut submits one question without writing food", async () => {
  await render();
  await click("Що краще поїсти?");
  expect(api.send).toHaveBeenCalledTimes(1);
  expect(api.send.mock.calls[0][0]).toEqual(expect.objectContaining({text:"Що краще поїсти?",dateContext:{mode:"default"}}));
  expect(api.send.mock.calls[0][0]).not.toHaveProperty("targetDate");
  expect(props.onAdd).not.toHaveBeenCalled();
});
test("C04 opening a historical diary does not pin the conversation day", async () => {
  props.date="2026-01-01";
  await render();
  expect(host.querySelector('input[type="date"]')).toBeNull();
  await click("Що залишилося на сьогодні?");
  expect(api.send.mock.calls[0][0].dateContext).toEqual({mode:"default"});
});
test("C04 explicit pin is visible and can be returned to today", async () => {
  props.initialDateContext={mode:"pinned",targetDate:"2026-01-02"};
  await render();
  expect(host.textContent).toContain("02.01.2026");
  await click("Сьогодні");
  await click("Що краще поїсти?");
  expect(api.send.mock.calls[0][0].dateContext).toEqual({mode:"default"});
});


function previewFixture() {
  const catalog=buildPlanCatalog({profile:{}});
  const ref=catalog.references.find(r=>r.name==='фрукти та ягоди');
  const item={itemId:'synthetic-fruit',name:'Синтетичний плід',quantity:{value:200,unit:'g'},nutritionBasis:{value:100,unit:'g'},nutrients:{p:1,f:2,c:3,cal:60},source:{kind:'estimate'},estimated:true,nutritionStatus:'complete',planMatch:{referenceId:ref.refId,consumedState:'as_sold',certainty:'matched'}};
  const [existing]=assignPlanItems([{...item,itemId:'prior-fruit'}],catalog,{});
  const freshness={targetDate:'2026-01-02',dayRevision:7,planFingerprint:catalog.fingerprint,notesRevision:'none'};
  const day={targetDate:'2026-01-02',meals:{1:{з:[existing]}},freshness};
  server.drafts=[{draftId:'synthetic-draft',revision:1,state:'ready',targetDate:day.targetDate,meal:1,items:[item],freshness}];
  api.day=jest.fn(async()=>day);
  api.refreshDraft=jest.fn(async()=>{server.drafts[0].freshness=day.freshness;server.drafts[0].revision++;return server.drafts[0];});
  props.planContext={profile:{}};
  props.date='2026-01-03';
  props.dayMeals={};
  return {day};
}
test("C04 historical preview reads its actual nonempty day and uses existing portions", async()=>{
  previewFixture();
  await render();
  expect(api.day).toHaveBeenCalledWith('2026-01-02',expect.any(AbortSignal));
  expect(host.textContent).toContain('За день: 50% → 100%');
  expect(button('Додати').disabled).toBe(false);
  expect(host.querySelector('.trainer-draft-date').open).toBe(false);
  expect(host.querySelector('.voice-plan details').open).toBe(false);
});
test("C04 unavailable historical day blocks Add and allows explicit no-model refresh",async()=>{
  previewFixture();
  api.day.mockRejectedValueOnce(Error('day_unavailable'));
  await render();
  expect(button('Додати').disabled).toBe(true);
  expect(host.textContent).toContain('Не вдалося прочитати цей день');
  await click('Оновити прев’ю');
  expect(api.refreshDraft).toHaveBeenCalledTimes(1);
  expect(api.send).not.toHaveBeenCalled();
  expect(button('Додати').disabled).toBe(false);
});
test("C04 changed day revision blocks Add until explicit refresh",async()=>{
  const {day}=previewFixture();
  day.freshness={...day.freshness,dayRevision:8};
  await render();
  expect(button('Додати').disabled).toBe(true);
  await click('Оновити прев’ю');
  expect(api.send).not.toHaveBeenCalled();
  expect(button('Додати').disabled).toBe(false);
});
test("C04 race after displayed preview stops commit when day changed",async()=>{
  const {day}=previewFixture();
  await render();
  day.freshness={...day.freshness,dayRevision:8};
  await click('Додати');
  expect(props.onAdd).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Записи дня змінилися');
  expect(button('Додати').disabled).toBe(true);
});

test("C01 explicit opener receives focus even when mounting hides it",async()=>{
 const opener=document.createElement('button');document.body.appendChild(opener);props.returnFocusRef={current:opener};
 await render();await act(async()=>root.unmount());
 for (let n=0;n<50 && document.activeElement!==opener;n++) await new Promise(resolve=>setTimeout(resolve,10));
 expect(document.activeElement).toBe(opener);
 opener.remove();root=createRoot(host);
});

test("C04 preview uses the freshly read catalog instead of an older page plan",async()=>{
 const {day}=previewFixture();
 day.catalog=buildPlanCatalog({profile:{portions:{'фрукти та ягоди':500}}});
 await render();
 expect(host.textContent).toContain('За день: 50% → 90%');
 expect(host.textContent).not.toContain('За день: 50% → 100%');
});

test("saved note-only receipt names the note without pretending it has zero calories", async () => {
  previewFixture();
  const draft = server.drafts[0];
  draft.state = 'saved'; draft.save = { command: { items: [], notes: [{ itemId: 'unknown-note', name: 'Домашня страва' }] } };
  await render();
  const receipt = host.querySelector('[data-testid="trainer-saved-receipt"]');
  expect(receipt.textContent).toContain('Домашня страва · нотатка');
  expect(receipt.textContent).toContain('без повного розрахунку калорій');
  expect(receipt.textContent).not.toContain('0 ккал');
});
test("unknown save stays expanded beside a newer advice message", async () => {
  previewFixture();
  server.drafts[0].state = 'unknown'; server.drafts[0].turnId = 'old';
  server.messages = [{ id: 'old-u', role: 'user', content: 'Їжа' }, { id: 'new-u', role: 'user', content: 'Порада' }];
  server.latestTurn = { turnId: 'new', text: 'Порада', state: 'completed' };
  await render();
  const card = host.querySelector('[data-testid="trainer-draft"]');
  expect(card.closest('.trainer-older-draft')).toBeNull();
  expect(card.textContent).toContain('Запис ще не підтверджено');
  expect(button('Перевірити й завершити').disabled).toBe(false);
});

test.each(['бобові', 'сир кисломолочний 0,2%'])(
  'C03 saved %s keeps its confirmed letter and portion after reopening',
  async (name) => {
    const catalog = buildPlanCatalog({ profile: {} });
    const ref = catalog.references.find((r) => r.name === name);
    const item = {
      itemId: 'saved-synthetic-food', name,
      quantity: { value: ref.norm, unit: 'g' },
      nutritionBasis: { value: 100, unit: 'g' },
      nutrients: { p: 10, f: 1, c: 20, cal: 130 },
      source: { kind: 'estimate' }, estimated: true,
      nutritionStatus: 'complete',
      planMatch: { referenceId: ref.refId, consumedState: 'as_sold', certainty: 'matched' },
    };
    const [confirmed] = assignPlanItems([item], catalog, {});
    const letter = confirmed.planAllocation.letter;
    const meals = { 1: { [letter]: [confirmed] } };
    // A fresh allocation must differ, otherwise this fixture misses the regression.
    expect(assignPlanItems([item], catalog, meals)[0].planAllocation.letter).not.toBe(letter);
    const freshness = { targetDate: '2026-01-02', dayRevision: 8, planFingerprint: 'synthetic', notesRevision: 'none' };
    const day = { targetDate: freshness.targetDate, meals, freshness, catalog };
    server.drafts = [{ draftId: 'saved-draft', revision: 2, state: 'saved', targetDate: day.targetDate, meal: 1, items: [item], freshness, save: { command: { items: [confirmed] } } }];
    api.day = jest.fn(async () => day);
    props.planContext = { profile: {} };
    props.dayMeals = {};
    const assertConfirmed = () => {
      const receipt = host.querySelector('[data-testid="trainer-saved-receipt"]');
      expect(receipt.textContent).toContain(name + ' · ' + letter.toUpperCase() + ' · 100% норми');
      expect(receipt.querySelector('input,select')).toBeNull();
      expect(receipt.textContent).not.toContain('Змінити дату або прийом');
    };
    await render();
    assertConfirmed();
    await act(async () => root.unmount());
    root = createRoot(host);
    await render();
    assertConfirmed();
  },
);

test("native canonical history has no projection delete or 30-day promise", async () => {
  server.canonicalHistory = true;
  await render();
  expect(host.textContent).toContain("Розмова зберігається у Hermes");
  expect(host.textContent).not.toContain("зберігаються 30 днів");
  expect(button("Видалити розмову")).toBeUndefined();
});

test("native receipt avoids a duplicate optimistic user bubble", async () => {
  const text = "Синтетичне яблуко";
  server.canonicalHistory = true;
  server.messages = [{ id: "native-user", turnId: "synthetic-latest-input", role: "user", content: text }];
  server.latestTurn = { turnId: "synthetic-latest-input", text, nativeInputClaimed: true, state: "completed" };
  await render();
  expect(host.querySelectorAll(".trainer-message.from-user")).toHaveLength(1);
});

test("native memory preview shows an addition and waits for explicit confirmation", async () => {
  const proposal = { proposalId: "synthetic-memory-proposal", baseRevision: 1, text: "Новий особистий факт", state: "proposed" };
  server.canonicalHistory = true; server.contextProposals = [proposal];
  api.context = jest.fn(async () => ({ text: "Поточні особисті факти", revision: 1, mode: "append" }));
  api.remember = jest.fn(async () => { server.contextProposals = [{ ...proposal, state: "applied" }]; return { revision: 2 }; });
  await render(); await click("Переглянути зміни");
  expect(host.textContent).toContain("Додати до пам’яті"); expect(host.textContent).toContain(proposal.text);
  const current = [...host.querySelectorAll("details")].find(value => value.querySelector("summary")?.textContent === "Поточна пам’ять");
  expect(current).toBeTruthy(); expect(current.open).toBe(false);
  expect(api.remember).not.toHaveBeenCalled(); await click("Запам’ятати");
  expect(api.remember).toHaveBeenCalledTimes(1); expect(api.remember.mock.calls[0][0]).toBe(proposal.proposalId);
});

test("failed transcription keeps the same local recording and retries only on request", async () => {
  server.composer.text = "Попередній текст";
  props.transcribe = jest.fn().mockRejectedValueOnce(Error("upstream_timeout")).mockResolvedValueOnce({ text: "Розпізнаний повтор" });
  await render(); await click("Почати запис");
  await act(async () => callbacks.onStop(new Blob(["synthetic"]), 2));
  expect(host.querySelector("audio")).toBeTruthy();
  expect(host.querySelector("textarea").value).toBe("Попередній текст");
  expect(button("Надіслати повідомлення").disabled).toBe(true);
  expect(api.send).not.toHaveBeenCalled();
  await click("Розпізнати ще раз");
  expect(recorderFactory).toHaveBeenCalledTimes(1);
  expect(props.transcribe).toHaveBeenCalledTimes(2);
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  expect(host.querySelector("textarea").value).toBe("Попередній текст\nРозпізнаний повтор");
  expect(api.send).not.toHaveBeenCalled();
  await click("Скасувати голосове");
  expect(host.querySelector("textarea").value).toBe("Попередній текст");
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
});

test("failed canonical message offers restoration without a duplicate message or automatic send", async () => {
  server.canonicalHistory = true;
  server.messages = [{ id: "native-user", turnId: "synthetic-failed-turn", role: "user", content: "Повернути цей текст" }];
  server.latestTurn = { turnId: "synthetic-failed-turn", state: "failed", error: "trainer_failed", text: "Повернути цей текст", targetDate: "2026-01-02", nativeInputClaimed: true };
  await render();
  expect(host.querySelectorAll(".from-user")).toHaveLength(1);
  expect(host.textContent).not.toContain("Перевірте з’єднання");
  await click("Повернути текст для уточнення");
  expect(host.querySelector("textarea").value).toBe("Повернути цей текст");
  expect(host.querySelector(".trainer-date-chip").textContent).toContain("02.01.2026");
  expect(api.send).not.toHaveBeenCalled();
});

test.each(['retry', 'cancel'])("STT failure preserves later manual edits on %s", async action => {
  server.composer.text = "Яблуко";
  props.transcribe = jest.fn().mockRejectedValueOnce(Error('upstream_timeout')).mockResolvedValueOnce({ text: 'Молоко' });
  await render(); await click('Почати запис');
  await act(async () => callbacks.onStop(new Blob(['synthetic']), 2));
  await act(async () => Simulate.change(host.querySelector('textarea'), { target: { value: 'Яблуко200г' } }));
  if (action === 'retry') {
    await click('Розпізнати ще раз');
    expect(host.querySelector('textarea').value).toBe('Яблуко200г\nМолоко');
  }
  await click('Скасувати голосове');
  expect(host.querySelector('textarea').value).toBe('Яблуко200г');
  expect(api.send).not.toHaveBeenCalled();
});

test('restoration makes relative dates explicit and owner switch clears the old date', async () => {
  const text = 'Учора з’їв яблуко';
  server.latestTurn = { turnId: 'synthetic-yesterday', state: 'failed', error: 'trainer_failed', text, sentAt: '2026-10-26T12:00:00Z', targetDate: '2026-10-25' };
  await render(); await click('Повернути текст для уточнення');
  expect(host.querySelector('textarea').value).toBe('25.10.2026 з’їв яблуко');
  server = { ...server, conversationId: 'synthetic-wife', currentTurn: null, latestTurn: null, messages: [], composer: { text: '', revision: 0 } };
  props.uid = 'synthetic-wife'; props.ownerKey = 'synthetic-wife:profile';
  await render();
  expect(host.querySelector('.trainer-date-chip')).toBeNull();
  await act(async () => Simulate.change(host.querySelector('textarea'), { target: { value: 'Мій новий текст' } }));
  await click('Надіслати повідомлення');
  expect(api.send.mock.calls[0][0].dateContext).toEqual({ mode: 'default' });
});

test("stopping an unknown result restores input only after cancellation and never sends it", async () => {
  const turn = { turnId: "synthetic-unknown-turn", state: "unknown", error: "execution_unknown", text: "Незавершений текст", targetDate: "2026-01-02" };
  server.currentTurn = turn; server.latestTurn = turn;
  api.cancel = jest.fn(async () => { server.currentTurn = null; server.latestTurn = { ...turn, state: "cancelled" }; });
  await render(); await click("Зупинити й повернути текст");
  expect(api.cancel).toHaveBeenCalledWith("synthetic-unknown-turn", expect.anything());
  expect(host.querySelector("textarea").value).toBe("Незавершений текст");
  expect(api.send).not.toHaveBeenCalled();
});

test("an old unknown cancellation cannot copy its text into another owner", async () => {
  const pending = deferred();
  const turn = { turnId: "synthetic-unknown-owner", state: "unknown", text: "Текст першого профілю" };
  server.currentTurn = turn; server.latestTurn = turn;
  api.cancel = jest.fn(() => pending.promise);
  await render(); await click("Зупинити й повернути текст");
  server = { ...server, conversationId: "synthetic-wife", currentTurn: null, latestTurn: null, messages: [], composer: { text: "", revision: 0 } };
  props.uid = "synthetic-wife"; props.ownerKey = "synthetic-wife:profile";
  await render();
  await act(async () => pending.resolve({ state: "cancelled" }));
  expect(host.querySelector("textarea").value).toBe("");
  expect(api.send).not.toHaveBeenCalled();
});

test('returning a cancelled message retries its unconfirmed Native cleanup before restoring text',async()=>{
 server.latestTurn={turnId:'synthetic-cancel-pending',state:'cancelled',cleanupPending:true,text:'Незавершений текст'};
 await render();await click('Повернути текст для уточнення');
 expect(api.cancel).toHaveBeenCalledWith('synthetic-cancel-pending',expect.anything());
 expect(host.querySelector('textarea').value).toBe('Незавершений текст');expect(api.send).not.toHaveBeenCalled();
});

test('cancelled cleanup still blocks sending and exposes an explicit stop control',async()=>{
 server.currentTurn={turnId:'synthetic-stopping',state:'cancelled',cleanupPending:true,text:'Попереднє повідомлення'};
 server.composer.text='Нове повідомлення';
 await render();
 expect(host.querySelector('[aria-label="Надіслати повідомлення"]').disabled).toBe(true);
 expect(host.querySelector('[aria-label="Почати запис"]').disabled).toBe(true);
 expect(host.textContent).toContain('Завершую попередню обробку');
 await click('Скасувати обробку');
 expect(api.cancel).toHaveBeenCalledWith('synthetic-stopping',expect.anything());
 expect(api.send).not.toHaveBeenCalled();
});

test("closing a voice preview releases its local object URL", async () => {
  await render(); await click("Почати запис");
  await act(async () => callbacks.onStop(new Blob(["synthetic"]), 2));
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  root = createRoot(host);
});
describe("1.9.6 chat stream", () => {
  const prev = "turn-previous-000001", active = "turn-active-00000001";
  test("S6 turn status is the last row of the message list, below the user's message, not in the composer", async () => {
    server.messages = [
      { id: prev + "-u", turnId: prev, role: "user", content: "З’їв яблуко" },
      { id: prev + "-a", turnId: prev, role: "assistant", content: "Готово" },
      { id: active + "-u", turnId: active, role: "user", content: "З’їв 200 г філе" },
    ];
    server.drafts = [{ draftId: "synthetic-saved-draft", revision: 1, state: "saved", targetDate: "2026-01-03", meal: 1, turnId: prev, items: [], save: { command: { items: [], notes: [] } } }];
    server.currentTurn = { turnId: active, state: "running" };
    server.latestTurn = { turnId: active, state: "running", text: "З’їв 200 г філе" };
    await render();
    const list = host.querySelector(".trainer-messages");
    const status = list.lastElementChild;
    expect(status.matches(".trainer-turn[role=status]")).toBe(true);
    expect(status.textContent).toContain("Тренер розбирає повідомлення");
    expect(button("Скасувати обробку")).toBeTruthy();
    const user = [...list.querySelectorAll(".trainer-message.from-user")].at(-1);
    expect(user.textContent).toContain("200 г філе");
    expect(user.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(list.querySelector('[data-testid="trainer-saved-receipt"]').compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host.querySelector("footer .trainer-turn")).toBeNull();
  });
  test.each([
    ["a short message stays fully in view with the status under it", 200, (message, status) => message.top === 12 && status.bottom <= 600],
    ["a long message scrolls to its end so the status and its buttons stay in view", 890, (message, status) => status.top >= 0 && status.bottom <= 600 && message.bottom > 0],
  ])("S6 %s", async (_name, height, visible) => {
    // Layout mock: content moves up as the chat scrolls; the scroll area is 600 px high.
    const area = () => host.querySelector(".trainer-scroll");
    const rect = (top, bottom) => ({ top, bottom, height: bottom - top, left: 0, right: 390, width: 390, x: 0, y: top, toJSON() {} });
    const layout = jest.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function () {
      const y = area()?.scrollTop || 0;
      if (this.classList.contains("trainer-scroll")) return rect(0, 600);
      if (this.classList.contains("trainer-turn")) return rect(310 + height - y, 390 + height - y);
      if (this.nextElementSibling?.classList.contains("trainer-turn")) return rect(300 - y, 300 + height - y);
      return rect(0, 0);
    });
    try {
      server.messages = [{ id: active + "-u", turnId: active, role: "user", content: "Синтетичний список їжі" }];
      server.currentTurn = { turnId: active, state: "running" };
      server.latestTurn = { turnId: active, state: "running" };
      await render();
      const status = host.querySelector(".trainer-messages > .trainer-turn");
      expect(visible(status.previousElementSibling.getBoundingClientRect(), status.getBoundingClientRect())).toBe(true);
    } finally { layout.mockRestore(); }
  });
  test("S6 status without the turn's message in the list is still the last row", async () => {
    server.currentTurn = { turnId: active, state: "queued" };
    await render();
    const list = host.querySelector(".trainer-messages");
    expect(list.lastElementChild.matches(".trainer-turn")).toBe(true);
    expect(list.lastElementChild.textContent).toContain("Повідомлення отримано");
  });
  test("S7 trainer **bold** renders as strong; stray ** and backticks disappear; single * stays", async () => {
    server.messages = [
      { id: prev + "-u", turnId: prev, role: "user", content: "Скільки **лишилось**?" },
      { id: prev + "-a", turnId: prev, role: "assistant", content: "Юра, **1385 ккал** до вечері, код `x`. Ще ** без пари і *одна* зірка." },
    ];
    await render();
    const trainer = host.querySelector(".trainer-message.from-trainer");
    expect([...trainer.querySelectorAll("strong")].map(e => e.textContent)).toEqual(["1385 ккал"]);
    expect(trainer.textContent).not.toMatch(/\*\*|`/);
    expect(trainer.textContent).toContain("код x.");
    expect(trainer.textContent).toContain("*одна*");
    expect(host.querySelector(".trainer-message.from-user").textContent).toContain("Скільки **лишилось**?");
  });
  test("S5 a connection error from a failed action clears itself once background checks reach the app", async () => {
    jest.useFakeTimers();
    try {
      server.currentTurn = { turnId: active, state: "running" };
      server.latestTurn = { turnId: active, state: "running" };
      api.cancel = jest.fn(async () => { throw Error("network_unavailable"); });
      await render();
      await click("Скасувати обробку");
      expect(host.querySelector(".trainer-error")?.textContent).toContain("Не вдалося зв’язатися");
      const polls = api.state.mock.calls.length;
      await act(async () => { jest.advanceTimersByTime(2500); });
      expect(api.state.mock.calls.length).toBeGreaterThan(polls);
      expect(host.querySelector(".trainer-error")).toBeNull();
    } finally { jest.useRealTimers(); }
  });
  test("S7 markup in trainer text stays text", async () => {
    server.messages = [{ id: prev + "-a", turnId: prev, role: "assistant", content: "<b>x</b> **y**" }];
    await render();
    const trainer = host.querySelector(".trainer-message.from-trainer");
    expect(trainer.querySelector("b")).toBeNull();
    expect(trainer.textContent).toContain("<b>x</b>");
  });
});

describe("1.9.7 card control", () => {
  const unknownItem = { itemId: "synthetic-home", name: "Синтетична домашня страва", quantity: { value: null, unit: "unknown" }, nutritionBasis: { value: null, unit: "unknown" }, nutrients: { p: null, f: null, c: null, cal: null }, source: { kind: "unknown" }, estimated: false, nutritionStatus: "unknown" };
  const settle = () => act(async () => { await new Promise(r => setTimeout(r, 750)); });
  function cardFixture({ noteId } = {}) {
    previewFixture();
    const draft = server.drafts[0];
    draft.items = [...draft.items, JSON.parse(JSON.stringify(unknownItem))];
    if (noteId) { draft.noteId = noteId; draft.items = [JSON.parse(JSON.stringify(unknownItem))]; }
    api.edit = jest.fn(async (id, body) => {
      const d = server.drafts.find(x => x.draftId === id);
      if (body.baseRevision !== d.revision) throw Error("draft_conflict");
      const removed = body.removeItemIds || [];
      if (body.items.some(i => removed.includes(i.itemId))) throw Error("invalid_request");
      d.items = d.items.filter(i => !removed.includes(i.itemId)).map(i => ({ ...i, ...body.items.find(x => x.itemId === i.itemId) }));
      d.revision++;
      return JSON.parse(JSON.stringify(d));
    });
    api.prepareSave = jest.fn(async (id, revision) => {
      const d = server.drafts.find(x => x.draftId === id);
      if (revision !== d.revision) throw Error("draft_conflict");
      if (d.items.some(i => i.nutritionStatus !== "complete" && i.noteSelected !== true)) throw Error("note_confirmation_required");
      Object.assign(d, { state: "saved", save: { command: { items: d.items.filter(i => i.nutritionStatus === "complete"), notes: d.items.filter(i => i.nutritionStatus !== "complete") } } });
      return JSON.parse(JSON.stringify(d));
    });
    api.receipt = jest.fn(async (id) => JSON.parse(JSON.stringify(server.drafts.find(x => x.draftId === id))));
    return draft;
  }
  const removeButton = (name) => host.querySelector(`button[aria-label="Прибрати ${name}"]`);
  test("S1 «Прибрати» takes a product out of the card and sends only its removal", async () => {
    cardFixture();
    await render();
    expect(removeButton("Синтетична домашня страва")?.textContent).toBe("Прибрати");
    await click("Прибрати Синтетична домашня страва");
    expect(host.querySelector('[data-testid="trainer-draft"]').textContent).not.toContain("Синтетична домашня страва");
    await settle();
    expect(api.edit).toHaveBeenCalledTimes(1);
    const body = api.edit.mock.calls[0][1];
    expect(body.removeItemIds).toEqual(["synthetic-home"]);
    expect(body.items.some(i => i.itemId === "synthetic-home")).toBe(false);
    expect(server.drafts[0].items.map(i => i.itemId)).toEqual(["synthetic-fruit"]);
    expect(button("Додати").disabled).toBe(false);
    expect(host.querySelector(".trainer-add-reason")).toBeNull();
  });
  test("S1 removals before sending go in one edit without the removed product's own changes", async () => {
    const draft = cardFixture();
    draft.items = [...draft.items, { ...draft.items[0], itemId: "synthetic-extra", name: "Синтетичний зайвий плід" }];
    await render();
    await act(async () => { Simulate.change(host.querySelector('select[aria-label="Одиниця 3"]'), { target: { value: "ml" } }); });
    await click("Прибрати Синтетичний зайвий плід");
    await click("Прибрати Синтетична домашня страва");
    await settle();
    expect(api.edit).toHaveBeenCalledTimes(1);
    const body = api.edit.mock.calls[0][1];
    expect([...body.removeItemIds].sort()).toEqual(["synthetic-extra", "synthetic-home"]);
    expect(body.items).toEqual([]);
    expect(server.drafts[0].items.map(i => i.itemId)).toEqual(["synthetic-fruit"]);
  });
  test("S1 a note card with several products also offers «Прибрати»", async () => {
    const draft = cardFixture({ noteId: "synthetic-note-000000002" });
    draft.items = [...draft.items, { ...JSON.parse(JSON.stringify(unknownItem)), itemId: "synthetic-soup", name: "Синтетичний суп" }];
    await render();
    expect(removeButton("Синтетичний суп")).toBeTruthy();
  });
  test("S1 the last product and a frozen card have no «Прибрати»", async () => {
    previewFixture();
    await render();
    expect(removeButton("Синтетичний плід")).toBeNull();
    await act(async () => root.unmount());
    root = createRoot(host);
    cardFixture();
    server.drafts[0].state = "unknown";
    await render();
    expect(host.querySelector('button[aria-label^="Прибрати "]')).toBeNull();
  });
  test("S1 «Прибрати» is off while the card is locked", async () => {
    cardFixture();
    server.drafts[0].blocked = true;
    await render();
    expect(removeButton("Синтетична домашня страва")?.disabled).toBe(true);
  });
  test("S2 «Додати» waits while a removal is still queued", async () => {
    const draft = cardFixture();
    draft.items = [...draft.items, { ...draft.items[0], itemId: "synthetic-extra", name: "Синтетичний зайвий плід" }];
    await render();
    await click("Прибрати Синтетичний зайвий плід");
    expect(button("Додати").disabled).toBe(true);
    expect(host.textContent).toContain("Зберігаю зміни прев’ю…");
    await settle();
  });
  test("S3 several products without calories use the plural", async () => {
    const draft = cardFixture();
    draft.items = [...draft.items, { ...JSON.parse(JSON.stringify(unknownItem)), itemId: "synthetic-soup", name: "Синтетичний суп" }];
    await render();
    expect(button("Додати").previousElementSibling.textContent).toBe("Без розрахунку калорій: «Синтетична домашня страва», «Синтетичний суп». Збережуться нотатками, у суму калорій не ввійдуть.");
  });
  test("S2 «Додати» saves a product without calories as a note instead of blocking", async () => {
    cardFixture();
    await render();
    expect(button("Додати").disabled).toBe(false);
    expect(host.textContent).not.toContain("Зберегти як нотатку без повного розрахунку");
    await click("Додати");
    expect(api.edit).toHaveBeenCalledTimes(1);
    expect(api.edit.mock.calls[0][1].items).toEqual([{ itemId: "synthetic-home", noteSelected: true }]);
    expect(api.prepareSave).toHaveBeenCalledTimes(1);
    expect(api.edit.mock.invocationCallOrder[0]).toBeLessThan(api.prepareSave.mock.invocationCallOrder[0]);
    expect(api.prepareSave.mock.calls[0][1]).toBe(server.drafts[0].revision);
    expect(host.querySelector('[data-testid="trainer-saved-receipt"]').textContent).toContain("Синтетична домашня страва · нотатка");
  });
  test("S2 a failed note confirmation does not save and leaves «Додати» available", async () => {
    cardFixture();
    api.edit.mockRejectedValueOnce(Error("draft_conflict"));
    await render();
    await click("Додати");
    expect(api.edit).toHaveBeenCalledTimes(1);
    expect(api.prepareSave).not.toHaveBeenCalled();
    expect(host.querySelector(".trainer-error")).toBeTruthy();
    expect(button("Додати").disabled).toBe(false);
  });
  test("S3 the reason sits right above «Додати» and names the product", async () => {
    cardFixture();
    await render();
    const add = button("Додати");
    expect(add.previousElementSibling.textContent).toBe("Без розрахунку калорій: «Синтетична домашня страва». Збережеться нотаткою, у суму калорій не ввійде.");
  });
  test("S3 a note card without quantity keeps «Додати» off and says what to do", async () => {
    cardFixture({ noteId: "synthetic-note-000000001" });
    await render();
    const add = button("Додати");
    expect(add.disabled).toBe(true);
    expect(add.previousElementSibling.textContent).toBe("Щоб записати «Синтетична домашня страва», уточніть кількість або напишіть тренеру, скільки це калорій.");
  });
});
