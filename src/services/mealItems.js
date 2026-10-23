export const UNITS = { g: 'г', ml: 'мл', portion: 'порц.', package: 'уп.' };
export const SOURCE_LABELS = { label: 'Етикетка', database: 'База продуктів', catalog: 'Каталог', estimate: 'Оцінка моделі', manual: 'Введено вручну', legacy: 'Попередній запис' };
export const newId = () => crypto.randomUUID();
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
export const parseDecimal = (x) => x === '' || x == null ? null : Number(String(x).replace(',', '.'));
export const roundMacros = (x) => ({ p: Math.round((x.p + 1e-9) * 10) / 10, f: Math.round((x.f + 1e-9) * 10) / 10, c: Math.round((x.c + 1e-9) * 10) / 10, cal: Math.round(x.cal) });

export function itemProblems(item) {
  const issues = [];
  if (!item?.name?.trim()) issues.push('Уточніть назву продукту');
  const q = item?.quantity, b = item?.nutritionBasis, n = item?.nutrients;
  if (!finite(q?.value) || q.value <= 0 || !UNITS[q?.unit]) issues.push('Уточніть спожиту кількість');
  if (!finite(b?.value) || b.value <= 0 || !UNITS[b?.unit]) issues.push('Уточніть основу харчових значень');
  if (q?.unit !== b?.unit && !(finite(item?.density) && item.density > 0 && ['g','ml'].includes(q?.unit) && ['g','ml'].includes(b?.unit))) issues.push('Одиниці порції та етикетки несумісні');
  if (['p','f','c','cal'].some(k => !finite(n?.[k]) || n[k] < 0)) issues.push('Потрібні ккал і всі БЖВ з джерела');
  if (!SOURCE_LABELS[item?.source?.kind]) issues.push('Уточніть джерело значень');
  if (item?.clarification) issues.push(item.clarification);
  return issues;
}

// Жодного округлення у збережених значеннях або проміжному підсумку.
export function itemMacros(item) {
  if (!item.quantity) {
    const ratio = (item.weight || 0) / 100;
    return { p: (item.p || 0) * ratio, f: (item.f || 0) * ratio, c: (item.c || 0) * ratio,
      cal: finite(item.calories) ? item.calories : finite(item.cal) ? item.cal * ratio : ((item.p || 0)*4+(item.f || 0)*9+(item.c || 0)*4)*ratio };
  }
  if (itemProblems(item).length) throw new Error('invalid_item');
  let value = item.quantity.value;
  if (item.quantity.unit !== item.nutritionBasis.unit) value *= item.quantity.unit === 'ml' ? item.density : 1 / item.density;
  const ratio = value / item.nutritionBasis.value;
  return Object.fromEntries(['p','f','c','cal'].map(k => [k, item.nutrients[k] * ratio]));
}

export function withQuantity(item, value, unit = item.quantity?.unit || 'g') {
  if (!finite(value) || value <= 0) throw new Error('invalid_quantity');
  if (item.quantity) return { ...item, quantity: { value, unit }, ...(item.portion != null ? {portion:item.portion * value / item.quantity.value}: {}) };
  const ratio = value / item.weight;
  return { ...item, weight: value, calories: itemMacros(item).cal * ratio,
    portion: (item.portion || 0) * ratio, cookedWeight: item.cookedWeight ? item.cookedWeight * ratio : null };
}

export function catalogItem(product, weight, portion, id = newId()) {
  const cal = finite(product.cal) ? product.cal : product.p * 4 + product.f * 9 + product.c * 4;
  return { itemId: id, name: product.name, quantity: { value: weight, unit: 'g' },
    nutritionBasis: { value: 100, unit: 'g' }, nutrients: { p: product.p, f: product.f, c: product.c, cal },
    source: { kind: 'catalog', label: 'Каталог' }, estimated: false, portion,
    ...(finite(product.coef) && product.coef > 0 ? { rawCookedCoef: product.coef } : {}) };
}

export function quantityText(item) {
  if (item.quantity) {
    const q=item.quantity;
    if(q.unit==='g' && item.rawCookedCoef && item.rawCookedCoef!==1) return `${Math.round(q.value*item.rawCookedCoef*10)/10} г (${q.value} г сир.)`;
    return `${q.value} ${UNITS[q.unit] || '?'}`;
  }
  return item.cookedWeight && item.cookedWeight !== item.weight ? `${item.cookedWeight} г (${item.weight} г сир.)` : `${item.weight} г`;
}
export const sourceText = item => SOURCE_LABELS[item.source?.kind] || SOURCE_LABELS.legacy;

export function normalizeAnalysis(data, makeId = newId) {
  if (!data || !Array.isArray(data.items) || data.items.length > 20 || !Array.isArray(data.unparsed) || data.unparsed.length > 20) throw new Error('invalid_response');
  return { items: data.items.map(raw => ({ itemId: makeId(), name: typeof raw.name === 'string' ? raw.name.slice(0,160) : '',
    quantity: { value: finite(raw.quantity?.value) ? raw.quantity.value : null, unit: raw.quantity?.unit || 'g' },
    nutritionBasis: { value: finite(raw.nutritionBasis?.value) ? raw.nutritionBasis.value : null, unit: raw.nutritionBasis?.unit || 'g' },
    nutrients: Object.fromEntries(['p','f','c','cal'].map(k => [k, finite(raw.nutrients?.[k]) ? raw.nutrients[k] : null])),
    source: { kind: raw.source?.kind || 'estimate', label: String(raw.source?.label || '').slice(0,160) },
    estimated: raw.source?.kind === 'estimate' || raw.estimated === true,
    clarification: String(raw.clarification || '').slice(0,300),
    ...(finite(raw.density) && raw.density > 0 ? { density: raw.density } : {}) })),
    unparsed: data.unparsed.map(x => String(x).slice(0,300)) };
}

// Фото змінює саме обраний рядок; спожита кількість залишається користувацькою.
export function mergePhotoItem(existing, response) {
  const parsed = normalizeAnalysis(response, () => existing.itemId);
  if (parsed.items.length !== 1 || parsed.unparsed.length) throw new Error('photo_clarification');
  const item = parsed.items[0];
  if (item.source.kind !== 'label' || itemProblems({ ...item, quantity: existing.quantity }).length) throw new Error('photo_clarification');
  return { ...item, itemId: existing.itemId, quantity: existing.quantity, estimated: false };
}
