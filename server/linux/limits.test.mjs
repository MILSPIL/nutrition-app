import test from 'node:test';
import assert from 'node:assert/strict';
import {parseThreads, limitsEnforced} from './limits.mjs';
const twoGiB = String(2 * 1024 ** 3);

test('the default remains one CPU; only explicit one/two CPU trials are accepted', () => {
  assert.equal(parseThreads(), 1);
  assert.equal(parseThreads('1'), 1);
  assert.equal(parseThreads('2'), 2);
  for (const invalid of ['0', '3', '-1', '1.5', '02', '2.0', '2foo', '', 'max']) {
    assert.throws(() => parseThreads(invalid), /test_cpu_count/);
  }
});

test('measured CPU quota must match the requested threads without changing RAM', () => {
  assert.equal(limitsEnforced('100000 100000', twoGiB, 1, 'normal'), true);
  assert.equal(limitsEnforced('200000 100000', twoGiB, 2, 'normal'), true);
  assert.equal(limitsEnforced('100000 100000', twoGiB, 2, 'normal'), false);
  assert.equal(limitsEnforced('200000 100000', twoGiB, 1, 'normal'), false);
  for (const invalid of ['max 100000', '0 100000', '200000 0', '300000 100000', '200000 100000 extra']) {
    assert.equal(limitsEnforced(invalid, twoGiB, 2, 'normal'), false);
  }
  for (const invalid of ['max', String(1024 ** 3), String(4 * 1024 ** 3)]) {
    assert.equal(limitsEnforced('200000 100000', invalid, 2, 'normal'), false);
  }
});

test('negative controls keep their existing RAM limits on both CPU settings', () => {
  for (const threads of [1, 2]) {
    const cpuMax = `${threads * 100000} 100000`;
    for (const mode of ['abort', 'timeout', 'concurrency']) {
      assert.equal(limitsEnforced(cpuMax, twoGiB, threads, mode), true);
      assert.equal(limitsEnforced(cpuMax, String(256 * 1024 ** 2), threads, mode), false);
    }
    assert.equal(limitsEnforced(cpuMax, String(256 * 1024 ** 2), threads, 'oom'), true);
    assert.equal(limitsEnforced(cpuMax, twoGiB, threads, 'oom'), false);
  }
});
