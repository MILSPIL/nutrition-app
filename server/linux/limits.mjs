// Only the baseline and the explicitly approved synthetic 2-CPU trial are allowed.
export function parseThreads(value = '1') {
  if (!['1', '2'].includes(value)) throw Error('test_cpu_count');
  return Number(value);
}

export function limitsEnforced(cpuMax, memoryMax, threads, mode) {
  const cpu = cpuMax.trim().split(/\s+/).map(Number);
  return [1, 2].includes(threads) && cpu.length === 2 &&
    cpu.every(Number.isSafeInteger) && cpu[0] > 0 && cpu[1] > 0 &&
    cpu[0] === cpu[1] * threads &&
    Number(memoryMax) === (mode === 'oom' ? 256 : 2048) * 1024 * 1024;
}
