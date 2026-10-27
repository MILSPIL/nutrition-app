import React, { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square, Camera, Send, X, Paperclip, Image as ImageIcon } from "lucide-react";
import { createTrainerApi, trainerError, trainerFeedback } from "../services/trainerApi";
import { createTrainerSession, NETWORK_ERRORS } from "../services/trainerSession";
import { dateLabel, initialTrainerDate, kyivDateKey, restoredTrainerText } from "../services/trainerDates";
import {
  createRecorder,
  normalizeAudio,
  normalizePhoto,
} from "../services/voiceMedia";
import { transcribeAudio, voiceError } from "../services/voiceApi";
import {
  itemMacros,
  itemProblems,
  roundMacros,
  parseDecimal,
  sourceText,
  UNITS,
  newId,
} from "../services/mealItems";
import { buildPlanCatalog } from "../services/planCatalog";
import {
  assignPlanItems,
  dailyPlanProgress,
  allocationCounts,
} from "../services/planAllocation";
import PlanAllocationFields from "./PlanAllocationFields";
import DecimalInput from "./DecimalInput";
import TrainerPhoto from "./TrainerPhoto";
import { trainerTimeline } from "../services/trainerTimeline";
import "./VoiceInputModal.css";
import "./TrainerChat.css";
const names = { 1: "Сніданок", 2: "Обід", 3: "Вечеря", 4: "Перекус" };
const empty = {};
const initial = {
  server: null,
  text: "",
  dirty: false,
  composerState: "loading",
  busy: false,
  error: "",
  admission: null,
};
const activeTurn = (t) =>
  t && (t.cleanupPending || ["queued", "running", "unknown", "cleanup_pending"].includes(t.state));
const statuses = {
  queued: "Повідомлення отримано",
  running: "Тренер розбирає повідомлення",
  unknown: "Результат ще невідомий",
  cleanup_pending: "Завершую обробку",
  failed: "Обробка не вдалася",
  cancelled: "Обробку скасовано",
};
// Trainer replies may use **bold**; nothing else is markup. Text nodes only:
// an unpaired ** and all backticks are dropped.
function trainerText(content) {
  const parts = String(content).replace(/`/g, "").split("**");
  if (parts.length % 2 === 0) parts.splice(-2, 2, parts.at(-2) + parts.at(-1));
  return parts.map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
}
function applyEdits(d, patch = {}) {
  return {
    ...d,
    ...patch,
    items: d.items.filter((i) => !patch.removeItemIds?.includes(i.itemId)).map((i) => {
      const next = { ...i, ...patch.items?.[i.itemId] };
      return {
        ...next,
        nutritionStatus: itemProblems(next).length ? "unknown" : "complete",
      };
    }),
  };
}
function DraftCard({
  draft,
  catalog,
  meals,
  disabled,
  dirty,
  onEdit,
  onSave,
  onPhoto,
  onOpenDay,
  dayStatus,
  stale,
  onRefresh,
}) {
  if (draft.state === "saved") {
    const command = draft.save?.command;
    const items = command ? command.items : draft.items.filter(item => item.nutritionStatus === "complete");
    const notes = command ? command.notes || [] : draft.items.filter(item => item.nutritionStatus !== "complete");
    const total = roundMacros(items.reduce((sum, item) => {
      if (item.nutritionStatus !== "complete") return sum;
      const value = itemMacros(item);
      for (const key of ["cal", "p", "f", "c"]) sum[key] += value[key];
      return sum;
    }, { cal: 0, p: 0, f: 0, c: 0 }));
    return <article className="trainer-draft trainer-saved" data-testid="trainer-saved-receipt">
      <div className="trainer-draft-heading"><h3>Додано до щоденника</h3><span>{dateLabel(draft.targetDate)} · {names[draft.meal]}</span></div>
      {items.map(item => <p key={item.itemId}>{item.name}{item.planAllocation?.letter ? ` · ${item.planAllocation.letter.toUpperCase()}` : ""}{Number.isFinite(item.portion) ? ` · ${Math.round(item.portion)}% норми` : ""}</p>)}
      {items.length > 0 && <p>{total.cal} ккал · Б {total.p} · Ж {total.f} · В {total.c}</p>}
      {notes.map(note => <p key={note.itemId || note.noteId}>{note.name} · нотатка</p>)}
      {notes.length > 0 && <p>Нотатки збережено без повного розрахунку калорій.</p>}
      <button onClick={() => onOpenDay(draft.targetDate)}>Відкрити цей день</button>
    </article>;
  }
  const frozen = ["saving", "unknown", "saved"].includes(draft.state);
  // The save command owns the confirmed allocation, even after the day changes.
  const allocated = frozen && Array.isArray(draft.save?.command?.items)
    ? draft.save.command.items
    : assignPlanItems(
        draft.items.filter((i) => i.nutritionStatus === "complete"),
        catalog,
        meals,
      );
  const byId = new Map(allocated.map((i) => [i.itemId, i]));
  const preview = { ...meals, preview: {} };
  for (const i of draft.state === "saved" ? [] : allocated) {
    const k = i.planAllocation.letter || "voice";
    preview.preview[k] = [...(preview.preview[k] || []), i];
  }
  const progress = dailyPlanProgress(meals),
    after = dailyPlanProgress(preview),
    total = roundMacros(
      allocated.reduce(
        (a, i) => {
          const m = itemMacros(i);
          for (const k of ["cal", "p", "f", "c"]) a[k] += m[k];
          return a;
        },
        { cal: 0, p: 0, f: 0, c: 0 },
      ),
    );
  const locked = disabled || frozen || draft.blocked;
  return (
    <article className="trainer-draft" data-testid="trainer-draft">
      <div className="trainer-draft-heading">
        <h3>{draft.state === "saved" ? "Додано" : "Прев’ю їжі"}</h3>
        <span>{dateLabel(draft.targetDate)} · {names[draft.meal]}</span>
      </div>
      <details className="trainer-draft-date">
        <summary>Змінити дату або прийом</summary>
        <div className="trainer-fields">
        <label>
          Дата
          <input
            aria-label="Дата чернетки"
            type="date"
            value={draft.targetDate}
            disabled={locked}
            onChange={(e) => onEdit({ targetDate: e.target.value })}
          />
        </label>
        <label>
          Прийом
          <select
            aria-label="Прийом чернетки"
            value={draft.meal}
            disabled={locked}
            onChange={(e) => onEdit({ meal: Number(e.target.value) })}
          >
            {Object.entries(names).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        </div>
      </details>
      {draft.items.map((raw, index) => {
        const item = byId.get(raw.itemId) || raw;
        return (
          <div className="trainer-food" key={item.itemId}>
            <div className="trainer-food-head">
              <h4>{item.name}</h4>
              {!frozen && draft.items.length > 1 && (
                <button
                  className="trainer-remove"
                  aria-label={`Прибрати ${item.name}`}
                  disabled={locked}
                  onClick={() => onEdit({ removeItemIds: [item.itemId] })}
                >
                  Прибрати
                </button>
              )}
            </div>
            <p className="trainer-source">
              {sourceText(item)}
              {item.estimated ? " · Приблизна оцінка" : ""}
            </p>
            {item.source?.estimateReason === "recipe_estimate" && <p className="trainer-hint">Оцінка за типовим рецептом</p>}
            {item.source?.portionOrigin?.assumption && <p className="trainer-hint">{item.source.portionOrigin.assumption}</p>}
            {(item.source?.assumptions || []).map((a, i) => (
              <p className="trainer-hint" key={i}>
                {a}
              </p>
            ))}
            <div className="trainer-fields">
              <label>
                Кількість
                <DecimalInput
                  aria-label={`Кількість ${index + 1}`}
                  value={item.quantity?.value ?? ""}
                  disabled={locked}
                  onChange={(e) =>
                    onEdit({
                      items: {
                        [item.itemId]: {
                          quantity: {
                            ...item.quantity,
                            value: parseDecimal(e.target.value),
                          },
                        },
                      },
                    })
                  }
                />
              </label>
              <label>
                Одиниця
                <select
                  aria-label={`Одиниця ${index + 1}`}
                  value={item.quantity?.unit || "unknown"}
                  disabled={locked}
                  onChange={(e) =>
                    onEdit({
                      items: {
                        [item.itemId]: {
                          quantity: { ...item.quantity, unit: e.target.value },
                        },
                      },
                    })
                  }
                >
                  {["g", "ml", "portion", "package", "unknown"].map((u) => (
                    <option key={u} value={u}>
                      {UNITS[u] || "Не знаю"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {item.nutritionStatus === "complete" ? (
              <>
                <p className="trainer-macros">
                  {roundMacros(itemMacros(item)).cal} ккал · Б{" "}
                  {roundMacros(itemMacros(item)).p} · Ж{" "}
                  {roundMacros(itemMacros(item)).f} · В{" "}
                  {roundMacros(itemMacros(item)).c}
                </p>
                <PlanAllocationFields
                  item={item}
                  index={index}
                  catalog={catalog}
                  progress={progress}
                  after={after}
                  disabled={locked}
                  onChange={(planChoice) =>
                    onEdit({ items: { [item.itemId]: { planChoice } } })
                  }
                  onSearch={() => {}}
                />
              </>
            ) : (
              <>
                <p>
                  Калорійність або кількість ще невідома. Можна уточнити
                  повідомленням.
                </p>
                <label className="trainer-checkbox">
                  <input
                    type="checkbox"
                    checked={item.noteSelected === true}
                    disabled={locked}
                    onChange={(e) =>
                      onEdit({
                        items: {
                          [item.itemId]: { noteSelected: e.target.checked },
                        },
                      })
                    }
                  />
                  Зберегти як нотатку без повного розрахунку
                </label>
              </>
            )}
            {!frozen && (
              <button
                className="trainer-secondary"
                disabled={disabled || draft.blocked}
                onClick={() => onPhoto(item.itemId)}
              >
                <Camera size={18} />
                Фото етикетки цього продукту
              </button>
            )}
          </div>
        );
      })}
      <p className="trainer-total">
        Розраховано: {total.cal} ккал · Б {total.p} · Ж {total.f} · В {total.c}
      </p>
      {draft.items.some((i) => i.nutritionStatus !== "complete") && (
        <p className="trainer-warning">
          Підсумок неповний. Нотатки не входять у суму калорій.
        </p>
      )}
      {dayStatus === "loading" && <p role="status">Перечитую записи за {dateLabel(draft.targetDate)}…</p>}
      {(dayStatus === "error" || stale) && !frozen && <div className="trainer-warning" role="status">
        <p>{dayStatus === "error" ? "Не вдалося прочитати цей день." : "Записи дня змінилися. Оновіть прев’ю перед додаванням."}</p>
        <button disabled={disabled || dirty} onClick={onRefresh}>Оновити прев’ю</button>
      </div>}
      {dirty && <p role="status">Зберігаю зміни прев’ю…</p>}
      {frozen && draft.state !== "saved" && (
        <p role="status">
          Запис ще не підтверджено. Повтор використає ту саму спробу.
        </p>
      )}
      {draft.state === "saved" ? (
        <button
          className="trainer-secondary"
          onClick={() => onOpenDay(draft.targetDate)}
        >
          Відкрити цей день
        </button>
      ) : (
        <button
          className="trainer-primary"
          disabled={
            disabled ||
            (!frozen && (dirty || stale || dayStatus !== "ready")) ||
            draft.blocked ||
            draft.items.some(
              (i) => i.nutritionStatus !== "complete" && !i.noteSelected,
            )
          }
          onClick={() => onSave(draft)}
        >
          {frozen ? "Перевірити й завершити" : "Додати"}
        </button>
      )}
    </article>
  );
}
export default function TrainerChat({
  mode = "coach",
  ownerKey,
  uid,
  meal = 1,
  planContext,
  dayMeals = empty,
  onClose,
  onAdd,
  onSaved,
  onOpenDay,
  ledger,
  api: providedApi,
  recorderFactory = createRecorder,
  audioNormalizer = normalizeAudio,
  photoNormalizer = normalizePhoto,
  transcribe = transcribeAudio,
  initialNote,
  initialDateContext,
  returnFocusRef,
}) {
  const api = useMemo(
    () => providedApi || createTrainerApi(uid),
    [providedApi, uid],
  );
  const [view, setView] = useState(initial),
    [error, setError] = useState(""),
    [recordState, setRecordState] = useState("ready"),
    [voicePreview, setVoicePreview] = useState(null),
    [sendPending, setSendPending] = useState(false),
    [seconds, setSeconds] = useState(0),
    [showAttachments, setShowAttachments] = useState(false),
    [dateContext, setDateContext] = useState(() => initialTrainerDate(initialDateContext)),
    [previewDays, setPreviewDays] = useState({}),
    [dayRefresh, setDayRefresh] = useState(0),
    [photos, setPhotos] = useState([]),
    [edits, setEdits] = useState({}),
    [context, setContext] = useState(null),
    [confirmDelete, setConfirmDelete] = useState(false),
    [canDiscard, setCanDiscard] = useState(false),
    [metricFailed, setMetricFailed] = useState(false);
  const panel = useRef(),
    textarea = useRef(),
    fileInput = useRef(),
    galleryInput = useRef(),
    attachmentTrigger = useRef(),
    photoTarget = useRef(),
    session = useRef(),
    alive = useRef(false),
    epoch = useRef(0),
    recorder = useRef(),
    recordingEpoch = useRef(0),
    sendLock = useRef(false),
    sttAbort = useRef(),
    voiceClip = useRef(null),
    scrollSnapshot = useRef({}),
    editRef = useRef({}),
    flushTask = useRef(),
    editFailure = useRef(false),
    latest = useRef(),
    attempt = useRef(),
    turnAttempts = useRef(new Map()),
    startedAt = useRef(0);
  const callbacks = useRef();
  callbacks.current = { onAdd, onSaved, onClose, onOpenDay };
  const catalog = useMemo(() => buildPlanCatalog(planContext), [planContext]);
  latest.current = { view, photos, recordState, dateContext, edits };
  editRef.current = edits;
  const catchError = (e) => {
    // The session shows a connection error itself and clears it on recovery.
    if (NETWORK_ERRORS.has(e?.message) && session.current?.get().error === e.message) return;
    if (alive.current) setError(trainerError(e));
  };
  const metric = async (p, id) => {
    if (!id || !ledger?.enabled) return;
    try {
      await ledger.update(id, p);
    } catch {
      if (alive.current) setMetricFailed(true);
    }
  };
  const startMetric = async (channel) => {
    if (!ledger?.enabled) return null;
    try {
      return await ledger.start(undefined, channel);
    } catch {
      if (alive.current) setMetricFailed(true);
      return null;
    }
  };
  const current = (generation) => alive.current && epoch.current === generation;
  function releaseVoiceClip() {
    if (voiceClip.current?.url) URL.revokeObjectURL(voiceClip.current.url);
    voiceClip.current = null;
  }
  useEffect(() => {
    const field = textarea.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(120, field.scrollHeight || 44)}px`;
  }, [view.text]);
  useEffect(() => {
    const overlay=panel.current?.parentElement, viewport=window.visualViewport;
    const fit=()=>{
      overlay?.style.setProperty('--trainer-visible-height',`${Math.max(1,viewport?.height || window.innerHeight)}px`);
      overlay?.style.setProperty('--trainer-visible-top',`${viewport?.offsetTop || 0}px`);
    };
    fit();viewport?.addEventListener('resize',fit);viewport?.addEventListener('scroll',fit);window.addEventListener('resize',fit);
    return ()=>{viewport?.removeEventListener('resize',fit);viewport?.removeEventListener('scroll',fit);window.removeEventListener('resize',fit);};
  },[]);
  useEffect(() => {
    epoch.current++;
    alive.current = true;
    setView(initial);
    setEdits({});
    editRef.current = {};
    setPhotos([]);
    setDateContext(initialTrainerDate(initialDateContext));
    setContext(null);
    setError("");
    setCanDiscard(false);
    setRecordState("ready");
    releaseVoiceClip();
    setVoicePreview(null);
    setSendPending(false);
    sendLock.current = false;
    const epochs = epoch;
    const generation = epochs.current;
    const attempts = turnAttempts.current;
    const previous = returnFocusRef?.current || document.activeElement,
      oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector('[aria-label="Закрити чат"]')?.focus();
    const createSession = () =>
      createTrainerSession({
        api,
        commit: (command, d) => callbacks.current.onAdd(command, d),
        onChange: setView,
        onSaved: (d, prepared) => {
          callbacks.current.onSaved?.(d, prepared);
        },
      });
    let s = createSession();
    session.current = s;
    let closed = false;
    void s
      .refresh()
      .then(() => {
        if (closed || !current(generation)) return;
        if (initialNote) void s.note(initialNote).catch(catchError);
      })
      .catch(() => {});
    const poll = setInterval(() => {
      if (!closed) void s.refresh({ background: true }).catch(() => {});
    }, 2500);
    const before = (e) => {
      if (
        s.get().dirty ||
        Object.keys(editRef.current).length ||
        ["recording", "permission", "transcribing"].includes(
          latest.current.recordState,
        )
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const pagehide = () => {
      epoch.current++;
      flushTask.current = null;
      editFailure.current = false;
      setView(initial);
      setPhotos([]);
      releaseVoiceClip();
      setVoicePreview(null);
      setSendPending(false);
      sendLock.current = false;
      setEdits({});
      editRef.current = {};
      recorder.current?.cancel();
      sttAbort.current?.abort();
      s.close();
      alive.current = false;
    };
    const pageshow = (e) => {
      if (e.persisted && !closed) {
        alive.current = true;
        setRecordState("ready");
        setError("");
        s = createSession();
        session.current = s;
        void s.refresh({ background: true }).catch(() => {});
      }
    };
    window.addEventListener("pageshow", pageshow);
    window.addEventListener("beforeunload", before);
    window.addEventListener("pagehide", pagehide);
    return () => {
      closed = true;
      epochs.current++;
      alive.current = false;
      recorder.current?.cancel();
      sttAbort.current?.abort();
      releaseVoiceClip();
      s.close();
      clearInterval(poll);
      window.removeEventListener("beforeunload", before);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("pageshow", pageshow);
      document.body.style.overflow = oldOverflow;
      window.setTimeout(() => {
        // The floating launcher becomes visible after its modal observer runs.
        window.requestAnimationFrame(() => { if (previous?.isConnected) previous.focus?.(); });
      }, 0);
      if (attempt.current)
        void metric(
          { status: "abandoned", finishedAt: Date.now() },
          attempt.current,
        );
      attempt.current = null;
      attempts.clear();
    };
    // Auth/open lifetime only; current callbacks are kept in a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey, api]);
  const previewKey = (view.server?.drafts || []).map(d =>
    [d.draftId, d.revision, d.state, edits[d.draftId]?.targetDate || d.targetDate, !!d.stale].join(":")
  ).join("|");
  useEffect(() => {
    const controller = new AbortController();
    const dates = [...new Set((view.server?.drafts || []).map(d => edits[d.draftId]?.targetDate || d.targetDate))];
    for (const target of dates) {
      setPreviewDays(previous => ({ ...previous, [target]: { ...previous[target], status: "loading" } }));
      Promise.resolve().then(() => api.day(target, controller.signal)).then(day => {
        if (!controller.signal.aborted) setPreviewDays(previous => ({ ...previous, [target]: { status: "ready", day } }));
      }).catch(() => {
        if (!controller.signal.aborted) setPreviewDays(previous => ({ ...previous, [target]: { status: "error" } }));
      });
    }
    return () => controller.abort();
    // Only a changed draft/day identity or an explicit refresh starts this read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, previewKey, dayRefresh]);
  const staleDay = (draft, day) => {
    if (draft.state === "saved") return false;
    if (draft.stale || !draft.freshness) return true;
    return !day?.freshness || ["targetDate", "dayRevision", "planFingerprint", "notesRevision", "targetsFingerprint"].some(key => draft.freshness[key] !== day.freshness[key]);
  };
  async function refreshPreview(draft) {
    try {
      await flushEdits();
      await session.current.refreshDraft(session.current.get().server.drafts.find(d => d.draftId === draft.draftId));
      if (alive.current) { setError(""); setDayRefresh(n => n + 1); }
    } catch (e) { catchError(e); }
  }
  const scrollDrafts = view.server?.drafts?.map(d=>d.draftId+':'+d.revision+':'+d.state).join('|') || '';
  const scrollMessage = view.server?.messages?.at(-1)?.id;
  const scrollKey=[scrollMessage,scrollDrafts,view.server?.latestTurn?.turnId,view.server?.currentTurn?.state,view.server?.contextProposals?.length].join('/');
  useEffect(()=>{
    const area=panel.current?.querySelector('.trainer-scroll');
    if(!area)return;
    // The last timeline item is the current conversation, even when an older
    // draft changed or a saved receipt exists. Never target a hidden form.
    let target=area.querySelector('.trainer-messages')?.lastElementChild,toBottom=false;
    const box=area.getBoundingClientRect();
    // The turn status sits under the user's message: show both when they fit,
    // otherwise the end of a long message with the status and its buttons.
    if(target?.classList.contains('trainer-turn')&&target.previousElementSibling){
      if(target.getBoundingClientRect().bottom-target.previousElementSibling.getBoundingClientRect().top+24<=box.height)target=target.previousElementSibling;
      else toBottom=true;
    }
    if(toBottom)area.scrollTop+=target.getBoundingClientRect().bottom-box.bottom+12;
    else if(target)area.scrollTop+=target.getBoundingClientRect().top-box.top-12;
    else area.scrollTop=area.scrollHeight;
    scrollSnapshot.current={drafts:scrollDrafts,message:scrollMessage};
  },[scrollKey,scrollDrafts,scrollMessage]);
  async function flushEdits() {
    const generation = epoch.current,
      own = session.current;
    if (flushTask.current) return flushTask.current;
    flushTask.current = (async () => {
      for (const [id, patch] of Object.entries(editRef.current)) {
        if (!current(generation)) throw Error("context_changed");
        const draft = own.get().server?.drafts.find((d) => d.draftId === id);
        if (!draft) throw Error("draft_conflict");
        await own.edit(draft, {
          ...patch,
          items: Object.entries(patch.items || {}).map(([itemId, fields]) => ({
            itemId,
            ...fields,
          })),
        });
        if (!current(generation)) return;
        if (editRef.current[id] === patch) {
          const next = { ...editRef.current };
          delete next[id];
          editRef.current = next;
          setEdits(next);
        }
      }
    })()
      .catch((e) => {
        if (current(generation)) editFailure.current = true;
        throw e;
      })
      .finally(() => {
        if (current(generation)) flushTask.current = null;
      });
    return flushTask.current;
  }
  useEffect(() => {
    if (!Object.keys(edits).length || view.busy || editFailure.current) return;
    const timer = setTimeout(() => {
      void flushEdits().catch(catchError);
    }, 650);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits, view.busy]);
  function edit(id, patch) {
    editFailure.current = false;
    const old = editRef.current[id] || {},
      items = { ...old.items };
    for (const [key, fields] of Object.entries(patch.items || {}))
      items[key] = { ...items[key], ...fields };
    // Unsent changes of a removed product are dropped: the server refuses
    // changes to an item it has just removed.
    const removeItemIds = [
      ...new Set([...(old.removeItemIds || []), ...(patch.removeItemIds || [])]),
    ];
    for (const key of removeItemIds) delete items[key];
    const next = {
      ...editRef.current,
      [id]: {
        baseRevision:
          old.baseRevision ??
          session.current.get().server?.drafts.find((d) => d.draftId === id)
            ?.revision,
        ...old,
        ...patch,
        items,
        ...(removeItemIds.length ? { removeItemIds } : {}),
      },
    };
    editRef.current = next;
    setEdits(next);
    setError("");
    void draftMetrics(
      session.current.get().server?.drafts.find((d) => d.draftId === id),
      { corrections: 1 },
    );
  }
  async function close(discard = false) {
    const generation = epoch.current,
      own = session.current;
    try {
      if (!discard) {
        await flushEdits();
        if (!current(generation)) return;
        await own.flush();
      }
      if (!current(generation)) return;
      epoch.current++;
      alive.current = false;
      own.close();
      recorder.current?.cancel();
      sttAbort.current?.abort();
      callbacks.current.onClose();
    } catch (e) {
      catchError(e);
      if (current(generation)) setCanDiscard(true);
    }
  }
  async function send(text, voiceAttempt, generation = epoch.current) {
    if (!current(generation) || sendLock.current) return;
    sendLock.current = true;
    setSendPending(true);
    const own = session.current;
    let id = voiceAttempt || voicePreview?.attemptId;
    try {
      if (!current(generation)) return;
      setError("");
      await flushEdits();
      if (!current(generation)) return;
      id = id || (await startMetric("text"));
      if (!current(generation)) return;
      const content =
        text ||
        own.get().text ||
        (photos.length
          ? "Уточни харчові значення за фото етикетки відповідного продукту."
          : "");
      const turnId = newId();
      const outgoingPhotos = latest.current.photos;
      await metric(
        {
          ownerKey,
          turnId,
          status: "processing",
          hasPhoto: outgoingPhotos.length > 0,
        },
        id,
      );
      if (!current(generation)) return;
      await own.send({
        turnId,
        text: content,
        images: outgoingPhotos,
        dateContext: latest.current.dateContext,
      });
      if (!current(generation)) return;
      if (id) turnAttempts.current.set(turnId, id);
      releaseVoiceClip();
      setVoicePreview(null);
      setPhotos([]);
      await metric(
        { status: "processing", hasPhoto: outgoingPhotos.length > 0 },
        id,
      );
    } catch (e) {
      if (current(generation)) {
        catchError(e);
        await metric({ status: "error" }, id);
      }
    } finally {
      if (current(generation)) {
        sendLock.current = false;
        setSendPending(false);
        setRecordState("ready");
      }
    }
  }
  async function recognizeRecording(blob, duration, id, generation, recording) {
    const isCurrent = () => current(generation) && recordingEpoch.current === recording;
    if (!isCurrent()) return;
    setRecordState("transcribing");
    setError("");
    if (voiceClip.current?.attemptId !== id || !voiceClip.current) {
      releaseVoiceClip();
      voiceClip.current = { blob, duration, attemptId: id, before: session.current.get().text,
        url: typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : null,
        generation, recording };
    }
    const clip = voiceClip.current;
    // A retry must append to edits made after the failed transcription.
    clip.before = session.current.get().text;
    clip.applied = false;
    setVoicePreview({ before: clip.before, attemptId: id, url: clip.url, status: "transcribing" });
    sttAbort.current = new AbortController();
    try {
      const audio = clip.audio || await audioNormalizer(blob);
      if (!isCurrent()) return;
      clip.audio = audio;
      const result = await transcribe(audio, duration, sttAbort.current.signal, "auto");
      if (!isCurrent()) return;
      if (!result.text?.trim()) throw Error("empty_transcript");
      session.current.type([clip.before.trim(), result.text.trim()].filter(Boolean).join("\n"));
      clip.applied = true;
      setVoicePreview({ before: clip.before, attemptId: id, url: clip.url, status: "ready" });
      setRecordState("ready");
    } catch (e) {
      if (!isCurrent()) return;
      setError(voiceError(e, "Не вдалося розпізнати запис. Він залишився тут, можна повторити."));
      setVoicePreview({ before: clip.before, attemptId: id, url: clip.url, status: "failed" });
      setRecordState("ready");
      await metric({ status: "error", finishedAt: Date.now() }, id);
    }
  }
  async function beginRecording() {
    const generation = epoch.current;
    if (
      recordState !== "ready" ||
      view.busy ||
      activeTurn(view.server?.currentTurn) ||
      view.admission || voicePreview || sendLock.current
    )
      return;
    setError("");
    const recording = ++recordingEpoch.current;
    const isCurrent = () => current(generation) && recordingEpoch.current === recording;
    setRecordState("permission");
    startedAt.current = Date.now();
    const id = await startMetric("voice");
    if (!isCurrent()) { void metric({ status: "abandoned", finishedAt: Date.now() }, id); return; }
    attempt.current = id;
    await metric({ ownerKey }, id);
    if (!isCurrent()) return;
    const r = recorderFactory({
      onState: (s) => {
        if (isCurrent()) setRecordState(s);
      },
      onTime: (s) => {
        if (isCurrent()) setSeconds(s);
      },
      onWaiting: () => {
        if (isCurrent())
          setError("Браузер очікує дозволу на мікрофон.");
      },
      onError: (e) => {
        if (!isCurrent()) return;
        catchError(e);
        void metric({ status: "error", finishedAt: Date.now() }, id);
        if (attempt.current === id) attempt.current = null;
        if (current(generation)) setRecordState("ready");
      },
      onStop: async (blob, duration) => {
        await recognizeRecording(blob, duration, id, generation, recording);
      },
    });
    recorder.current = r;
    await r.start();
  }
  function cancelRecording() {
    recordingEpoch.current++;
    recorder.current?.cancel();
    sttAbort.current?.abort();
    releaseVoiceClip();
    setVoicePreview(null);
    setRecordState("ready");
    setError("");
    void metric({ status: "abandoned", finishedAt: Date.now() }, attempt.current);
    attempt.current = null;
  }
  function cancelVoicePreview() {
    const clip = voiceClip.current;
    if (!voicePreview || !clip || !current(clip.generation) || sendLock.current) return;
    const before = clip.applied ? clip.before : session.current.get().text;
    cancelRecording();
    session.current.type(before);
  }
  async function returnMessage(turn) {
    const generation = epoch.current, own = session.current;
    if (!turn?.text || !current(generation) || sendLock.current) return;
    try {
      if (activeTurn(turn) || turn.cleanupPending) await own.cancel(turn.turnId);
      if (!current(generation) || session.current !== own) return;
      const existing = own.get().text;
      const restored = restoredTrainerText(turn);
      own.type(existing.trim() && existing !== turn.text && existing !== restored ? `${existing}\n${restored}` : restored);
      if (turn.targetDate) setDateContext({ mode: "pinned", targetDate: turn.targetDate });
      setError("");
      textarea.current?.focus();
    } catch (e) { if (current(generation)) catchError(e); }
  }
  async function addPhoto(file) {
    const generation = epoch.current;
    if (!file) return;
    setError("");
    if (photos.length >= 2) {
      setError("Можна додати до двох фото.");
      return;
    }
    const itemId = photoTarget.current;
    try {
      const p = await photoNormalizer(file);
      if (!current(generation)) return;
      setPhotos((old) => [...old, { ...p, itemId, addedAt: Date.now() }]);
    } catch (e) {
      if (current(generation)) catchError(e);
    }
  }
  useEffect(() => {
    if (!photos.length) return;
    const timer = setTimeout(
      () => {
        setPhotos([]);
        setError(
          "Термін тимчасових фото минув. Додайте їх знову; текст і чернетки збережені.",
        );
      },
      Math.max(
        0,
        300000 - (Date.now() - Math.min(...photos.map((p) => p.addedAt))),
      ),
    );
    return () => clearTimeout(timer);
  }, [photos]);
  async function draftMetrics(draft, patch) {
    if (!draft || !ledger?.enabled) return;
    try {
      const rows = await ledger.list(),
        ids = new Set(draft.originTurnIds || [draft.turnId]);
      const matching = rows.filter(
        (row) => row.ownerKey === ownerKey && ids.has(row.turnId),
      );
      const hasPhoto = matching.some((row) => row.hasPhoto);
      for (const row of matching) {
        const related = (session.current.get().server?.drafts || []).filter(
          (d) => (d.originTurnIds || [d.turnId]).includes(row.turnId),
        );
        const partial = related.some(
          (d) =>
            d.state !== "saved" ||
            d.items.some((i) => i.nutritionStatus !== "complete"),
        );
        await metric(
          {
            ...patch,
            hasPhoto,
            ...(patch.status === "saved" ? { partial } : {}),
          },
          row.attemptId,
        );
        if (patch.status === "saved" && row.attemptId === attempt.current)
          attempt.current = null;
      }
    } catch {
      if (alive.current) setMetricFailed(true);
    }
  }
  async function save(draft) {
    const generation = epoch.current,
      own = session.current;
    try {
      setError("");
      await flushEdits();
      if (!current(generation)) return;
      const fresh = own
        .get()
        .server.drafts.find((d) => d.draftId === draft.draftId);
      let previewDay;
      if (!["saving", "unknown", "saved"].includes(fresh.state)) {
        previewDay = await api.day(fresh.targetDate);
        if (!current(generation)) return;
        setPreviewDays(previous => ({ ...previous, [fresh.targetDate]: { status: "ready", day: previewDay } }));
        if (staleDay(fresh, previewDay)) throw Error("stale_preview");
      }
      await own.save(fresh);
      setDayRefresh(n => n + 1);
      if (!current(generation)) return;
      await draftMetrics(fresh, {
        status: "saved",
        submissionId: own
          .get()
          .server?.drafts.find((d) => d.draftId === draft.draftId)?.save
          ?.submissionId,
        finishedAt: Date.now(),
        partial: fresh.items.some((i) => i.nutritionStatus !== "complete"),
        ...allocationCounts(
          assignPlanItems(
            fresh.items.filter((i) => i.nutritionStatus === "complete"),
            previewDay?.catalog || catalog,
            previewDay?.meals || previewDays[fresh.targetDate]?.day?.meals || dayMeals,
          ),
        ),
      });
    } catch (e) {
      if (current(generation)) catchError(e);
    }
  }
  const busy = view.busy || sendPending || recordState !== "ready",
    turn = view.server?.currentTurn,
    canSend =
      !!view.server &&
      !busy &&
      !activeTurn(turn) &&
      !view.admission &&
      !view.composerConflict &&
      voicePreview?.status !== "failed" &&
      (view.text.trim() || photos.length);
  const feedback = trainerFeedback({localMessage:error,clientCode:view.error,turn:view.server?.latestTurn});
  const timeline = trainerTimeline(view.server || {});
  function draftCard(entry) {
    const d = entry.draft;
    const card = <DraftCard
      draft={applyEdits(d, edits[d.draftId])}
      catalog={previewDays[edits[d.draftId]?.targetDate || d.targetDate]?.day?.catalog || catalog}
      meals={previewDays[edits[d.draftId]?.targetDate || d.targetDate]?.day?.meals || empty}
      dayStatus={previewDays[edits[d.draftId]?.targetDate || d.targetDate]?.status || "loading"}
      stale={staleDay(d, previewDays[edits[d.draftId]?.targetDate || d.targetDate]?.day)}
      onRefresh={() => void refreshPreview(d)} dirty={!!edits[d.draftId]} disabled={busy}
      onEdit={p => edit(d.draftId, p)} onSave={save}
      onPhoto={itemId => { photoTarget.current = itemId; setShowAttachments(true); }}
      onOpenDay={date => { callbacks.current.onOpenDay?.(date); void close(); }}
    />;
    return entry.collapsed ? <details className="trainer-older-draft" key={d.draftId}>
      <summary>Незавершене прев’ю · {dateLabel(d.targetDate)} · {d.items.length} продуктів</summary>{card}
    </details> : <React.Fragment key={d.draftId}>{card}</React.Fragment>;
  }
  function choosePhoto(input) {
    const rows=(view.server?.drafts||[]).filter(d=>d.state==='ready').flatMap(d=>d.items);
    if(rows.length>1 && !rows.some(item=>item.itemId===photoTarget.current)) {
      setError('Оберіть «Фото етикетки цього продукту» у потрібному рядку прев’ю.');setShowAttachments(false);return;
    }
    photoTarget.current=photoTarget.current || rows[0]?.itemId || photos[0]?.itemId || newId();
    setShowAttachments(false);input.current.click();
  }
  function keys(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      if(showAttachments){setShowAttachments(false);attachmentTrigger.current?.focus();return;}
      void close();
    }
    if (e.key === "Tab") {
      const nodes = [
        ...panel.current.querySelectorAll(
          'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,[tabindex="0"]',
        ),
      ].filter((n) => n.getClientRects().length);
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  }
  return (
    <div className="trainer-overlay">
      <section
        className="trainer-chat"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trainer-title"
        ref={panel}
        onKeyDown={keys}
        data-testid="trainer-chat"
      >
        <header className="trainer-header">
          <div>
            <h2 id="trainer-title">{mode === "food" ? "Додати їжу" : "Тренер"}</h2>
            <p>{mode === "food" ? "Текст, голос або фото" : "Поради про харчування й тренування"}</p>
          </div>
          <button aria-label="Закрити чат" onClick={() => void close()}>
            <X />
          </button>
        </header>
        <div className="trainer-scroll">
          <p className="trainer-intro">
            {mode === "food" ? "Розкажіть, що з’їли, або додайте фото. Можна сказати «вчора». Перевірте прев’ю й натисніть «Додати»." : "Запитайте пораду. Тренер врахує підтверджені записи. Якщо розповісте про з’їдене, покаже прев’ю перед додаванням."}
          </p>
          {mode === "coach" && !view.server?.messages?.length && <div className="trainer-shortcuts" aria-label="Почати розмову">
            {["Що краще поїсти?", "Що залишилося на сьогодні?"].map(text => <button key={text} disabled={!view.server || busy || activeTurn(turn) || !!view.admission || !!view.composerConflict} onClick={() => void send(text)}>{text}</button>)}
            <button disabled={busy || !!view.admission} onClick={() => textarea.current?.focus()}>Записати їжу</button>
          </div>}
          {timeline.historyDrafts.length > 0 && <section className="trainer-earlier-drafts" aria-label="Попередні записи й прев’ю">
            {timeline.historyDrafts.map(draftCard)}
          </section>}
          <div aria-live="polite" className="trainer-messages">
            {timeline.entries.map(entry => {
              if (entry.kind === "draft") return draftCard(entry);
              const m = entry.message;
              return (
              <div
                key={m.id}
                className={`trainer-message ${m.role === "user" ? "from-user" : "from-trainer"}`}
              >
                <span>{m.role === "user" ? "Ви" : "Тренер"}</span>
                <p>{m.role === "user" ? m.content : trainerText(m.content)}</p>
                {(m.photos || []).map((photo, index) => <TrainerPhoto key={`${ownerKey}:${photo.ref}`} api={api} reference={photo.ref} number={index + 1} />)}
              </div>
            ); })}
            {activeTurn(turn) && (
              <div className="trainer-turn" role="status">
                <p>{turn.state === "unknown" ? feedback || "Завершення ще не підтверджене." : turn.cleanupPending ? "Завершую попередню обробку" : statuses[turn.state]}</p>
                {turn.state === "unknown" && (
                  <button
                    onClick={() =>
                      void session.current.recover(turn.turnId).catch(catchError)
                    }
                    disabled={busy}
                  >
                    Перевірити результат
                  </button>
                )}
                {turn.state === "unknown" ? <button
                  onClick={() => turn.text ? void returnMessage(turn) : void session.current.cancel(turn.turnId).catch(catchError)}
                  disabled={busy || turn.expired}
                >{turn.text ? "Зупинити й повернути текст" : "Скасувати обробку"}</button> : <button
                  onClick={() =>
                    void session.current.cancel(turn.turnId).catch(catchError)
                  }
                  disabled={busy || turn.expired}
                >
                  Скасувати обробку
                </button>}
              </div>
            )}
          </div>
          {view.server?.maintenanceBlocked && (
            <p className="trainer-warning">
              Тренер завершує відновлення. Нові повідомлення тимчасово
              недоступні.
            </p>
          )}
          {(view.server?.contextProposals || [])
            .filter((p) => p.state === "proposed")
            .map((p) => (
              <article className="trainer-memory" key={p.proposalId}>
                <h3>Пропозиція для пам’яті</h3>
                {!context ? (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void session.current
                        .context()
                        .then(setContext)
                        .catch(catchError)
                    }
                  >
                    Переглянути зміни
                  </button>
                ) : (
                  <>
                    {context.mode === "append" ? (
                      <>
                        <p>Додати до пам’яті</p>
                        <pre>{p.text}</pre>
                        <details><summary>Поточна пам’ять</summary><pre>{context.text || "Ще немає особистих записів."}</pre></details>
                      </>
                    ) : (
                      <><p>Було</p><pre>{context.text}</pre><p>Буде</p><pre>{p.text}</pre></>
                    )}
                    <button
                      className="trainer-primary"
                      disabled={busy || context.revision !== p.baseRevision}
                      onClick={() =>
                        void session.current
                          .remember(p.proposalId)
                          .then(() => setContext(null))
                          .catch(catchError)
                      }
                    >
                      Запам’ятати
                    </button>
                    {context.revision !== p.baseRevision && (
                      <p>
                        Пам’ять змінилася. Попросіть тренера підготувати нову
                        пропозицію.
                      </p>
                    )}
                  </>
                )}
              </article>
            ))}
          {view.server && (
            <details className="trainer-options">
              <summary>Історія чату</summary>
              <p>
                {view.server.canonicalHistory
                  ? "Розмова зберігається у Hermes та доступна на сайті й у Desktop."
                  : "Повідомлення й незавершені чернетки зберігаються 30 днів."}
                {" "}Підтверджена їжа залишається у щоденнику.
              </p>
              {!view.server.canonicalHistory && (!confirmDelete ? (
                <button disabled={busy} onClick={() => setConfirmDelete(true)}>
                  Видалити розмову
                </button>
              ) : (
                <>
                  <p>
                    Видалити історію й незбережені чернетки? Записи щоденника
                    залишаться.
                  </p>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void session.current
                        .forget()
                        .then(() => {
                          setEdits({});
                          editRef.current = {};
                          setPhotos([]);
                          setConfirmDelete(false);
                        })
                        .catch(catchError)
                    }
                  >
                    Так, видалити розмову
                  </button>
                  <button onClick={() => setConfirmDelete(false)}>
                    Залишити
                  </button>
                </>
              ))}
            </details>
          )}
        </div>
        <footer className="trainer-composer">
          {error && Object.keys(edits).length > 0 && (
            <button
              disabled={busy}
              onClick={() => {
                setEdits({});
                editRef.current = {};
                editFailure.current = false;
                setError("");
                void session.current.refresh().catch(catchError);
              }}
            >
              Скасувати мої незбережені правки й перечитати прев’ю
            </button>
          )}
          {feedback && turn?.state !== "unknown" && (
            <p className="trainer-error" role="alert">
              {feedback}
            </p>
          )}
          {["failed", "cancelled"].includes(view.server?.latestTurn?.state) && view.server.latestTurn.text && !view.text.trim() && !voicePreview && (
            <button className="trainer-secondary" disabled={busy || !!view.admission}
              onClick={() => void returnMessage(view.server.latestTurn)}>
              Повернути текст для уточнення
            </button>
          )}
          {metricFailed && (
            <p className="trainer-warning">
              Статистика пілоту неповна; їжу можна додавати.
            </p>
          )}
          {view.admission && (
            <div role="status">
              <p>Перевірте отримання, щоб не надіслати їжу двічі.</p>
              <button
                disabled={busy}
                onClick={() =>
                  void session.current.checkAdmission().catch(catchError)
                }
              >
                Перевірити отримання
              </button>
              {view.admission.state === "not_received" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    view.admission.lostMedia
                      ? session.current.recompose()
                      : void session.current
                          .checkAdmission(true)
                          .catch(catchError)
                  }
                >
                  {view.admission.lostMedia
                    ? "Повернути текст і додати фото знову"
                    : "Надіслати ту саму спробу"}
                </button>
              )}
            </div>
          )}
          {view.composerConflict && (
            <div>
              <button
                onClick={() =>
                  void session.current.chooseComposer(true).catch(catchError)
                }
              >
                Залишити мій текст
              </button>
              <button
                onClick={() =>
                  void session.current.chooseComposer(false).catch(catchError)
                }
              >
                Взяти текст іншої вкладки
              </button>
            </div>
          )}
          {dateContext.mode === "pinned" && <div className="trainer-date-chip">
            <span>Для записів: {dateLabel(dateContext.targetDate)}</span>
            <button disabled={busy || !!view.admission} onClick={() => setDateContext({ mode: "default" })}>Сьогодні</button>
          </div>}
          <label className="trainer-text-label trainer-sr-only" htmlFor="trainer-message">{mode === "food" ? "Що ви з’їли" : "Повідомлення тренеру"}</label>
          <p className="trainer-composer-status" role="status">
            {
              {
                loading: "Завантажую чат…",
                saved: "Текст збережений",
                saving: "Зберігаю текст…",
                unsaved: "Текст ще не збережений",
                error: "Текст ще не збережений",
              }[view.composerState]
            }
          </p>
          {!!photos.length && (
            <div className="trainer-photos">
              {photos.map((p, i) => (
                <div key={i}>
                  <img src={p.preview} alt="Фото етикетки перед надсиланням" />
                  <button
                    aria-label={`Прибрати фото ${i + 1}`}
                    disabled={busy || !!view.admission}
                    onClick={() =>
                      setPhotos((a) => a.filter((_, n) => n !== i))
                    }
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {voicePreview && <div className="trainer-voice-preview">
            {voicePreview.url && <audio controls preload="metadata" src={voicePreview.url} aria-label="Прослухати голосове перед надсиланням" />}
            {voicePreview.status === "ready" && <p role="status">Розпізнаний текст можна змінити. Щоб надіслати його, натисніть «Надіслати».</p>}
            {voicePreview.status === "failed" && <p role="status">Запис залишився. Можна розпізнати його ще раз або скасувати.</p>}
            <div className="trainer-voice-actions">
              {voicePreview.status === "failed" && <button className="trainer-secondary" disabled={busy || !!view.admission} onClick={() => {
                const clip = voiceClip.current;
                if (clip) void recognizeRecording(clip.blob, clip.duration, clip.attemptId, clip.generation, clip.recording);
              }}>Розпізнати ще раз</button>}
              <button className="trainer-secondary" disabled={view.busy || sendPending || !!view.admission} onClick={cancelVoicePreview}>{voicePreview.status === "transcribing" ? "Скасувати запис" : "Скасувати голосове"}</button>
            </div>
          </div>}
          <input
            ref={fileInput}
            className="trainer-file"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              void addPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input ref={galleryInput} className="trainer-file" type="file" accept="image/*" onChange={e=>{void addPhoto(e.target.files?.[0]);e.target.value="";}}/>
          {showAttachments && <div className="trainer-attachment-options" role="group" aria-label="Додати фото">
            <button type="button" disabled={busy || !!view.admission} onClick={()=>choosePhoto(fileInput)}><Camera size={18}/>Сфотографувати</button>
            <button type="button" disabled={busy || !!view.admission} onClick={()=>choosePhoto(galleryInput)}><ImageIcon size={18}/>З галереї</button>
          </div>}
          <div className="trainer-input-row">
            <button ref={attachmentTrigger} className="trainer-icon-button" aria-label="Прикріпити фото" aria-expanded={showAttachments} title="Прикріпити фото" disabled={busy || !!view.admission || !view.server} onClick={()=>{photoTarget.current=null;setShowAttachments(value=>!value);}}><Paperclip size={21}/></button>
            <textarea ref={textarea} id="trainer-message" rows="1" placeholder={mode === "food" ? "Що ви з’їли?" : "Напишіть тренеру…"} value={view.text} disabled={busy || !!view.admission} onChange={e=>{setError("");session.current.type(e.target.value);}}/>
            {recordState === "recording" ? <button className="trainer-recording trainer-stop" aria-label="Зупинити запис" onClick={()=>recorder.current.stop()}><Square size={19}/>{seconds} с</button> : <>
              <button className="trainer-icon-button" aria-label="Почати запис" title="Почати запис" disabled={!view.server || busy || !!view.admission || activeTurn(turn) || !!voicePreview} onClick={()=>void beginRecording()}><Mic size={21}/></button>
              <button className="trainer-primary trainer-icon-button" aria-label="Надіслати повідомлення" title="Надіслати" disabled={!canSend} onClick={()=>void send()}><Send size={21}/></button>
            </>}
          </div>
          {(["permission", "recording"].includes(recordState) || (recordState === "transcribing" && !voicePreview)) && <button className="trainer-secondary" onClick={cancelRecording}>Скасувати запис</button>}
          {recordState === "transcribing" && <p className="trainer-date-hint" role="status">Розпізнаю голос…</p>}
          {recordState === "permission" && <p className="trainer-date-hint" role="status">Очікую дозволу на мікрофон…</p>}
          {view.server &&
            view.text.trim() &&
            !activeTurn(turn) &&
            !view.admission && (
              <button
                className="trainer-note-fallback"
                disabled={busy}
                onClick={() =>
                  void flushEdits()
                    .then(() =>
                      session.current.note({
                        text: view.text,
                        targetDate: dateContext.mode === "pinned" ? dateContext.targetDate : kyivDateKey(),
                        meal,
                      }),
                    )
                    .catch(catchError)
                }
              >
                Зберегти текст як нотатку без оцінки
              </button>
            )}
          {canDiscard && (
            <button onClick={() => void close(true)}>
              Закрити без збереження останніх змін
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
