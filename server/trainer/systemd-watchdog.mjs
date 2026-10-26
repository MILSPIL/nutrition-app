import { spawn } from 'node:child_process';
// Helper remains in this API service cgroup. It cannot generate a heartbeat
// while this JavaScript event loop is paused, even though the helper is awake.
export function startSystemdWatchdog({ script = '/opt/scisense/personal/adapters/hermes_notify_helper.py', spawnHelper = spawn } = {}) {
  if (!process.env.NOTIFY_SOCKET) throw Error('watchdog_required');
  const child = spawnHelper('/usr/bin/python3', [script], { stdio: ['pipe', 'ignore', 'ignore'], env: { NOTIFY_SOCKET: process.env.NOTIFY_SOCKET, PATH: '/usr/bin:/bin' } });
  let timer, ready = false, closed = false;
  const failed = () => { clearInterval(timer); child.stdin?.destroy(); if (!closed) process.exitCode = 1; };
  child.on('error', failed); child.on('exit', failed); child.stdin.on('error', failed);
  return Object.freeze({
    ready() { if (closed || ready || !child.stdin.writable) throw Error('watchdog_unavailable'); ready = true; child.stdin.write('R'); timer = setInterval(() => { if (child.stdin.writableLength > 4) return failed(); child.stdin.write('W'); }, 400); timer.unref(); },
    close() { closed = true; clearInterval(timer); child.stdin.end(); },
  });
}
