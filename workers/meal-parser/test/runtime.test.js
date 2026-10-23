import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare';

test('workerd SQLite: атомарний ліміт, бюджет і маркери переживають справжній restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'scisense-budget-'));
  const source = await readFile(new URL('../src/budget.js', import.meta.url), 'utf8');
  const options = {
    modules: true,
    script: source + '\nexport default { fetch() { return new Response("local fixture"); } };',
    compatibilityDate: '2026-10-19',
    host: '127.0.0.1', port: 0,
    log: new Log(LogLevel.ERROR), cf: false, telemetry: { enabled: false },
    bindings: { PILOT_BUDGET_MICROS: '300' },
    durableObjects: { PILOT_BUDGET: { className: 'PilotBudget', useSQLite: true } },
    resourcePersistencePath: directory,
    outboundService: () => { throw Error('Мережа заборонена в тесті'); },
  };
  let mf;
  const object = async () => {
    const ns = await mf.getDurableObjectNamespace('PILOT_BUDGET');
    return ns.get(ns.idFromName('pilot-v1'));
  };
  const send = (stub, body) => stub.fetch('https://budget.local/', { method: 'POST', body: JSON.stringify(body) });
  const reserve = (id, uid = 'a'.repeat(64), cost = 100) => ({ action: 'reserve', id, uid, cost });
  try {
    mf = new Miniflare(convertV4MiniflareOptions(options));
    let stub = await object();
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    const responses = await Promise.all(ids.map(id => send(stub, reserve(id))));
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 200, 429]);
    const accepted = ids.filter((_, i) => responses[i].status === 200);
    for (const id of accepted) assert.equal((await send(stub, { action: 'finish', id })).status, 200);
    await mf.dispose();
    mf = new Miniflare(convertV4MiniflareOptions(options));
    stub = await object();
    assert.equal((await send(stub, reserve(accepted[0]))).status, 409);
    assert.equal((await send(stub, reserve(crypto.randomUUID(), 'b'.repeat(64)))).status, 200);
    const exhausted = await send(stub, reserve(crypto.randomUUID(), 'c'.repeat(64), 1));
    assert.equal(exhausted.status, 429);
    assert.equal((await exhausted.json()).error, 'budget_exhausted');
  } finally {
    try { await mf?.dispose(); } finally { await rm(directory, { recursive: true, force: true }); }
  }
});
