// Calendar labels only. The backend owns the admitted sentAt and resolves speech dates.
export function kyivDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = type => parts.find(p => p.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function dateLabel(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date.split('-').reverse().join('.') : '';
}
export function initialTrainerDate(context) {
  return context?.mode === 'pinned' && /^\d{4}-\d{2}-\d{2}$/.test(context.targetDate || '')
    ? { mode: 'pinned', targetDate: context.targetDate }
    : { mode: 'default' };
}
// Recovery is a new send. Replace relative days using the original admitted
// timestamp so an editable message keeps its meaning across midnight.
export function restoredTrainerText(turn) {
  const text = turn?.text || '';
  let originalToday;
  if (turn?.sentAt && Number.isFinite(new Date(turn.sentAt).getTime())) originalToday = kyivDateKey(new Date(turn.sentAt));
  if (!originalToday && /(?:^|[^\p{L}])(?:сьогодні|сегодня|today)(?=$|[^\p{L}])/iu.test(text) && /(?:^|[^\p{L}])(?:вчора|учора|вчера|yesterday)(?=$|[^\p{L}])/iu.test(text)) return text;
  const relativeDate = yesterday => {
    if (!originalToday) return dateLabel(turn?.targetDate);
    const value = new Date(originalToday + 'T12:00:00Z');
    if (yesterday) value.setUTCDate(value.getUTCDate() - 1);
    return dateLabel(value.toISOString().slice(0, 10));
  };
  return text.replace(/(^|[^\p{L}])(сьогодні|сегодня|today|вчора|учора|вчера|yesterday)(?=$|[^\p{L}])/giu,
    (match, prefix, word) => {
      const date = relativeDate(/^(?:вчора|учора|вчера|yesterday)$/iu.test(word));
      return date ? prefix + date : match;
    });
}
