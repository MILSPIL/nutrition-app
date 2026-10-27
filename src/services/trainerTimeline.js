// Native row order is canonical. A draft belongs to its durable input IDs,
// never to a matching sentence, product, date or mutable update timestamp.
export function trainerTimeline({ messages = [], drafts = [], latestTurn } = {}) {
  const rows = [...messages];
  if (latestTurn?.text && !rows.some(m => m.turnId === latestTurn.turnId || m.id === latestTurn.turnId + "-u"))
    rows.push({ id: latestTurn.turnId + "-pending", turnId: latestTurn.turnId, role: "user", content: latestTurn.text });
  const anchored = new Map(), historyDrafts = [];
  for (const draft of drafts) {
    const ids = new Set([draft.turnId, ...(draft.originTurnIds || [])].filter(Boolean));
    let index = -1;
    rows.forEach((m, i) => { if (ids.has(m.turnId) || [...ids].some(id => m.id === id + "-u" || m.id === id + "-a" || m.id === id + "-v")) index = i; });
    const entry = { kind: "draft", draft, compact: draft.state === "saved", collapsed: !["saving", "unknown", "saved"].includes(draft.state) && !ids.has(latestTurn?.turnId) };
    if (index < 0) historyDrafts.push(entry);
    else anchored.set(index, [...(anchored.get(index) || []), entry]);
  }
  return { historyDrafts, entries: rows.flatMap((message, i) => [{ kind: "message", message }, ...(anchored.get(i) || [])]) };
}
