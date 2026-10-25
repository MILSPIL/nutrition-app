import { profileTargets, validateNutritionTargets, targetsFromFields, targetsReport, approvedLegacyTargetsPatch } from './profileTargets';

test('two profiles keep different goals and unset profile never receives a template', () => {
  const one = { nutritionTargets: { version: 1, cal: 2305, p: 140, f: 70, c: 235 } };
  const two = { nutritionTargets: { version: 1, cal: 1800, p: 95, f: 55, c: 200 } };
  expect(profileTargets(one).values.cal).toBe(2305);
  expect(profileTargets(two).values.cal).toBe(1800);
  expect(profileTargets({})).toEqual({ state: 'unset', values: {} });
  expect(profileTargets(two).values.p).toBe(95);
});
test('partial targets preserve unknowns and do not invent zero or macro-derived calories', () => {
  const profile = { nutritionTargets: { version: 1, p: 95 } };
  expect(profileTargets(profile)).toEqual({ state: 'partial', values: { p: 95 } });
  const report = targetsReport({ p: 100, f: 50, c: 200, cal: 1900 }, profile);
  expect(report).toContain('Білки: 100г / 95г (105%)');
  expect(report).toContain('Калорії: 1900 ккал');
  expect(report).not.toContain('2305');
  expect(report).not.toMatch(/NaN|Infinity|\/ 0/);
});
test.each([null, [], {}, { version: 2 }, { version: 1, cal: 0 }, { version: 1, p: -1 }, { version: 1, cal: Infinity }, { version: 1, f: '70' }, { version: 1, ownerUid: 'other' }, { version: 1, p: null }])('rejects malformed targets %j', value => {
  expect(() => validateNutritionTargets(value)).toThrow('invalid_nutrition_targets');
  expect(profileTargets({ nutritionTargets: value }).values).toEqual({});
});
test('form allows decimal comma, blank optional targets, and full clearing', () => {
  expect(targetsFromFields({ cal: '1800', p: '95,5', f: '', c: '200' })).toEqual({ version: 1, cal: 1800, p: 95.5, c: 200 });
  expect(targetsFromFields({})).toEqual({ version: 1 });
  expect(() => targetsFromFields({ p: '95 г' })).toThrow('invalid_nutrition_targets');
});
test('legacy migration needs exact approved identity and preserves existing goals', () => {
  expect(() => approvedLegacyTargetsPatch({}, { uid: 'wife', approvedUid: 'owner' })).toThrow('targets_migration_not_approved');
  expect(() => approvedLegacyTargetsPatch({})).toThrow('targets_migration_not_approved');
  const patch = approvedLegacyTargetsPatch({}, { uid: 'owner', approvedUid: 'owner' });
  expect(patch.nutritionTargets.cal).toBe(2305);
  expect(approvedLegacyTargetsPatch(patch, { uid: 'owner', approvedUid: 'owner' })).toEqual({});
});
