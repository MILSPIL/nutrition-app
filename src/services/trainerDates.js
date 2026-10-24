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
