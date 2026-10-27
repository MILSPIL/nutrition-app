// Synthetic Linux fixtures only. Never retain stderr, transcript or media in reports.
export function createDiagnostics() {
  const state = {stdinFinished: false, audioReadBytes: null, stderrBytes: 0, stdoutBytes: 0, exitCode: null, exitSignal: null};
  let tail = '';
  return {
    stdinFinished() { state.stdinFinished = true; },
    stdout(chunk) { state.stdoutBytes += chunk.length; },
    stderr(chunk) {
      state.stderrBytes += chunk.length;
      const text = tail + chunk.toString('utf8');
      const marker = /(?:^|\n)read_audio_data: read ([0-9]{1,8}) bytes from stdin(?:\r?\n|$)/g;
      for (const match of text.matchAll(marker)) state.audioReadBytes = Number(match[1]);
      tail = text.slice(-128);
    },
    closed(code, signal) {
      state.exitCode = Number.isInteger(code) ? code : null;
      state.exitSignal = ['SIGTERM', 'SIGKILL', 'SIGABRT', 'SIGSEGV'].includes(signal) ? signal : null;
      tail = '';
    },
    snapshot() { return {...state}; },
  };
}

export function cpuUsageDeltaMs(before, after) {
  const read = text => {
    const match = /^usage_usec ([0-9]+)$/m.exec(text);
    const value = match ? Number(match[1]) : NaN;
    return Number.isSafeInteger(value) ? value : null;
  };
  const start = read(before), end = read(after);
  return start !== null && end !== null && end >= start ? Math.round((end - start) / 1000) : null;
}
