import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createSystemdProcess } from './systemd-process.mjs';

function fixture({ wrongRole = false, missingAttestation = false } = {}) {
  const socket = new PassThrough(); let empty = false, captured = false, closed = false;
  // Split the duplex directions to avoid echoing client ACK back as IPC.
  const writes = [], rawWrite = socket.write.bind(socket);
  socket.write = chunk => { writes.push(String(chunk)); return true; };
  const child = createSystemdProcess({ socketPath: '/synthetic/y.sock', role: 'y', pollMs: 1, handshakeMs: 10,
    verifySocket() {}, connectSocket() { return socket; },
    capture(value) { assert.equal(value.invocation, 'a'.repeat(32)); captured = true; return { empty: () => empty, close: () => { closed = true; } }; } });
  child.on('error', () => {});
  return { child, writes, get captured() { return captured; }, get closed() { return closed; },
    attest() { if (!missingAttestation) rawWrite(JSON.stringify({ type: 'scisense-service', version: 1, role: wrongRole ? 'w' : 'y', cgroup: '/synthetic', invocation: 'a'.repeat(32) }) + '\n'); },
    drain() { empty = true; }, end() { socket.destroy(); } };
}
test('activation gates setup behind captured cgroup and EOF never proves drain', async () => {
  const f = fixture(); let exited = false;
  f.child.on('exit', () => { exited = true; }); f.child.stdin.write('setup\n');
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(f.writes, []);
  f.attest(); await new Promise(resolve => setImmediate(resolve)); assert.equal(f.captured, true); assert.match(f.writes[0], /scisense-launch/); assert.equal(f.writes[1], 'setup\n');
  f.end(); await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(exited, false);
  f.drain(); await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(exited, true); assert.equal(f.closed, true);
});
for (const mode of ['wrongRole', 'missingAttestation']) test(mode + ' remains physically unknown', async () => {
  const f = fixture({ [mode]: true }); let exited = false;
  f.child.on('exit', () => { exited = true; }); await new Promise(resolve => setImmediate(resolve)); f.attest();
  await new Promise(resolve => setTimeout(resolve, 20)); f.child.kill();
  assert.equal(exited, false); assert.equal(f.captured, false); assert.deepEqual(f.writes, []);
});
