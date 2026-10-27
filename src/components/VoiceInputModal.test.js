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
    value: { randomUUID: () => `uuid-${++counter}` },
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
  await render();
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
  await render();
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
  await render();
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
  await render();
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
  await render();
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
  await render();
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
  await render();
  await stop();
  await render({ isOpen: false });
  await render({ isOpen: true });
  await act(async () => old.resolve({ text: "СТАРЕ" }));
  expect(container.textContent).not.toContain("СТАРЕ");
  expect(props.api.analyze).not.toHaveBeenCalled();
  expect(recorders[0].cancel).toHaveBeenCalled();
  expect(rows[0].status).toBe("abandoned");
  await stop();
  expect(container.textContent).toContain("106 ккал");
});
test("зміна дати вимагає явного перенесення, commit лишається один", async () => {
  await render();
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
  await render();
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
  await render();
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
  await render();
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
  await render();
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
  await render();
  await stop();
  const delayed = deferred(),
    original = props.ledger.update;
  props.ledger.update = jest.fn((id, patch) =>
    patch.hasPhoto === true ? delayed.promise : original(id, patch),
  );
  await photo();
  await render({ isOpen: false });
  await render({ isOpen: true });
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
    await render();
    await stop();
    expect(button("Додати").disabled).toBe(true);
    await change(label, value);
    expect(button("Додати").disabled).toBe(true);
    expect(container.textContent).toContain("Уточніть, який саме суп");
    expect(props.onAdd).not.toHaveBeenCalled();
  },
);

test("фото одного продукту не скасовує повторний розбір зміненого тексту", async () => {
  await render();
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
  await render();
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
  await render({ mode: "stt_only" });
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
    await render();
    await stop();
    expect(props.api.analyze).not.toHaveBeenCalled();
    await render({ isOpen: false });
    await render({ isOpen: true, mode: "full" });
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
    await render({ mode: "stt_only" });
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
  await render({ mode: "stt_only" });
  await change("Мова розпізнавання", "ru");
  await stop();
  expect(props.api.transcribe.mock.calls[0][3]).toBe("ru");
  expect(writes.mock.calls).toEqual([["scisense.voice.language", "ru"]]);
  expect(localStorage.length).toBe(1);
  await render({ isOpen: false });
  await render({ isOpen: true });
  expect(container.querySelector('[aria-label="Мова розпізнавання"]').value).toBe("ru");
});

test("недоступний localStorage не блокує запис або вибір мови", async () => {
  jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw Error("blocked"); });
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("blocked"); });
  await render({ mode: "stt_only" });
  expect(container.querySelector('[aria-label="Мова розпізнавання"]').value).toBe("auto");
  await change("Мова розпізнавання", "uk");
  await stop();
  expect(props.api.transcribe.mock.calls[0][3]).toBe("uk");
  expect(props.api.analyze).not.toHaveBeenCalled();
});

test("квота STT зберігає аудіо для явного повтору без нового запису та аналізу", async () => {
  props.api.transcribe.mockRejectedValueOnce(Error("upstream_limited"));
  await render({ mode: "stt_only" });
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
  await render({ mode: "stt_only" });
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
  await render();
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
  await render();
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
  await render({ mode: "stt_only" });
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
  await render({ mode: "stt_only" });
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
  await render();
  await stop();
  const old = deferred();
  const prepared = await props.photoNormalizer();
  props.photoNormalizer = jest.fn()
    .mockImplementationOnce(() => old.promise)
    .mockResolvedValueOnce(prepared);
  await render();
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
  await render();
  await stop();
  props.api.analyze.mockResolvedValue(answer([{ ...food(), source: { kind: "label" } }]));
  await photo();
  const old = deferred();
  const second = { type: "image/jpeg", data: "second", preview: "data:image/jpeg;base64,c2Vjb25k" };
  props.photoNormalizer = jest.fn()
    .mockImplementationOnce(() => old.promise)
    .mockResolvedValueOnce(second);
  await render();
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
  await render(); await stop();
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
