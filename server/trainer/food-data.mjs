// Only these four nutrients are consumed. Missing data never becomes zero.
export const NUTRIENTS = Object.freeze({
  p: [1003],
  f: [1004],
  c: [1005],
  cal: [2048, 2047, 1008],
});
export const PREPARATIONS = ["raw", "cooked", "dry", "as_sold", "unknown"];
export function preparationOf(description) {
  const value = String(description).toLowerCase();
  // FDC sometimes retains an acquisition state (raw/from dried) before the
  // consumed preparation. Explicit cooking wins; roasting alone does not turn
  // "buckwheat groats, roasted, dry" into cooked hydrated groats.
  const positive = value.replace(/\b(not cooked|uncooked|unprepared)\b/g, "");
  if (
    /\b(cooked|prepared|boiled|baked|stewed|braised|fried|steamed|grilled|heated)\b/.test(
      positive,
    )
  )
    return "cooked";
  if (/\b(dry|dried|dehydrated)\b(?![ -]+(?:heat|roasted))/.test(value))
    return "dry";
  if (/\b(raw|uncooked|not cooked)\b/.test(value)) return "raw";
  if (/\broasted\b/.test(value)) return "cooked";
  return "as_sold";
}
export function normalizeFood(row, source) {
  if (!Number.isSafeInteger(row.fdcId) || !row.description?.trim())
    throw Error("invalid_food");
  const selectedNutrientIds = {},
    nutrients = {};
  for (const [key, ids] of Object.entries(NUTRIENTS)) {
    const values = (row.foodNutrients || []).filter((n) =>
      ids.includes(n.nutrient?.id),
    );
    const selected = ids
      .flatMap((id) => values.filter((n) => n.nutrient.id === id))
      .find(
        (n) =>
          typeof n.amount === "number" &&
          Number.isFinite(n.amount) &&
          n.amount >= 0 &&
          String(n.nutrient.unitName).toLowerCase() ===
            (key === "cal" ? "kcal" : "g") &&
          // A less-than result is not an exact measured zero.
          !String(n.value || "").startsWith("<"),
      );
    nutrients[key] = selected?.amount ?? null;
    selectedNutrientIds[key] = selected?.nutrient.id ?? null;
  }
  return {
    id: `fdc:${row.fdcId}`,
    name: row.description.slice(0, 400),
    preparation: preparationOf(row.description),
    nutritionBasis: { value: 100, unit: "g" },
    nutrients,
    selectedNutrientIds,
    source: {
      kind: "database",
      label: "USDA FoodData Central",
      recordId: `fdc:${row.fdcId}`,
      version: source.version,
      dataset: source.id,
      url: `https://fdc.nal.usda.gov/food-details/${row.fdcId}/nutrients`,
    },
    portions: (row.foodPortions || [])
      .filter((p) => Number.isFinite(p.gramWeight) && p.gramWeight > 0)
      .slice(0, 12)
      .map((p) => ({
        grams: p.gramWeight,
        description: String(
          p.portionDescription || p.modifier || p.measureUnit?.name || "",
        ).slice(0, 160),
        amount: Number.isFinite(p.amount) && p.amount > 0 ? p.amount : 1,
      })),
  };
}
