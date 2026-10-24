import { validFoodProvenance } from './foodProvenance.js';
const finite = (x) =>
  typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 100000;
const keys = (x, allowed) =>
  x &&
  typeof x === "object" &&
  !Array.isArray(x) &&
  Object.keys(x).every((k) => allowed.includes(k));
const text = (x, max) =>
  typeof x === "string" && x.trim().length > 0 && x.length <= max;
export const foodNoteId = (submissionId, itemId) => `${submissionId}_${itemId}`;
export const validNullableQuantity = (q) =>
  keys(q, ["value", "unit"]) &&
  (q.value === null || (finite(q.value) && q.value > 0)) &&
  ["g", "ml", "portion", "package", "unknown"].includes(q.unit);
export const validKnownNutrients = (n) =>
  keys(n, ["p", "f", "c", "cal"]) &&
  ["p", "f", "c", "cal"].every((k) => n[k] === null || finite(n[k]));
export function validFoodNote(note) {
  const s = note?.provenance;
  return (
    keys(note, [
      "itemId",
      "name",
      "quantity",
      "knownNutrients",
      "nutritionBasis",
      "provenance",
      "originalText",
      "originDraft",
    ]) &&
    /^[a-zA-Z0-9-]{8,80}$/.test(note.itemId || "") &&
    text(note.name, 160) &&
    validNullableQuantity(note.quantity) &&
    validNullableQuantity(note.nutritionBasis) &&
    validKnownNutrients(note.knownNutrients) &&
    typeof note.originalText === "string" &&
    note.originalText.length <= 8000 &&
    text(note.originDraft, 80) &&
    keys(s, [
      "kind",
      "label",
      "recordId",
      "dataset",
      "version",
      "url",
      "assumptions",
      "portionOrigin",
      "estimateReason",
    ]) && validFoodProvenance(s) &&
    ["label", "database", "personal", "estimate", "unknown", "manual"].includes(
      s.kind,
    ) &&
    ["label", "recordId", "dataset", "version", "url"].every(
      (k) =>
        s[k] === undefined ||
        (k === "version" && Number.isInteger(s[k]) && s[k] > 0) ||
        (typeof s[k] === "string" && s[k].length <= 400),
    ) &&
    (s.assumptions === undefined ||
      (Array.isArray(s.assumptions) &&
        s.assumptions.length <= 9 &&
        s.assumptions.every((x) => text(x, 240)))) &&
    !JSON.stringify(note).match(/data:(?:image|audio)\//i)
  );
}
export function noteFromDraft(item, originDraft, originalText = "") {
  const clean = {
    itemId: item.itemId,
    name: item.name,
    quantity: item.quantity || { value: null, unit: "unknown" },
    knownNutrients: item.nutrients || { p: null, f: null, c: null, cal: null },
    nutritionBasis: item.nutritionBasis || { value: null, unit: "unknown" },
    provenance: item.source || { kind: "unknown" },
    originalText,
    originDraft,
  };
  if (!validFoodNote(clean)) throw Error("invalid_food_note");
  return clean;
}
export const activeFoodNotes = (notes) =>
  (notes || []).filter((n) => n.state === "active");
export function foodNotesSummary(notes) {
  const active = activeFoodNotes(notes);
  return {
    incomplete: active.length > 0,
    unresolvedCount: active.length,
    notes: active,
    label: active.length
      ? "Підсумок неповний: враховано лише їжу з розрахованими ккал і БЖВ."
      : "Підсумок розрахованої їжі",
  };
}
export function foodNotesReport(notes) {
  const s = foodNotesSummary(notes);
  if (!s.incomplete) return "";
  return (
    `\n\n${s.label}\nБез повної оцінки:\n` +
    s.notes
      .map(
        (n) =>
          `${n.name}${n.quantity?.value != null ? ` · ${n.quantity.value} ${{ g: "г", ml: "мл", portion: "порц.", package: "уп." }[n.quantity.unit] || ""}` : ""}; основа ${n.nutritionBasis?.value ?? "невідомо"} ${{ g: "г", ml: "мл", portion: "порц.", package: "уп." }[n.nutritionBasis?.unit] || ""}; джерело: ${{ label: "етикетка", database: "база продуктів", personal: "особистий підтверджений запис", estimate: "приблизна оцінка", unknown: "невідоме", manual: "введено вручну" }[n.provenance?.kind] || "невідоме"}; відомо на цю основу: ` +
          ["cal", "p", "f", "c"]
            .map(
              (k) =>
                `${{ cal: "ккал", p: "Б", f: "Ж", c: "В" }[k]} ${n.knownNutrients?.[k] ?? "невідомо"}`,
            )
            .join(", "),
      )
      .join("\n")
  );
}
