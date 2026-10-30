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
  date_draft_conflict: "This date already has an unsaved draft in snapshot.draft. If its state is saving or unknown, or it has noteId, ask the user to add or check that card first. Otherwise edit it: same draftId, its revision as baseRevision; keep its items and meal unless the user asks.",
  draft_frozen: "This draft is being saved and cannot change. Do not propose; ask the user to check that card first, then send the food again.",
  draft_too_large: "Draft data is over 16000 bytes. Propose fewer items or shorter names and assumptions, or ask the user to add the current preview first.",
  invalid_quantity: "quantity is {value, unit}: value is a number above 0 and up to 100000, or null; unit is g, ml, portion, package or unknown.",
  draft_already_proposed: "This draft was already proposed in this turn. Do not propose again; answer the user.",
  invalid_food_query: "query: one food, up to 160 characters and 1-12 words; preparation from the enum.",
  date_draft_in_turn: "This turn already proposed another draft for this date; a date gets one draft per turn. Do not propose again now; tell the user which food is not in the card yet and ask them to send it in the next message.",
  manual_values_not_in_message: "Use source manual only with kcal and all P/F/C numbers the user wrote; otherwise use estimate with assumption: kcal from the user.",
  note_draft_single: "This draft has noteId: it holds exactly one item. Do not add food to it; ask the user to add or fix that card first, then send the food again.",
};
// Repairable codes the model may see; anything else aborts the turn instead.
export const MODEL_TOOL_ERRORS = new Set(Object.keys(hints));
export function safeToolFailure(error) {
  const code = error?.message;
  return typeof code === "string" && Object.hasOwn(hints, code) ? { error: code, hint: hints[code] } : { error: "tool_unavailable" };
}
