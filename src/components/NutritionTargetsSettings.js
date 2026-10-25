import React, { useState } from 'react';
import { profileTargets, targetsFromFields } from '../services/profileTargets';
const fields = [['cal', 'Калорії, ккал'], ['p', 'Білки, г'], ['f', 'Жири, г'], ['c', 'Вуглеводи, г']];
export default function NutritionTargetsSettings({ profile, onSave, onBack }) {
  const [values, setValues] = useState(() => profileTargets(profile).values);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setError('');setSaved(false);setSaving(true);
    try { await onSave(targetsFromFields(values));setSaved(true); }
    catch (e) { setError(e.message === 'invalid_nutrition_targets' ? 'Вкажіть додатні числа або залиште поле порожнім. Калорії до 20000, білки й жири до 1000 г, вуглеводи до 2000 г.' : 'Не вдалося підтвердити збереження норм. Перевірте з’єднання та повторіть.'); }
    finally { setSaving(false); }
  }
  return <form onSubmit={submit} className="space-y-3">
    <button type="button" onClick={onBack} disabled={saving} className="min-h-[44px] text-[#007AFF]">Назад</button>
    <h3 className="text-[18px] font-semibold">Профіль і програма</h3>
    <p className="text-[14px] text-[#64646c]">Ваші погоджені денні норми. Введіть їх вручну; порожнє поле означає, що норму ще не задано. Облік їжі працює й без норм.</p>
    {fields.map(([key, label]) => <label key={key} className="block text-[14px]">{label}
      <input aria-label={label} inputMode="decimal" type="text" value={values[key] ?? ''} disabled={saving}
        onChange={e => {setValues(previous => ({...previous, [key]:e.target.value}));setSaved(false);}}
        className="block w-full min-h-[44px] p-3 mt-1 rounded-xl bg-[#F2F2F7]" />
    </label>)}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {saved && <p role="status" className="text-green-700">Особисті норми збережено.</p>}
    <button type="submit" disabled={saving} className="min-h-[48px] w-full p-3 rounded-xl bg-[#007AFF] text-white disabled:opacity-50">{saving ? 'Зберігаю…' : 'Зберегти норми'}</button>
  </form>;
}
