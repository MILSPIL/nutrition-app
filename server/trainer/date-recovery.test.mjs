import assert from 'node:assert/strict';
import { test } from 'node:test';
import { restoredTrainerText } from '../../src/services/trainerDates.js';
import { turnDateContext } from './date-context.mjs';

for (const text of ['Учора з’їв яблуко', 'Вчера съел яблоко', 'Yesterday I ate an apple']) {
  test(`recovered relative day keeps the original day: ${text}`, () => {
    const original = { text, sentAt: '2026-10-26T12:00:00Z', targetDate: '2026-10-25' };
    const restored = restoredTrainerText(original);
    const result = turnDateContext({ text: restored, sentAt: '2026-10-27T12:00:00Z', dateContext: { mode: 'pinned', targetDate: original.targetDate } });
    assert.equal(result.targetDate, '2026-10-25');
    assert.equal(result.hints.ambiguous, false);
    assert.ok(restored.includes('25.10.2026'));
  });
}
test('two relative days stay distinct and require clarification after recovery', () => {
  const text = restoredTrainerText({ text: 'Вчора з’їв яблуко, сьогодні випив молоко', sentAt: '2026-10-26T12:00:00Z', targetDate: '2026-10-25' });
  const result = turnDateContext({ text, sentAt: '2026-10-27T12:00:00Z' });
  assert.equal(result.hints.ambiguous, true);
  assert.deepEqual(result.hints.dates, ['2026-10-25', '2026-10-26']);
});
test('legacy mixed dates without the original timestamp never collapse to one day', () => {
  const original = 'Вчора з’їв яблуко, сьогодні випив молоко';
  const text = restoredTrainerText({ text: original, targetDate: '2026-10-25' });
  assert.equal(text, original);
  assert.equal(turnDateContext({ text, sentAt: '2026-10-27T12:00:00Z' }).hints.ambiguous, true);
});
