import { auth } from "../firebase";
import { voiceError } from "./voiceApi";
const messages = {
  native_queue_pending: "У черзі залишилося незавершене повідомлення. Текст збережено; завершіть його перед повтором.",
  trainer_failed: "Тренер не завершив повідомлення. Текст збережено; його можна повернути й уточнити.",
  trainer_timeout: "Тренер не встиг завершити відповідь. Повідомлення збережено. Перевірте результат або поверніть текст.",
  trainer_quota: "Обробку цього повідомлення зупинено. Текст збережено; спробуйте описати один прийом їжі або повторіть пізніше.",
  trainer_queue_full: "Тренер завершує інші повідомлення. Текст збережено, спробуйте трохи пізніше.",
  execution_unknown: "Завершення ще не підтверджене. Перевірте результат або зупиніть обробку й поверніть текст.",
  network_unavailable: "Не вдалося зв’язатися із застосунком. Текст залишився; перевірте мережу.",
  model_payload_invalid: "Тренер повернув відповідь, яку не вдалося перевірити. Повідомлення збережено, їжу не додано автоматично.",
  media_missing: "Фото видалено або вже недоступне.",
  data_auth_required: "Не вдалося підключити ваш щоденник. Вийдіть з акаунта SciSense й увійдіть знову; текст збережено.",
  connection_auth_required: "Підключення Hermes потребує повторного входу власника. Ручний трекер доступний.",
  connection_unconfigured: "Підключення моделі в Hermes ще не налаштовано. Ручний трекер доступний.",
  media_quota: "Місце для фото цього профілю заповнене. Видаліть непотрібні фото або надішліть текст.",
  media_unsupported: "Вибрана в Hermes модель не підтримує фото. Оберіть модель із підтримкою зображень або надішліть текст.",
  media_conflict: "Фото цієї спроби вже відрізняється. Прикріпіть фото до нового повідомлення.",
  media_unavailable: "Фото не вдалося підготувати. Прикріпіть його ще раз; текст збережено.",
  day_unavailable: "Не вдалося прочитати записи цього дня. Перечитайте прев’ю перед додаванням.",
  stale_preview: "Записи дня змінилися. Оновіть прев’ю й перевірте підсумок.",
  stale_snapshot: "День змінився під час відповіді. Перевірте актуальні записи перед новим повідомленням.",
  memory_read_only: "Пам’ять тренера поки доступна для читання. Нове уподобання ще не збережено.",
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
    "Не вдалося вмістити повідомлення й контекст у запит. Текст збережений. Спробуйте коротше повідомлення.",
  admission_unknown:
    "Немає підтвердження отримання повідомлення. Перевірте стан перед повтором.",
  conversation_gone: "Цю розмову видалено. Відкрийте чат заново.",
  turn_gone: "Термін зберігання цього повідомлення минув.",
  invalid_quantity: "Вкажіть додатну кількість або залиште її невідомою.",
  plan_conflict:
    "Дані дня або план змінилися перед записом. Попередню спробу скасовано. Оновіть прев’ю й натисніть «Додати» ще раз.",
};
export const trainerError = (e) =>
  messages[e?.message] || voiceError(e || Error(), messages.trainer_failed);
// Show one actionable failure. A concrete server cause takes precedence over generic recovery text.
export function trainerFeedback({ localMessage = '', clientCode, turn } = {}) {
  const concrete = ['failed', 'unknown'].includes(turn?.state) && messages[turn.error];
  const genericCodes = [undefined, '', 'trainer_unavailable', 'client_timeout', 'request_failed', 'trainer_failed'];
  const genericMessages = ['', ...['trainer_unavailable', 'client_timeout', 'request_failed'].map(code => trainerError(Error(code)))];
  if (concrete && genericCodes.includes(clientCode) && genericMessages.includes(localMessage)) return concrete;
  return localMessage || (clientCode ? trainerError(Error(clientCode)) : '') ||
    (['failed', 'unknown'].includes(turn?.state) ? trainerError(Error(turn.error || 'trainer_failed')) : '');
}
export function createTrainerApi(
  uid,
  {
    endpoint = process.env.REACT_APP_MEAL_API_URL,
    fetcher = fetch,
    getUser = () => auth.currentUser,
    timeoutMs = 15000,
  } = {},
) {
  async function rawRequest(path, method = "GET", body, signal) {
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
    } catch (error) {
      if (error?.name === "AbortError") throw Error("client_timeout");
      if (error?.name === "TypeError") throw Error("network_unavailable");
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
  let connecting, photoQueue = Promise.resolve();
  async function connectData(signal) {
    if (!connecting) {
      const user = getUser();
      if (!user || user.uid !== uid || typeof user.refreshToken !== "string" || !user.refreshToken) throw Error("data_auth_required");
      // Normal own-user Firebase delegation, never a ChatGPT or model grant.
      // No token is kept in local storage or returned by the server.
      connecting = rawRequest("/data-session", "PUT", { refreshToken: user.refreshToken }).finally(() => { connecting = undefined; });
    }
    const result = await connecting;
    if (signal?.aborted) throw Error("client_timeout");
    if (getUser()?.uid !== uid) throw Error("unauthorized");
    return result;
  }
  async function request(path, method = "GET", body, signal) {
    try { return await rawRequest(path, method, body, signal); }
    catch (error) {
      // Server guarantees this refusal precedes admission or draft mutation.
      if (error.message !== "data_auth_required" || path === "/data-session") throw error;
      await connectData(signal);
      return rawRequest(path, method, body, signal);
    }
  }
  return {
    request,
    photo(reference, variant = "thumbnail", signal) {
      // One image fetch at a time leaves the other HTTP slot for chat/status.
      const task = photoQueue.catch(() => {}).then(() => {
        if (signal?.aborted) throw Error("client_timeout");
        return request(`/photos/${encodeURIComponent(reference)}/${variant}`, "GET", undefined, signal);
      });
      photoQueue = task; return task;
    },
    deletePhoto: (reference, signal) => request(`/photos/${encodeURIComponent(reference)}`, "POST", { action: "delete" }, signal),
    async state(s) {
      const state = await request("/state", "GET", undefined, s);
      if (state.dataSession && state.dataSession.phase !== "connected") return { ...state, dataSession: await connectData(s) };
      return state;
    },
    day: (date, s) => request(`/days/${date}`, "GET", undefined, s),
    refreshDraft: (id, revision, s) => request(`/drafts/${id}/refresh`, "PUT", { baseRevision: revision }, s),
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
