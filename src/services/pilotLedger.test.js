import { pilotSummary, createPilotLedger } from "./pilotLedger";
test("знаменник містить відмови, тишу, закриття та unknown, чисельник лише підтверджений повний запис", () => {
  const rows = [
    { status: "error" },
    { status: "abandoned" },
    { status: "unknown" },
    { status: "saved", correct: false },
    { status: "saved", correct: true, partial: true },
    { status: "saved", correct: true, manualPfc: true },
    { status: "saved", correct: true, manualSearch: true },
    { status: "saved", correct: true, hasPhoto: true },
  ];
  expect(pilotSummary(rows)).toEqual({
    attempts: 8,
    withPhoto: 1,
    successes: 1,
    percent: 13,
    invalid: false,
  });
});
test("вимкнений пілот не відкриває сховище", async () => {
  const ledger = createPilotLedger(false);
  await expect(ledger.list()).resolves.toEqual([]);
  await expect(ledger.cleanup()).resolves.toBeUndefined();
});
test("відмова IndexedDB позначає весь пілот неповним і зберігається після reload", async () => {
  localStorage.clear();
  Object.defineProperty(global, "indexedDB", {
    configurable: true,
    value: {
      open() {
        throw Error("quota");
      },
    },
  });
  const ledger = createPilotLedger(true);
  await expect(ledger.list()).rejects.toThrow();
  expect(ledger.invalid()).toBe(true);
  expect(createPilotLedger(true).invalid()).toBe(true);
  await ledger.close();
});
