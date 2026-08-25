const pad = (value) => String(value).padStart(2, '0');

export const formatLocalDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const getTodayDateKey = () => formatLocalDateKey(new Date());

export const getDateInputMax = () => getTodayDateKey();

export const parseDateInput = (value) => {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
};

export const isSameLocalDate = (left, right) => {
  if (!left || !right) {
    return false;
  }

  return formatLocalDateKey(left) === formatLocalDateKey(right);
};

export const calculateProgramDay = (startDate, currentDate = new Date()) => {
  if (!startDate) {
    return 1;
  }

  const start = parseDateInput(startDate) ?? new Date(startDate);
  const today = currentDate instanceof Date ? new Date(currentDate) : new Date(currentDate);

  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  if (Number.isNaN(start.getTime()) || Number.isNaN(today.getTime())) {
    return 1;
  }

  const diffDays = Math.floor((today - start) / (1000 * 60 * 60 * 24));
  return diffDays + 1;
};

