// Only static validation codes cross into the model. Never forward raw errors,
// paths, credentials, database diagnostics, or the user's data.
const hints = {
  invalid_food_proposal: "Use UUID itemId, name, quantity, preparation and source; follow the item schema.",
  invalid_food_source: "Use only the documented fields for this source kind.",
  food_source_not_offered: "Call food_lookup in this turn; use its exact recordId, source kind and preparation.",
  invalid_plan_match: "Use planMatch.referenceId from catalog refId, consumedState and certainty; omit if uncertain.",
  invalid_date: "For dayRef today/yesterday/draft omit targetDate. For explicit use a user-specified or pinned ISO date.",
  invalid_household_measure: "Use returned measureIndex with quantity unit portion; do not invent a measure.",
  draft_conflict: "Use the current draftId/baseRevision from the snapshot; a new draft has baseRevision 0.",
  date_clarification: "Ask one date question; do not create a draft for an ambiguous date.",
  date_change_requires_confirmation: "Keep the existing draft date; date changes require the user's preview edit.",
  consumption_unconfirmed: "This message does not confirm eating; answer or ask one question without a food draft.",
  label_evidence_missing: "Use the photo binding itemId and photoRef from mediaBindings.",
  estimate_reason_required: "Set estimateReason to no_matching_source or recipe_estimate with assumptions.",
  assumptions_required: "Provide a short explicit assumption for this estimate.",
  invalid_portion_origin: "Use portionOrigin kind user, catalog_measure or estimate with an assumption.",
  brand_is_not_exact: "This is an analogue: mark estimated and describe the assumption, or ask one question.",
  density_not_confirmed: "Do not convert g/ml without confirmed density; preserve the given unit.",
  memory_read_only: "Personal memory is read-only; do not claim it was saved.",
};
export function safeToolFailure(error) {
  const code = error?.message;
  return typeof code === "string" && Object.hasOwn(hints, code) ? { error: code, hint: hints[code] } : { error: "tool_unavailable" };
}
