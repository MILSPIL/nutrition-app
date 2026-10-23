import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  Mic,
  Square,
  Camera,
  Image as ImageIcon,
  X,
  Trash2,
} from "lucide-react";
import {
  createRecorder,
  normalizeAudio,
  normalizePhoto,
} from "../services/voiceMedia";
import { analyzeFood, transcribeAudio, voiceError } from "../services/voiceApi";
import {
  newId,
  normalizeAnalysis,
  mergePhotoItem,
  itemProblems,
  itemMacros,
  roundMacros,
  parseDecimal,
  UNITS,
  sourceText,
} from "../services/mealItems";
import { saveError } from "../services/useMealDay";
import "./VoiceInputModal.css";
import {buildPlanCatalog,planFingerprint} from '../services/planCatalog';
import {assignPlanItems,dailyPlanProgress,persistedPlanItem,allocationCounts,invalidatePlanIdentity} from '../services/planAllocation';
import PlanAllocationFields from './PlanAllocationFields';
const emptyMeals={};
const defaultApi = { transcribe: transcribeAudio, analyze: analyzeFood };
const languageKey = "scisense.voice.language";
const languages = ["auto", "uk", "ru"];
function storedLanguage() {
  try {
    const value = localStorage.getItem(languageKey);
    return languages.includes(value) ? value : "auto";
  } catch (_) {
    return "auto";
  }
}
const names = { 1: "Сніданок", 2: "Обід", 3: "Вечеря", 4: "Перекус" };
// Залишаємо кому під час набору: перетворення в число не повинно з'їдати «0,».
function DecimalInput({ value, onChange, ...props }) {
  const [raw, setRaw] = useState(value == null ? "" : String(value));
  useEffect(() => {
    if (parseDecimal(raw) !== value) setRaw(value == null ? "" : String(value));
  }, [value, raw]);
  return (
    <input
      {...props}
      inputMode="decimal"
      value={raw}
      onChange={(e) => {
        setRaw(e.target.value);
        onChange(e);
      }}
    />
  );
}

export default function VoiceInputModal({
  isOpen,
  onClose,
  onAdd,
  date,
  meal,
  activeDate,
  api = defaultApi,
  mode = process.env.REACT_APP_STT_ONLY === "1" ? "stt_only" : "full",
  ledger,
  recorderFactory = createRecorder,
  audioNormalizer = normalizeAudio,
  photoNormalizer = normalizePhoto,
  onSaved,
  onReturnToDate,
  ownerKey,
  pendingSave = false,
  onRetryPending,
  planContext,
  dayMeals = emptyMeals,
  onRefreshPlan,
}) {
  const [catalog,setCatalog]=useState(()=>buildPlanCatalog(planContext));
  const catalogRef=useRef(catalog);catalogRef.current=catalog;
  const [needsPlanRefresh,setNeedsPlanRefresh]=useState(false);
  const sttOnly = mode === "stt_only";
  const [language, setLanguage] = useState(storedLanguage);
  const [state, setState] = useState("ready"),
    [seconds, setSeconds] = useState(0),
    [waiting, setWaiting] = useState(false);
  const [text, setText] = useState(""),
    [draftItems, setDraftItems] = useState([]),
    [unparsed, setUnparsed] = useState([]),
    [photos, setPhotos] = useState([]);
  const items=useMemo(()=>assignPlanItems(draftItems,catalog,dayMeals),[draftItems,catalog,dayMeals]);
  const setItems=update=>setDraftItems(current=>{
    const allocated=assignPlanItems(current,catalogRef.current,dayMeals);
    return typeof update==='function'?update(allocated):update;
  });
  const progress=dailyPlanProgress(dayMeals);
  const previewMeals={...dayMeals,preview:{}};
  for(const item of items) {const key=item.planAllocation.letter||'voice';previewMeals.preview[key]=[...(previewMeals.preview[key]||[]),item];}
  const afterProgress=dailyPlanProgress(previewMeals);
  const [target, setTarget] = useState({ date, meal }),
    [photoTarget, setPhotoTarget] = useState(""),
    [error, setError] = useState("");
  const [partial, setPartial] = useState(false),
    [dirtyText, setDirtyText] = useState(false),
    [metricError, setMetricError] = useState(false);
  const [saveUnknown, setSaveUnknown] = useState(false),
    [photoIssue, setPhotoIssue] = useState(false);
  const life = useRef({ closed: true, revision: 0 }),
    starting = useRef(false),
    recorder = useRef(),
    request = useRef(),
    audio = useRef(),
    attempt = useRef(),
    submission = useRef(),
    saved = useRef(false),
    saving = useRef(false),
    attemptStatus = useRef("started");
  const panel = useRef(),
    cameraInput = useRef(),
    galleryInput = useRef(),
    latest = useRef();
  const metrics = useRef({ actions: 1, corrections: 0, clarifications: 0 }),
    mediaAt = useRef(0),
    retryTask = useRef(null);
  latest.current = {
    state,
    sttOnly,
    language,
    items,
    unparsed,
    text,
    photos,
    target,
    photoTarget,
    partial,
    saveUnknown,
    pendingSave,
  };
  const track = async (patch, id = attempt.current, session = life.current) => {
    if (id === attempt.current && patch.status)
      attemptStatus.current = patch.status;
    if (!id || !ledger?.enabled) return;
    try {
      await ledger.update(id, { ...patch });
    } catch (_) {
      if (!session.closed && life.current === session) setMetricError(true);
    }
  };
  const action = () => {
    metrics.current.actions++;
    void track(metrics.current);
  };
  const bump = () => {
    life.current.revision++;
    request.current?.abort();
    submission.current = null;
    retryTask.current = null;
    action();
  };
  const valid = (session, revision) =>
    !life.current.closed &&
    life.current === session &&
    session.revision === revision;
  const stopResources = () => {
    request.current?.abort();
    recorder.current?.cancel();
    request.current = null;
    recorder.current = null;
    audio.current = null;
  };
  const clearDraft = () => {
    retryTask.current = null;
    submission.current = null;
    setText("");
    setItems([]);
    setUnparsed([]);
    setPhotos([]);
    setPhotoTarget("");
    setPhotoIssue(false);
  };
  const edit = (fn) => {
    bump();
    metrics.current.corrections++;
    void track(metrics.current);
    fn();
  };
  const abandon = () => {
    if (saved.current || !attempt.current) return;
    const status =
      saving.current || latest.current.saveUnknown
        ? "unknown"
        : attemptStatus.current === "error"
          ? "error"
          : "abandoned";
    void track({ status, finishedAt: Date.now() });
  };
  async function newAttempt(carry = false) {
    const session = life.current,
      revision = session.revision,
      parent = attempt.current;
    if (parent && !["error", "abandoned"].includes(attemptStatus.current))
      await track(
        { status: "abandoned", finishedAt: Date.now() }, parent, session,
      );
    if (!valid(session, revision)) return false;
    const previous = metrics.current;
    const nextMetrics = {
      actions: carry ? 1 : 2,
      corrections: carry ? previous.corrections : 0,
      clarifications: carry ? previous.clarifications : 0,
      manualPfc: carry && !!previous.manualPfc,
    };
    let id;
    try {
      id = ledger?.enabled ? await ledger.start(parent) : newId();
    } catch (_) {
      id = newId();
      if (valid(session, revision)) setMetricError(true);
    }
    const abandonCreated = () => {
      if (ledger?.enabled)
        void track({ status: "abandoned", finishedAt: Date.now() }, id, session);
    };
    if (!valid(session, revision)) { abandonCreated(); return false; }
    metrics.current = nextMetrics;
    attempt.current = id;
    attemptStatus.current = "started";
    await track({
      ...nextMetrics,
      hasPhoto: carry && latest.current.photos.length > 0,
      partial: carry && latest.current.partial,
    }, id, session);
    if (!valid(session, revision)) { abandonCreated(); return false; }
    return true;
  }
  async function retry(task) {
    if (!task || saving.current) return;
    setState("processing");
    bump();
    retryTask.current = task;
    const session = life.current,
      revision = session.revision;
    if ((await newAttempt(true)) && valid(session, revision)) {
      mediaAt.current = Date.now();
      void task();
    }
  }
  function cancelProcessing() {
    const task = retryTask.current;
    bump();
    retryTask.current = task;
    if (latest.current.photos.length) setPhotoIssue(true);
    setState("preview");
    setError("Обробку скасовано. Чернетка залишилась. Можна повторити обробку.");
    void track({ status: "abandoned", finishedAt: Date.now() });
  }
  async function analyze(
    transcript,
    images = [],
    rowId = "",
    session = life.current,
    revision = session.revision,
  ) {
    if (latest.current.sttOnly || !valid(session, revision)) return;
    const id = attempt.current;
    const controller = new AbortController();
    request.current = controller;
    setState("processing");
    setError("");
    retryTask.current = () => analyze(transcript, images, rowId);
    try {
      const row = rowId
        ? latest.current.items.find((i) => i.itemId === rowId)
        : null;
      const prompt = row
        ? `Уточни тільки цей продукт: ${row.name}. Спожито ${row.quantity.value} ${row.quantity.unit}.\n${transcript}`
        : transcript;
      const requestCatalog=catalogRef.current;
      const response = await api.analyze(prompt, images, controller.signal, requestCatalog.apiCatalog);
      if (!valid(session, revision)) return;
      if (rowId) {
        const updated = mergePhotoItem(row, response, requestCatalog);
        setItems((current) =>
          current.map((i) => (i.itemId === rowId ? updated : i)),
        );
      } else {
        const parsed = normalizeAnalysis(response, newId, requestCatalog);
        setItems(parsed.items);
        setUnparsed(parsed.unparsed);
        setPhotoTarget(parsed.items.length === 1 ? parsed.items[0].itemId : "");
      }
      const parsed = normalizeAnalysis(response, newId, requestCatalog);
      const questions =
        parsed.unparsed.length +
        parsed.items.filter((i) => itemProblems(i).length).length;
      metrics.current.clarifications += questions;
      setPhotoIssue(false);
      if (!rowId) setDirtyText(false);
      setState("preview");
      retryTask.current = null;
      await track(
        {
          ...metrics.current,
          previewMs: Math.max(0, Date.now() - mediaAt.current),
        },
        id,
        session,
      );
    } catch (e) {
      if (!valid(session, revision)) return;
      setState("preview");
      setError(voiceError(e));
      if (rowId) {
        setPhotoIssue(true);
        metrics.current.clarifications++;
      }
      await track({ ...metrics.current, status: "error" }, id, session);
    }
  }
  async function processAudio(blob, duration) {
    const session = life.current,
      revision = session.revision,
      id = attempt.current;
    setState("processing");
    setError("");
    mediaAt.current = Date.now();
    retryTask.current = () => processAudio(blob, duration);
    audio.current = { blob, duration };
    try {
      const wav =
        blob.type === "audio/wav" ? blob : await audioNormalizer(blob);
      if (!valid(session, revision)) return;
      audio.current = { blob: wav, duration };
      const controller = new AbortController();
      request.current = controller;
      const response = await api.transcribe(
        wav,
        duration,
        controller.signal,
        latest.current.language,
      );
      if (!valid(session, revision)) return;
      if (!response.text?.trim()) throw Error("empty_transcript");
      setText(response.text);
      if (latest.current.sttOnly) {
        setDirtyText(false);
        setState("preview");
        retryTask.current = null;
      } else {
        await analyze(response.text, [], "", session, revision);
      }
    } catch (e) {
      if (!valid(session, revision)) return;
      setState("preview");
      setError(voiceError(e));
      await track({ status: "error" }, id, session);
    }
  }
  async function start() {
    if (starting.current || saving.current || latest.current.saveUnknown || latest.current.pendingSave || latest.current.state !== "ready") return;
    if ((text || items.length || photos.length || audio.current) && !window.confirm("Почати новий запис і замінити чернетку?")) return;
    starting.current = true;
    const session = life.current;
    bump();
    stopResources();
    setItems([]);
    setUnparsed([]);
    setPhotos([]);
    setText("");
    setError("");
    setSeconds(0);
    setWaiting(false);
    setPartial(false);
    setDirtyText(false);
    setSaveUnknown(false);
    setPhotoIssue(false);
    saved.current = false;
    retryTask.current = null;
    setState("permission");
    if (!(await newAttempt())) { if (life.current === session) starting.current = false; return; }
    const revision = session.revision;
    recorder.current = recorderFactory({
      onState: (next) => {
        if (valid(session, revision)) setState(next);
      },
      onTime: (value) => {
        if (valid(session, revision)) setSeconds(value);
      },
      onWaiting: () => {
        if (valid(session, revision)) setWaiting(true);
      },
      onError: (e) => {
        if (valid(session, revision)) {
          setState("preview");
          setError(voiceError(e));
          void track({ status: "error" });
        }
      },
      onStop: (blob, duration) => {
        if (valid(session, revision)) void processAudio(blob, duration);
      },
    });
    void recorder.current.start();
    starting.current = false;
  }
  function close() {
    if (saved.current) {
      onClose();
      return;
    }
    if (saving.current) return;
    if (saveUnknown) {
      if (
        window.confirm(
          "Результат збереження ще невідомий. Закрити чернетку? На головному екрані натисніть «Повторити» після відновлення зв’язку. Не додавайте цей прийом заново до перевірки.",
        )
      )
        onClose();
      return;
    }
    if (
      (text ||
        items.length ||
        photos.length ||
        audio.current ||
        state === "recording") &&
      !window.confirm("Закрити й видалити незбережену чернетку?")
    )
      return;
    onClose();
  }
  useEffect(() => {
    if (!isOpen) {
      clearDraft();
      return;
    }
    const session = { closed: false, revision: 0 };
    life.current = session;
    attempt.current = null;
    submission.current = null;
    saved.current = false;
    saving.current = false;
    starting.current = false;
    setSaveUnknown(false);
    setState("ready");
    setError("");
    attemptStatus.current = "started";
    setTarget({ date, meal });
    setCatalog(buildPlanCatalog(planContext));
    setNeedsPlanRefresh(false);
    setMetricError(false);
    const previous = document.activeElement,
      oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const begin = Promise.resolve().then(() => {
      if (!session.closed) {
        panel.current?.focus();

      }
    });
    void begin;
    const onPageHide = () => {
      abandon();
      session.closed = true;
      stopResources();
      clearDraft();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      abandon();
      session.closed = true;
      stopResources();
      retryTask.current = null;
      window.removeEventListener("pagehide", onPageHide);
      document.body.style.overflow = oldOverflow;
      previous?.focus?.();
    };
    // Одна ізольована сесія на відкриття; StrictMode cleanup скасовує перший microtask до запиту дозволу.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, ownerKey]);

  async function addPhoto(file) {
    if (latest.current.sttOnly || !file) return;
    if (!photoTarget) {
      setError("Оберіть продукт, якого стосується фото.");
      return;
    }
    if (photos.length >= 2) {
      setError("Можна додати два фото. Видаліть зайве перед новим.");
      return;
    }
    bump();
    const session = life.current,
      revision = session.revision,
      id = attempt.current;
    setState("processing");
    setError("");
    mediaAt.current = Date.now();
    setPhotoIssue(true);
    retryTask.current = () => addPhoto(file);
    try {
      const photo = await photoNormalizer(file);
      if (!valid(session, revision)) return;
      const next = [...photos, photo];
      setPhotos(next);
      await track({ hasPhoto: true }, id, session);
      if (!valid(session, revision)) return;
      await analyze(text, next, photoTarget, session, revision);
    } catch (e) {
      if (!valid(session, revision)) return;
      setState("preview");
      setPhotoIssue(true);
      setError(voiceError(e));
      await track({ status: "error" }, id, session);
    }
  }
  const changeItem = (id, fn, manualPfc = false) =>
    edit(() => {
      setItems((current) =>
        current.map((item) => (item.itemId === id ? fn(item) : item)),
      );
      if (manualPfc) {
        metrics.current.manualPfc = true;
        void track({ manualPfc: true });
      }
    });
  async function save() {
    if (latest.current.sttOnly || saving.current || needsPlanRefresh || (pendingSave && !saveUnknown)) return;
    if (activeDate && activeDate !== target.date) {
      setError(
        "Відкрита інша дата. Явно виберіть дату чернетки перед додаванням.",
      );
      return;
    }
    if (
      !items.length ||
      unparsed.length ||
      dirtyText ||
      photoIssue ||
      items.some((i) => itemProblems(i).length)
    )
      return;
    const session = life.current,
      revision = session.revision,
      id = attempt.current;
    saving.current = true;
    action();
    setState("saving");
    if (!submission.current) {
      try {
        const fingerprint=await planFingerprint(catalogRef.current);
        if(!valid(session,revision)) {saving.current=false;return;}
        submission.current={type:"appendAllocated",submissionId:`${target.date}~${newId()}`,meal:target.meal,items:items.map(persistedPlanItem),planFingerprint:fingerprint,updatedAt:new Date().toISOString()};
      } catch (_) {saving.current=false;setState("preview");setError("Не вдалося перевірити план. Повторіть додавання.");return;}
    }
    setState("saving");
    setError("");
    await track(
      {
        submissionId: submission.current.submissionId,
        status: "unknown",
        partial,
        ...allocationCounts(submission.current.items),
      },
      id,
      session,
    );
    try {
      if (session.closed || life.current !== session) {
        await track(
          { status: "abandoned", finishedAt: Date.now() },
          id,
          session,
        );
        return;
      }
      await onAdd(submission.current, target.date);
      if (session.closed || life.current !== session) return;
      saved.current = true;
      setSaveUnknown(false);
      setState("saved");
      stopResources();
      clearDraft();
      await track(
        { status: "saved", finishedAt: Date.now(), partial },
        id,
        session,
      );
      onSaved?.();
    } catch (e) {
      if (session.closed || life.current !== session) return;
      setState("preview");
      const unknown =
        [
          "save_unknown",
          "unavailable",
          "deadline-exceeded",
          "unknown",
        ].includes(e.message) ||
        ["unavailable", "deadline-exceeded", "unknown"].includes(e.code);
      setSaveUnknown(unknown);
      if(!unknown) submission.current=null;
      if(['plan_conflict','revision_conflict','submission_conflict'].includes(e.message)) setNeedsPlanRefresh(true);
      setError(saveError(e));
      await track({ status: unknown ? "unknown" : "error" }, id, session);
    } finally {
      if (life.current === session) saving.current = false;
    }
  }
  const keyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
    if (e.key !== "Tab") return;
    const nodes = [
      ...panel.current.querySelectorAll(
        'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]',
      ),
    ].filter((n) => n.getClientRects().length);
    const first = nodes[0],
      last = nodes[nodes.length - 1];
    if (
      e.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === panel.current)
    ) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };
  if (!isOpen) return null;
  const locked =
    ["permission", "recording", "processing", "saving"].includes(state) ||
    saveUnknown || pendingSave;
  const canSave =
    !sttOnly &&
    state !== "ready" &&
    !needsPlanRefresh &&
    (!pendingSave || saveUnknown) &&
    items.length > 0 &&
    !unparsed.length &&
    !dirtyText &&
    !photoIssue &&
    items.every((i) => !itemProblems(i).length) &&
    !["permission", "recording", "processing", "saving"].includes(state);
  return (
    <div className="voice-overlay" onKeyDown={keyDown}>
      <section
        className="voice-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-title"
        tabIndex={-1}
        ref={panel}
      >
        <header className="voice-heading">
          <div>
            <h2 id="voice-title">
              {sttOnly ? "Перевірка розпізнавання" : "Додати їжу"}
            </h2>
            <p>
              {target.date} · {names[target.meal]}
            </p>
          </div>
          <button
            aria-label="Закрити голосову чернетку"
            onClick={close}
            disabled={state === "saving"}
            className="voice-icon"
          >
            <X size={24} />
          </button>
        </header>
        <div className="voice-body">
          {sttOnly && (
            <p className="voice-lab-note">
              Лабораторна перевірка голосу: результатом є лише текст.
              Фото, аналіз їжі та додавання прийому тут вимкнені.
            </p>
          )}
          {state !== "saved" && (
            <label>
              Мова розпізнавання
              <select
                aria-label="Мова розпізнавання"
                value={language}
                disabled={
                  ["processing", "saving"].includes(state) || saveUnknown
                }
                onChange={(e) => {
                  const value = e.target.value;
                  if (!languages.includes(value)) return;
                  setLanguage(value);
                  try {
                    localStorage.setItem(languageKey, value);
                  } catch (_) {
                    // Заблоковане сховище не заважає поточному запису.
                  }
                }}
              >
                <option value="auto">Автоматично</option>
                <option value="uk">Українська</option>
                <option value="ru">Російська</option>
              </select>
            </label>
          )}
          {pendingSave && !saveUnknown ? (
            <div role="status"><p>Спочатку перевірте попереднє збереження.</p>
              <button className="voice-primary" onClick={onRetryPending}>Перевірити збереження</button>
            </div>
          ) : state === "ready" && (
            <div className="voice-ready">
              <p>Коли будете готові, скажіть, що з’їли та скільки.</p>
              <button className="voice-primary" onClick={() => void start()}><Mic size={20} /> Почати запис</button>
              {(text || items.length > 0) && <button className="voice-secondary" onClick={() => setState("preview")}>Повернутися до прев’ю</button>}
            </div>
          )}
          {state === "permission" && (
            <div role="status">
              <p>Дозвольте мікрофон у запиті браузера.</p>
              {waiting && (
                <p>
                  Запит ще очікує відповіді. Можна закрити чернетку й
                  повернутися пізніше.
                </p>
              )}
            </div>
          )}
          {state === "recording" && (
            <div className="voice-recording" role="status">
              <Mic size={28} />
              <strong>Записую · {seconds} с</strong>
              <p>Скажіть, що з’їли та скільки.</p>
              <button
                className="voice-primary"
                onClick={() => {
                  action();
                  recorder.current?.stop();
                }}
              >
                <Square size={18} /> Зупинити запис
              </button>
            </div>
          )}
          {state === "processing" && (
            <>
              <p role="status">
                {sttOnly ? "Розпізнаю голос…" : "Готую прев’ю…"} Чернетка
                залишиться тут.
              </p>
              <button className="voice-secondary" onClick={cancelProcessing}>
                Скасувати обробку
              </button>
            </>
          )}
          {metricError && (
            <p role="alert">
              Облік спроб пілоту недоступний. Ці вимірювання не можна вважати
              повними.
            </p>
          )}
          {!sttOnly && activeDate && activeDate !== target.date && (
            <div role="alert">
              <p>Відкрита інша дата: {activeDate}.</p>
              <button
                className="voice-secondary"
                disabled={locked}
                onClick={() => onReturnToDate?.(target.date)}
              >
                Повернутися до {target.date}
              </button>
              <button
                className="voice-secondary"
                disabled={locked}
                onClick={() =>
                  edit(() => setTarget({ ...target, date: activeDate }))
                }
              >
                Перенести на {activeDate}
              </button>
            </div>
          )}
          {catalog.overLimit && !sttOnly && <p role="status">Каталог завеликий для автоматичного зіставлення. Їжу можна додати й вибрати літеру вручну.</p>}
          {needsPlanRefresh && <button className="voice-secondary" onClick={async()=>{
            const session=life.current,revision=session.revision;
            try {const fresh=await onRefreshPlan?.();if(!valid(session,revision))return;if(!fresh)throw Error();setCatalog(buildPlanCatalog(fresh));setNeedsPlanRefresh(false);setError("");}
            catch(_){setError("Не вдалося перечитати план. Перевірте зв’язок.");}
          }}>Перечитати план і прев’ю</button>}
          {error && (
            <p className="voice-error" role="alert">
              {error}
            </p>
          )}
          {state === "saved" ? (
            <div role="status">
              <h3>Прийом збережено</h3>
              <p>
                {target.date} · {names[target.meal]}
              </p>
              {ledger?.enabled && (
                <button
                  className="voice-secondary"
                  onClick={async () => {
                    await track({ correct: true });
                    onSaved?.();
                    onClose();
                  }}
                >
                  Запис правильний і повний
                </button>
              )}
              <button className="voice-primary" onClick={onClose}>
                Готово
              </button>
            </div>
          ) : (
            <>
              {text && (
                <details open={sttOnly ? true : undefined}>
                  <summary>Розпізнаний текст</summary>
                  <textarea
                    aria-label="Розпізнаний текст"
                    value={text}
                    readOnly={sttOnly}
                    disabled={locked}
                    onChange={(e) => {
                      if (sttOnly) return;
                      edit(() => {
                        setText(e.target.value);
                        setDirtyText(true);
                      });
                    }}
                  />
                  {!sttOnly && dirtyText && (
                    <button
                      className="voice-secondary"
                      disabled={locked}
                      onClick={() => {
                        setPartial(false);
                        setPhotos([]);
                        mediaAt.current = Date.now();
                        void analyze(text);
                      }}
                    >
                      Оновити за текстом
                    </button>
                  )}
                </details>
              )}
              {(sttOnly ? [] : items).map((item, index) => {
                const problems = itemProblems(item),
                  totals = problems.length
                    ? null
                    : roundMacros(itemMacros(item));
                return (
                  <article
                    className="voice-item"
                    key={item.itemId}
                    data-testid="voice-item"
                  >
                    <label>
                      Продукт {index + 1}
                      <input
                        aria-label={`Назва продукту ${index + 1}`}
                        value={item.name}
                        disabled={locked}
                        onChange={(e) =>
                          changeItem(item.itemId, (x) => ({
                            ...invalidatePlanIdentity(x),
                            name: e.target.value,
                            source: { kind: "manual" },
                          }))
                        }
                      />
                    </label>
                    <div className="voice-quantity">
                      <label>
                        Кількість
                        <DecimalInput
                          aria-label={`Кількість продукту ${index + 1}`}
                          inputMode="decimal"
                          value={item.quantity.value ?? ""}
                          disabled={locked}
                          onChange={(e) =>
                            changeItem(item.itemId, (x) => ({
                              ...x,
                              quantity: {
                                ...x.quantity,
                                value: parseDecimal(e.target.value),
                              },
                            }))
                          }
                        />
                      </label>
                      <label>
                        Одиниця
                        <select
                          aria-label={`Одиниця продукту ${index + 1}`}
                          value={item.quantity.unit}
                          disabled={locked}
                          onChange={(e) =>
                            changeItem(item.itemId, (x) => ({
                              ...x,
                              planChoice:{...x.planChoice,mass:undefined},
                              quantity: { ...x.quantity, unit: e.target.value },
                            }))
                          }
                        >
                          {Object.entries(UNITS).map(([v, label]) => (
                            <option key={v} value={v}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <p className="voice-nutrition">
                      {totals
                        ? `${totals.cal} ккал · Б ${totals.p} · Ж ${totals.f} · В ${totals.c}`
                        : "Потрібне уточнення"}
                    </p>
                    <p className="voice-source">{sourceText(item)}</p>
                    <PlanAllocationFields item={item} index={index} catalog={catalog} progress={progress} after={afterProgress} disabled={locked}
                      onChange={choice=>changeItem(item.itemId,x=>({...x,planChoice:choice}))}
                      onSearch={()=>{metrics.current.manualSearch=true;void track({manualSearch:true});}}/>
                    {problems.length > 0 && (
                      <ul className="voice-error">
                        {problems.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    )}
                    <details>
                      <summary>Основа та харчові значення</summary>
                      <div className="voice-quantity">
                        <label>
                          На кількість
                          <DecimalInput
                            aria-label={`Основа продукту ${index + 1}`}
                            inputMode="decimal"
                            value={item.nutritionBasis.value ?? ""}
                            disabled={locked}
                            onChange={(e) =>
                              changeItem(
                                item.itemId,
                                (x) => ({
                                  ...x,
                                  nutritionBasis: {
                                    ...x.nutritionBasis,
                                    value: parseDecimal(e.target.value),
                                  },
                                  source: { kind: "manual" },
                                }),
                                true,
                              )
                            }
                          />
                        </label>
                        <label>
                          Одиниця основи
                          <select
                            value={item.nutritionBasis.unit}
                            disabled={locked}
                            onChange={(e) =>
                              changeItem(
                                item.itemId,
                                (x) => ({
                                  ...x,
                                  nutritionBasis: {
                                    ...x.nutritionBasis,
                                    unit: e.target.value,
                                  },
                                  source: { kind: "manual" },
                                }),
                                true,
                              )
                            }
                          >
                            {Object.entries(UNITS).map(([v, label]) => (
                              <option key={v} value={v}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="voice-macros">
                        {Object.entries({
                          cal: "ккал",
                          p: "Білки",
                          f: "Жири",
                          c: "Вуглеводи",
                        }).map(([key, label]) => (
                          <label key={key}>
                            {label}
                            <DecimalInput
                              aria-label={`${label} на основу продукту ${index + 1}`}
                              inputMode="decimal"
                              disabled={locked}
                              value={item.nutrients[key] ?? ""}
                              onChange={(e) =>
                                changeItem(
                                  item.itemId,
                                  (x) => ({
                                    ...x,
                                    nutrients: {
                                      ...x.nutrients,
                                      [key]: parseDecimal(e.target.value),
                                    },
                                    source: { kind: "manual" },
                                  }),
                                  true,
                                )
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </details>
                    <button
                      className="voice-remove"
                      aria-label={`Вилучити продукт ${index + 1}`}
                      disabled={locked}
                      onClick={() => {
                        if (window.confirm("Вилучити цей продукт із чернетки?"))
                          edit(() => {
                            setItems((current) =>
                              current.filter((i) => i.itemId !== item.itemId),
                            );
                            setPartial(true);
                          });
                      }}
                    >
                      <Trash2 size={16} /> Вилучити
                    </button>
                  </article>
                );
              })}
              {(sttOnly ? [] : unparsed).map((fragment, index) => (
                <div className="voice-item" key={index}>
                  <p>Не розпізнано: {fragment}</p>
                  <button
                    disabled={locked}
                    className="voice-secondary"
                    onClick={() =>
                      edit(() => {
                        setUnparsed((current) =>
                          current.filter((_, i) => i !== index),
                        );
                        setPartial(true);
                      })
                    }
                  >
                    Вилучити цей фрагмент
                  </button>
                  <p>Для повного запису уточніть розпізнаний текст.</p>
                </div>
              ))}
              {!sttOnly && !!items.length && (
                <div className="voice-photos">
                  <h3>Уточнити за упаковкою</h3>
                  <p>
                    Назва спереду та харчова панель. До двох фото одного
                    продукту.
                  </p>
                  <label>
                    До якого продукту фото
                    <select
                      aria-label="Продукт для фото"
                      value={photoTarget}
                      disabled={locked || photoIssue}
                      onChange={(e) => {
                        if (photoIssue) return;
                        bump();
                        setPhotoTarget(e.target.value);
                        setPhotos([]);
                        setPhotoIssue(false);
                        setError("");
                      }}
                    >
                      <option value="">Оберіть продукт</option>
                      {items.map((i) => (
                        <option key={i.itemId} value={i.itemId}>
                          {i.name || "Без назви"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="voice-photo-buttons">
                    <button
                      className="voice-secondary"
                      disabled={locked || photos.length >= 2 || !photoTarget}
                      onClick={() => {
                        action();
                        cameraInput.current?.click();
                      }}
                    >
                      <Camera size={20} /> Сфотографувати
                    </button>
                    <button
                      className="voice-secondary"
                      disabled={locked || photos.length >= 2 || !photoTarget}
                      onClick={() => {
                        action();
                        galleryInput.current?.click();
                      }}
                    >
                      <ImageIcon size={20} /> З галереї
                    </button>
                  </div>
                  <input
                    ref={cameraInput}
                    aria-label="Фото камерою"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    onChange={(e) => {
                      void addPhoto(e.target.files[0]);
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={galleryInput}
                    aria-label="Фото з галереї"
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      void addPhoto(e.target.files[0]);
                      e.target.value = "";
                    }}
                  />
                  <div className="voice-photo-grid">
                    {photos.map((photo, index) => (
                      <div key={index}>
                        <img
                          alt={`Упаковка, фото ${index + 1}`}
                          src={photo.preview}
                        />
                        <button
                          disabled={locked}
                          aria-label={`Видалити фото ${index + 1}`}
                          onClick={() => {
                            bump();
                            const next = photos.filter((_, i) => i !== index);
                            setPhotos(next);
                            if (next.length)
                              void analyze(text, next, photoTarget);
                          }}
                        >
                          Видалити
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!sttOnly && photoIssue && (
                <div role="alert">
                  <p>
                    Фото ще потребує уточнення. Додайте чіткішу харчову панель
                    або виправте одиницю кількості.
                  </p>
                  {!!photos.length && (
                    <button
                      className="voice-secondary"
                      disabled={locked}
                      onClick={() =>
                        void retry(
                          retryTask.current ||
                            (() => analyze(text, photos, photoTarget)),
                        )
                      }
                    >
                      Повторити читання фото
                    </button>
                  )}
                  <button
                    className="voice-secondary"
                    disabled={locked}
                    onClick={() => {
                      bump();
                      setPhotoIssue(false);
                      setPhotos([]);
                      setError("");
                    }}
                  >
                    Продовжити з попередніми значеннями
                  </button>
                </div>
              )}
              {!sttOnly && partial && (
                <p role="status">
                  Чернетку скорочено. У пілоті це частковий запис.
                </p>
              )}
              {state === "preview" && (
                <div className="voice-retry">
                  <button
                    className="voice-secondary"
                    disabled={saveUnknown || pendingSave}
                    onClick={() => setState("ready")}
                  >
                    <Mic size={18} /> Записати ще раз
                  </button>
                  {retryTask.current && (!photoIssue || !photos.length) && (
                    <button
                      className="voice-secondary"
                      disabled={saveUnknown || pendingSave}
                      onClick={() => void retry(retryTask.current)}
                    >
                      Повторити обробку
                    </button>
                  )}
                </div>
              )}
              {!sttOnly && (
                <footer className="voice-footer">
                  <button
                    className="voice-primary"
                    disabled={!canSave}
                    onClick={save}
                  >
                    {state === "saving"
                      ? "Зберігаю…"
                      : saveUnknown
                        ? "Перевірити збереження"
                        : "Додати"}
                  </button>
                </footer>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
