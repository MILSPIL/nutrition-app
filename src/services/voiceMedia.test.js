import { createRecorder, encodeWav } from "./voiceMedia";
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const callbacks = () =>
  Object.fromEntries(
    ["onState", "onWaiting", "onError", "onStop", "onTime"].map((k) => [
      k,
      jest.fn(),
    ]),
  );
let recording;
class Recorder {
  static isTypeSupported(type) {
    return type === "audio/mp4";
  }
  constructor(stream, options) {
    this.mimeType = options?.mimeType;
    this.state = "inactive";
    recording = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["sound"], { type: this.mimeType }),
    });
    this.onstop?.();
  }
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
test("пізній дозвіл після закриття зупиняє трек і не створює запис", async () => {
  const pending = deferred(),
    stop = jest.fn(),
    cb = callbacks(),
    r = createRecorder(cb, {
      devices: { getUserMedia: () => pending.promise },
      Recorder,
    });
  const starting = r.start();
  r.cancel();
  pending.resolve({ getTracks: () => [{ stop }] });
  await starting;
  expect(stop).toHaveBeenCalled();
  expect(cb.onStop).not.toHaveBeenCalled();
  expect(cb.onState).toHaveBeenCalledTimes(1);
});
test("20 с очікування не є відмовою, пізній дозвіл можна скасувати", async () => {
  const pending = deferred(),
    cb = callbacks(),
    r = createRecorder(cb, {
      devices: { getUserMedia: () => pending.promise },
      Recorder,
    });
  const starting = r.start();
  jest.advanceTimersByTime(20000);
  expect(cb.onWaiting).toHaveBeenCalledTimes(1);
  expect(cb.onError).not.toHaveBeenCalled();
  r.cancel();
  pending.resolve({ getTracks: () => [{ stop: jest.fn() }] });
  await starting;
});
test("відмова дозволу має окрему помилку без їжі", async () => {
  const cb = callbacks(),
    error = new DOMException("denied", "NotAllowedError");
  await createRecorder(cb, {
    devices: { getUserMedia: () => Promise.reject(error) },
    Recorder,
  }).start();
  expect(cb.onError).toHaveBeenCalledWith(error);
  expect(cb.onStop).not.toHaveBeenCalled();
});
test("Stop повертає підтримуваний MIME і звільняє всі треки", async () => {
  const stops = [jest.fn(), jest.fn()],
    cb = callbacks(),
    r = createRecorder(cb, {
      devices: {
        getUserMedia: async () => ({
          getTracks: () => stops.map((stop) => ({ stop })),
        }),
      },
      Recorder,
    });
  await r.start();
  jest.advanceTimersByTime(1000);
  r.stop();
  expect(cb.onStop).toHaveBeenCalledTimes(1);
  expect(cb.onStop.mock.calls[0][0].type).toBe("audio/mp4");
  expect(cb.onStop.mock.calls[0][1]).toBe(1);
  stops.forEach((stop) => expect(stop).toHaveBeenCalled());
  r.cancel();
});
test("автостоп не продовжує звук понад обмеження", async () => {
  const cb = callbacks(),
    r = createRecorder(cb, {
      devices: {
        getUserMedia: async () => ({ getTracks: () => [{ stop: jest.fn() }] }),
      },
      Recorder,
    });
  await r.start();
  jest.advanceTimersByTime(90000);
  expect(recording.state).toBe("inactive");
  expect(cb.onStop).toHaveBeenCalledTimes(1);
  r.cancel();
});
test("помилка рекордера також зупиняє запис", async () => {
  const cb = callbacks(),
    stop = jest.fn(),
    r = createRecorder(cb, {
      devices: { getUserMedia: async () => ({ getTracks: () => [{ stop }] }) },
      Recorder,
    });
  await r.start();
  recording.onerror();
  expect(recording.state).toBe("inactive");
  expect(stop).toHaveBeenCalled();
  expect(cb.onStop).not.toHaveBeenCalled();
});
test("WAV має перевірювану тривалість і mono PCM16/16k", async () => {
  const blob = encodeWav({
    duration: 1,
    sampleRate: 48000,
    length: 48000,
    numberOfChannels: 2,
    getChannelData: () => new Float32Array(48000).fill(0.5),
  });
  const bytes = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsArrayBuffer(blob);
  });
  const view = new DataView(bytes);
  expect(blob.size).toBe(32044);
  expect(view.getUint32(24, true)).toBe(16000);
  expect(view.getUint16(22, true)).toBe(1);
  expect(view.getUint16(34, true)).toBe(16);
  expect(view.getInt16(44, true)).toBe(16383);
  expect(() => encodeWav({ duration: 91 })).toThrow("invalid_audio_duration");
});
