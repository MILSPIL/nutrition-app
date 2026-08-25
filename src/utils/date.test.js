import {
  calculateProgramDay,
  formatLocalDateKey,
  getDateInputMax,
  parseDateInput
} from './date';

describe('date utils', () => {
  test('formats local date key without UTC drift', () => {
    expect(formatLocalDateKey(new Date(2026, 3, 20, 23, 59, 0))).toBe('2026-04-20');
  });

  test('parses date input as a valid local date', () => {
    const parsed = parseDateInput('2026-04-20');

    expect(parsed).toBeInstanceOf(Date);
    expect(formatLocalDateKey(parsed)).toBe('2026-04-20');
  });

  test('calculates program day from start date', () => {
    const currentDate = new Date(2026, 3, 20, 10, 0, 0);

    expect(calculateProgramDay('2026-04-01', currentDate)).toBe(20);
    expect(calculateProgramDay('', currentDate)).toBe(1);
  });

  test('returns today key for input max', () => {
    expect(getDateInputMax()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
