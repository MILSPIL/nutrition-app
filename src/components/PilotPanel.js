import React, { useEffect, useState } from "react";
import { pilotSummary, exportPilotRows } from "../services/pilotLedger";
import { readSubmission } from "../services/mealStore";
export default function PilotPanel({ ledger, uid, version = 0 }) {
  const [rows, setRows] = useState([]),
    [error, setError] = useState(false);
  const refresh = async () => {
    try {
      setRows(await ledger.list());
    } catch (_) {
      setError(true);
    }
  };
  useEffect(() => {
    if (!ledger.enabled) return;
    let closed = false;
    (async () => {
      try {
        await ledger.cleanup();
        const values = await ledger.list();
        for (const row of values.filter(
          (x) => x.status === "unknown" && x.submissionId,
        )) {
          const date = row.submissionId.split("~")[0];
          try {
            if (await readSubmission(uid, date, row.submissionId))
              await ledger.update(row.attemptId, {
                status: "saved",
                finishedAt: Date.now(),
              });
          } catch (_) {}
        }
        if (!closed) await refresh();
      } catch (_) {
        if (!closed) setError(true);
      }
    })();
    return () => {
      closed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledger, uid, version]);
  if (!ledger.enabled) return null;
  const summary = pilotSummary(rows, error || ledger.invalid());
  const download = () => {
    const blob = new Blob(
        [JSON.stringify({ summary, attempts: exportPilotRows(rows) }, null, 2)],
        { type: "application/json" },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "scisense-pilot.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return (
    <details className="max-w-lg mx-auto px-4 my-4">
      <summary>
        Пілот: {summary.successes}/{summary.attempts} успішних спроб (
        {summary.percent}%)
      </summary>
      <p>
        Із фото: {summary.withPhoto}. Підтвердьте правильність збережених
        записів після перевірки дня.
      </p>
      {summary.invalid && (
        <p role="alert">Облік неповний. Висновок про поріг пілоту недійсний.</p>
      )}
      {rows
        .filter((row) => row.status === "saved" && !row.correct)
        .map((row) => (
          <div key={row.attemptId} className="my-2">
            <span>
              {new Date(row.startedAt).toLocaleString("uk-UA")} ·{" "}
              {row.hasPhoto
                ? "із фото"
                : row.channel === "text"
                  ? "текст"
                  : "голос"}
            </span>
            <button
              className="p-3 text-[#007AFF]"
              onClick={async () => {
                try {
                  await ledger.update(row.attemptId, { correct: true });
                  await refresh();
                } catch (_) {
                  setError(true);
                }
              }}
            >
              Запис правильний і повний
            </button>
          </div>
        ))}
      <button className="p-3 text-[#007AFF]" onClick={download}>
        Експортувати знеособлені вимірювання
      </button>
      <button
        className="p-3 text-[#B42318]"
        onClick={async () => {
          if (window.confirm("Видалити всі вимірювання пілоту?")) {
            try {
              await ledger.erase();
              setError(false);
              await refresh();
            } catch (_) {
              setError(true);
            }
          }
        }}
      >
        Видалити вимірювання
      </button>
    </details>
  );
}
