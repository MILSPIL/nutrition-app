// Only the explicitly approved Free account, no automatic paid/model fallback.
export const GROQ_MODEL = 'whisper-large-v3';
export function groqFreeApproved(env) {
  const approved = Date.parse(env.GROQ_FREE_APPROVED_AT || '');
  return env.TRANSCRIBE_PROVIDER === 'groq' && env.TRANSCRIBE_MODEL === GROQ_MODEL &&
    env.GROQ_ACCOUNT_TIER === 'free' && Number.isFinite(approved) && approved <= Date.now();
}
export function transcriptionLanguage(value = 'auto') {
  if (!['auto', 'uk', 'ru'].includes(value)) throw Object.assign(Error('invalid_audio'), {status: 400});
  return value;
}
// Cap the decoded response, including chunked responses without Content-Length.
export async function limitedJson(response, signal, max = 65536) {
  const reader = response.body?.getReader();
  if (!reader) throw Error('invalid_response');
  let total = 0; const chunks = [];
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, {once: true});
  try {
    if (Number(response.headers.get('content-length')) > max) throw Error('invalid_response');
    while (true) {
      if (signal.aborted) throw Error('upstream_timeout');
      const {value, done} = await reader.read();
      if (signal.aborted) throw Error('upstream_timeout');
      if (done) break;
      total += value.byteLength;
      if (total > max) throw Error('invalid_response');
      chunks.push(value);
    }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
    catch { throw Error('invalid_response'); }
  } finally {
    signal.removeEventListener('abort', abort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
