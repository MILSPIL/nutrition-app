import React, { useEffect, useRef, useState } from "react";

function imageURL(value) {
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(value?.type) || typeof value.data !== "string" || value.data.length > 24 * 1024 * 1024) throw Error("media_unavailable");
  const binary = atob(value.data), data = new Uint8Array(binary.length);
  for (let n = 0; n < binary.length; n++) data[n] = binary.charCodeAt(n);
  return URL.createObjectURL(new Blob([data], { type: value.type }));
}
const missingText = "Фото видалено або вже недоступне.";
// Each mounted component belongs to one authenticated chat lifetime. Protected
// bytes become short-lived object URLs, never public URLs or persisted cache.
export default function TrainerPhoto({ api, reference, number = 1 }) {
  const [thumbnail, setThumbnail] = useState(null), [phase, setPhase] = useState("loading"),
    [attempt, setAttempt] = useState(0), [open, setOpen] = useState(false),
    [original, setOriginal] = useState(null), [fullError, setFullError] = useState(""),
    [confirm, setConfirm] = useState(false), [deleting, setDeleting] = useState(false);
  const host = useRef(), trigger = useRef(), dialog = useRef(), alive = useRef(false), deletion = useRef();
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; deletion.current?.abort(); };
  }, []);
  useEffect(() => {
    let disposed = false, started = false, url, observer;
    const controller = new AbortController(); setThumbnail(null); setPhase("loading");
    const load = async () => {
      if (started || disposed) return; started = true; observer?.disconnect();
      try {
        const value = await api.photo(reference, "thumbnail", controller.signal);
        if (disposed) return;
        url = imageURL(value); setThumbnail(url); setPhase("ready");
      } catch (error) { if (!disposed) setPhase(error.message === "media_missing" ? "missing" : "error"); }
    };
    if (typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void load(); }, { rootMargin: "120px" });
      observer.observe(host.current);
    } else void load();
    return () => { disposed = true; observer?.disconnect(); controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [api, reference, attempt]);
  useEffect(() => {
    if (!open) return;
    const node = dialog.current, back = trigger.current, fallback = host.current, controller = new AbortController();
    let disposed = false, url;
    setOriginal(null); setFullError(""); setConfirm(false);
    if (typeof node.showModal === "function") node.showModal(); else node.setAttribute("open", "");
    node.querySelector("button")?.focus();
    void api.photo(reference, "original", controller.signal).then(value => {
      if (disposed) return; url = imageURL(value); setOriginal(url);
    }).catch(error => { if (!disposed) setFullError(error.message === "media_missing" ? missingText : "Не вдалося відкрити фото. Спробуйте ще раз."); });
    return () => { disposed = true; controller.abort(); if (url) URL.revokeObjectURL(url); if (typeof node.close === "function") node.close(); else node.removeAttribute("open"); if (back?.isConnected) back.focus(); else if (fallback?.isConnected) fallback.focus(); };
  }, [api, reference, open]);
  async function remove() {
    if (deleting) return;
    const controller = new AbortController(); deletion.current = controller; setDeleting(true); setFullError("");
    try {
      const result = await api.deletePhoto(reference, controller.signal);
      if (result?.deleted !== true) throw Error("media_unavailable");
      if (alive.current) { if (thumbnail) URL.revokeObjectURL(thumbnail); setThumbnail(null); setPhase("missing"); setOpen(false); }
    } catch { if (alive.current) setFullError("Не вдалося видалити фото. Спробуйте ще раз."); }
    finally { if (alive.current) setDeleting(false); }
  }
  return <div className="trainer-history-photo" ref={host} tabIndex="-1">
    {phase === "missing" ? <p>{missingText}</p> : <>
      <button ref={trigger} className="trainer-photo-open" disabled={phase !== "ready"} onClick={() => setOpen(true)} aria-label={`Відкрити фото ${number}`}>
        {thumbnail ? <img src={thumbnail} alt={`Фото ${number} з повідомлення`} width="180" height="180" /> : <span>{phase === "error" ? "Фото не завантажено" : "Завантажую фото…"}</span>}
      </button>
      {phase === "error" && <button onClick={() => setAttempt(value => value + 1)}>Повторити завантаження фото</button>}
    </>}
    {open && <dialog ref={dialog} className="trainer-photo-dialog" aria-label={`Фото ${number}`} onCancel={event => { event.preventDefault(); if (!deleting) setOpen(false); }} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); if (!deleting) setOpen(false); }
      if (event.key === "Tab") {
        const buttons = [...dialog.current.querySelectorAll("button:not(:disabled)")], first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <div className="trainer-photo-dialog-header"><strong>Фото {number}</strong><button disabled={deleting} onClick={() => setOpen(false)} aria-label="Закрити фото">Закрити</button></div>
      {original && <img src={original} alt={`Повне фото ${number} з повідомлення`} />}
      {!original && !fullError && <p role="status">Відкриваю оригінал…</p>}
      {fullError && <p role="alert">{fullError}</p>}
      {confirm ? <div className="trainer-photo-confirm"><p>Видалити це фото з історії? Записи про їжу залишаться.</p><button disabled={deleting} onClick={() => void remove()}>{deleting ? "Видаляю…" : "Так, видалити фото"}</button><button disabled={deleting} onClick={() => setConfirm(false)}>Залишити фото</button></div>
        : <button onClick={() => setConfirm(true)}>Видалити фото</button>}
    </dialog>}
  </div>;
}
