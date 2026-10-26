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
 await new Promise(resolve=>setTimeout(resolve,5));expect(document.activeElement).toBe(opener);
 opener.remove();root=createRoot(host);
});

test("C04 preview uses the freshly read catalog instead of an older page plan",async()=>{
 const {day}=previewFixture();
 day.catalog=buildPlanCatalog({profile:{portions:{'фрукти та ягоди':500}}});
 await render();
 expect(host.textContent).toContain('За день: 50% → 90%');
 expect(host.textContent).not.toContain('За день: 50% → 100%');
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
      const badge = host.querySelector('.voice-plan-badge').textContent;
      expect(badge.startsWith(letter.toUpperCase() + ' ·')).toBe(true);
      expect(badge).toContain('100% норми');
      expect(host.textContent).toContain('За день: 100% → 100%');
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
  server.messages = [{ id: "native-user", role: "user", content: text }];
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
