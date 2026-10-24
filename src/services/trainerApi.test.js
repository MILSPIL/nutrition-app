jest.mock("../firebase", () => ({ auth: { currentUser: null } }));
import { createTrainerApi } from "./trainerApi";
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
