// COACH-PROBLEMS-01, K4: GET /meal-api/ops/problems. Запити без заголовка Origin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMealApi } from './api.mjs';
import { createOpsProblems } from './ops-problems.mjs';
import { openProblemJournal } from './trainer/problem-journal.mjs';
import { LOCAL_TRANSCRIBE_MODEL } from '../workers/meal-parser/src/index.js';

const KEY = 'k'.repeat(43), RELEASE = 'c'.repeat(40);
// 2026-03-10 12:00 за Києвом.
const NOW = Date.parse('2026-03-10T10:00:00Z'), DAY = 86400000;
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const data = [{ alg: 'RS256', kid: 'synthetic' }, { iss: 'https://securetoken.google.com/scisense-test', aud: 'scisense-test', sub: 'pilot', iat: now - 10, auth_time: now - 20, exp: now + 300 }]
    .map(x => Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
  return data + '.' + sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url');
}
const env = { ALLOWED_ORIGINS: 'https://ntzg.pp.ua', FIREBASE_PROJECT: 'scisense-test', ALLOWED_UIDS: 'pilot', LIVE_ENABLED: 'true', TRANSCRIBE_MODEL: LOCAL_TRANSCRIBE_MODEL,
  PARSE_MODEL: 'claude-sonnet-5-5', ANTHROPIC_API_KEY: 'synthetic', PRICING_APPROVED_AT: 'synthetic-only', PRICING_MODEL_PAIR: `${LOCAL_TRANSCRIBE_MODEL}|claude-sonnet-5-5`,
  INPUT_MICROS_PER_MTOK: 2, OUTPUT_MICROS_PER_MTOK: 10, PILOT_BUDGET: { idFromName: x => x, get: () => ({ fetch: async () => Response.json({ ok: true }) }) } };

async function fixture(t, { key = KEY, ops = true, provider = async () => ({ items: [], unparsed: ['synthetic'] }), maxConcurrent = 2 } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ops-problems-'))); chmodSync(dir, 0o700);
  let clock = NOW;
  const journal = openProblemJournal(join(dir, 'problems.sqlite'), { release: RELEASE, now: () => clock });
  const api = createMealApi({ env, keyResolver: publicKey, provider, maxConcurrent,
    ops: ops ? createOpsProblems({ problems: journal, tokenHash: key ? createHash('sha256').update(key).digest() : null, releaseId: RELEASE, now: () => clock }) : null });
  const address = await api.listen(0), base = `http://${address.address}:${address.port}`;
  t.after(async () => { await api.close(); journal.close(); rmSync(dir, { recursive: true, force: true }); });
  const get = (path = '/meal-api/ops/problems', { method = 'GET', headers = [['Authorization', 'Bearer ' + KEY]] } = {}) => new Promise((resolve, reject) => {
    const grouped = {};
    for (const [name, value] of headers) (grouped[name] ??= []).push(value);
    const req = httpRequest(base + path, { method, headers: Object.fromEntries(Object.entries(grouped).map(([name, values]) => [name, values.length === 1 ? values[0] : values])) }, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject); req.end();
  });
  return { api, base, journal, get, tick(ms) { clock += ms; } };
}

test('K4 без заголовка, невірний ключ, ключ не налаштований: 401 з однаковим тілом', async t => {
  const f = await fixture(t), none = await fixture(t, { key: null });
  const answers = [await f.get(undefined, { headers: [] }), await f.get(undefined, { headers: [['Authorization', 'Bearer ' + 'x'.repeat(43)]] }),
    await f.get(undefined, { headers: [['Authorization', KEY]] }), await none.get(),
    await f.get(undefined, { headers: [['Authorization', 'Bearer ' + KEY], ['Authorization', 'Bearer ' + KEY]] })];
  for (const answer of answers) { assert.equal(answer.status, 401); assert.equal(answer.text, '{"error":"unauthorized"}'); }
});

test('K4 POST 405; невалідний since, since завтра, зайвий параметр 400', async t => {
  const f = await fixture(t);
  assert.equal((await f.get(undefined, { method: 'POST' })).status, 405);
  for (const query of ['?since=2026-3-01', '?since=2026-02-30', '?since=', '?since', '?since=2026-03-11', '?since=2026-03-01&x=1', '?x=1', '?since=2026-03-01&since=2026-03-02'])
    assert.equal((await f.get('/meal-api/ops/problems' + query)).status, 400, query);
});

test('K4 правильний ключ: 200, рівно поля S3, без CORS; since 40 днів тому обрізається до ретеншну', async t => {
  const f = await fixture(t);
  f.tick(-30 * DAY); f.journal.record('turn_failed', 'trainer_failed');
  f.tick(25 * DAY); f.journal.record('tool_error', 'invalid_food_proposal', 'propose_food_draft');
  f.tick(5 * DAY); f.journal.record('turn_cancelled', 'user_cancel');
  const answer = await f.get();
  assert.equal(answer.status, 200);
  assert.equal(answer.headers['content-type'], 'application/json');
  assert.equal(answer.headers['access-control-allow-origin'], undefined);
  const value = JSON.parse(answer.text);
  assert.deepEqual(Object.keys(value), ['version', 'releaseId', 'generatedAt', 'journal', 'rows']);
  assert.deepEqual({ ...value, rows: undefined }, { version: 1, releaseId: RELEASE, generatedAt: '2026-03-10T10:00Z', journal: { ok: true, writeErrors: 0 }, rows: undefined });
  // За замовчуванням 7 календарних днів включно із сьогодні.
  assert.deepEqual(value.rows.map(r => [r.day, r.category]), [['2026-03-05', 'tool_error'], ['2026-03-10', 'turn_cancelled']]);
  for (const row of value.rows) assert.deepEqual(Object.keys(row), ['day', 'release', 'category', 'code', 'tool', 'count', 'firstAt', 'lastAt']);
  const old = JSON.parse((await f.get('/meal-api/ops/problems?since=2026-01-29')).text);
  assert.deepEqual(old.rows.map(r => r.day), ['2026-02-08', '2026-03-05', '2026-03-10']);
  assert.equal((await f.get('/meal-api/ops/problems?since=2026-03-10')).status, 200);
});

test('K4 ліміт: 100 невірних ключів не вичерпують; 31-й запит з правильним ключем за годину 429', async t => {
  const f = await fixture(t);
  for (let n = 0; n < 100; n++) assert.equal((await f.get(undefined, { headers: [['Authorization', 'Bearer ' + 'w'.repeat(43)]] })).status, 401);
  assert.equal((await f.get()).status, 200);
  assert.equal((await f.get('/meal-api/ops/problems?x=1')).status, 400);
  for (let n = 3; n <= 30; n++) assert.equal((await f.get()).status, 200, String(n));
  assert.equal((await f.get()).status, 429);
  f.tick(60 * 60000 + 1);
  assert.equal((await f.get()).status, 200);
});

test('K4 усі слоти maxConcurrent зайняті: читання все одно 200', async t => {
  let started; const entered = new Promise(resolve => { started = resolve; });
  let finish; const hold = new Promise(resolve => { finish = resolve; });
  const f = await fixture(t, { maxConcurrent: 1, provider: async () => { started(); await hold; return { items: [], unparsed: ['synthetic'] }; } });
  const busy = fetch(f.base + '/meal-api/analyze', { method: 'POST', body: JSON.stringify({ text: 'synthetic', images: [] }),
    headers: { Origin: 'https://ntzg.pp.ua', Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' } });
  await entered;
  const blocked = await fetch(f.base + '/meal-api/analyze', { method: 'POST', body: '{}', headers: { Origin: 'https://ntzg.pp.ua', Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' } });
  assert.equal(blocked.status, 429);
  assert.equal((await f.get()).status, 200);
  finish(); assert.equal((await busy).status, 200);
});

test('K4 без ops (liveEnabled=false чи v2): маршрут 404, як зараз', async t => {
  const off = await fixture(t, { ops: false });
  const answer = await off.get();
  assert.equal(answer.status, 404);
  assert.equal(answer.text, '{"error":"not_found"}');
});
