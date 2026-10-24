import { PRODUCTS_DB } from "../../src/data/products.js";
import { randomUUID, createHash } from "node:crypto";
import { fail, stableJSON, LIMITS } from "./limits.mjs";
import { itemProblems } from "../../src/services/mealItems.js";
import { measuredQuantity, modelQuantity, explicitQuantityInText, preservePortion, sourceIdentity } from "../../src/services/foodProvenance.js";
import {
  assignPlanItems,
  persistedPlanItem,
} from "../../src/services/planAllocation.js";
import {
  buildPlanCatalog,
  planFingerprint,
} from "../../src/services/planCatalog.js";
import { noteFromDraft } from "../../src/services/foodNotes.js";
export const validDate = (d) =>
  typeof d === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(d) &&
  Number.isFinite(Date.parse(d + "T12:00:00Z")) &&
  new Date(d + "T12:00:00Z").toISOString().slice(0, 10) === d;
const id = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(value);
const object = (v, ks) =>
  v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.keys(v).every((k) => ks.includes(k));
const editable = (d) => {
  if (d && ["saving", "unknown", "saved"].includes(d.state))
    fail("draft_frozen", 409);
};
const choice = (value) => {
  if (
    !object(value, [
      "assignment",
      "letter",
      "referenceKey",
      "consumedState",
      "mass",
    ]) ||
    (value.assignment !== undefined &&
      !["auto", "manual"].includes(value.assignment)) ||
    (value.letter !== undefined &&
      !["", ...Object.keys(PRODUCTS_DB)].includes(value.letter)) ||
    (value.referenceKey !== undefined &&
      (typeof value.referenceKey !== "string" ||
        value.referenceKey.length > 160)) ||
    (value.consumedState !== undefined &&
      !["raw", "cooked", "as_sold", "unknown"].includes(value.consumedState))
  )
    fail("invalid_plan_choice");
  if (
    value.mass &&
    (!object(value.mass, ["baseQuantity", "baseMassGrams"]) ||
      !quantity(value.mass.baseQuantity) ||
      !(value.mass.baseMassGrams > 0 && value.mass.baseMassGrams <= 100000))
  )
    fail("invalid_plan_choice");
  return structuredClone(value);
};
const quantity = (q) =>
  object(q, ["value", "unit"]) &&
  ["g", "ml", "portion", "package", "unknown"].includes(q.unit) &&
  (q.value === null ||
    (typeof q.value === "number" &&
      Number.isFinite(q.value) &&
      q.value > 0 &&
      q.value <= 100000));
export function patchDraft(
  previous,
  patch,
  { resolve, now = Date.now, manual = false, turnId } = {},
) {
  editable(previous);
  if (
    !object(patch, [
      "draftId",
      "baseRevision",
      "targetDate",
      "meal",
      "items",
      "removeItemIds",
      "originalText",
      "noteId",
    ]) ||
    !Number.isSafeInteger(patch.baseRevision) ||
    patch.baseRevision !== (previous?.revision || 0) ||
    !validDate(patch.targetDate) ||
    ![1, 2, 3, 4].includes(patch.meal) ||
    !Array.isArray(patch.items) ||
    patch.items.length > 20
  )
    fail("draft_conflict", 409);
  if (previous && patch.draftId !== previous.draftId)
    fail("draft_conflict", 409);
  if (
    patch.originalText !== undefined &&
    (typeof patch.originalText !== "string" ||
      Buffer.byteLength(patch.originalText) > LIMITS.userBytes)
  )
    fail("invalid_request");
  if (
    patch.noteId !== undefined &&
    (typeof patch.noteId !== "string" ||
      !/^[-a-zA-Z0-9_]{17,161}$/.test(patch.noteId))
  )
    fail("invalid_request");
  const items = new Map(
    (previous?.items || []).map((i) => [i.itemId, structuredClone(i)]),
  );
  const removed = patch.removeItemIds || [];
  if (
    !Array.isArray(removed) ||
    removed.length > 20 ||
    removed.some((i) => !items.has(i))
  )
    fail("invalid_request");
  removed.forEach((i) => items.delete(i));
  const origins = { ...(previous?.origins || {}) };
  const originRef = (text) => {
    const found = Object.keys(origins).find((key) => origins[key] === text);
    if (found) return found;
    const key = randomUUID();
    origins[key] = text;
    return key;
  };
  const seen = new Set();
  for (const raw of patch.items) {
    if (!id(raw?.itemId) || seen.has(raw.itemId)) fail("invalid_food_proposal");
    seen.add(raw.itemId);
    const old = items.get(raw.itemId);
    let updated;
    if (manual) {
      if (
        !old ||
        !object(raw, ["itemId", "quantity", "planChoice", "noteSelected"])
      )
        fail("invalid_request");
      updated = { ...old };
      if (raw.quantity !== undefined) {
        if (!quantity(raw.quantity)) fail("invalid_quantity");
        updated = measuredQuantity(updated, raw.quantity);
        updated.nutritionStatus = itemProblems(updated).length
          ? "unknown"
          : "complete";
      }
      if (raw.planChoice !== undefined)
        updated.planChoice = choice(raw.planChoice);
      if (raw.noteSelected !== undefined) {
        if (typeof raw.noteSelected !== "boolean") fail("invalid_request");
        updated.noteSelected = raw.noteSelected;
      }
    } else if (old && object(raw, ["itemId", "quantity"])) {
      if (!quantity(raw.quantity)) fail("invalid_quantity");
      updated = modelQuantity(old, raw.quantity, patch.originalText, {trustedSingleItem:previous?.items?.length === 1 && patch.items.length === 1});
      updated.nutritionStatus = itemProblems(updated).length
        ? "unknown"
        : "complete";
    } else {
      updated = resolve(raw);
      // A partial concrete source is evidence, not a blank model template.
      // Keep its unknown fields even if a later proposal supplies all numbers.
      const normalizedName = String(updated.name).normalize("NFKC").trim().toLocaleLowerCase("uk");
      const explicitNewProduct = old && String(old.name).normalize("NFKC").trim().toLocaleLowerCase("uk") !== normalizedName &&
        String(patch.originalText || "").normalize("NFKC").toLocaleLowerCase("uk").includes(normalizedName);
      const partialConcrete = old && ["label","database","personal"].includes(old.source?.kind) &&
        ["p","f","c","cal"].some(key => old.nutrients?.[key] == null);
      const retainedLabel = old?.source?.kind === "label" && updated.source.kind !== "label" && !explicitNewProduct;
      if ((partialConcrete && updated.source.kind === "estimate" && !explicitNewProduct) || retainedLabel) {
        updated = explicitQuantityInText(updated.quantity, patch.originalText, {itemName:old.name, trustedSingleItem:previous?.items?.length === 1 && patch.items.length === 1})
          ? measuredQuantity(old, updated.quantity) : structuredClone(old);
        updated.nutritionStatus = itemProblems(updated).length
          ? "unknown"
          : "complete";
      }
      if (old && raw.source?.kind === "label") {
        updated = explicitQuantityInText(updated.quantity, patch.originalText, {itemName:updated.name, trustedSingleItem:previous?.items?.length === 1 && patch.items.length === 1})
          ? measuredQuantity(updated, updated.quantity) : preservePortion(old, updated);
        updated.nutritionStatus = itemProblems(updated).length
          ? "unknown"
          : "complete";
      }
      if (old?.planChoice?.assignment === "manual")
        updated.planChoice =
          sourceIdentity(old) === sourceIdentity(updated)
            ? old.planChoice
            : {
                assignment: "manual",
                letter: old.planChoice.letter,
                referenceKey: "",
              };
      if (old) updated.noteSelected = old.noteSelected === true;
    }
    updated.originalTextRef =
      old?.originalTextRef ||
      originRef(
        old?.originalText ??
          (old ? previous?.originalText : undefined) ??
          patch.originalText ??
          "",
      );
    delete updated.originalText;
    items.set(raw.itemId, updated);
  }
  if (items.size < 1 || items.size > 20) fail("invalid_food_proposal");
  const value = {
    draftId: previous?.draftId || randomUUID(),
    targetDate: patch.targetDate,
    meal: patch.meal,
    revision: (previous?.revision || 0) + 1,
    state: "ready",
    items: [...items.values()],
    updatedAt: now(),
    originTurnIds: [
      ...new Set([
        ...(previous?.originTurnIds ||
          (previous?.turnId ? [previous.turnId] : [])),
        ...(turnId ? [turnId] : []),
      ]),
    ],
    origins: Object.fromEntries(
      Object.entries(origins).filter(([key]) =>
        [...items.values()].some((i) => i.originalTextRef === key),
      ),
    ),
    ...(previous?.noteId || patch.noteId
      ? { noteId: previous?.noteId || patch.noteId }
      : {}),
  };
  if (turnId || previous?.turnId) value.turnId = turnId || previous.turnId;
  if (
    Buffer.byteLength(stableJSON(value)) > 16000 ||
    /data:(image|audio)\//i.test(stableJSON(value))
  )
    fail("draft_too_large", 413);
  return value;
}
// Source, nutrient values and IDs come only from the canonical draft. The browser
// chooses a letter/note before this step; server recomputes allocations against fresh plan.
export async function commandFromDraft(
  draft,
  { planContext = {}, meals = {}, dayRevision, now = Date.now } = {},
) {
  if (dayRevision !== undefined && (!Number.isSafeInteger(dayRevision) || dayRevision < 0))
    fail("invalid_day_revision");
  const known = draft.items
      .filter((i) => i.nutritionStatus === "complete")
      .map(({ originalText, originalTextRef, noteSelected, ...item }) => item),
    unknown = draft.items.filter((i) => i.nutritionStatus !== "complete");
  if (unknown.some((i) => i.noteSelected !== true))
    fail("note_confirmation_required", 409);
  const catalog = buildPlanCatalog(planContext),
    items = assignPlanItems(known, catalog, meals).map(persistedPlanItem);
  if (items.some((i) => itemProblems(i).length)) fail("invalid_item");
  const command = {
    type: draft.noteId ? "resolveFoodNote" : "saveTrainerDraft",
    submissionId: randomUUID(),
    targetDate: draft.targetDate,
    meal: draft.meal,
    items,
    notes: unknown.map((i) =>
      noteFromDraft(
        i,
        draft.draftId,
        draft.origins?.[i.originalTextRef] ??
          i.originalText ??
          draft.originalText,
      ),
    ),
    planFingerprint: await planFingerprint(catalog),
    ...(dayRevision !== undefined ? {expectedRevision:dayRevision} : {}),
    updatedAt: new Date(now()).toISOString(),
  };
  if (draft.noteId) {
    if (items.length !== 1 || unknown.length) fail("note_conflict", 409);
    command.noteId = draft.noteId;
    delete command.notes;
  }
  const { updatedAt, ...payload } = command;
  return {
    draftId: draft.draftId,
    draftRevision: draft.revision,
    command,
    hash: createHash("sha256").update(stableJSON(payload)).digest("hex"),
  };
}
export function attachDraftStore({
  db,
  tx,
  conversation,
  own,
  internal,
  active,
  now,
}) {
  db.exec(`CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id),target_date TEXT NOT NULL,revision INTEGER NOT NULL,value TEXT NOT NULL,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS proposals(turn_id TEXT NOT NULL REFERENCES turns(id),draft_id TEXT NOT NULL,base_revision INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(turn_id,draft_id));
 CREATE TABLE IF NOT EXISTS save_commands(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,draft_id TEXT NOT NULL,hash TEXT NOT NULL,command TEXT,state TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS context_proposals(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,turn_id TEXT,base_revision INTEGER NOT NULL,value TEXT NOT NULL,state TEXT NOT NULL,created INTEGER NOT NULL);`);
  const get = (uid, cid, did) => {
    conversation(uid, cid);
    const r = db
      .prepare("SELECT * FROM drafts WHERE id=? AND conversation_id=?")
      .get(did, cid);
    if (!r) fail("not_found", 404);
    return JSON.parse(r.value);
  };
  const write = (cid, d) => {
    const collision = db
      .prepare(
        "SELECT id FROM drafts WHERE conversation_id=? AND target_date=? AND json_extract(value,'$.state')!='saved'",
      )
      .get(cid, d.targetDate);
    if (collision && collision.id !== d.draftId)
      fail("date_draft_conflict", 409);
    db.prepare(
      "INSERT INTO drafts VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET target_date=excluded.target_date,revision=excluded.revision,value=excluded.value,updated=excluded.updated",
    ).run(d.draftId, cid, d.targetDate, d.revision, stableJSON(d), d.updatedAt);
    return d;
  };
  return {
    drafts(uid, cid) {
      conversation(uid, cid);
      return db
        .prepare(
          "SELECT value FROM drafts WHERE conversation_id=? ORDER BY target_date",
        )
        .all(cid)
        .map((r) => {
          const d = JSON.parse(r.value);
          return {
            ...d,
            blocked: !!(
              d.turnId &&
              db
                .prepare("SELECT 1 FROM cleanup_jobs WHERE turn_id=?")
                .get(d.turnId)
            ),
          };
        });
    },
    draft: get,
    propose(id, generation, patch, resolve) {
      return tx(() => {
        const turn = internal(id);
        active(turn);
        if (turn.generation !== generation) fail("stale_result", 409);
        const old = patch.draftId
          ? get(turn.owner, turn.conversation_id, patch.draftId)
          : null;
        const snapshot = JSON.parse(turn.snapshot);
        const admitted = Array.isArray(snapshot.draft)
          ? snapshot.draft.find((d) => d.draftId === patch.draftId)
          : snapshot.draft;
        if (old && admitted?.revision !== old.revision)
          fail("draft_conflict", 409);
        const next = patchDraft(old, patch, { resolve, now, turnId: id });
        if (
          db
            .prepare("SELECT 1 FROM proposals WHERE turn_id=? AND draft_id=?")
            .get(id, next.draftId)
        )
          fail("draft_already_proposed", 409);
        db.prepare("INSERT INTO proposals VALUES(?,?,?,?)").run(
          id,
          next.draftId,
          old?.revision || 0,
          stableJSON(next),
        );
        return next;
      });
    },
    publish(turn) {
      const output = [];
      for (const p of db
        .prepare("SELECT * FROM proposals WHERE turn_id=?")
        .all(turn.id)) {
        const old = db
          .prepare("SELECT revision,value FROM drafts WHERE id=?")
          .get(p.draft_id);
        let state = "applied";
        const value = JSON.parse(p.value),
          collision = db
            .prepare(
              "SELECT id FROM drafts WHERE conversation_id=? AND target_date=? AND json_extract(value,'$.state')!='saved'",
            )
            .get(turn.conversation_id, value.targetDate);
        if (
          (old?.revision || 0) !== p.base_revision ||
          (old &&
            ["saving", "saved", "unknown"].includes(
              JSON.parse(old.value).state,
            )) ||
          (collision && collision.id !== value.draftId)
        )
          state = "conflict";
        else write(turn.conversation_id, value);
        output.push({ draftId: p.draft_id, revision: value.revision, state });
      }
      db.prepare(
        "UPDATE context_proposals SET state='proposed' WHERE turn_id=? AND state='pending'",
      ).run(turn.id);
      return output;
    },
    editDraft(uid, cid, did, patch) {
      return tx(() => {
        const old = get(uid, cid, did);
        return write(
          cid,
          patchDraft(old, { ...patch, draftId: did }, { manual: true, now }),
        );
      });
    },
    manualNote(uid, cid, { text, targetDate, meal, noteId, itemId }) {
      return tx(() => {
        conversation(uid, cid);
        if (
          typeof text !== "string" ||
          !text.trim() ||
          Buffer.byteLength(text) > LIMITS.userBytes
        )
          fail("invalid_request");
        const next = patchDraft(
          null,
          {
            baseRevision: 0,
            targetDate,
            meal,
            originalText: text,
            ...(noteId ? { noteId } : {}),
            items: [
              {
                itemId: itemId || randomUUID(),
                name: text.slice(0, 160),
                quantity: { value: null, unit: "unknown" },
                preparation: "unknown",
                source: { kind: "unknown" },
              },
            ],
          },
          {
            resolve: (raw) => ({
              ...raw,
              nutritionBasis: { value: null, unit: "unknown" },
              nutrients: { p: null, f: null, c: null, cal: null },
              nutritionStatus: "unknown",
              estimated: false,
            }),
            now,
          },
        );
        return write(cid, next);
      });
    },
    beginSave(uid, cid, did, revision, prepared) {
      return tx(() => {
        const d = get(uid, cid, did);
        if (["saving", "unknown", "saved"].includes(d.state)) return d;
        if (
          d.revision !== revision ||
          prepared.draftRevision !== revision ||
          prepared.draftId !== did
        )
          fail("draft_conflict", 409);
        if (
          d.turnId &&
          db.prepare("SELECT 1 FROM cleanup_jobs WHERE turn_id=?").get(d.turnId)
        )
          fail("trainer_busy", 409);
        const { command, hash } = prepared;
        db.prepare("INSERT INTO save_commands VALUES(?,?,?,?,?,?,?)").run(
          command.submissionId,
          cid,
          did,
          hash,
          stableJSON(command),
          "saving",
          now(),
        );
        return write(cid, {
          ...d,
          state: "saving",
          save: { command, hash, submissionId: command.submissionId },
          updatedAt: now(),
        });
      });
    },
    saveUnknown(uid, cid, did) {
      return tx(() => {
        const d = get(uid, cid, did);
        if (d.state === "saved") return d;
        if (!d.save) fail("draft_conflict", 409);
        db.prepare("UPDATE save_commands SET state='unknown' WHERE id=?").run(
          d.save.submissionId,
        );
        return write(cid, { ...d, state: "unknown" });
      });
    },
    confirmRejected(uid, cid, did, expectedId, proof) {
      return tx(() => {
        const d = get(uid, cid, did);
        if (
          !d.save ||
          d.save.submissionId !== expectedId ||
          proof?.rejectedSubmissions?.[expectedId] !== d.save.hash ||
          proof?.submissionMarkers?.[expectedId]
        )
          fail("save_unconfirmed", 409);
        db.prepare("UPDATE save_commands SET state='rejected' WHERE id=?").run(
          expectedId,
        );
        const { save, ...rest } = d;
        return write(cid, {
          ...rest,
          state: "ready",
          revision: d.revision + 1,
          lastRejected: expectedId,
          updatedAt: now(),
        });
      });
    },
    confirmSaved(uid, cid, did, proof) {
      return tx(() => {
        const d = get(uid, cid, did);
        if (
          !d.save ||
          proof?.submissionMarkers?.[d.save.submissionId] !== d.save.hash
        )
          fail("save_unconfirmed", 409);
        db.prepare("UPDATE save_commands SET state='saved' WHERE id=?").run(
          d.save.submissionId,
        );
        return write(cid, {
          ...d,
          state: "saved",
          receipt: {
            submissionId: d.save.submissionId,
            targetDate: d.targetDate,
            revision: proof.revision,
          },
          updatedAt: now(),
        });
      });
    },
    proposeContext(id, generation, { baseRevision, text }) {
      return tx(() => {
        const turn = internal(id);
        active(turn);
        if (
          turn.generation !== generation ||
          baseRevision !== JSON.parse(turn.snapshot).contextRevision ||
          typeof text !== "string" ||
          !text.trim() ||
          Buffer.byteLength(text) > 8000 ||
          /data:(image|audio)\//i.test(text)
        )
          fail("invalid_context_proposal");
        const pid = randomUUID();
        db.prepare("INSERT INTO context_proposals VALUES(?,?,?,?,?,?,?)").run(
          pid,
          turn.conversation_id,
          id,
          baseRevision,
          text,
          "pending",
          now(),
        );
        return { proposalId: pid, baseRevision, text };
      });
    },
    contextProposals(uid, cid) {
      conversation(uid, cid);
      return db
        .prepare(
          "SELECT id proposalId,base_revision baseRevision,value text,state FROM context_proposals WHERE conversation_id=? AND state IN ('proposed','applied') AND NOT EXISTS(SELECT 1 FROM cleanup_jobs WHERE cleanup_jobs.turn_id=context_proposals.turn_id)",
        )
        .all(cid);
    },
    contextProposal(uid, cid, id) {
      conversation(uid, cid);
      const p = db
        .prepare(
          "SELECT id proposalId,base_revision baseRevision,value text,state FROM context_proposals WHERE id=? AND conversation_id=? AND state IN ('proposed','applied') AND NOT EXISTS(SELECT 1 FROM cleanup_jobs WHERE cleanup_jobs.turn_id=context_proposals.turn_id)",
        )
        .get(id, cid);
      if (!p) fail("not_found", 404);
      return p;
    },
    contextApplied(uid, cid, id) {
      conversation(uid, cid);
      db.prepare(
        "UPDATE context_proposals SET state='applied' WHERE id=? AND conversation_id=? AND state='proposed'",
      ).run(id, cid);
    },
  };
}
