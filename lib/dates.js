const DAY_MS = 24 * 60 * 60 * 1000;

export function pad2(value) {
  return String(value).padStart(2, "0");
}

export function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseDateKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function addDays(date, amount) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + amount);
  return next;
}

export function enumerateDateKeys(startDate, endDate) {
  const keys = [];
  for (let cursor = new Date(startDate); cursor <= endDate; cursor = addDays(cursor, 1)) {
    keys.push(toDateKey(cursor));
  }
  return keys;
}

export function getPeriodRange(period, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let startDate;
  let endDate;

  if (period === "week") {
    const daysFromMonday = (today.getDay() + 6) % 7;
    startDate = addDays(today, -daysFromMonday);
    endDate = addDays(startDate, 6);
  } else if (period === "month") {
    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  } else {
    throw new Error(`Unsupported period: ${period}`);
  }

  const queryEndDate = endDate > today ? today : endDate;
  return {
    period,
    startDate: toDateKey(startDate),
    endDate: toDateKey(endDate),
    queryEndDate: toDateKey(queryEndDate),
    today: toDateKey(today),
    days: enumerateDateKeys(startDate, endDate),
  };
}

export function dayDifference(startDateKey, endDateKey) {
  const start = parseDateKey(startDateKey);
  const end = parseDateKey(endDateKey);
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

