import { auth } from "../firebase";
import { voiceError } from "./voiceApi";
const messages = {
  trainer_busy:
    "Тренер ще завершує попереднє повідомлення. Зачекайте або перевірте його стан.",
  trainer_unavailable:
    "Тренер тимчасово недоступний. Текст і готові чернетки збережено на сервері.",
  history_conflict:
    "Чат змінився в іншій вкладці. Перечитайте його перед надсиланням.",
  composer_conflict:
    "Текст змінено в іншій вкладці. Оберіть, яку версію залишити.",
  draft_conflict: "Чернетка змінилася. Перечитайте прев’ю перед редагуванням.",
  draft_frozen: "Ця чернетка вже зберігається. Спочатку перевірте результат.",
  date_draft_conflict: "На цю дату вже є чернетка. Доповніть її повідомленням.",
  note_confirmation_required:
    "Для їжі без розрахунку оберіть «Зберегти як нотатку».",
  notes_disabled: "Нотатки ще не ввімкнені. Текст залишився у чаті.",
  save_unconfirmed:
    "Запис ще не підтверджено. Повтор перевірить ту саму спробу.",
  context_conflict: "Пам’ять тренера вже змінилася. Потрібна нова пропозиція.",
  message_too_large: "Повідомлення завелике. Скоротіть його до 8000 байтів.",
  context_too_large:
    "Накопичилося забагато незавершених чернеток. Завершіть одну з них.",
  admission_unknown:
    "Немає підтвердження отримання повідомлення. Перевірте стан перед повтором.",
  conversation_gone: "Цю розмову видалено. Відкрийте чат заново.",
  turn_gone: "Термін зберігання цього повідомлення минув.",
  invalid_quantity: "Вкажіть додатну кількість або залиште її невідомою.",
  plan_conflict:
    "План змінився перед записом. Попередню спробу скасовано. Перевірте прев’ю й натисніть «Додати» ще раз.",
};
export const trainerError = (e) =>
  messages[e?.message] || voiceError(e || Error());
export function createTrainerApi(
  uid,
  {
    endpoint = process.env.REACT_APP_MEAL_API_URL,
    fetcher = fetch,
    getUser = () => auth.currentUser,
    timeoutMs = 15000,
  } = {},
) {
  async function request(path, method = "GET", body, signal) {
    if (!endpoint) throw Error("live_disabled");
    const c = new AbortController(),
      abort = () => c.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(abort, timeoutMs);
    const owner = () => {
      const user = getUser();
      if (!user || user.uid !== uid) throw Error("unauthorized");
      return user;
    };
    try {
      const token = await Promise.race([
        owner().getIdToken(),
        new Promise((_, reject) => {
          if (c.signal.aborted) reject(Error("client_timeout"));
          else
            c.signal.addEventListener(
              "abort",
              () => reject(Error("client_timeout")),
              { once: true },
            );
        }),
      ]);
      owner();
      if (c.signal.aborted) throw Error("client_timeout");
      const r = await fetcher(`${endpoint.replace(/\/$/, "")}/trainer${path}`, {
        method,
        cache: "no-store",
        signal: c.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const data = await r.json();
      owner();
      if (c.signal.aborted) throw Error("client_timeout");
      if (!r.ok)
        throw Object.assign(Error(data.error || "trainer_unavailable"), {
          status: r.status,
        });
      return data;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
  return {
    request,
    state: (s) => request("/state", "GET", undefined, s),
    composer: (b, s) => request("/composer", "PUT", b, s),
    send: (b, s) => request("/turns", "POST", b, s),
    turn: (id, s) => request(`/turns/${id}`, "GET", undefined, s),
    recover: (id, s) => request(`/turns/${id}/recover`, "POST", {}, s),
    cancel: (id, s) => request(`/turns/${id}/cancel`, "POST", {}, s),
    edit: (id, b, s) => request(`/drafts/${id}`, "PUT", b, s),
    prepareSave: (id, revision, s) =>
      request(`/drafts/${id}/save`, "POST", { baseRevision: revision }, s),
    receipt: (id, s) => request(`/drafts/${id}/receipt`, "POST", {}, s),
    unknown: (id, s) => request(`/drafts/${id}/unknown`, "POST", {}, s),
    note: (b, s) => request("/notes", "POST", b, s),
    context: (s) => request("/context", "GET", undefined, s),
    remember: (id, s) => request(`/context/${id}/confirm`, "POST", {}, s),
    forget: (conversationId, s) =>
      request("/conversation/delete", "POST", { conversationId }, s),
  };
}
