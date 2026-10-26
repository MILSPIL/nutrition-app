jest.mock("../firebase", () => ({ auth: { currentUser: null } }));
import { createTrainerApi, trainerError, trainerFeedback } from "./trainerApi";
test("owner switch while obtaining token cannot send previous owner payload", async () => {
  let uid = "first";
  const fetcher = jest.fn(),
    api = createTrainerApi("first", {
      endpoint: "/meal-api",
      fetcher,
      getUser: () => ({
        uid,
        getIdToken: async () => {
          uid = "second";
          return "synthetic";
        },
      }),
    });
  await expect(api.send({ text: "synthetic" })).rejects.toThrow("unauthorized");
  expect(fetcher).not.toHaveBeenCalled();
});
test("trainer request is no-store and targets only its route", async () => {
  const fetcher = jest.fn(async () => ({
    ok: true,
    json: async () => ({ messages: [] }),
  }));
  const api = createTrainerApi("synthetic", {
    endpoint: "/meal-api",
    fetcher,
    getUser: () => ({ uid: "synthetic", getIdToken: async () => "synthetic" }),
  });
  await api.state();
  expect(fetcher.mock.calls[0][0]).toBe("/meal-api/trainer/state");
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    method: "GET",
    cache: "no-store",
  });
});

test('context size error is accurate and concrete failure replaces generic recovery', () => {
 const turn={state:'failed',error:'context_too_large'};
 const text=trainerFeedback({clientCode:'trainer_unavailable',turn});
 expect(text).toContain('контекст');expect(text).not.toContain('незавершених чернеток');
 expect(trainerFeedback({localMessage:trainerError(Error('client_timeout')),turn})).toBe(text);
 expect(trainerFeedback({localMessage:'Оберіть фото потрібного продукту.',turn})).toBe('Оберіть фото потрібного продукту.');
 expect(trainerFeedback({clientCode:'history_conflict',turn})).toContain('іншій вкладці');
 expect(trainerFeedback({turn:{state:'completed'}})).toBe('');
});


test("specific native photo failure takes precedence over generic retry text", () => {
  const result = trainerFeedback({ clientCode: "trainer_unavailable", turn: { state: "failed", error: "media_quota" } });
  expect(result).toContain("Місце для фото"); expect(result).toContain("цього профілю");
  expect(trainerError(Error("media_unsupported"))).toContain("Вибрана в Hermes модель не підтримує фото");
});
