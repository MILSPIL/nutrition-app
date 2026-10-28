import { createHash, timingSafeEqual } from 'node:crypto';
import { kyivDay, shiftDay, minuteStamp, PROBLEM_RETENTION_DAYS } from './trainer/problem-journal.mjs';

// COACH-PROBLEMS-01 S3. Read-only знеособлені лічильники для забору з Mac.
// Ключ перевіряється першим, тож запити з невірним ключем ліміт не вичерпують.
const digest = value => createHash('sha256').update(value).digest();
const validDay = value => { const ms = Date.parse(value + 'T00:00:00Z'); return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value; };
const unauthorized = { status: 401, body: { error: 'unauthorized' } };
export function createOpsProblems({ problems, tokenHash = null, releaseId, now = Date.now, limit = 30, windowMs = 3600000 }) {
  if (!problems || typeof problems.rows !== 'function' || typeof problems.status !== 'function' || typeof releaseId !== 'string' ||
      tokenHash !== null && (!Buffer.isBuffer(tokenHash) || tokenHash.length !== 32)) throw Error('server_config_invalid');
  const hits = [];
  const authorized = header => {
    if (!tokenHash || typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
    const candidate = header.slice(7);
    return candidate.length <= 172 && timingSafeEqual(digest(candidate), tokenHash);
  };
  return Object.freeze({
    handle({ method, url, rawHeaders }) {
      if (method !== 'GET') return { status: 405, body: { error: 'method_not_allowed' } };
      const headers = [];
      for (let i = 0; i < rawHeaders.length; i += 2) if (rawHeaders[i].toLowerCase() === 'authorization') headers.push(rawHeaders[i + 1]);
      if (headers.length !== 1 || !authorized(headers[0])) return unauthorized;
      const at = now();
      while (hits.length && hits[0] <= at - windowMs) hits.shift();
      hits.push(at);
      if (hits.length > limit) return { status: 429, body: { error: 'rate_limited' } };
      const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
      const params = new URLSearchParams(query), keys = [...params.keys()];
      const today = kyivDay(at), floor = shiftDay(today, -PROBLEM_RETENTION_DAYS);
      let since = shiftDay(today, -6);
      if (keys.length) {
        const value = params.get('since');
        if (keys.length !== 1 || keys[0] !== 'since' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !validDay(value) || value > today)
          return { status: 400, body: { error: 'bad_request' } };
        since = value < floor ? floor : value;
      }
      const { ok, writeErrors } = problems.status();
      const rows = problems.rows(since).map(({ day, release, category, code, tool, count, firstAt, lastAt }) => ({ day, release, category, code, tool, count, firstAt, lastAt }));
      return { status: 200, body: { version: 1, releaseId, generatedAt: minuteStamp(at), journal: { ok, writeErrors }, rows } };
    },
  });
}
