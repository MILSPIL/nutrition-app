import { transcribeAudio, voiceError, voiceRequest } from "./voiceApi";
import { auth } from "../firebase";
jest.mock("../firebase", () => ({ auth: { currentUser: null } }));
const user = { getIdToken: async () => "TEST_ONLY_TOKEN" };
test("без endpoint або користувача зовнішнього виклику немає", async () => {
  const fetcher = jest.fn();
  await expect(
    voiceRequest("analyze", {}, null, { endpoint: "", user, fetcher }),
  ).rejects.toThrow("live_disabled");
  await expect(
    voiceRequest("analyze", {}, null, {
      endpoint: "https://test.invalid",
      fetcher,
    }),
  ).rejects.toThrow("unauthorized");
  expect(fetcher).not.toHaveBeenCalled();
});
test.each([401, 429, 500])(
  "HTTP %s повертає помилку без автоматичного повтору",
  async (status) => {
    const fetcher = jest.fn(async () => ({
      ok: false,
      json: async () => ({ error: "upstream_failed" }),
    }));
    await expect(
      voiceRequest("analyze", { text: "synthetic" }, null, {
        endpoint: "https://test.invalid",
        user,
        fetcher,
      }),
    ).rejects.toThrow("upstream_failed");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).not.toContain("TOKEN");
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer TEST_ONLY_TOKEN",
    );
  },
);
test("закритий запит не чекає завислого оновлення Firebase token", async () => {
  const controller = new AbortController(),
    fetcher = jest.fn(),
    pending = voiceRequest("analyze", {}, controller.signal, {
      endpoint: "https://test.invalid",
      user: { getIdToken: () => new Promise(() => {}) },
      fetcher,
    });
  controller.abort();
  await expect(pending).rejects.toHaveProperty("name", "AbortError");
  expect(fetcher).not.toHaveBeenCalled();
});
test("окремий 60-секундний таймаут охоплює також отримання token", async () => {
  jest.useFakeTimers();
  const fetcher = jest.fn(),
    pending = voiceRequest("analyze", {}, null, {
      endpoint: "https://test.invalid",
      user: { getIdToken: () => new Promise(() => {}) },
      fetcher,
    });
  const assertion = expect(pending).rejects.toThrow("client_timeout");
  jest.advanceTimersByTime(60000);
  await assertion;
  expect(fetcher).not.toHaveBeenCalled();
  jest.useRealTimers();
});


test.each([undefined, "auto", "uk", "ru"])(
  "transcribeAudio передає мовну перевагу %s у multipart без аналізу",
  async (language) => {
    const previousEndpoint = process.env.REACT_APP_MEAL_API_URL;
    const previousFetch = global.fetch;
    const controller = new AbortController();
    const audio = new Blob(["synthetic audio"], { type: "audio/wav" });
    process.env.REACT_APP_MEAL_API_URL = "https://test.invalid";
    auth.currentUser = user;
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ text: "Кефір 200 г" }),
    }));
    try {
      await transcribeAudio(audio, 3, controller.signal, language);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, request] = global.fetch.mock.calls[0];
      expect(url).toBe("https://test.invalid/transcribe");
      expect(request.body.get("language")).toBe(language || "auto");
      expect(request.body.get("duration")).toBe("3");
      expect(request.body.get("audio").type).toBe("audio/wav");
      expect(request.body.get("audio").size).toBe(audio.size);
    } finally {
      auth.currentUser = null;
      global.fetch = previousFetch;
      if (previousEndpoint === undefined) delete process.env.REACT_APP_MEAL_API_URL;
      else process.env.REACT_APP_MEAL_API_URL = previousEndpoint;
    }
  },
);

test.each(["transcribe", "analyze"])("ліміт %s має нейтральне повідомлення та збереження чернетки", async (route) => {
  const message = voiceError(Error("upstream_limited"));
  expect(message).not.toContain("Groq");
  expect(message).toMatch(/ліміт/);
  expect(message).toContain("пізніше");
  expect(message).toContain("Чернетка залишилась");
  const fetcher = jest.fn(async () => ({
    ok: false,
    json: async () => ({ error: "upstream_limited" }),
  }));
  await expect(
    voiceRequest(route, new FormData(), null, {
      endpoint: "https://test.invalid", user, fetcher,
    }),
  ).rejects.toHaveProperty("publicMessage", message);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
