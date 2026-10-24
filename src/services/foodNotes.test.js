import { applyDayCommand } from "./mealCommands";
import {
  validFoodNote,
  noteFromDraft,
  foodNotesReport,
  foodNotesSummary,
} from "./foodNotes";
const note = {
  itemId: "note-synthetic-001",
  name: "Невідома страва",
  quantity: { value: null, unit: "portion" },
  knownNutrients: { p: null, f: 2, c: null, cal: 50 },
  nutritionBasis: { value: 100, unit: "g" },
  provenance: { kind: "unknown" },
  originalText: "Зʼїв невідому страву",
  originDraft: "draft-synthetic",
};
const item = {
  itemId: "item-synthetic-001",
  name: "Кефір",
  quantity: { value: 200, unit: "g" },
  nutritionBasis: { value: 100, unit: "g" },
  nutrients: { p: 3, f: 2.5, c: 4, cal: 51 },
  source: { kind: "label" },
  estimated: false,
  planAllocation: { version: 1, status: "unallocated", assignment: "auto" },
};
const command = {
  type: "saveTrainerDraft",
  targetDate: "2026-01-03",
  meal: 1,
  submissionId: "submission-synthetic",
  items: [item],
  notes: [note],
  updatedAt: "2026-01-03T10:00:00Z",
};
test("mixed command and note-only each create exactly one day marker; no partial zeros", () => {
  const r = applyDayCommand({}, command, "hash");
  expect(r.day.totalMacros.cal).toBe(102);
  expect(r.noteWrites[0].knownNutrients.p).toBeNull();
  expect(r.day.revision).toBe(1);
  expect(applyDayCommand(r.day, command, "hash").duplicate).toBe(true);
  const only = applyDayCommand({}, { ...command, items: [] }, "notes-only");
  expect(only.day.totalMacros.cal).toBe(0);
  expect(only.noteWrites).toHaveLength(1);
  expect(Object.keys(only.day.submissionMarkers)).toHaveLength(1);
  expect(() =>
    applyDayCommand({}, { ...command, items: [], notes: [] }, "x"),
  ).toThrow("invalid_command");
});
test("full nutrition conversion resolves the note and appends food atomically, retry is idempotent", () => {
  const first = applyDayCommand({}, { ...command, items: [] }, "note");
  const resolvedNote = first.noteWrites[0],
    convert = {
      type: "resolveFoodNote",
      targetDate: command.targetDate,
      meal: 2,
      submissionId: "resolve-synthetic",
      noteId: resolvedNote.noteId,
      items: [{ ...item, itemId: note.itemId }],
      updatedAt: "2026-01-03T11:00:00Z",
    };
  const r = applyDayCommand(first.day, convert, "convert", { resolvedNote });
  expect(r.day.totalMacros.cal).toBe(102);
  expect(r.day.foodNotes).toEqual({});
  expect(r.resolvedNote.state).toBe("resolved");
  expect(r.resolvedNote.name).toBeUndefined();
  expect(applyDayCommand(r.day, convert, "convert").duplicate).toBe(true);
  expect(() =>
    applyDayCommand(
      first.day,
      { ...convert, items: [{ ...item, nutrients: { cal: null } }] },
      "bad",
      { resolvedNote },
    ),
  ).toThrow();
});
test("old append contract stays strict; 20 combined positions maximum and IDs cannot collide", () => {
  expect(() =>
    applyDayCommand({}, { ...command, type: "append", items: [] }, "x"),
  ).toThrow("invalid_command");
  expect(() =>
    applyDayCommand(
      {},
      { ...command, notes: [{ ...note, itemId: item.itemId }] },
      "x",
    ),
  ).toThrow("duplicate_item");
  const many = Array.from({ length: 20 }, (_, n) => ({
    ...note,
    itemId: `note-synthetic-${n}`,
  }));
  expect(
    applyDayCommand({}, { ...command, items: [], notes: many }, "x").noteWrites,
  ).toHaveLength(20);
  expect(() => applyDayCommand({}, { ...command, notes: many }, "x")).toThrow(
    "invalid_command",
  );
});
test("report and summary make known values and incompleteness visible", () => {
  const active = { ...note, state: "active" },
    resolved = { ...note, state: "resolved" };
  expect(foodNotesSummary([active, resolved]).unresolvedCount).toBe(1);
  expect(foodNotesReport([active])).toContain("Б невідомо");
  expect(foodNotesReport([active])).toContain("ккал 50");
  expect(foodNotesReport([resolved])).toBe("");
});
test("note validation rejects foreign fields, media and bad values while retaining unknowns", () => {
  expect(validFoodNote(note)).toBe(true);
  expect(
    validFoodNote({
      ...note,
      knownNutrients: { ...note.knownNutrients, p: -1 },
    }),
  ).toBe(false);
  expect(validFoodNote({ ...note, secret: "x" })).toBe(false);
  expect(
    validFoodNote({ ...note, originalText: "data:image/png;base64,abc" }),
  ).toBe(false);
  expect(
    noteFromDraft(
      { ...item, quantity: { value: null, unit: "g" } },
      "draft-synthetic",
    ).quantity.value,
  ).toBeNull();
});
