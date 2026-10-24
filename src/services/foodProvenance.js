// Quantity provenance is independent from nutrient provenance. Optional fields
// keep existing diary entries readable; new model proposals are stricter.
const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every(key => allowed.includes(key));

export function validPortionOrigin(value) {
  return keys(value, ['kind', 'assumption'])
    && ['user', 'catalog_measure', 'estimate'].includes(value.kind)
    && typeof value.assumption === 'string'
    && value.assumption.trim().length > 0 && value.assumption.length <= 400;
}

export function validFoodProvenance(source) {
  return keys(source, ['kind','label','recordId','dataset','version','url','assumptions','portionOrigin','estimateReason'])
    && (source.portionOrigin === undefined || validPortionOrigin(source.portionOrigin))
    && (source.estimateReason === undefined || (source.kind === 'estimate'
      && ['no_matching_source', 'recipe_estimate'].includes(source.estimateReason)));
}

// This is deliberately a conservative lexical binding, not a second food
// parser. A mass beside another food must stay estimated even when its number
// appears elsewhere in the message. Only the canonical one-item draft can bind
// a reply that contains just a quantity.
const normalized = value => String(value || '').normalize('NFKC').toLocaleLowerCase('uk').replace(/[’'`]/g, '');
const incidentalWords = new Set(['так','это','ето','це','десь','десь-то','було','був','була','були','буде','важить','вага','вес','весит','зїв','зїла','їв','їла','съел','съела','ел','ела','випив','випила','выпил','выпила','ще','еще','там','тут','саме','рівно','ровно','yes','ate','weighs','weight','was','is','exactly','had']);
const descriptions = /^(?:синтет|synthe|середн|малень|велик|small|large|medium|свіж|свеж|fresh|тушко|тушен|варен|варён|boiled|смаже|жарен|запеч|baked|сиров|raw|готов|cooked|домаш|homemade)/u;
const words = text => (normalized(text).match(/\p{L}+/gu) || []).filter(word => word.length >= 3 && !incidentalWords.has(word) && !descriptions.test(word));
const foodWord = word => {
  let key = word.replace(/(?:ами|ями|ів|ов|ам|ям|ах|ях|ом|ем|ою|ею|ий|ый|ого|ої|а|я|у|ю|и|ы|і|е|о)$/u, ending => word.length - ending.length >= 3 ? '' : ending).replace(/і/g, 'и');
  if (key === 'яблок') key = 'яблук';
  return key;
};
const bindsFood = (nearby, name, fromEnd = false) => {
  if (!name.length || nearby.length < name.length) return false;
  const adjacent = fromEnd ? nearby.slice(-name.length) : nearby.slice(0,name.length);
  // All meaningful name words must be adjacent to the quantity. A shared
  // ingredient alone does not bind e.g. corn to cornbread.
  return adjacent.map(foodWord).sort().join('|') === name.map(foodWord).sort().join('|');
};
const uncertainQuantity = text => /(?:^|\s)(?:не|ні|нет|not|або|чи|или|or|десь|до|понад|менше|більше|от|более|меньше|under|over)(?:\s|$)|приблиз|примерно|орієнтов|около|\babout\b|\baround\b|~|на око|без зваж|не зваж|\d\s*[-–—/]\s*\d/u.test(text);
function quantityClauses(text) {
  const result = []; let from = 0;
  // Decimal separators stay in their number. Food list separators delimit the
  // binding; a bare "apple, 150 g" may borrow the immediately preceding name.
  const boundaries = /[;!?\n]|(?<!\d)[.,]|[.,](?!\d)|\s+(?:і|й|та|и|and|а|але|но|but)\s+/gu;
  for (const boundary of text.matchAll(boundaries)) {
    result.push({start:from,end:boundary.index,text:text.slice(from,boundary.index)});
    from = boundary.index + boundary[0].length;
  }
  result.push({start:from,end:text.length,text:text.slice(from)});
  return result;
}

export function explicitQuantityInText(quantity, userText, { itemName = '', trustedSingleItem = false } = {}) {
  if (!quantity || !Number.isFinite(quantity.value) || quantity.value <= 0 || typeof userText !== 'string') return false;
  const text = normalized(userText), name = words(itemName), clauses = quantityClauses(text);
  const pattern = /(\d+(?:[.,]\d+)?)\s*(кілограм(?:и|ів|а)?|килограмм(?:а|ов|ы)?|kg|кг|грам(?:и|ів|а)?|грамм(?:а|ов|ы)?|grams?|г|мілілітр(?:и|ів|а)?|миллилитр(?:а|ов|ы)?|milliliters?|мл|ml|порц(?:ія|ії|ій|и|ий)?\.?|portion|уп(?:аковка|аковки|аковок)?\.?|package)(?![\p{L}\p{N}])/gu;
  const matches = [...text.matchAll(pattern)];
  for (const match of matches) {
    const unit = match[2];
    const kind = /^(?:кг|kg|кілограм|килограмм)/.test(unit) ? 'kg'
      : /^(?:мл|ml|мілілітр|миллилитр|milliliter)/.test(unit) ? 'ml'
        : /^(?:порц|portion)/.test(unit) ? 'portion'
          : /^(?:уп|package)/.test(unit) ? 'package' : 'g';
    const amount = Number(match[1].replace(',', '.')) * (kind === 'kg' ? 1000 : 1);
    if ((kind === 'kg' ? 'g' : kind) !== quantity.unit || Math.abs(amount - quantity.value) >= 1e-9) continue;
    const at = clauses.findIndex(clause => clause.start <= match.index && clause.end >= match.index + match[0].replace(/\.$/,'').length);
    const clause = clauses[at];
    if (!clause || uncertainQuantity(clause.text) || text[clause.end] === '?') continue;
    const before = text.slice(clause.start,match.index), after = text.slice(match.index + match[0].length,clause.end);
    if (/(?:^|\s)(?:на|per)\s*$/.test(before)) continue;
    const rest = text.slice(0,match.index) + text.slice(match.index + match[0].length);
    if (trustedSingleItem && matches.length === 1 && !uncertainQuantity(text) && !/\d/.test(rest) && words(rest).length === 0) return true;
    if (!name.length || matches.filter(other => clause.start <= other.index && other.index < clause.end).length !== 1) continue;
    const following = words(after), preceding = words(before);
    if (bindsFood(following,name) || (following.length === 0 && bindsFood(preceding,name,true))) return true;
    if (following.length === 0 && preceding.length === 0 && at > 0) {
      const previous = clauses[at-1];
      if (!/\d/.test(previous.text) && !uncertainQuantity(previous.text) && bindsFood(words(previous.text),name,true)) return true;
    }
  }
  return false;
}

export function modelQuantity(item, quantity, userText, { trustedSingleItem = false } = {}) {
  if (explicitQuantityInText(quantity, userText, {itemName:item.name, trustedSingleItem})) return measuredQuantity(item, quantity);
  const source = {...item.source, portionOrigin:{kind:'estimate', assumption:'Кількість оцінено за описом; точну масу користувач не вказав'}};
  return {...item,quantity,source,estimated:true};
}

export function sourceIdentity(item) {
  return JSON.stringify([
    String(item?.name || '').normalize('NFKC').trim().toLocaleLowerCase('uk'),
    item?.preparation || '', item?.source?.kind || '', item?.source?.recordId || ''
  ]);
}

export function measuredQuantity(item, quantity) {
  const source = {
    ...item.source,
    portionOrigin: { kind: 'user', assumption: 'Кількість уточнена користувачем' }
  };
  // Legacy estimates may include approximate nutrients. Changing quantity alone
  // must not silently promote them to exact nutritional data.
  const nutrientEstimate = source.kind === 'estimate' || (item.estimated === true
    && (item.source?.portionOrigin?.kind !== 'estimate' || Boolean(item.source?.assumptions?.length)));
  return { ...item, quantity, source, estimated: nutrientEstimate };
}

export function preservePortion(existing, replacement) {
  const source = { ...replacement.source };
  if (existing.source?.portionOrigin) source.portionOrigin = { ...existing.source.portionOrigin };
  else if (existing.estimated === true) {
    source.portionOrigin = { kind: 'estimate', assumption: 'Маса з попередньої приблизної оцінки' };
  }
  return {
    ...replacement, quantity: existing.quantity, source,
    estimated: source.kind === 'estimate' || source.portionOrigin?.kind === 'estimate'
  };
}
