import { auth } from "../firebase";
export const voiceError = (error, fallback = "Обробка не вдалася. Чернетка залишилась. Перевірте з’єднання та повторіть.") =>
  messages[error.message] ||
  messages[error.name] ||
  fallback;

const messages = {
  NotAllowedError:
    "Доступ до мікрофона не надано. Дозвольте його в налаштуваннях браузера та повторіть.",
  NotFoundError: "Мікрофон не знайдено.",
  microphone_unsupported:
    "Запис недоступний. Відкрийте HTTPS-сторінку в сучасному браузері.",
  audio_decode_failed:
    "Не вдалося прочитати звук. Повторіть коротший запис у браузері.",
  photo_decode_failed:
    "Фото не відкривається. Оберіть JPEG, PNG або WebP з галереї.",
  photo_too_large: "Фото завелике. Обріжте його до етикетки та повторіть.",
  photo_clarification:
    "Не вдалося впевнено прочитати етикетку. Сфотографуйте харчову панель ближче та перевірте г або мл.",
  invalid_response:
    "Сервіс повернув неповні дані. Чернетка залишилась; повторіть обробку.",

  unauthorized: "Сеанс завершився. Увійдіть ще раз.",
  rate_limited: "Досягнуто ліміту спроб. Зачекайте й повторіть пізніше.",
  upstream_limited:
    "Сервіс тимчасово досяг ліміту запитів. Спробуйте пізніше. Чернетка залишилась.",
  live_disabled: "Сервіс розпізнавання ще не підключений для цього середовища.",
  budget_disabled: "Обробку ще не ввімкнено: потрібен погоджений бюджет.",
  empty_transcript:
    "Не вдалося почути їжу. Повторіть запис із назвою та кількістю.",
  upstream_timeout: "Розпізнавання не відповіло вчасно. Чернетка залишилась.",
  client_timeout: "Обробка триває надто довго. Чернетка залишилась.",
  pilot_forbidden: "Цей обліковий запис ще не доданий до пілоту.",
};
function untilAborted(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
export async function voiceRequest(path, body, signal, options = {}) {
  const endpoint = options.endpoint ?? process.env.REACT_APP_MEAL_API_URL;
  if (!endpoint) throw Error("live_disabled");
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 60000);
  try {
    const user = options.user || auth.currentUser;
    if (!user) throw Error("unauthorized");
    const token = await untilAborted(user.getIdToken(), controller.signal);
    if (controller.signal.aborted)
      throw new DOMException("Aborted", "AbortError");
    const response = await (options.fetcher || fetch)(
      `${endpoint.replace(/\/$/, "")}/${path}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body instanceof FormData
            ? {}
            : { "Content-Type": "application/json" }),
        },
        body: body instanceof FormData ? body : JSON.stringify(body),
      },
    );
    const data = await response.json();
    if (!response.ok) {
      const e = Error(data.error || "upstream_failed");
      e.publicMessage = messages[e.message];
      throw e;
    }
    return data;
  } catch (e) {
    if (timedOut) {
      const timeout = Error("client_timeout");
      timeout.publicMessage = messages.client_timeout;
      throw timeout;
    }
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
export const transcribeAudio = (audio, duration, signal, language = "auto") => {
  const form = new FormData();
  form.set("audio", audio, "recording.wav");
  form.set("duration", String(duration));
  form.set("language", language);
  return voiceRequest("transcribe", form, signal);
};
export const analyzeFood = (text, images, signal, planCatalog) =>
  voiceRequest(
    "analyze",
    { text, images: images.map(({ type, data }) => ({ type, data })), ...(planCatalog ? {analysisVersion:2,planCatalog}: {}) },
    signal,
  );
