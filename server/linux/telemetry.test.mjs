import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiagnostics, cpuUsageDeltaMs} from './telemetry.mjs';

test('diagnostics persist only counters and allowlisted state, including split chunks', () => {
  const d = createDiagnostics();
  d.stdinFinished();
  d.stderr(Buffer.from('private synthetic transcript\nread_audio_data: read 160'));
  d.stderr(Buffer.from('044 bytes from stdin\nprivate trailing text'));
  d.stdout(Buffer.from('private result'));
  d.closed(null, 'SIGTERM');
  assert.deepEqual(d.snapshot(), {stdinFinished: true, audioReadBytes: 160044, stderrBytes: 96, stdoutBytes: 14, exitCode: null, exitSignal: 'SIGTERM'});
  assert.equal(JSON.stringify(d.snapshot()).includes('private'), false);
});

test('missing markers and arbitrary stderr or signals cannot become report text', () => {
  const d = createDiagnostics();
  d.stderr(Buffer.from('read_audio_data: read secret bytes from stdin\n' + 'secret'.repeat(10000)));
  d.closed(0, 'secret');
  assert.equal(d.snapshot().audioReadBytes, null);
  assert.equal(d.snapshot().exitCode, 0);
  assert.equal(d.snapshot().exitSignal, null);
  assert.equal(JSON.stringify(d.snapshot()).includes('secret'), false);
});

test('CPU usage is a measured delta; missing or reset counters remain unknown', () => {
  assert.equal(cpuUsageDeltaMs('usage_usec 1000000\nuser_usec 0', 'usage_usec 91000000\nuser_usec 80000000'), 90000);
  for (const [before, after] of [['unavailable', 'usage_usec 5'], ['usage_usec 6', 'usage_usec 5'], ['usage_usec 0', 'usage_usec 9007199254740992']]) {
    assert.equal(cpuUsageDeltaMs(before, after), null);
  }
});
