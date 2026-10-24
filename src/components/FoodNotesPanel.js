import React from "react";
import { foodNotesSummary, foodNotesReport } from "../services/foodNotes";

export default function FoodNotesPanel({ notes = [], onResolve }) {
  const summary = foodNotesSummary(notes);
  if (!summary.incomplete) return null;
  return (
    <section
      aria-label="Їжа без повної оцінки"
      className="bg-[#FFF4DF] rounded-2xl p-4 mb-4"
    >
      <p className="font-semibold">
        Підсумок неповний: {summary.unresolvedCount} без повної оцінки
      </p>
      <p className="text-sm mt-1">
        Ця їжа збережена. До підсумку ккал і БЖВ входять лише розраховані
        позиції.
      </p>
      <ul className="mt-3 space-y-3">
        {summary.notes.map((note) => (
          <li key={note.noteId}>
            <p className="whitespace-pre-wrap break-words">
              {foodNotesReport([note])
                .split("Без повної оцінки:\n")
                .slice(1)
                .join("Без повної оцінки:\n")}
            </p>
            {onResolve && (
              <button
                className="min-h-[44px] text-[#007AFF]"
                onClick={() => onResolve(note)}
              >
                Уточнити оцінку
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
