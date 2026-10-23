// Медіа живуть лише в пам’яті поточної чернетки.
export function createRecorder(
  callbacks,
  platform = {
    devices: navigator.mediaDevices,
    Recorder: window.MediaRecorder,
  },
) {
  let closed = false,
    stream,
    recorder,
    interval,
    permissionTimer,
    started,
    bytes = 0;
  const chunks = [];
  const stopTracks = () => stream?.getTracks().forEach((track) => track.stop());
  const clearTimers = () => {
    clearInterval(interval);
    clearTimeout(permissionTimer);
  };
  const fail = (error) => {
    const notify = !closed;
    closed = true;
    clearTimers();
    if (recorder && recorder.state !== "inactive") recorder.stop();
    stopTracks();
    chunks.length = 0;
    if (notify) callbacks.onError(error);
  };
  const stop = () => {
    if (recorder?.state === "recording") {
      clearInterval(interval);
      recorder.stop();
      stopTracks();
    }
  };
  return {
    async start() {
      if (!platform.devices?.getUserMedia || !platform.Recorder)
        return fail(Error("microphone_unsupported"));
      callbacks.onState("permission");
      permissionTimer = setTimeout(() => {
        if (!closed) callbacks.onWaiting();
      }, 20000);
      try {
        stream = await platform.devices.getUserMedia({ audio: true });
        clearTimeout(permissionTimer);
        if (closed) {
          stopTracks();
          return;
        }
        const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
          (x) => platform.Recorder.isTypeSupported?.(x),
        );
        recorder = new platform.Recorder(
          stream,
          mime ? { mimeType: mime } : undefined,
        );
        recorder.ondataavailable = (event) => {
          if (closed || !event.data?.size) return;
          bytes += event.data.size;
          if (bytes > 10 * 1024 * 1024) {
            fail(Error("audio_too_large"));
            if (recorder.state !== "inactive") recorder.stop();
            return;
          }
          chunks.push(event.data);
        };
        recorder.onerror = () => fail(Error("recording_failed"));
        recorder.onstop = () => {
          clearTimers();
          stopTracks();
          if (closed) return;
          const blob = new Blob(chunks, {
            type: recorder.mimeType || chunks[0]?.type || "",
          });
          chunks.length = 0;
          if (!blob.size) return fail(Error("empty_transcript"));
          callbacks.onStop(blob, Math.min(90, (Date.now() - started) / 1000));
        };
        started = Date.now();
        recorder.start(250);
        callbacks.onState("recording");
        interval = setInterval(() => {
          callbacks.onTime(Math.floor((Date.now() - started) / 1000));
          if (Date.now() - started >= 89000) stop();
        }, 250);
      } catch (error) {
        fail(error);
      }
    },
    stop,
    cancel() {
      closed = true;
      clearTimers();
      if (recorder && recorder.state !== "inactive") recorder.stop();
      stopTracks();
      chunks.length = 0;
    },
  };
}

export function encodeWav(buffer) {
  if (!(buffer.duration > 0 && buffer.duration <= 90))
    throw Error("invalid_audio_duration");
  const rate = 16000,
    samples = Math.floor(buffer.duration * rate),
    bytes = new ArrayBuffer(44 + samples * 2),
    view = new DataView(bytes);
  const text = (at, value) =>
    [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
    buffer.getChannelData(i),
  );
  for (let i = 0; i < samples; i++) {
    const at = (i * buffer.sampleRate) / rate,
      left = Math.floor(at),
      right = Math.min(left + 1, buffer.length - 1);
    let value = 0;
    for (const channel of channels)
      value += channel[left] + (channel[right] - channel[left]) * (at - left);
    value = Math.max(-1, Math.min(1, value / channels.length));
    view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true);
  }
  return new Blob([bytes], { type: "audio/wav" });
}
export async function normalizeAudio(blob) {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) throw Error("audio_decode_failed");
  const context = new Audio();
  try {
    return encodeWav(await context.decodeAudioData(await blob.arrayBuffer()));
  } catch (_) {
    throw Error("audio_decode_failed");
  } finally {
    await context.close();
  }
}

export async function normalizePhoto(file) {
  if (!file || file.size > 20 * 1024 * 1024) throw Error("photo_too_large");
  const url = URL.createObjectURL(file);
  let image;
  try {
    image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(Error("photo_decode_failed"));
      img.src = url;
    });
    if (
      !image.naturalWidth ||
      image.naturalWidth * image.naturalHeight > 50000000
    )
      throw Error("photo_too_large");
    const ratio = Math.min(
      1,
      1600 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * ratio);
    canvas.height = Math.round(image.naturalHeight * ratio);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.88),
      data = dataUrl.split(",")[1];
    if (!data || data.length > Math.ceil((5 * 1024 * 1024) / 3) * 4)
      throw Error("photo_too_large");
    return { type: "image/jpeg", data, preview: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}
