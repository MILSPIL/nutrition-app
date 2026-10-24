import { newId } from "./mealItems";
const ALLOWED = [
  "attemptId",
  "channel",
  "ownerKey",
  "turnId",
  "parentAttemptId",
  "submissionId",
  "startedAt",
  "updatedAt",
  "finishedAt",
  "previewMs",
  "actions",
  "planAssignedCount",
  "planUnresolvedCount",
  "planManualCount",
  "corrections",
  "clarifications",
  "hasPhoto",
  "manualSearch",
  "manualPfc",
  "partial",
  "correct",
  "status",
];
export const exportPilotRows = (rows) =>
  rows.map(({ ownerKey, turnId, ...row }) => row);
export const pilotSummary = (allRows, invalid = false) => {
  const rows = allRows.filter((row) => row.channel !== "text");
  const successes = rows.filter(
    (x) =>
      x.status === "saved" &&
      x.correct === true &&
      !x.partial &&
      !x.manualSearch &&
      !x.manualPfc,
  ).length;
  return {
    attempts: rows.length,
    withPhoto: rows.filter((x) => x.hasPhoto).length,
    successes,
    percent: rows.length ? Math.round((successes / rows.length) * 100) : 0,
    invalid,
  };
};
export function createPilotLedger(
  enabled = process.env.REACT_APP_PILOT_MODE === "1",
) {
  let invalid = false,
    opened;
  const active = new Set();
  const open = () =>
    opened ||
    (opened = new Promise((resolve, reject) => {
      const request = indexedDB.open("scisense-pilot-v1", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("attempts", { keyPath: "attemptId" });
        request.result.createObjectStore("meta");
      };
      request.onerror = () => reject(Error("pilot_storage_unavailable"));
      request.onblocked = () => reject(Error("pilot_storage_unavailable"));
      request.onsuccess = () => resolve(request.result);
    }));
  const run = async (fn, readonly = false) => {
    if (!enabled) return null;
    try {
      const db = await open();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(
          ["attempts", "meta"],
          readonly ? "readonly" : "readwrite",
        );
        let result;
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(Error("pilot_storage_unavailable"));
        tx.onabort = () => reject(Error("pilot_storage_unavailable"));
        fn(tx, (value) => {
          result = value;
        });
      });
    } catch (e) {
      invalid = true;
      try {
        localStorage.setItem("scisense-pilot-invalid", "1");
      } catch (_) {}
      throw e;
    }
  };
  const update = (attemptId, patch) => {
    if (patch.status && patch.status !== "started") active.delete(attemptId);
    return run((tx, done) => {
      const store = tx.objectStore("attempts"),
        request = store.get(attemptId);
      request.onsuccess = () => {
        if (!request.result) {
          tx.abort();
          return;
        }
        const next = { ...request.result, ...patch, updatedAt: Date.now() };
        store.put(
          Object.fromEntries(
            ALLOWED.filter(
              (k) =>
                next[k] !== undefined &&
                (!k.startsWith("plan") ||
                  (Number.isSafeInteger(next[k]) &&
                    next[k] >= 0 &&
                    next[k] <= 20)),
            ).map((k) => [k, next[k]]),
          ),
        );
        done(next);
      };
    });
  };
  return {
    enabled,
    textSummary: (rows) => ({
      attempts: rows.filter((r) => r.channel === "text").length,
      saved: rows.filter((r) => r.channel === "text" && r.status === "saved")
        .length,
    }),
    start: async (parentAttemptId, channel = "voice") => {
      if (!["voice", "text"].includes(channel))
        throw Error("invalid_metric_channel");
      const attemptId = newId();
      await run((tx, done) => {
        tx.objectStore("attempts").put({
          attemptId,
          channel,
          ...(parentAttemptId ? { parentAttemptId } : {}),
          startedAt: Date.now(),
          updatedAt: Date.now(),
          status: "started",
          hasPhoto: false,
          actions: 1,
          corrections: 0,
          clarifications: 0,
          manualSearch: false,
          manualPfc: false,
          partial: false,
          correct: false,
        });
        done(attemptId);
      });
      active.add(attemptId);
      return attemptId;
    },
    update,
    list: () =>
      run((tx, done) => {
        const request = tx.objectStore("attempts").getAll();
        request.onsuccess = () => done(request.result);
      }, true).then((rows) => rows || []),
    async cleanup() {
      await run((tx) => {
        const store = tx.objectStore("attempts"),
          request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          const row = cursor.value;
          if (row.startedAt < Date.now() - 30 * 86400000) cursor.delete();
          else if (row.status === "started" && !active.has(row.attemptId))
            cursor.update({
              ...row,
              status: "abandoned",
              finishedAt: Date.now(),
            });
          cursor.continue();
        };
      });
    },
    async erase() {
      await run((tx) => {
        tx.objectStore("attempts").clear();
        tx.objectStore("meta").clear();
      });
      invalid = false;
      try {
        localStorage.removeItem("scisense-pilot-invalid");
      } catch (_) {}
    },
    invalid: () => {
      try {
        return (
          invalid || localStorage.getItem("scisense-pilot-invalid") === "1"
        );
      } catch (_) {
        return true;
      }
    },
    close: async () => {
      const pending = opened;
      opened = null;
      active.clear();
      if (pending)
        try {
          (await pending).close();
        } catch (_) {}
    },
  };
}
