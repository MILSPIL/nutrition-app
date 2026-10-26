import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { connect } from 'node:net';
import { constants, lstatSync, realpathSync, openSync, closeSync, fstatSync, readSync, statfsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const roles = new Set(['y', 'w', 'payer']);
const invalid = () => { throw Error('personal_launcher_invalid'); };
function trusted(path, directory) {
  const s = lstatSync(path);
  if (s.uid !== 0 || s.mode & 0o022 || realpathSync(path) !== path || (directory ? !s.isDirectory() : !s.isSocket())) invalid();
}
export function captureServiceCgroup({ role, cgroup, invocation, type, version }, { root = '/sys/fs/cgroup', slice = 'scisense.slice' } = {}) {
  if (!roles.has(role) || type !== 'scisense-service' || version !== 1 || !/^[a-f0-9]{32}$/.test(invocation || '') ||
      typeof cgroup !== 'string' || !new RegExp('^/' + slice.replace('.', '\\.') + '/scisense-' + role + '@[A-Za-z0-9_.:!\\\\-]+\\.service$').test(cgroup)) invalid();
  const path = join(root, cgroup), parent = dirname(path);
  trusted(root, true); trusted(parent, true); trusted(path, true);
  if (statfsSync(root).type !== 0x63677270) invalid();
  const rootIdentity=lstatSync(root),parentIdentity=lstatSync(parent);
  let dir, events;
  try {
    dir = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const identity = fstatSync(dir), actual = lstatSync(path);
    if (identity.uid !== 0 || identity.ino !== actual.ino || identity.dev !== actual.dev) invalid();
    events = openSync('/proc/self/fd/' + dir + '/cgroup.events', constants.O_RDONLY | constants.O_NOFOLLOW);
    const e = fstatSync(events);
    if (e.uid !== 0 || !e.isFile() || e.dev !== identity.dev) invalid();
    let closed = false;
    return Object.freeze({
      empty() {
        if (closed) invalid();
        try {
          const current = fstatSync(dir);
          if (current.ino !== identity.ino || current.dev !== identity.dev || current.uid !== 0) invalid();
          const buffer = Buffer.alloc(4096), length = readSync(events, buffer, 0, buffer.length, 0);
          const text = buffer.subarray(0, length).toString('ascii');
          if (!/^populated [01]$/m.test(text)) invalid();
          return /^populated 0$/m.test(text);
        } catch (error) {
          if (error.code !== 'ENODEV') throw error;
          // kernfs returns ENODEV on the still-held descriptor after removal.
          // cgroup_destroy_locked refuses populated/online descendants before
          // deactivating these nodes. Require the same healthy root/parent AND
          // removal of this captured inode, never a bare pathname ENOENT.
          trusted(root,true);trusted(parent,true);
          const r=lstatSync(root),p=lstatSync(parent);
          if(r.dev!==rootIdentity.dev||r.ino!==rootIdentity.ino||p.dev!==parentIdentity.dev||p.ino!==parentIdentity.ino||statfsSync(root).type!==0x63677270)invalid();
          try {
            const replacement=lstatSync(path);
            if(replacement.ino===identity.ino&&replacement.dev===identity.dev)return false;
            trusted(path,true);return true;
          }catch(missing){if(missing.code==='ENOENT')return true;throw missing;}
        }
      },
      close() { if (!closed) { closed = true; closeSync(events); closeSync(dir); } },
    });
  } catch (error) { if (events !== undefined) closeSync(events); if (dir !== undefined) closeSync(dir); throw error; }
}

// Synchronous construction, asynchronous activation. From the first connect
// attempt onward only captured kernel cgroup drain may emit the exit event.
export function verifyLauncherSocket(socketPath, brokerGid) {
  if (!Number.isInteger(brokerGid) || brokerGid <= 0) invalid();
  trusted(dirname(socketPath), true);
  const parent = lstatSync(dirname(socketPath)), socket = lstatSync(socketPath);
  if (parent.gid !== brokerGid || (parent.mode & 0o777) !== 0o710 || socket.uid !== 0 || socket.gid !== brokerGid ||
      (socket.mode & 0o777) !== 0o660 || !socket.isSocket() || realpathSync(socketPath) !== socketPath) invalid();
}

export function createSystemdProcess({ socketPath, role, brokerGid, verifySocket, capture = captureServiceCgroup, connectSocket = connect, pollMs = 50, handshakeMs = 4000 }) {
  if (!roles.has(role) || typeof socketPath !== 'string' || !socketPath.startsWith('/') || !Number.isInteger(pollMs) || pollMs < 1 || pollMs > 1000) invalid();
  const child = new EventEmitter();
  child.requiresPhysicalDrain = true;
  child.stdin = new PassThrough({ highWaterMark: 65536 });
  child.stdout = new PassThrough({ highWaterMark: 65536 });
  let socket, guard, timer, poll, failed = false, exited = false, stopped = false;
  child.stdin.on('error', () => fail());
  child.stdout.on('error', () => fail());
  const fail = () => {
    if (!failed) { failed = true; child.emit('error', Error('trainer_unavailable')); }
    socket?.destroy();
  };
  function checkDrain() {
    if (exited || !guard) return;
    try {
      if (!guard.empty()) return;
      exited = true; clearInterval(poll); clearTimeout(timer); guard.close();
      socket?.destroy(); child.stdin.destroy(); child.stdout.end(); child.emit('exit', null, 'SIGKILL');
    } catch { fail(); /* unknown physical state remains quarantined */ }
  }
  child.kill = () => { stopped = true; socket?.destroy(); checkDrain(); return true; };
  queueMicrotask(() => {
    try {
      if (stopped) return fail();
      if (verifySocket) verifySocket(socketPath); else verifyLauncherSocket(socketPath, brokerGid);
      socket = connectSocket({ path: socketPath });
      socket.on('error', fail);
      socket.once('close', () => { clearTimeout(timer); child.stdout.end(); checkDrain(); });
      timer = setTimeout(fail, handshakeMs); timer.unref();
      let prelude = Buffer.alloc(0);
      const attest = chunk => {
        prelude = Buffer.concat([prelude, chunk]);
        const end = prelude.indexOf(10);
        if (end < 0) { if (prelude.length > 8192) fail(); return; }
        if (end > 8192) return fail();
        try {
          const value = JSON.parse(prelude.subarray(0, end));
          if (value.role !== role) invalid();
          guard = capture(value); // capture inode/events before ACK can spawn Native
          poll = setInterval(checkDrain, pollMs); poll.unref();
          clearTimeout(timer); socket.removeListener('data', attest);
          socket.write(JSON.stringify({ type: 'scisense-launch', invocation: value.invocation }) + '\n');
          const rest = Buffer.from(prelude.subarray(end + 1)); if (rest.length) child.stdout.write(rest);
          prelude.fill(0); prelude = Buffer.alloc(0);
          child.stdin.pipe(socket); socket.pipe(child.stdout);
        } catch { fail(); }
      };
      socket.on('data', attest);
    } catch { fail(); }
  });
  return child;
}
