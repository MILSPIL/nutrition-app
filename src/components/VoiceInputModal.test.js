import {TextEncoder} from 'util';
import {createHash} from 'crypto';
global.TextEncoder=TextEncoder;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import VoiceInputModal from "./VoiceInputModal";
import { pilotSummary } from "../services/pilotLedger";
jest.mock("../services/voiceApi", () => ({ voiceError: (e) => e.message }));
jest.mock("../services/useMealDay", () => ({ saveError: (e) => e.message }));
global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, props, rows, recorders, counter;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const food = (name = "Тестовий кефір", unit = "g") => ({
  name,
  quantity: { value: 200, unit },
  nutritionBasis: { value: 100, unit },
  nutrients: { p: 2.9, f: 2.5, c: 4, cal: 53 },
  source: { kind: "estimate" },
  estimated: true,
});
const answer = (items = [food()], unparsed = []) => ({ items, unparsed });
const render = async (patch) => {
  Object.assign(props, patch);
  await act(async () => {
    root.render(<VoiceInputModal {...props} />);
  });
};
const openAndStart = async patch => { await render(patch); if (button("Почати запис")) await click("Почати запис"); };
const button = (name) =>
  [...container.querySelectorAll("button")].find(
    (b) =>
      b.textContent.trim() === name || b.getAttribute("aria-label") === name,
  );
const click = async (name) => {
  const node = button(name);
  expect(node).toBeTruthy();
  expect(node.disabled).toBe(false);
  await act(async () => Simulate.click(node));
};
const change = async (label, value) => {
  const node = container.querySelector(`[aria-label="${label}"]`);
  await act(async () => Simulate.change(node, { target: { value } }));
};
const stop = () => click("Зупинити запис");
const photo = async () => {
  const input = container.querySelector('[aria-label="Фото з галереї"]');
  await act(async () =>
    Simulate.change(input, {
      target: { files: [new Blob(["photo"])], value: "" },
    }),
  );
};
beforeEach(() => {
  localStorage.clear();
  counter = 0;
  Object.defineProperty(global, "crypto", {
    configurable: true,
    // Детермінований SHA-256 fixture: справжній hash, без гонки libuv thread pool із React act у Linux CI.
    value: { subtle:{digest:async(_algorithm,bytes)=>Uint8Array.from(createHash('sha256').update(bytes).digest()).buffer}, randomUUID: () => `uuid-${++counter}` },
  });
  window.confirm = jest.fn(() => true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  rows = [];
  recorders = [];
  props = {
    isOpen: true,
    date: "2026-10-20",
    activeDate: "2026-10-20",
    meal: 1,
    onClose: jest.fn(),
    onAdd: jest.fn(async () => ({})),
    onSaved: jest.fn(),
    api: {
      transcribe: jest.fn(async () => ({ text: "Випив 200 грамів кефіру" })),
      analyze: jest.fn(async () => answer()),
    },
    ledger: {
      enabled: true,
      start: jest.fn(async (parent) => {
        const attemptId = `attempt-${rows.length + 1}`;
        rows.push({ attemptId, parentAttemptId: parent, status: "started" });
        return attemptId;
      }),
      update: jest.fn(async (id, patch) => {
        Object.assign(
          rows.find((r) => r.attemptId === id),
          patch,
        );
      }),
    },
    recorderFactory: (cb) => {
      const recorder = {
        start: jest.fn(() => cb.onState("recording")),
        cancel: jest.fn(),
        stop: jest.fn(() =>
          cb.onStop(new Blob(["sound"], { type: "audio/wav" }), 1),
        ),
      };
      recorders.push(recorder);
      return recorder;
    },
    photoNormalizer: async () => ({
      type: "image/jpeg",
      data: "synthetic",
      preview: "data:image/jpeg;base64,c3ludGhldGlj",
    }),
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});
test("Stop автоматично створює прев’ю; подвійна Додати чекає ACK і пише один раз", async () => {
  const save = deferred();
  props.onAdd = jest.fn(() => save.promise);
  await openAndStart();
  expect(rows).toHaveLength(1);
  await stop();
  expect(props.api.transcribe).toHaveBeenCalledTimes(1);
  expect(props.api.analyze).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("106 ккал");
  const add = button("Додати");
  await act(async () => {
    Simulate.click(add);
    Simulate.click(add);
  });
  expect(props.onAdd).toHaveBeenCalledTimes(1);
  expect(container.textContent).not.toContain("Прийом збережено");
  await act(async () => save.resolve({}));
  expect(container.textContent).toContain("Прийом збережено");
  expect(rows[0].status).toBe("saved");
  expect(pilotSummary(rows).successes).toBe(0);
  await click("Запис правильний і повний");
  expect(pilotSummary(rows).successes).toBe(1);
});
test("фото упаковки змінює існуючий рядок, етикетка переважає оцінку", async () => {
  await openAndStart();
  await stop();
  props.api.analyze.mockResolvedValue(
    answer([
      {
        ...food(),
        quantity: { value: 900, unit: "g" },
        source: { kind: "label" },
      },
    ]),
  );
  await photo();
  expect(container.querySelectorAll('[data-testid="voice-item"]')).toHaveLength(
    1,
  );
  expect(
    container.querySelector('[aria-label="Кількість продукту 1"]').value,
  ).toBe("200");
  expect(container.textContent).toContain("Етикетка");
  await change("Кількість продукту 1", "250");
  expect(container.textContent).toContain("133 ккал");
  await click("Додати");
  expect(props.onAdd.mock.calls[0][0].items[0].quantity.value).toBe(250);
  expect(rows[0].hasPhoto).toBe(true);
});
test("кілька продуктів потребують явної прив’язки фото", async () => {
  props.api.analyze.mockResolvedValue(answer([food(), food("Яблуко")]));
  await openAndStart();
  await stop();
  expect(button("Сфотографувати").disabled).toBe(true);
  const id = container.querySelector('[aria-label="Продукт для фото"]')
    .options[2].value;
  await change("Продукт для фото", id);
  props.api.analyze.mockResolvedValue(
    answer([{ ...food("Етикетка яблука"), source: { kind: "label" } }]),
  );
  await photo();
  expect(container.querySelector('[aria-label="Назва продукту 1"]').value).toBe(
    "Тестовий кефір",
  );
  expect(container.querySelector('[aria-label="Назва продукту 2"]').value).toBe(
    "Етикетка яблука",
  );
});
test("нерозбірлива етикетка не маскується автоматичним збереженням старої оцінки", async () => {
  await openAndStart();
  await stop();
  props.api.analyze.mockResolvedValue(
    answer([
      {
        ...food(),
        nutrients: { p: null, f: null, c: null, cal: null },
        source: { kind: "label" },
      },
    ]),
  );
  await photo();
  expect(button("Додати").disabled).toBe(true);
  expect(container.textContent).toContain("Фото ще потребує уточнення");
  await click("Продовжити з попередніми значеннями");
  expect(button("Додати").disabled).toBe(false);
  expect(container.textContent).toContain("Оцінка моделі");
});
test("тиша та явний retry дають дві спроби, попередня помилка зберігається", async () => {
  props.api.transcribe.mockResolvedValueOnce({ text: "" });
  await openAndStart();
  await stop();
  expect(rows[0].status).toBe("error");
  await click("Повторити обробку");
  expect(rows).toHaveLength(2);
  expect(rows[0].status).toBe("error");
  expect(rows[1].parentAttemptId).toBe(rows[0].attemptId);
  await click("Додати");
  await click("Запис правильний і повний");
  expect(pilotSummary(rows).percent).toBe(50);
});
test("частковий текст явно вилучається, але не зараховується в успішний пілот", async () => {
  props.api.analyze.mockResolvedValue(answer([food()], ["ще щось"]));
  await openAndStart();
  await stop();
  expect(button("Додати").disabled).toBe(true);
  await click("Вилучити цей фрагмент");
  await click("Додати");
  await click("Запис правильний і повний");
  expect(pilotSummary(rows).successes).toBe(0);
  expect(rows[0].partial).toBe(true);
});
test("пізній API після закриття/відкриття не відновлює стару чернетку", async () => {
  const old = deferred();
  props.api.transcribe.mockImplementationOnce(() => old.promise);
  await openAndStart();
  await stop();
  await render({ isOpen: false });
  await openAndStart({ isOpen: true });
  await act(async () => old.resolve({ text: "СТАРЕ" }));
  expect(container.textContent).not.toContain("СТАРЕ");
  expect(props.api.analyze).not.toHaveBeenCalled();
  expect(recorders[0].cancel).toHaveBeenCalled();
  expect(rows[0].status).toBe("abandoned");
  await stop();
  expect(container.textContent).toContain("106 ккал");
});
test("зміна дати вимагає явного перенесення, commit лишається один", async () => {
  await openAndStart();
  await stop();
  await render({ activeDate: "2026-10-21" });
  await click("Додати");
  expect(props.onAdd).not.toHaveBeenCalled();
  await click("Перенести на 2026-10-21");
  await click("Додати");
  expect(props.onAdd.mock.calls[0][1]).toBe("2026-10-21");
});
test("невизначене збереження повторює той самий payload та ID", async () => {
  props.onAdd
    .mockRejectedValueOnce(Error("save_unknown"))
    .mockResolvedValueOnce({});
  await openAndStart();
  await stop();
  await click("Додати");
  expect(container.textContent).not.toContain("Прийом збережено");
  expect(
    container.querySelector('[aria-label="Кількість продукту 1"]').disabled,
  ).toBe(true);
  await click("Перевірити збереження");
  expect(props.onAdd.mock.calls[0][0]).toEqual(props.onAdd.mock.calls[1][0]);
  expect(rows).toHaveLength(1);
});
test("десяткова кома вводиться послідовно й не губиться після нуля", async () => {
  await openAndStart();
  await stop();
  await change("Кількість продукту 1", "0");
  await change("Кількість продукту 1", "0,");
  expect(
    container.querySelector('[aria-label="Кількість продукту 1"]').value,
  ).toBe("0,");
  await change("Кількість продукту 1", "0,5");
  await click("Додати");
  expect(props.onAdd.mock.calls[0][0].items[0].quantity.value).toBe(0.5);
});
test("новий запис після ручних БЖВ скидає старі поля, retry зберігає прапорець", async () => {
  await openAndStart();
  await stop();
  await change("Білки на основу продукту 1", "9");
  props.api.analyze.mockRejectedValueOnce(Error("upstream_timeout"));
  await photo();
  props.api.analyze.mockResolvedValue(
    answer([{ ...food(), source: { kind: "label" } }]),
  );
  await click("Повторити читання фото");
  expect(rows).toHaveLength(2);
  await click("Додати");
  await click("Запис правильний і повний");
  expect(pilotSummary(rows).successes).toBe(0);
  expect(rows[1].manualPfc).toBe(true);
  expect(rows[1].hasPhoto).toBe(true);
});

test("невдале фото не можна мовчки відкинути зміною його прив’язки", async () => {
  props.api.analyze.mockResolvedValue(answer([food(), food("Яблуко")]));
  await openAndStart();
  await stop();
  const select = container.querySelector('[aria-label="Продукт для фото"]');
  await change("Продукт для фото", select.options[1].value);
  props.api.analyze.mockResolvedValue(
    answer([
      {
        ...food(),
        nutrients: { p: null, f: null, c: null, cal: null },
        source: { kind: "label" },
      },
    ]),
  );
  await photo();
  expect(select.disabled).toBe(true);
  await change("Продукт для фото", select.options[2].value);
  expect(button("Додати").disabled).toBe(true);
  await click("Продовжити з попередніми значеннями");
  expect(select.disabled).toBe(false);
});
test("закриття під час запису метрики фото не запускає старе фото в новій сесії", async () => {
  await openAndStart();
  await stop();
  const delayed = deferred(),
    original = props.ledger.update;
  props.ledger.update = jest.fn((id, patch) =>
    patch.hasPhoto === true ? delayed.promise : original(id, patch),
  );
  await photo();
  await render({ isOpen: false });
  await openAndStart({ isOpen: true });
  await act(async () => delayed.resolve());
  expect(props.api.analyze).toHaveBeenCalledTimes(1);
  expect(button("Зупинити запис")).toBeTruthy();
  expect(container.textContent).not.toContain("Тестовий кефір");
});

test.each([
  ["Кількість продукту 1", "250"],
  ["Одиниця продукту 1", "ml"],
  ["Назва продукту 1", "Інший суп"],
  ["Білки на основу продукту 1", "4"],
])(
  "зміна %s не відповідає на семантичне уточнення їжі",
  async (label, value) => {
    props.api.analyze.mockResolvedValue(
      answer([
        {
          ...food("Суп"),
          clarification: "Уточніть, який саме суп: борщ чи курячий?",
        },
      ]),
    );
    await openAndStart();
    await stop();
    expect(button("Додати").disabled).toBe(true);
    await change(label, value);
    expect(button("Додати").disabled).toBe(true);
    expect(container.textContent).toContain("Уточніть, який саме суп");
    expect(props.onAdd).not.toHaveBeenCalled();
  },
);

test("фото одного продукту не скасовує повторний розбір зміненого тексту", async () => {
  await openAndStart();
  await stop();
  await change("Розпізнаний текст", "Кефір 200 г і хліб 50 г");
  props.api.analyze.mockResolvedValueOnce(
    answer([{ ...food(), source: { kind: "label" } }]),
  );
  await photo();
  expect(button("Оновити за текстом")).toBeTruthy();
  expect(button("Додати").disabled).toBe(true);
  props.api.analyze.mockResolvedValueOnce(answer([food(), food("Хліб")]));
  await click("Оновити за текстом");
  expect(container.querySelectorAll('[data-testid="voice-item"]')).toHaveLength(
    2,
  );
  expect(button("Додати").disabled).toBe(false);
});
test("невизначений commit дозволяє свідомий вихід без нового запису чи успіху", async () => {
  props.onAdd.mockRejectedValueOnce(Error("save_unknown"));
  await openAndStart();
  await stop();
  await click("Додати");
  window.confirm.mockReturnValueOnce(false);
  await click("Закрити голосову чернетку");
  expect(props.onClose).not.toHaveBeenCalled();
  window.confirm.mockReturnValueOnce(true);
  await click("Закрити голосову чернетку");
  expect(props.onClose).toHaveBeenCalledTimes(1);
  expect(props.onAdd).toHaveBeenCalledTimes(1);
  expect(rows[0].status).toBe("unknown");
  expect(pilotSummary(rows).successes).toBe(0);
});


test("STT-only показує текст без аналізу, фото та збереження прийому", async () => {
  await openAndStart({ mode: "stt_only" });
  await stop();
  expect(props.api.transcribe).toHaveBeenCalledTimes(1);
  expect(props.api.analyze).not.toHaveBeenCalled();
  const transcript = container.querySelector('[aria-label="Розпізнаний текст"]');
  expect(transcript.value).toBe("Випив 200 грамів кефіру");
  expect(transcript.closest("details").open).toBe(true);
  expect(transcript.readOnly).toBe(true);
  expect(container.textContent).toContain("Лабораторна перевірка");
  expect(container.textContent).toContain("Фото, аналіз їжі та додавання прийому");
  expect(container.querySelector('input[type="file"]')).toBeNull();
  expect(button("Додати")).toBeUndefined();
  expect(button("Оновити за текстом")).toBeUndefined();
  expect(button("Повторити обробку")).toBeUndefined();
  expect(props.onAdd).not.toHaveBeenCalled();
  expect(props.onSaved).not.toHaveBeenCalled();
  expect(rows.some((row) => row.status === "saved")).toBe(false);
});

test("REACT_APP_STT_ONLY вмикає лабораторію за замовчуванням, явний full має пріоритет", async () => {
  const previous = process.env.REACT_APP_STT_ONLY;
  process.env.REACT_APP_STT_ONLY = "1";
  try {
    await openAndStart();
    await stop();
    expect(props.api.analyze).not.toHaveBeenCalled();
    await render({ isOpen: false });
    await openAndStart({ isOpen: true, mode: "full" });
    await stop();
    expect(props.api.analyze).toHaveBeenCalledTimes(1);
    await click("Додати");
    expect(props.onAdd).toHaveBeenCalledTimes(1);
  } finally {
    if (previous === undefined) delete process.env.REACT_APP_STT_ONLY;
    else process.env.REACT_APP_STT_ONLY = previous;
  }
});

test.each([null, "uk", "ru", "invalid", '"uk"'])(
  "збережена мова %s читається з дозволеним fallback auto",
  async (stored) => {
    if (stored !== null) localStorage.setItem("scisense.voice.language", stored);
    await openAndStart({ mode: "stt_only" });
    const expected = ["uk", "ru"].includes(stored) ? stored : "auto";
    const select = container.querySelector('[aria-label="Мова розпізнавання"]');
    expect(select).toBeTruthy();
    expect(select.value).toBe(expected);
    await stop();
    expect(props.api.transcribe.mock.calls[0][3]).toBe(expected);
  },
);

test("зміна мови під час запису діє одразу та зберігає тільки мовну перевагу", async () => {
  const writes = jest.spyOn(Storage.prototype, "setItem");
  await openAndStart({ mode: "stt_only" });
  await change("Мова розпізнавання", "ru");
  await stop();
  expect(props.api.transcribe.mock.calls[0][3]).toBe("ru");
  expect(writes.mock.calls).toEqual([["scisense.voice.language", "ru"]]);
  expect(localStorage.length).toBe(1);
  await render({ isOpen: false });
  await openAndStart({ isOpen: true });
  expect(container.querySelector('[aria-label="Мова розпізнавання"]').value).toBe("ru");
});

test("недоступний localStorage не блокує запис або вибір мови", async () => {
  jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw Error("blocked"); });
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("blocked"); });
  await openAndStart({ mode: "stt_only" });
  expect(container.querySelector('[aria-label="Мова розпізнавання"]').value).toBe("auto");
  await change("Мова розпізнавання", "uk");
  await stop();
  expect(props.api.transcribe.mock.calls[0][3]).toBe("uk");
  expect(props.api.analyze).not.toHaveBeenCalled();
});

test("квота STT зберігає аудіо для явного повтору без нового запису та аналізу", async () => {
  props.api.transcribe.mockRejectedValueOnce(Error("upstream_limited"));
  await openAndStart({ mode: "stt_only" });
  await change("Мова розпізнавання", "uk");
  await stop();
  expect(props.api.transcribe).toHaveBeenCalledTimes(1);
  const [audio, duration] = props.api.transcribe.mock.calls[0];
  expect(rows[0].status).toBe("error");
  await click("Повторити обробку");
  const retried = props.api.transcribe.mock.calls[1];
  expect(retried[0]).toBe(audio);
  expect(retried[1]).toBe(duration);
  expect(retried[3]).toBe("uk");
  expect(recorders).toHaveLength(1);
  expect(props.api.analyze).not.toHaveBeenCalled();
  expect(props.onAdd).not.toHaveBeenCalled();
  expect(rows[0].status).toBe("error");
  expect(rows).toHaveLength(2);
  expect(container.querySelector('[aria-label="Розпізнаний текст"]').value).toBe("Випив 200 грамів кефіру");
});

test("скасування обробки зберігає аудіо, повтор не приймає запізнілий текст", async () => {
  const old = deferred();
  props.api.transcribe.mockImplementationOnce(() => old.promise);
  await openAndStart({ mode: "stt_only" });
  await stop();
  const first = props.api.transcribe.mock.calls[0];
  await click("Скасувати обробку");
  expect(first[2].aborted).toBe(true);
  await click("Повторити обробку");
  expect(props.api.transcribe.mock.calls[1][0]).toBe(first[0]);
  expect(recorders).toHaveLength(1);
  await act(async () => old.resolve({ text: "СТАРЕ" }));
  expect(container.querySelector('[aria-label="Розпізнаний текст"]').value).toBe("Випив 200 грамів кефіру");
  expect(props.api.analyze).not.toHaveBeenCalled();
  expect(props.onAdd).not.toHaveBeenCalled();
});

test("квота під час фото зберігає текст, фото та рядок для явного повтору", async () => {
  await openAndStart();
  await stop();
  props.api.analyze.mockRejectedValueOnce(Error("upstream_limited"));
  await photo();
  const transcript = container.querySelector('[aria-label="Розпізнаний текст"]').value;
  const photoBefore = container.querySelector('.voice-photo-grid img').src;
  expect(button("Додати").disabled).toBe(true);
  expect(props.api.transcribe).toHaveBeenCalledTimes(1);
  props.api.analyze.mockResolvedValueOnce(answer([{ ...food(), source: { kind: "label" } }]));
  await click("Повторити читання фото");
  expect(container.querySelector('[aria-label="Розпізнаний текст"]').value).toBe(transcript);
  expect(container.querySelector('.voice-photo-grid img').src).toBe(photoBefore);
  expect(container.querySelectorAll('[data-testid="voice-item"]')).toHaveLength(1);
  expect(props.api.transcribe).toHaveBeenCalledTimes(1);
  await click("Додати");
  expect(props.onAdd).toHaveBeenCalledTimes(1);
});


test("скасоване читання фото зберігає чернетку й блокує стару відповідь до повтору", async () => {
  await openAndStart();
  await stop();
  const old = deferred();
  props.api.analyze.mockImplementationOnce(() => old.promise);
  await photo();
  const request = props.api.analyze.mock.calls[1];
  const originalPhoto = container.querySelector('.voice-photo-grid img').src;
  await click("Скасувати обробку");
  expect(request[2].aborted).toBe(true);
  expect(button("Додати").disabled).toBe(true);
  expect(container.querySelector('[aria-label="Розпізнаний текст"]').value).toBe("Випив 200 грамів кефіру");
  await act(async () => old.resolve(answer([food("СТАРЕ")])));
  expect(container.querySelector('[aria-label="Назва продукту 1"]').value).toBe("Тестовий кефір");
  props.api.analyze.mockResolvedValueOnce(answer([{ ...food(), source: { kind: "label" } }]));
  await click("Повторити читання фото");
  expect(props.api.analyze.mock.calls[2][1]).toEqual(request[1]);
  expect(container.querySelector('.voice-photo-grid img').src).toBe(originalPhoto);
  expect(button("Додати").disabled).toBe(false);
  await click("Додати");
  expect(props.onAdd).toHaveBeenCalledTimes(1);
});

test("скасування нормалізації не губить початкове аудіо й не запускає старий запит", async () => {
  const old = deferred();
  const original = new Blob(["browser recording"], { type: "audio/webm" });
  const normalized = new Blob(["PCM"], { type: "audio/wav" });
  props.audioNormalizer = jest.fn()
    .mockImplementationOnce(() => old.promise)
    .mockResolvedValueOnce(normalized);
  props.recorderFactory = (cb) => ({
    start: () => cb.onState("recording"),
    cancel: jest.fn(),
    stop: () => cb.onStop(original, 3),
  });
  await openAndStart({ mode: "stt_only" });
  await stop();
  await click("Скасувати обробку");
  expect(props.api.transcribe).not.toHaveBeenCalled();
  await click("Повторити обробку");
  expect(props.audioNormalizer).toHaveBeenCalledTimes(2);
  expect(props.audioNormalizer.mock.calls[1][0]).toBe(original);
  expect(props.api.transcribe.mock.calls[0][0]).toBe(normalized);
  await act(async () => old.resolve(normalized));
  expect(props.api.transcribe).toHaveBeenCalledTimes(1);
  expect(props.api.analyze).not.toHaveBeenCalled();
  expect(props.onAdd).not.toHaveBeenCalled();
});

test("відмова від нового запису або закриття зберігає STT-чернетку", async () => {
  await openAndStart({ mode: "stt_only" });
  await stop();
  window.confirm.mockReturnValue(false);
  await click("Записати ще раз");
  await click("Закрити голосову чернетку");
  expect(recorders).toHaveLength(1);
  expect(props.onClose).not.toHaveBeenCalled();
  expect(container.querySelector('[aria-label="Розпізнаний текст"]').value).toBe("Випив 200 грамів кефіру");
  expect(props.api.analyze).not.toHaveBeenCalled();
  expect(props.onAdd).not.toHaveBeenCalled();
});


test("скасування підготовки фото залишає початковий файл для повтору", async () => {
  await openAndStart();
  await stop();
  const old = deferred();
  const prepared = await props.photoNormalizer();
  props.photoNormalizer = jest.fn()
    .mockImplementationOnce(() => old.promise)
    .mockResolvedValueOnce(prepared);
  await openAndStart();
  await photo();
  const original = props.photoNormalizer.mock.calls[0][0];
  await click("Скасувати обробку");
  expect(button("Додати").disabled).toBe(true);
  expect(props.api.analyze).toHaveBeenCalledTimes(1);
  props.api.analyze.mockResolvedValueOnce(answer([{ ...food(), source: { kind: "label" } }]));
  await click("Повторити обробку");
  expect(props.photoNormalizer.mock.calls[1][0]).toBe(original);
  expect(props.api.analyze).toHaveBeenCalledTimes(2);
  expect(container.querySelectorAll('.voice-photo-grid img')).toHaveLength(1);
  await act(async () => old.resolve(prepared));
  expect(props.api.analyze).toHaveBeenCalledTimes(2);
  expect(container.querySelectorAll('.voice-photo-grid img')).toHaveLength(1);
  expect(button("Додати").disabled).toBe(false);
});


test("повтор після скасування другого фото зберігає обидва файли", async () => {
  await openAndStart();
  await stop();
  props.api.analyze.mockResolvedValue(answer([{ ...food(), source: { kind: "label" } }]));
  await photo();
  const old = deferred();
  const second = { type: "image/jpeg", data: "second", preview: "data:image/jpeg;base64,c2Vjb25k" };
  props.photoNormalizer = jest.fn()
    .mockImplementationOnce(() => old.promise)
    .mockResolvedValueOnce(second);
  await openAndStart();
  await photo();
  const original = props.photoNormalizer.mock.calls[0][0];
  await click("Скасувати обробку");
  expect(button("Додати").disabled).toBe(true);
  await click("Повторити читання фото");
  expect(props.photoNormalizer).toHaveBeenCalledTimes(2);
  expect(props.photoNormalizer.mock.calls[1][0]).toBe(original);
  expect(props.api.analyze.mock.calls[2][1].map((image) => image.data)).toEqual(["synthetic", "second"]);
  expect(container.querySelectorAll('.voice-photo-grid img')).toHaveLength(2);
  await act(async () => old.resolve(second));
  expect(props.api.analyze).toHaveBeenCalledTimes(3);
  expect(container.querySelectorAll('.voice-photo-grid img')).toHaveLength(2);
  expect(button("Додати").disabled).toBe(false);
});

test("пізнє створення скасованої спроби не привласнює збереження нового повтору", async () => {
  props.api.transcribe.mockRejectedValueOnce(Error("upstream_limited"));
  await openAndStart(); await stop();
  const old = deferred();
  props.ledger.start.mockImplementationOnce(parent => {
    rows.push({attemptId: "attempt-2", parentAttemptId: parent, status: "started"});
    return old.promise;
  });
  await click("Повторити обробку");
  await click("Скасувати обробку");
  await click("Повторити обробку");
  expect(props.api.transcribe).toHaveBeenCalledTimes(2);
  await act(async () => old.resolve("attempt-2"));
  await click("Додати");
  expect(rows.find(row => row.attemptId === "attempt-2").status).toBe("abandoned");
  expect(rows.find(row => row.attemptId === "attempt-3").status).toBe("saved");
  expect(props.onAdd).toHaveBeenCalledTimes(1);
});

test("L01: відкриття й повторний render не починають запису або спроби", async()=>{
 await render();await render({meal:2});expect(recorders).toHaveLength(0);expect(rows).toHaveLength(0);
 expect(button("Почати запис")).toBeTruthy();await click("Почати запис");expect(recorders).toHaveLength(1);expect(rows).toHaveLength(1);
 expect(props.api.transcribe).not.toHaveBeenCalled();expect(props.api.analyze).not.toHaveBeenCalled();
});

test("L01: StrictMode і подвійний tap до ledger await створюють одну спробу", async()=>{
 const delayed=deferred();props.ledger.start.mockImplementationOnce(()=>delayed.promise);
 await act(async()=>root.render(<React.StrictMode><VoiceInputModal {...props}/></React.StrictMode>));
 expect(recorders).toHaveLength(0);const start=button("Почати запис");
 await act(async()=>{Simulate.click(start);Simulate.click(start);});expect(props.ledger.start).toHaveBeenCalledTimes(1);
 rows.push({attemptId:'delayed',status:'started'});await act(async()=>delayed.resolve('delayed'));
 expect(recorders).toHaveLength(1);
});
test("L01: повторний запис чекає нового Start і дозволяє повернути прев’ю", async()=>{
 await openAndStart();await stop();await click("Записати ще раз");expect(recorders).toHaveLength(1);expect(rows).toHaveLength(1);
 window.confirm.mockReturnValueOnce(false);await click("Почати запис");expect(recorders).toHaveLength(1);
 await click("Повернутися до прев’ю");expect(container.textContent).toContain("106 ккал");
 await click("Записати ще раз");await click("Почати запис");expect(recorders).toHaveLength(2);expect(rows).toHaveLength(2);
});
test("L01: pending після повторного відкриття блокує новий запис", async()=>{
 await render({pendingSave:true,onRetryPending:jest.fn()});expect(button("Почати запис")).toBeUndefined();
 await click("Перевірити збереження");expect(props.onRetryPending).toHaveBeenCalledTimes(1);expect(rows).toHaveLength(0);
});

test('L04/L07: AI визначає З без ручної дії, appendAllocated і підсумкові counts',async()=>{
 props.api.analyze.mockResolvedValue(answer([{...food('Яблуко'),planMatch:{referenceId:'fruits:fruit',certainty:'matched',consumedState:'as_sold'}}]));
 await openAndStart();await stop();expect(container.textContent).toContain('З · Фрукти · 50% норми');
 await click('Додати');const command=props.onAdd.mock.calls[0][0];expect(command.type).toBe('appendAllocated');expect(command.items[0].portion).toBe(50);
 expect(command.items[0]).not.toHaveProperty('planMatch');expect(command.planFingerprint).toMatch(/^[a-f0-9]{64}$/);
 expect(rows[0]).toMatchObject({planAssignedCount:1,planUnresolvedCount:0,planManualCount:0,partial:false});
});
test('L04: літера й фото зберігають itemId, кількість і ручний вибір',async()=>{
 const response=()=>answer([{...food('Кефір 1%'),planMatch:{referenceId:'dairy:kefir',certainty:'matched',consumedState:'as_sold'}}]);
 props.api.analyze.mockResolvedValue(response());await openAndStart();await stop();await change('Літера продукту 1','ж');
 expect(container.textContent).toContain('54.8% норми');const id=container.querySelector('[aria-label="Продукт для фото"]')?.value;
 const label=response();label.items[0].source={kind:'label'};props.api.analyze.mockResolvedValue(label);await photo();
 expect(container.textContent).toContain('54.8% норми');await click('Додати');const item=props.onAdd.mock.calls[0][0].items[0];
 expect(item.planAllocation.letter).toBe('ж');expect(item.quantity.value).toBe(200);if(id)expect(item.itemId).toBe(id);expect(rows[0].planManualCount).toBe(1);expect(rows[0].planAssignedCount).toBe(1);
});
test('L04: інша етикетка зберігає ручну літеру, скидає тільки відповідник',async()=>{
 props.api.analyze.mockResolvedValue(answer([{...food('Кефір 1%'),planMatch:{referenceId:'dairy:kefir',certainty:'matched',consumedState:'as_sold'}}]));
 await openAndStart();await stop();await change('Літера продукту 1','ж');
 props.api.analyze.mockResolvedValue(answer([{...food('Кефір 2.5%'),source:{kind:'label'},planMatch:null}]));await photo();
 expect(container.textContent).toContain('Ж · Молочні · норму не визначено');expect(button('Додати').disabled).toBe(false);
 await click('Додати');expect(rows[0]).toMatchObject({planAssignedCount:0,planUnresolvedCount:1,planManualCount:1,partial:false});
});
test('L04: невідома літера не заважає зберегти ккал, ручний пошук рахується окремо',async()=>{
 await openAndStart();await stop();expect(container.textContent).toContain('Без літери');expect(button('Додати').disabled).toBe(false);
 await change('Літера продукту 1','б');expect(container.textContent).toContain('норму не визначено');
 const ref=container.querySelector('[aria-label="Відповідник продукту 1"]');const kefir=[...ref.options].find(o=>o.textContent.includes('кефір'));
 await change('Відповідник продукту 1',kefir.value);await change('Кількість продукту 1','270');await click('Додати');
 expect(props.onAdd.mock.calls[0][0].items[0].portion).toBe(100);expect(rows[0].manualSearch).toBe(true);expect(rows[0].planAssignedCount).toBe(1);
});
test('L05: plan_conflict вимагає нового читання і свідомого підтвердження',async()=>{
 props.api.analyze.mockResolvedValue(answer([{...food('Яблуко'),planMatch:{referenceId:'fruits:fruit',certainty:'matched',consumedState:'as_sold'}}]));
 props.onAdd.mockRejectedValueOnce(Error('plan_conflict'));props.onRefreshPlan=jest.fn(async()=>({profile:{portions:{'фрукти та ягоди':800}}}));
 await openAndStart();await stop();await click('Додати');expect(button('Додати').disabled).toBe(true);
 await click('Перечитати план і прев’ю');expect(props.onAdd).toHaveBeenCalledTimes(1);expect(container.textContent).toContain('25% норми');
 await click('Додати');expect(props.onAdd.mock.calls[1][0].submissionId).not.toBe(props.onAdd.mock.calls[0][0].submissionId);
 expect(props.onAdd.mock.calls[1][0].items[0].portion).toBe(25);
});
test('L01: зміна власника зупиняє запис і чекає нового Start',async()=>{
 await openAndStart({ownerKey:'one'});await render({ownerKey:'two'});expect(recorders[0].cancel).toHaveBeenCalled();expect(button('Почати запис')).toBeTruthy();expect(recorders).toHaveLength(1);
});

test('L05: зміна власника видаляє вже готову приватну чернетку',async()=>{
 await openAndStart({ownerKey:'owner-a'});await stop();expect(container.textContent).toContain('Тестовий кефір');
 await render({ownerKey:'owner-b'});expect(button('Почати запис')).toBeTruthy();expect(button('Повернутися до прев’ю')).toBeUndefined();expect(container.querySelector('[data-testid="voice-item"]')).toBeNull();expect(props.onAdd).not.toHaveBeenCalled();
});
test('L04: Без літери вибирається явно і зберігається ручним',async()=>{
 props.api.analyze.mockResolvedValue(answer([{...food(),planMatch:{referenceId:'dairy:kefir',consumedState:'as_sold',certainty:'matched'}}]));
 await openAndStart();await stop();expect(container.querySelector('[aria-label="Літера продукту 1"] option[value=""]')).toBeTruthy();
 await change('Літера продукту 1','');await click('Додати');expect(props.onAdd.mock.calls[0][0].items[0].planAllocation).toEqual({version:1,status:'unallocated',assignment:'manual'});
});

test('L07: повтор фото переносить ручний пошук тієї самої чернетки',async()=>{
 await openAndStart();await stop();await change('Літера продукту 1','б');
 const select=container.querySelector('[aria-label="Відповідник продукту 1"]');const ref=[...select.options].find(o=>o.textContent.includes('кефір')).value;
 await change('Відповідник продукту 1',ref);props.api.analyze.mockRejectedValueOnce(Error('upstream_error'));await photo();
 props.api.analyze.mockResolvedValueOnce(answer([{...food(),source:{kind:'label'}}]));await click('Повторити читання фото');await click('Додати');expect(rows).toHaveLength(2);expect(rows[1].manualSearch).toBe(true);
 expect(pilotSummary(rows.map(r=>({...r,correct:true})) ).successes).toBe(0);
});
test('L04: підтверджена маса зберігає кому під час набору',async()=>{
 props.api.analyze.mockResolvedValue(answer([{...food('Кефір','ml'),planMatch:{referenceId:'dairy:kefir',consumedState:'as_sold',certainty:'matched'}}]));
 await openAndStart();await stop();await change('Маса продукту 1','206');await change('Маса продукту 1','206,');
 expect(container.querySelector('[aria-label="Маса продукту 1"]').value).toBe('206,');await change('Маса продукту 1','206,5');await click('Додати');
 expect(props.onAdd.mock.calls[0][0].items[0].planAllocation.conversion.baseMassGrams).toBe(206.5);
});
test('L05: unknown зберігає показані літери навіть після паралельної зміни дня',async()=>{
 props.api.analyze.mockResolvedValue(answer([{...food(),planMatch:{referenceId:'dairy:kefir',consumedState:'as_sold',certainty:'matched'}}]));
 props.onAdd.mockRejectedValueOnce(Error('save_unknown'));await openAndStart();await stop();await click('Додати');
 await render({dayMeals:{1:{б:[{name:'старий',portion:100,weight:100,p:1,f:1,c:1,cal:10}]}}});
 expect(container.querySelector('.voice-plan-badge').textContent).toContain('Б · Молочні');expect(props.onAdd.mock.calls[0][0].items[0].planAllocation.letter).toBe('б');
});

test('review: закриття pending до ACK дозволене без повторного додавання',async()=>{
 const pending=deferred();props.onAdd.mockReturnValue(pending.promise);
 await openAndStart();await stop();await click('Додати');
 expect(button('Закрити голосову чернетку').disabled).toBe(false);
 await click('Закрити голосову чернетку');expect(props.onClose).toHaveBeenCalledTimes(1);
 await render({isOpen:false});await act(async()=>pending.resolve({}));
 expect(props.onAdd).toHaveBeenCalledTimes(1);
});
test('review: not_ready пропонує перечитати план, а не тупикове Додати',async()=>{
 props.onAdd.mockRejectedValue(Error('not_ready'));props.onRefreshPlan=jest.fn(async()=>({}));
 await openAndStart();await stop();await click('Додати');expect(button('Перечитати план і прев’ю')).toBeTruthy();
});

test('review: повтор pending має явний результат без нового запису',async()=>{
 props.onRetryPending=jest.fn(async()=>{});await render({pendingSave:true});await click('Перевірити збереження');
 expect(container.textContent).toContain('Попередній запис підтверджено');expect(props.onAdd).not.toHaveBeenCalled();expect(rows).toHaveLength(0);
});
