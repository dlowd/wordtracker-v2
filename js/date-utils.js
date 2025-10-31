const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATE_KEY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

export const parseDateInput = (value) => {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? null : date;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const match = DATE_KEY_REGEX.exec(trimmed);
    if (match) {
      const [, year, month, day] = match;
      const date = new Date(Number(year), Number(month) - 1, Number(day));
      return Number.isNaN(date.valueOf()) ? null : date;
    }
    const date = new Date(trimmed);
    return Number.isNaN(date.valueOf()) ? null : date;
  }
  return null;
};

export const startOfDay = (value) => {
  const date = parseDateInput(value);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

export const addDays = (value, amount) => {
  const date = startOfDay(value);
  if (!date || !Number.isFinite(amount)) return null;
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + amount);
  return next;
};

export const diffInDays = (a, b) => {
  const startA = startOfDay(a);
  const startB = startOfDay(b);
  if (!startA || !startB) return 0;
  return Math.round((startA.getTime() - startB.getTime()) / MS_PER_DAY);
};

export const getDateKey = (value) => {
  const date = startOfDay(value);
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseDateKey = (key) => {
  const match = DATE_KEY_REGEX.exec(key ?? '');
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.valueOf()) ? null : date;
};

export const todayInLocalZone = () => startOfDay(new Date());

export default {
  parseDateInput,
  startOfDay,
  addDays,
  diffInDays,
  getDateKey,
  parseDateKey,
  todayInLocalZone
};
