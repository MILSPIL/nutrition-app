// Minimal synthetic-fixture checks; these do not establish real-world accuracy.
export function evaluateTranscript(text) {
  const tokens = typeof text === 'string' ? (text.toLowerCase().replace(/(\d)(?=\p{L})/gu, '$1 ').match(/[\p{L}\p{N}]+/gu) || []) : [];
  const grams = new Set(['г', 'грам', 'грами', 'грама', 'грамів', 'грамм', 'граммов', 'грамма']);
  // Reject a 200 token embedded in a grouped, decimal or spelled larger number.
  const numericContext = /^(?:\d+|нуль|ноль|один|одна|одне|одно|два|дві|две|три|чотири|четыре|пять|ять|шість|шесть|сім|семь|вісім|восемь|девять|дев|ять|десять|сто|двісті|двести|тисяч\p{L}*|тысяч\p{L}*|мільйон\p{L}*|миллион\p{L}*|\p{L}*(?:дцять|дцать|десят|сот)|кома|запятая|ціл\p{L}*|цел\p{L}*|і|и)$/u;
  return {
    recognizedFood: tokens.some(t => /^кеф[іи]р(?:у|а)?$/u.test(t)),
    recognizedAmount: tokens.some((t, i) => ['200', 'двісті', 'двести'].includes(t) && grams.has(tokens[i+1]) && !numericContext.test(tokens[i-1] || '')),
  };
}
