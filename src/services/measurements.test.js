import {
  calculateMeasurementDiff,
  getMeasurementComparison,
  MEASUREMENT_PARAMS
} from './measurements';

describe('measurements service', () => {
  test('exports the expected measurement params', () => {
    expect(MEASUREMENT_PARAMS.map((param) => param.key)).toEqual([
      'weight',
      'waist',
      'hips',
      'chest',
      'arms',
      'thighs'
    ]);
  });

  test('calculates measurement diff with rounding', () => {
    expect(calculateMeasurementDiff(80.2, 81.0)).toBe(-0.8);
    expect(calculateMeasurementDiff(undefined, 81.0)).toBeNull();
  });

  test('builds comparison data from sorted measurements', () => {
    const comparison = getMeasurementComparison([
      { id: '2026-04-20', date: '2026-04-20', weight: 80 },
      { id: '2026-04-01', date: '2026-04-01', weight: 85 },
      { id: '2026-04-10', date: '2026-04-10', weight: 82 }
    ]);

    expect(comparison.initial.date).toBe('2026-04-01');
    expect(comparison.previous.date).toBe('2026-04-10');
    expect(comparison.current.date).toBe('2026-04-20');
  });
});
