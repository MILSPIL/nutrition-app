import { lstatSync, realpathSync, readdirSync, unlinkSync } from 'node:fs';
// This tree contains only raw, uncommitted uploads. Native retained history is
// under separate UIDs/HOMEs and is never visited here. A monotonic deadline
// avoids retaining a known file longer when the wall clock moves backwards.
export function createPersonalEphemeralSweeper(paths, profiles, { wall = Date.now, monotonic = () => performance.now(), intervalMs = 5000, ttlMs = 295000, onFault = () => {} } = {}) {
  if (!paths.ephemeralRoot || !Number.isInteger(intervalMs) || intervalMs < 1 || intervalMs > 5000 || !Number.isInteger(ttlMs) || ttlMs <= 0 || ttlMs + intervalMs > 300000) throw Error('personal_ephemeral_invalid');
  const seen = new Map(); let closed = false, faulted = false;
  const tick = () => {
    const current = new Set(); let removed = 0, faults = 0;
    for (const { uid } of profiles.entries()) {
      try {
        const directory = paths.account(uid).media, parent = lstatSync(directory);
        if (realpathSync(directory) !== directory || !parent.isDirectory() || parent.uid !== process.getuid() || parent.mode & 0o077) throw Error();
        const names = readdirSync(directory); if (names.length > 1000) throw Error();
        for (const name of names) {
          try {
            const file = directory + '/' + name, info = lstatSync(file);
            if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || info.nlink !== 1 || info.mode & 0o077) throw Error();
            const key = file + ':' + info.dev + ':' + info.ino; current.add(key);
            if (!seen.has(key)) seen.set(key, monotonic() + Math.max(0, ttlMs - Math.max(0, wall() - info.mtimeMs)));
            if (monotonic() >= seen.get(key)) { unlinkSync(file); seen.delete(key); removed++; }
          } catch { faults++; }
        }
      } catch { faults++; }
    }
    for (const key of seen.keys()) if (!current.has(key)) seen.delete(key);
    if (faults && !faulted) { faulted = true; try { onFault(); } catch {} }
    return { removed, faults };
  };
  tick(); const timer = setInterval(tick, intervalMs); timer.unref();
  return Object.freeze({ tick, get faulted() { return faulted; }, close() { if (!closed) { closed = true; clearInterval(timer); seen.clear(); } } });
}
