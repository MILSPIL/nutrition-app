import { voiceRequest } from "./voiceApi";
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
