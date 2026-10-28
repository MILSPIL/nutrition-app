import { DatabaseSync } from "node:sqlite";
import { openSync, closeSync, lstatSync, existsSync } from "node:fs";
import { TOOLS } from "./limits.mjs";

// COACH-PROBLEMS-01 S1. Знеособлений журнал: лише агреговані лічильники за
// (доба, реліз, категорія, код, інструмент). Жодного тексту, uid, id чи шляху.
// Код поза цим переліком записується як `other`, тож довільний рядок (повідомлення
// помилки, назва продукту) у файл потрапити не може. Перелік статичний; повноту
// перевіряє problem-journal.test.mjs за джерелами S1.
export const KNOWN_CODES = Object.freeze([
  "admission_conflict", "assumptions_required", "bad_request", "brand_is_not_exact", "budget_disabled",
  "budget_invalid", "budget_permissions", "budget_rollback", "call_limit", "canonical_history_required",
  "cleanup_unsafe", "composer_conflict", "conflict", "connection_auth_required", "connection_busy",
  "connection_closed", "connection_conflict", "connection_key_invalid", "connection_material_invalid",
  "connection_model_changed", "connection_permissions", "connection_refresh_uncertain",
  "connection_store_invalid", "connection_store_unavailable", "consumption_unconfirmed", "context_conflict",
  "context_exists", "context_invalid", "context_too_large", "context_unavailable", "context_unconfirmed",
  "conversation_conflict", "conversation_gone", "curated_pack_invalid", "data_auth_required",
  "data_session_close_failed", "data_session_config_invalid", "date_change_requires_confirmation",
  "date_clarification", "date_draft_conflict", "date_draft_in_turn", "day_unavailable",
  "deletion_manifest_invalid", "deletion_manifest_missing", "deletion_manifest_rollback",
  "density_not_confirmed", "desktop_method_forbidden", "desktop_unavailable", "draft_already_proposed",
  "draft_conflict", "draft_frozen", "draft_too_large", "estimate", "estimate_reason_required",
  "execution_unknown", "expired", "food_index_checksum", "food_source_not_offered", "forbidden",
  "free_stt_ledger_invalid", "hermes_arch_invalid", "hermes_config_invalid", "hermes_failed",
  "hermes_isolation_required", "hermes_path_invalid", "hermes_path_overlap", "hermes_permissions",
  "hermes_pin_invalid", "hermes_profile_alias", "hermes_profile_invalid", "hermes_profile_too_large",
  "hermes_python_invalid", "hermes_worker_failed", "history_conflict", "interrupted_before_start",
  "invalid_context_proposal", "invalid_date", "invalid_day_revision", "invalid_food",
  "invalid_food_proposal", "invalid_food_query", "invalid_food_source", "invalid_household_measure",
  "invalid_image", "invalid_item", "invalid_lease", "invalid_payload", "invalid_plan_choice",
  "invalid_plan_match", "invalid_portion_origin", "invalid_quantity", "invalid_request", "invalid_response",
  "invalid_token", "invalid_tools", "ipc_invalid", "isolation_failed", "item", "label_evidence_missing",
  "lease_pending", "ledger_replaced", "live_disabled", "local_not_stopped", "marker_unconfirmed",
  "media_conflict", "media_missing", "media_quota", "media_reattach_required", "media_too_large",
  "media_unavailable", "media_unsupported", "memory_read_only", "message_too_large", "model_owner_required",
  "model_payload_invalid", "model_selection_refused", "native_cancelled", "native_queue_pending",
  "native_receipt_invalid", "no_matching_source", "not_found", "note_confirmation_required", "note_conflict",
  "note_draft_single", "notes_disabled", "omission_required", "other", "owner_channel_close_failed",
  "owner_shutdown_incomplete", "permission_denied", "personal_activation_invalid",
  "personal_channel_invalid", "personal_channel_limit", "personal_config_invalid",
  "personal_ephemeral_invalid", "personal_key_invalid", "personal_launcher_invalid",
  "personal_owner_conflict", "personal_provision_cleanup_failed", "personal_registry_conflict",
  "personal_runtime_invalid", "personal_shutdown_incomplete", "personal_store_invalid", "pilot_forbidden",
  "port_invalid", "problem_journal_invalid", "profile_mismatch", "profile_missing", "receipt_invalid",
  "receipt_stale", "recipe_estimate", "registry_changed", "required_fact_missing",
  "resource_limits_not_enforced", "save_unconfirmed", "server_activation_invalid", "server_config_invalid",
  "server_start_refused", "session_changed", "shutdown", "snapshot_mismatch", "source_changed",
  "stale_preview", "stale_result", "stale_snapshot", "state_exists", "tool_result_too_large",
  "trainer_activation_invalid", "trainer_busy", "trainer_cancelled", "trainer_config", "trainer_failed",
  "trainer_in_use", "trainer_key_invalid", "trainer_permissions", "trainer_queue_full", "trainer_quota",
  "trainer_replaced", "trainer_store_invalid", "trainer_timeout", "trainer_unavailable",
  "transfer_command_failed", "transfer_config", "transfer_input_timeout", "transfer_invalid",
  "transfer_refused", "transfer_source_missing", "trusted_read_invalid", "turn_conflict", "turn_expired",
  "turn_gone", "turn_inactive", "unauthorized", "unknown", "upstream_failed", "upstream_limited",
  "upstream_timeout", "user_cancel", "watchdog_required", "watchdog_unavailable"
]);
export const PROBLEM_CATEGORIES = Object.freeze(["turn_failed", "turn_unknown", "turn_cancelled", "turn_cause", "overflow", "tool_error",
  "payer_failure", "food_estimate", "food_unknown", "food_portion_estimate", "food_total"]);
export const PROBLEM_RETENTION_DAYS = 30;
const known = new Set(KNOWN_CODES), categories = new Set(PROBLEM_CATEGORIES), tools = new Set(TOOLS);
const kyiv = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" });
export const kyivDay = ms => kyiv.format(new Date(ms));
export const shiftDay = (day, days) => new Date(Date.parse(day + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);
export const minuteStamp = ms => new Date(ms).toISOString().slice(0, 16) + "Z";
export const safeCode = code => typeof code === "string" && known.has(code) ? code : "other";
export const safeTool = tool => tool === "" || tool === undefined ? "" : tools.has(tool) ? tool : "other";

// Журнал, що не відкрився: служба працює, S3 показує journal.ok=false.
export function disabledProblemJournal() {
  return Object.freeze({ record() {}, rows() { return []; }, status() { return { ok: false, writeErrors: 0 }; }, close() {} });
}

export function openProblemJournal(file, { release, now = Date.now, maxRows = 5000 } = {}) {
  if (typeof release !== "string" || !release || !Number.isInteger(maxRows) || maxRows < 1) throw Error("problem_journal_invalid");
  if (!existsSync(file)) closeSync(openSync(file, "wx", 0o600));
  const info = lstatSync(file);
  if (!info.isFile() || info.nlink !== 1 || info.mode & 0o077) throw Error("problem_journal_invalid");
  const db = new DatabaseSync(file);
  let writeErrors = 0, closed = false, maintainedDay = null, statements;
  try {
    db.exec(`PRAGMA secure_delete=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
      CREATE TABLE IF NOT EXISTS problems(day TEXT NOT NULL,release TEXT NOT NULL,category TEXT NOT NULL,code TEXT NOT NULL,tool TEXT NOT NULL,
        count INTEGER NOT NULL,first_at TEXT NOT NULL,last_at TEXT NOT NULL,PRIMARY KEY(day,release,category,code,tool));`);
    statements = {
      bump: db.prepare("UPDATE problems SET count=count+1,last_at=? WHERE day=? AND release=? AND category=? AND code=? AND tool=?"),
      size: db.prepare("SELECT COUNT(*) n FROM problems WHERE category<>'overflow'"),
      insert: db.prepare("INSERT INTO problems VALUES(?,?,?,?,?,1,?,?) ON CONFLICT(day,release,category,code,tool) DO UPDATE SET count=count+1,last_at=excluded.last_at"),
      purge: db.prepare("DELETE FROM problems WHERE day<?"),
      rows: db.prepare("SELECT * FROM problems WHERE day>=? ORDER BY day,release,category,code,tool"),
    };
    maintain(now());
  } catch (error) { db.close(); throw error; }
  function maintain(at) {
    const today = kyivDay(at);
    if (today === maintainedDay) return;
    statements.purge.run(shiftDay(today, -PROBLEM_RETENTION_DAYS));
    maintainedDay = today;
  }
  return Object.freeze({
    // Ніколи не кидає: збій запису не змінює хід, лише лічильник writeErrors.
    record(category, code, tool = "") {
      try {
        if (closed || !categories.has(category)) throw Error("problem_journal_invalid");
        const at = now(), day = kyivDay(at), stamp = minuteStamp(at), key = [day, release, category, safeCode(code), safeTool(tool)];
        maintain(at);
        if (statements.bump.run(stamp, ...key).changes) return;
        if (category !== "overflow" && statements.size.get().n >= maxRows) key.splice(2, 3, "overflow", "other", "");
        statements.insert.run(...key, stamp, stamp);
      } catch { writeErrors++; }
    },
    rows(since) {
      if (closed) return [];
      maintain(now());
      return statements.rows.all(since).map(r => ({ day: r.day, release: r.release, category: r.category, code: r.code, tool: r.tool,
        count: r.count, firstAt: r.first_at, lastAt: r.last_at }));
    },
    status() { return { ok: !closed, writeErrors }; },
    close() { if (!closed) { closed = true; db.close(); } },
  });
}

// Перехід ходу (S2 а) → категорія журналу. Лише стан і код, без id ходу.
const turnCategories = { failed: "turn_failed", unknown: "turn_unknown", cancelled: "turn_cancelled" };
export const turnProblemRecorder = journal => ({ state, code }) => {
  if (Object.hasOwn(turnCategories, state)) journal.record(turnCategories[state], code);
};
