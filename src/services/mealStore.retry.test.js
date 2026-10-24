import { webcrypto } from 'crypto';
import { TextEncoder } from 'util';
import { doc, getDocFromServer, runTransaction } from 'firebase/firestore';
import { writerStamp } from './writerFence';
import { commitMealDay, commandHash } from './mealStore';
import { buildPlanCatalog, planFingerprint } from './planCatalog';

jest.mock('../firebase', () => ({ db: {} }));
jest.mock('./writerFence', () => ({ writerStamp: jest.fn() }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db, ...parts) => parts.join('/')),
  getDocFromServer: jest.fn(), runTransaction: jest.fn(),
  FieldPath: class { constructor(...parts) { this.parts = parts; } },
}));
const uid = 'synthetic-owner', date = '2026-10-25', nonce = '8ea30550-dbf5-4cc0-9828-f227707223fa';
const empty = () => ({ 1: {}, 2: {}, 3: {}, 4: {} });
const clone = value => JSON.parse(JSON.stringify(value));
const denied = () => Object.assign(new Error('synthetic denied'), { code: 'permission-denied' });
const item = { itemId: 'synthetic-item-001', name: 'Синтетичний продукт', quantity: { value: 100, unit: 'g' }, nutritionBasis: { value: 100, unit: 'g' }, nutrients: { p: 1, f: 2, c: 3, cal: 40 }, source: { kind: 'label' }, estimated: false, planAllocation: { version: 1, status: 'unallocated', assignment: 'auto' } };
const command = () => ({ type: 'append', submissionId: 'synthetic-submit-001', meal: 1, items: [item], updatedAt: 'synthetic-time' });
function harness(events, { loadError } = {}) {
  let day = { meals: empty(), revision: 0, submissionMarkers: {}, rejectedSubmissions: {} };
  let root = { users: { [uid]: { name: 'Синтетичний', meals: empty(), mealsDateKey: date, mealRevision: 0 } } };
  const writes = [];
  getDocFromServer.mockImplementation(async () => ({ data: () => clone(day) }));
  runTransaction.mockImplementation(async (_db, callback) => {
    const observed = clone(day), observedRoot = clone(root), pending = [];
    const tx = {
      get: jest.fn(async ref => ({ data: () => ref === `users/${uid}` ? clone(observedRoot) : ref.includes('/mealHistory/') ? clone(observed) : { notesEnabled: true, minimumWriterVersion: 3 } })),
      set: jest.fn((ref, value, options) => pending.push({ ref, value: clone(value), options })),
    };
    const result = await callback(tx);
    if (pending.length) {
      writes.push(pending);
      const event = events.shift();
      if (event?.error) {
        if (event.after) day = { ...day, ...clone(event.after) };
        throw event.error;
      }
      for (const write of pending) {
        if (write.ref.includes('/mealHistory/')) day = { ...day, ...write.value, submissionMarkers: { ...day.submissionMarkers, ...write.value.submissionMarkers }, rejectedSubmissions: { ...day.rejectedSubmissions, ...write.value.rejectedSubmissions } };
        else if (write.ref === `users/${uid}`) root = { ...root, ...write.value };
      }
    }
    if (!pending.length && loadError && Object.keys(day.submissionMarkers).length) throw loadError;
    return result;
  });
  return { writes, day: () => clone(day), root: () => clone(root) };
}
beforeAll(() => { globalThis.TextEncoder = TextEncoder; Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto }); });
beforeEach(() => { jest.clearAllMocks(); doc.mockImplementation((_db, ...parts) => parts.join('/')); writerStamp.mockReturnValue({ writerVersion: 3, writerNonce: nonce }); });

test('permission denial retries only after a confirmed concurrent revision advance, keeping the same stamp and marker', async () => {
  const c = command(), h = harness([{ error: denied(), after: { revision: 1 } }]);
  const result = await commitMealDay(uid, uid, date, c);
  expect(result.revision).toBe(2); expect(h.writes).toHaveLength(2); expect(writerStamp).toHaveBeenCalledTimes(1);
  const expectedHash = await commandHash(c);
  for (const attempt of h.writes) for (const write of attempt) {
    expect(write.value.writerNonce).toBe(nonce);
    if (write.ref.includes('/mealHistory/')) expect(write.value.submissionMarkers[c.submissionId]).toBe(expectedHash);
  }
  expect(h.day().meals[1].voice).toHaveLength(1);
});
test('an ordinary denied write with no revision advance is not retried', async () => {
  const error = denied(), h = harness([{ error }]);
  await expect(commitMealDay(uid, uid, date, command())).rejects.toBe(error); expect(h.writes).toHaveLength(1);
});
test('even continuous contention stops after three write attempts', async () => {
  const errors = [denied(), denied(), denied()], h = harness(errors.map((error, i) => ({ error, after: { revision: i + 1 } })));
  await expect(commitMealDay(uid, uid, date, command())).rejects.toBe(errors[2]); expect(h.writes).toHaveLength(3);
});
test('the matching committed success marker wins before any retry', async () => {
  const c = command(), hash = await commandHash(c), h = harness([{ error: denied(), after: { revision: 1, submissionMarkers: { [c.submissionId]: hash } } }]);
  expect((await commitMealDay(uid, uid, date, c)).revision).toBe(1); expect(h.writes).toHaveLength(1);
});
test('a trainer CAS remains fixed and becomes a terminal conflict on a newer day', async () => {
  const c = { ...command(), type: 'saveTrainerDraft', targetDate: date, expectedRevision: 0, notes: [], planFingerprint: await planFingerprint(buildPlanCatalog()) };
  const h = harness([{ error: denied(), after: { revision: 1 } }]);
  await expect(commitMealDay(uid, uid, date, c)).rejects.toThrow('plan_conflict');
  expect(h.writes).toHaveLength(2); expect(h.day().rejectedSubmissions[c.submissionId]).toBe(await commandHash(c));
  expect(h.day().meals).toEqual(empty()); expect(h.day().submissionMarkers[c.submissionId]).toBeUndefined();
});
test('an existing terminal rejection on the newer day is never turned into food', async () => {
  const c = command(), hash = await commandHash(c), h = harness([{ error: denied(), after: { revision: 1, rejectedSubmissions: { [c.submissionId]: hash } } }]);
  await expect(commitMealDay(uid, uid, date, c)).rejects.toThrow('plan_conflict');
  expect(h.writes).toHaveLength(1); expect(h.day().meals).toEqual(empty());
});
test.each(['unavailable', 'deadline-exceeded', 'unknown'])('%s retains save_unknown and does not enter contention retry', async code => {
  const h = harness([{ error: Object.assign(new Error('synthetic transport'), { code }), after: { revision: 1 } }]);
  await expect(commitMealDay(uid, uid, date, command())).rejects.toThrow('save_unknown'); expect(h.writes).toHaveLength(1);
});


test.each(['unavailable', 'permission-denied', undefined])('confirmed success followed by %s while refreshing never reopens the write cycle', async code => {
  const c = command(), hash = await commandHash(c), loadError = Object.assign(new Error('synthetic refresh failed'), { code });
  const h = harness([{ error: denied(), after: { revision: 1, submissionMarkers: { [c.submissionId]: hash } } }], { loadError });
  await expect(commitMealDay(uid, uid, date, c)).rejects.toThrow('save_unknown'); expect(h.writes).toHaveLength(1);
});
test('a confirmed successful transaction followed by refresh failure does not write again', async () => {
  const loadError = Object.assign(new Error('synthetic refresh failed'), { code: 'permission-denied' }), h = harness([], { loadError });
  await expect(commitMealDay(uid, uid, date, command())).rejects.toThrow('save_unknown'); expect(h.writes).toHaveLength(1);
});
test('failed or invalid revision readback cannot authorize a retry', async () => {
  const error = denied(), h = harness([{ error, after: { revision: '1' } }]);
  await expect(commitMealDay(uid, uid, date, command())).rejects.toBe(error); expect(h.writes).toHaveLength(1);
  const h2 = harness([{ error, after: { revision: 1 } }]); getDocFromServer.mockRejectedValue(new Error('synthetic readback failed'));
  await expect(commitMealDay(uid, uid, date, command())).rejects.toBe(error); expect(h2.writes).toHaveLength(1);
});

test.each(['submissionMarkers', 'rejectedSubmissions'])('a mismatched hash in %s never authorizes a retry', async field => {
  const c = command(), h = harness([{ error: denied(), after: { revision: 1, [field]: { [c.submissionId]: 'other-hash' } } }]);
  await expect(commitMealDay(uid, uid, date, c)).rejects.toThrow('submission_conflict'); expect(h.writes).toHaveLength(1);
});
