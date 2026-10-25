// One profile owns its targets. Missing targets never borrow another profile's plan.
const KEYS = ['cal', 'p', 'f', 'c'];
const LIMITS = { cal: 20000, p: 1000, f: 1000, c: 2000 };
export function validateNutritionTargets(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1 ||
      Object.keys(value).some(key => key !== 'version' && !KEYS.includes(key))) {
    throw Error('invalid_nutrition_targets');
  }
  const result = { version: 1 };
  for (const key of KEYS) {
    if (!Object.hasOwn(value, key)) continue;
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) ||
        value[key] <= 0 || value[key] > LIMITS[key]) throw Error('invalid_nutrition_targets');
    result[key] = value[key];
  }
  return result;
}
export function profileTargets(profile) {
  if (profile?.nutritionTargets == null) return { state: 'unset', values: {} };
  try {
    const values = { ...validateNutritionTargets(profile.nutritionTargets) };
    delete values.version;
    const count = Object.keys(values).length;
    return { state: count === 4 ? 'complete' : count ? 'partial' : 'unset', values };
  } catch (_) {
    return { state: 'invalid', values: {} };
  }
}
export function targetsFromFields(fields) {
  const value = { version: 1 };
  for (const key of KEYS) {
    const text = String(fields[key] ?? '').trim().replace(',', '.');
    if (text === '') continue;
    if (!/^\d+(?:\.\d+)?$/.test(text)) throw Error('invalid_nutrition_targets');
    value[key] = Number(text);
  }
  return validateNutritionTargets(value);
}
export function targetsReport(totals, profile) {
  const { values, state } = profileTargets(profile);
  const rows = [['p', 'Білки', 'г'], ['f', 'Жири', 'г'], ['c', 'Вуглеводи', 'г'], ['cal', 'Калорії', ' ккал']];
  const text = rows.map(([key, label, unit]) => `${label}: ${totals[key]}${unit}` +
    (values[key] === undefined ? '' : ` / ${values[key]}${unit} (${Math.round(totals[key] / values[key] * 100)}%)`)).join('\n');
  return text + (state === 'unset' ? '\nОсобисті норми ще не задані.' :
    state === 'invalid' ? '\nОсобисті норми потребують перевірки.' : '');
}
// Operator-only migration; never a UI or per-request fallback.
export function approvedLegacyTargetsPatch(profile, { uid, approvedUid } = {}) {
  if (!uid || !approvedUid || uid !== approvedUid) throw Error('targets_migration_not_approved');
  if (profile?.nutritionTargets != null) return {};
  return { nutritionTargets: { version: 1, cal: 2305, p: 140, f: 70, c: 235 } };
}
