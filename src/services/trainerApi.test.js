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


test("native state connects only the current own Firebase session and never requests a model login", async () => {
 const fetcher=jest.fn(async url=>({ok:true,json:async()=>url.endsWith("/state")?{messages:[],dataSession:{phase:"reauth_required"}}:{phase:"connected"}}));
 const api=createTrainerApi("owner",{endpoint:"/meal-api",fetcher,getUser:()=>({uid:"owner",refreshToken:"synthetic-own-refresh",getIdToken:async()=>"synthetic"})});
 expect((await api.state()).dataSession.phase).toBe("connected");
 expect(fetcher.mock.calls).toHaveLength(2);expect(fetcher.mock.calls[1][0]).toBe("/meal-api/trainer/data-session");
 expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({refreshToken:"synthetic-own-refresh"});
});
test("data auth recovery deduplicates connection and retries the same unadmitted request once", async () => {
 let connected=false; const bodies=[];
 const fetcher=jest.fn(async(url,options)=>{
  if(url.endsWith("/data-session")){await Promise.resolve();connected=true;return {ok:true,json:async()=>({phase:"connected"})};}
  bodies.push(options.body);return {ok:connected,status:connected?202:401,json:async()=>connected?{state:"queued"}:{error:"data_auth_required"}};
 });
 const api=createTrainerApi("owner",{endpoint:"/meal-api",fetcher,getUser:()=>({uid:"owner",refreshToken:"synthetic-own-refresh",getIdToken:async()=>"synthetic"})});
 await Promise.all([api.send({turnId:"same-1",text:"own food"}),api.send({turnId:"same-2",text:"own food 2"})]);
 expect(fetcher.mock.calls.filter(([url])=>url.endsWith("/data-session"))).toHaveLength(1);
 expect(bodies.filter(x=>JSON.parse(x).turnId==="same-1")).toEqual([JSON.stringify({turnId:"same-1",text:"own food"}),JSON.stringify({turnId:"same-1",text:"own food"})]);
});
test("UID switch during Firebase delegation cannot send the previous refresh token", async () => {
 let uid="owner",tokenCalls=0;
 const fetcher=jest.fn(async()=>({ok:true,json:async()=>({dataSession:{phase:"reauth_required"}})}));
 const api=createTrainerApi("owner",{endpoint:"/meal-api",fetcher,getUser:()=>({uid,refreshToken:"synthetic-own-refresh",getIdToken:async()=>{if(++tokenCalls===2)uid="wife";return "synthetic";}})});
 await expect(api.state()).rejects.toThrow("unauthorized");expect(fetcher).toHaveBeenCalledTimes(1);
});

test("model failures and unknown execution never become a misleading connection instruction", () => {
  for (const code of ["trainer_failed", "trainer_timeout", "trainer_quota", "model_payload_invalid", "execution_unknown"]) {
    expect(trainerError(Error(code))).not.toContain("Перевірте з’єднання");
    if (code === "execution_unknown") expect(trainerError(Error(code))).not.toContain("повторіть");
  }
  expect(trainerFeedback({ clientCode: "client_timeout", turn: { state: "unknown", error: "execution_unknown" } })).toContain("не підтверджене");
});

test("an actual network failure has its own recovery message", async () => {
  const api = createTrainerApi("synthetic", { endpoint: "/meal-api", fetcher: async () => { throw TypeError("Failed to fetch"); },
    getUser: () => ({ uid: "synthetic", getIdToken: async () => "synthetic" }) });
  await expect(api.state()).rejects.toThrow("network_unavailable");
  expect(trainerError(Error("network_unavailable"))).toContain("мережу");
});
test("1.9.10 K11: sending photos waits longer than ordinary requests, other requests keep 15 s", async () => {
  jest.useFakeTimers();
  try {
    const fetcher = jest.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(Object.assign(Error("aborted"), { name: "AbortError" })), { once: true })));
    const api = createTrainerApi("synthetic", { endpoint: "/meal-api", fetcher, getUser: () => ({ uid: "synthetic", getIdToken: async () => "synthetic" }) });
    const outcome = promise => { const box = { settled: false }; promise.then(() => { box.settled = true; }, error => { box.settled = true; box.error = error; }); return box; };
    const flush = async () => { for (let n = 0; n < 10; n++) await Promise.resolve(); };
    const images = Array.from({ length: 10 }, () => ({ type: "image/jpeg", data: "synthetic" }));
    const photos = outcome(api.send({ turnId: "synthetic-turn", baseRevision: 0, text: "Обід", images }));
    const plain = outcome(api.state());
    await flush(); jest.advanceTimersByTime(15001); await flush();
    expect(plain.error?.message).toBe("client_timeout");
    expect(photos.settled).toBe(false);
    jest.advanceTimersByTime(75000 - 15001 - 1); await flush();
    expect(photos.settled).toBe(false);
    jest.advanceTimersByTime(2); await flush();
    expect(photos.error?.message).toBe("client_timeout");
  } finally { jest.useRealTimers(); }
});
test("1.9.10 K12c: a turn the server closed without a reply has its own text", () => {
  expect(trainerError(Error("trainer_no_reply"))).toBe("Тренер не відповів на це повідомлення. Поверніть текст кнопкою нижче й надішліть ще раз.");
  expect(trainerError(Error("trainer_stop_retrying"))).toBe("Тренер не відповідає. Сервер зупиняє обробку сам; чат звільниться без вашої дії.");
});
